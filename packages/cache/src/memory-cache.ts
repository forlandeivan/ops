/**
 * In-Memory Cache Implementation using node-cache
 * 
 * Phase 4.1: Memory cache backend for single-instance deployments
 */

import NodeCache from 'node-cache';
import { createLogger } from '@unica/observability/lib/logger';
import type { CacheProvider } from './cache-manager';

const logger = createLogger('cache:memory');

/**
 * In-memory cache provider using node-cache
 * 
 * Suitable for single-instance deployments.
 * Data is not shared between instances.
 */
export class MemoryCache implements CacheProvider {
  readonly name = 'memory';
  
  private readonly cache: NodeCache;

  constructor(options?: { stdTTL?: number; checkperiod?: number }) {
    this.cache = new NodeCache({
      stdTTL: options?.stdTTL ?? 600, // 10 minutes default TTL
      checkperiod: options?.checkperiod ?? 600, // Check for expired keys every 10 minutes
      useClones: false, // Better performance for object references
    });

    this.cache.on('set', (key: string) => {
      logger.debug({ key }, 'Cache set');
    });

    this.cache.on('del', (key: string) => {
      logger.debug({ key }, 'Cache deleted');
    });

    this.cache.on('expired', (key: string) => {
      logger.debug({ key }, 'Cache expired');
    });

    logger.debug('Memory cache initialized');
  }

  async get<T>(key: string): Promise<T | null> {
    const value = this.cache.get<T>(key);
    if (value === undefined) {
      return null;
    }
    return value;
  }

  async set(key: string, value: unknown, ttl?: number): Promise<void> {
    if (ttl !== undefined) {
      // Convert ms to seconds for node-cache
      const ttlSeconds = Math.max(1, Math.floor(ttl / 1000));
      this.cache.set(key, value, ttlSeconds);
    } else {
      this.cache.set(key, value);
    }
  }

  async del(key: string): Promise<void> {
    this.cache.del(key);
  }

  async delByPrefix(prefix: string): Promise<void> {
    const keys = this.cache.keys().filter((key) => key.startsWith(prefix));
    if (keys.length > 0) {
      this.cache.del(keys);
    }
  }

  async clear(): Promise<void> {
    this.cache.flushAll();
    logger.debug('Memory cache cleared');
  }

  /**
   * Get cache statistics (for monitoring)
   */
  getStats(): { keys: number; hits: number; misses: number } {
    return this.cache.getStats();
  }
}
