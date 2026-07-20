/**
 * Circuit breaker для MinIO/S3.
 *
 * Зачем: при недоступности хранилища (как в аварии 2026-06-03) без предохранителя
 * каждый файловый запрос честно ждёт таймаут и копится, насыщая API на минуты.
 * Предохранитель размыкается после серии сбоев и мгновенно отдаёт 503 (fail-fast),
 * не трогая мёртвое хранилище, а затем аккуратно пробует восстановление.
 *
 * Состояния: closed (норма) → open (fail-fast 503) → half_open (одна проба) → closed.
 * Учитываются только ИНФРАСТРУКТУРНЫЕ сбои (таймаут/коннект/5xx). Прикладные ответы
 * (NoSuchKey/NoSuchBucket/403/404) означают, что MinIO жив, и НЕ размыкают предохранитель.
 * «Медленный» успешный вызов (> slowCallMs при норме <100мс) считается сбоем —
 * ловим «серую» деградацию до полного отказа.
 *
 * Параметры — через env (см. ниже), значения по умолчанию подобраны под внутренний
 * MinIO и enterprise-нагрузку. Состояние — в памяти процесса (на инстанс).
 */
import { createLogger } from "@unica/observability/lib/logger";

const logger = createLogger("storage-circuit-breaker");

/** Ошибка «хранилище временно недоступно» → HTTP 503 + Retry-After. */
export class StorageUnavailableError extends Error {
  readonly status = 503;
  readonly statusCode = 503;
  readonly code = "STORAGE_UNAVAILABLE";
  readonly retryAfterSeconds: number;

  constructor(message: string, options?: { retryAfterSeconds?: number; cause?: unknown }) {
    super(message);
    this.name = "StorageUnavailableError";
    this.retryAfterSeconds = options?.retryAfterSeconds ?? 15;
    if (options?.cause !== undefined) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}

const INFRA_ERROR_NAMES = new Set(["TimeoutError", "AbortError", "TimeoutError: socket"]);
const INFRA_ERROR_CODES = new Set([
  "ETIMEDOUT",
  "ECONNREFUSED",
  "ECONNRESET",
  "ENOTFOUND",
  "EPIPE",
  "EAI_AGAIN",
  "ERR_SOCKET_CONNECTION_TIMEOUT",
]);

/** Инфраструктурный сбой хранилища (а не прикладной ответ вроде NoSuchKey/403)? */
export function isStorageInfraFailure(error: unknown): boolean {
  if (error instanceof StorageUnavailableError) return true;
  if (!error || typeof error !== "object") return false;
  const e = error as {
    name?: string;
    code?: string;
    message?: string;
    $metadata?: { httpStatusCode?: number };
  };
  const httpStatus = e.$metadata?.httpStatusCode;
  if (typeof httpStatus === "number") {
    // Ответ от MinIO получен: 5xx — инфраструктура, всё остальное (404/403/400) — прикладное.
    return httpStatus >= 500;
  }
  if (e.name && INFRA_ERROR_NAMES.has(e.name)) return true;
  if (e.code && INFRA_ERROR_CODES.has(e.code)) return true;
  const msg = (e.message ?? "").toLowerCase();
  return (
    msg.includes("timeout") ||
    msg.includes("socket") ||
    msg.includes("econnrefused") ||
    msg.includes("econnreset") ||
    msg.includes("did not establish a connection") ||
    msg.includes("network")
  );
}

type State = "closed" | "open" | "half_open";

interface Sample {
  t: number;
  ok: boolean;
}

export interface BreakerOptions {
  windowMs?: number;
  minVolume?: number;
  failureRate?: number;
  slowCallMs?: number;
  openBaseMs?: number;
  openMaxMs?: number;
  successToClose?: number;
  enabled?: boolean;
  now?: () => number;
}

export class StorageCircuitBreaker {
  private state: State = "closed";
  private samples: Sample[] = [];
  private openUntil = 0;
  private currentOpenMs: number;
  private probeInFlight = false;
  private probeSuccesses = 0;
  private readonly o: Required<Omit<BreakerOptions, "now">> & { now: () => number };

  constructor(opts: BreakerOptions = {}) {
    this.o = {
      windowMs: opts.windowMs ?? 30_000,
      minVolume: opts.minVolume ?? 10,
      failureRate: opts.failureRate ?? 0.5,
      slowCallMs: opts.slowCallMs ?? 2_000,
      openBaseMs: opts.openBaseMs ?? 10_000,
      openMaxMs: opts.openMaxMs ?? 30_000,
      successToClose: opts.successToClose ?? 2,
      enabled: opts.enabled ?? true,
      now: opts.now ?? Date.now,
    };
    this.currentOpenMs = this.o.openBaseMs;
  }

  getState(): State {
    return this.state;
  }

  private prune(now: number): void {
    const cutoff = now - this.o.windowMs;
    while (this.samples.length > 0 && this.samples[0].t < cutoff) {
      this.samples.shift();
    }
  }

