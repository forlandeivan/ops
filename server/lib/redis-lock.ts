/**
 * Lightweight distributed lock backed by Redis SET NX.
 *
 * Falls back to a no-op (always acquired) when REDIS_URL is not set,
 * which is correct for single-instance / local dev deployments where
 * the in-memory Map in callers provides sufficient deduplication.
 */
import { randomUUID } from 'crypto';
import Redis from 'ioredis';
import { createLogger } from './logger';

const logger = createLogger('redis-lock');

const LOCK_KEY_PREFIX = 'lock:';
const RELEASE_LOCK_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
end
return 0
`;

export interface RedisLockHandle {
  key: string;
  token: string;
}

let _client: Redis | null = null;
let _initialized = false;

function getClient(): Redis | null {
  if (_initialized) {
    return _client;
  }
  _initialized = true;

  const redisUrl = process.env.REDIS_URL?.trim();
  if (!redisUrl) {
    return null;
  }

  try {
    _client = new Redis(redisUrl, {
      enableReadyCheck: true,
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
      lazyConnect: true,
    });

    _client.on('error', (err) => {
      logger.warn({ err }, 'redis-lock: connection error');
    });
  } catch (err) {
    logger.warn({ err }, 'redis-lock: failed to create client');
    _client = null;
  }

  return _client;
}

export interface TryAcquireLockOptions {
  /**
   * Fail-closed: если Redis не сконфигурирован или недоступен — НЕ считать лок взятым
   * (вернуть null), чтобы взаимоисключение не вырождалось в no-op. Нужен вызывающим,
   * у которых конкурентное исполнение реально опасно (janitor: плановый тик в одном
   * контейнере против run-now в api). Дефолт — прежнее fail-open поведение.
   */
  failClosed?: boolean;
}

/**
 * Try to acquire a distributed lock.
 *
 * Returns a lock handle if the lock was acquired (caller should proceed),
 * or `null` if another instance already holds the lock.
 *
 * When Redis is unavailable the call by default returns a handle so that
 * the in-memory deduplication in the caller remains the last defence;
 * pass `failClosed: true` to treat unavailable Redis as "not acquired".
 */
export async function tryAcquireLock(
  key: string,
  ttlMs: number,
  options: TryAcquireLockOptions = {},
): Promise<RedisLockHandle | null> {
  const client = getClient();
  const token = randomUUID();
  if (!client) {
    if (options.failClosed) {
      logger.warn({ key }, 'redis-lock: Redis not configured, failing closed (lock not acquired)');
      return null;
    }
    return { key, token };
  }

  try {
    const result = await client.set(
      `${LOCK_KEY_PREFIX}${key}`,
      token,
      'PX',
      ttlMs,
      'NX',
    );
    return result === 'OK' ? { key, token } : null;
  } catch (err) {
    if (options.failClosed) {
      logger.warn({ err, key }, 'redis-lock: tryAcquireLock failed, failing closed (lock not acquired)');
      return null;
    }
    logger.warn({ err, key }, 'redis-lock: tryAcquireLock failed, treating as acquired');
    return { key, token };
  }
}

/**
 * Release a previously acquired lock.
 * Errors are swallowed - the TTL acts as a safety net if release fails.
 */
export async function releaseLock(lock: RedisLockHandle): Promise<void> {
  const client = getClient();
  if (!client) {
    return;
  }

  try {
    await client.eval(RELEASE_LOCK_SCRIPT, 1, `${LOCK_KEY_PREFIX}${lock.key}`, lock.token);
  } catch (err) {
    logger.warn({ err, key: lock.key }, 'redis-lock: releaseLock failed (TTL will expire naturally)');
  }
}
