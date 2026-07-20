import type { Agent as HttpAgent } from "http";
import type { Agent as HttpsAgent } from "https";
import { createLogger } from "@unica/observability/lib/logger";

/**
 * Наблюдаемость занятости пула HTTP-соединений к MinIO (P0.3).
 *
 * Без неё исчерпание пула невидимо до 100% отказа — узнаём по жалобам/инциденту.
 * Сэмплер периодически снимает занятость агентов и эскалирует в WARN при насыщении
 * (есть очередь ожидающих сокет ИЛИ занятость ≥ порога) — ранний сигнал ДО outage.
 * Та же метрика — механизм ассерта для e2e leak-регресса (занятость → 0 после ошибок).
 */

const logger = createLogger("minio-pool");

export interface MinioPoolStats {
  /** Потолок одновременных соединений на origin (host:port). */
  maxSockets: number;
  /** Сокеты «в работе» (checked out). */
  active: number;
  /** Свободные keep-alive сокеты (переиспользуемые). */
  free: number;
  /** Запросы, ждущие свободный сокет (пул исчерпан). */
  queued: number;
  byOrigin: Record<string, { active: number; free: number; queued: number }>;
}

type PoolAgent = HttpAgent | HttpsAgent;

function lengths(map: Record<string, unknown[]> | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  if (!map) return out;
  for (const origin of Object.keys(map)) {
    const list = map[origin];
    out[origin] = Array.isArray(list) ? list.length : 0;
  }
  return out;
}

const sum = (obj: Record<string, number>): number => Object.values(obj).reduce((a, b) => a + b, 0);

/** Снимок занятости пула по списку http/https-агентов. Чистая функция. */
export function collectPoolStats(agents: PoolAgent[]): MinioPoolStats {
  const byOrigin: MinioPoolStats["byOrigin"] = {};
  let active = 0;
  let free = 0;
  let queued = 0;
  let maxSockets = 0;

  for (const agent of agents) {
    const a = agent as unknown as {
      maxSockets?: number;
      sockets?: Record<string, unknown[]>;
      freeSockets?: Record<string, unknown[]>;
      requests?: Record<string, unknown[]>;
    };
    if (typeof a.maxSockets === "number" && a.maxSockets > maxSockets) {
      maxSockets = a.maxSockets;
    }
    const s = lengths(a.sockets);
    const f = lengths(a.freeSockets);
    const r = lengths(a.requests);
    for (const origin of new Set([...Object.keys(s), ...Object.keys(f), ...Object.keys(r)])) {
      const entry = byOrigin[origin] ?? (byOrigin[origin] = { active: 0, free: 0, queued: 0 });
      entry.active += s[origin] ?? 0;
      entry.free += f[origin] ?? 0;
      entry.queued += r[origin] ?? 0;
    }
    active += sum(s);
    free += sum(f);
    queued += sum(r);
  }

  return { maxSockets, active, free, queued, byOrigin };
}

/** Решение по одному сэмплу: насыщен ли пул. Чистая функция (тестируемая). */
export function evaluatePoolSample(
  stats: MinioPoolStats,
  saturationRatio: number,
): { saturated: boolean; occupancy: number; eventName: string } {
  const occupancy = stats.maxSockets > 0 ? stats.active / stats.maxSockets : 0;
  const saturated = stats.queued > 0 || occupancy >= saturationRatio;
  return {
    saturated,
    occupancy: Math.round(occupancy * 100) / 100,
    eventName: saturated ? "storage.pool.saturation" : "storage.pool.sample",
  };
}

let timer: ReturnType<typeof setInterval> | null = null;

/** Запускает периодический сэмплер (идемпотентно, unref — не держит процесс). */
export function startMinioPoolMonitor(
  statsFn: () => MinioPoolStats,
  opts?: { intervalMs?: number; saturationRatio?: number },
): void {
  if (timer) {
    return;
  }
  const intervalMs = opts?.intervalMs ?? (Number(process.env.MINIO_POOL_MONITOR_INTERVAL_MS) || 30_000);
  const ratio = opts?.saturationRatio ?? (Number(process.env.MINIO_POOL_SATURATION_RATIO) || 0.8);

  timer = setInterval(() => {
    try {
      const stats = statsFn();
      const { saturated, occupancy, eventName } = evaluatePoolSample(stats, ratio);
      const payload = {
        event_name: eventName,
        component: "minio-pool",
        max_sockets: stats.maxSockets,
        active: stats.active,
        free: stats.free,
        queued: stats.queued,
        occupancy,
      };
      if (saturated) {
        logger.warn(payload, "[minio-pool] пул близок к насыщению — риск деградации загрузок/ASR");
      } else {
        logger.debug(payload, "[minio-pool] sample");
      }
    } catch (err) {
      logger.warn({ err, event_name: "storage.pool.sample_failed" }, "[minio-pool] sample failed");
    }
  }, intervalMs);

  if (typeof timer.unref === "function") {
    timer.unref();
  }
}

export function stopMinioPoolMonitor(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