  private toOpen(now: number, reason: string): void {
    this.state = "open";
    this.openUntil = now + this.currentOpenMs;
    this.probeInFlight = false;
    this.probeSuccesses = 0;
    logger.warn(
      { event_name: "storage_cb.open", outcome: "failure", open_ms: this.currentOpenMs, reason },
      "[storage-cb] разомкнут — fail-fast 503",
    );
  }

  private toHalfOpen(): void {
    this.state = "half_open";
    this.probeInFlight = false;
    this.probeSuccesses = 0;
    logger.info({ event_name: "storage_cb.half_open" }, "[storage-cb] полуоткрыт — пробный запрос");
  }

  private toClosed(): void {
    this.state = "closed";
    this.samples = [];
    this.currentOpenMs = this.o.openBaseMs;
    this.probeInFlight = false;
    this.probeSuccesses = 0;
    logger.info({ event_name: "storage_cb.close" }, "[storage-cb] замкнут — норма");
  }

  private recordClosed(ok: boolean, now: number): void {
    this.samples.push({ t: now, ok });
    this.prune(now);
    const total = this.samples.length;
    if (total < this.o.minVolume) return;
    const failures = this.samples.reduce((n, s) => n + (s.ok ? 0 : 1), 0);
    if (failures / total >= this.o.failureRate) {
      this.toOpen(now, `failure_rate ${failures}/${total}`);
    }
  }

  private backoffToOpen(now: number, reason: string): void {
    this.currentOpenMs = Math.min(this.o.openMaxMs, this.currentOpenMs * 2);
    this.toOpen(now, reason);
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.o.enabled) return fn();

    const now = this.o.now();

    if (this.state === "open") {
      if (now < this.openUntil) {
        throw new StorageUnavailableError("Хранилище временно недоступно, повторите позже.", {
          retryAfterSeconds: Math.max(1, Math.ceil((this.openUntil - now) / 1000)),
        });
      }
      this.toHalfOpen();
    }

    if (this.state === "half_open") {
      if (this.probeInFlight) {
        throw new StorageUnavailableError("Хранилище восстанавливается, повторите позже.", {
          retryAfterSeconds: Math.max(1, Math.ceil(this.currentOpenMs / 1000)),
        });
      }
      this.probeInFlight = true;
      const startedAt = this.o.now();
      try {
        const result = await fn();
        const durationMs = this.o.now() - startedAt;
        this.probeInFlight = false;
        if (durationMs > this.o.slowCallMs) {
          this.backoffToOpen(this.o.now(), "slow_probe");
          return result;
        }
        this.probeSuccesses += 1;
        if (this.probeSuccesses >= this.o.successToClose) this.toClosed();
        return result;
      } catch (error) {
        this.probeInFlight = false;
        if (isStorageInfraFailure(error)) {
          this.backoffToOpen(this.o.now(), "probe_failed");
          throw new StorageUnavailableError("Хранилище временно недоступно, повторите позже.", {
            cause: error,
            retryAfterSeconds: Math.max(1, Math.ceil(this.currentOpenMs / 1000)),
          });
        }
        // Прикладная ошибка (NoSuchKey/403): MinIO ответил — считаем пробу успешной.
        this.probeSuccesses += 1;
        if (this.probeSuccesses >= this.o.successToClose) this.toClosed();
        throw error;
      }
    }

    // closed
    const startedAt = this.o.now();
    try {
      const result = await fn();
      const durationMs = this.o.now() - startedAt;
      this.recordClosed(durationMs <= this.o.slowCallMs, this.o.now());
      return result;
    } catch (error) {
      if (isStorageInfraFailure(error)) {
        this.recordClosed(false, this.o.now());
        throw new StorageUnavailableError("Не удалось подключиться к хранилищу файлов.", { cause: error });
      }
      // Прикладная ошибка — хранилище живо.
      this.recordClosed(true, this.o.now());
      throw error;
    }
  }
}

function envNum(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

export const storageCircuitBreaker = new StorageCircuitBreaker({
  enabled: (process.env.MINIO_CB_ENABLED ?? "on").trim().toLowerCase() !== "off",
  windowMs: envNum("MINIO_CB_WINDOW_MS", 30_000),
  minVolume: envNum("MINIO_CB_MIN_VOLUME", 10),
  failureRate: envNum("MINIO_CB_FAILURE_RATE", 0.5),
  slowCallMs: envNum("MINIO_CB_SLOW_CALL_MS", 2_000),
  openBaseMs: envNum("MINIO_CB_OPEN_BASE_MS", 10_000),
  openMaxMs: envNum("MINIO_CB_OPEN_MAX_MS", 30_000),
  successToClose: envNum("MINIO_CB_SUCCESS_TO_CLOSE", 2),
});

/** Обернуть один вызов к MinIO в circuit breaker. */
export function runThroughStorageBreaker<T>(_label: string, fn: () => Promise<T>): Promise<T> {
  return storageCircuitBreaker.run(fn);
}
