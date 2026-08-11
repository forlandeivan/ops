import { randomUUID } from "node:crypto";

import { createLogger } from "../lib/logger";
import {
  fileArtifactCleanupJobDurationSeconds,
  fileArtifactCleanupJobsTotal,
  fileArtifactCleanupOldestReadyAgeSeconds,
  fileArtifactCleanupQueueJobs,
} from "../monitoring/file-artifact-cleanup-metrics";
import {
  JanitorDomainGatewayError,
  type JanitorDomainGateway,
} from "./domain-gateway-client";
import {
  createFileArtifactCleanupJobStore,
  type FileArtifactCleanupJobRecord,
  type FileArtifactCleanupJobStore,
} from "./file-artifact-cleanup-job-store";

const logger = createLogger("file-artifact-cleanup-worker");

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = value ? Number(value) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export interface FileArtifactCleanupWorkerOptions {
  store?: FileArtifactCleanupJobStore;
  gateway: JanitorDomainGateway;
  workerId?: string;
  concurrency?: number;
  pollMs?: number;
  leaseMs?: number;
  activeAsrRetryMs?: number;
  baseBackoffMs?: number;
  maxBackoffMs?: number;
  maxAttempts?: number;
  statsRefreshMs?: number;
  random?: () => number;
}

export interface FileArtifactCleanupWorkerHandle {
  workerId: string;
  stop(): Promise<void>;
}

function errorText(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}

function nextBackoffMs(
  attempts: number,
  baseBackoffMs: number,
  maxBackoffMs: number,
  random: () => number,
): number {
  const exponential = Math.min(maxBackoffMs, baseBackoffMs * 2 ** Math.max(0, attempts - 1));
  return Math.max(1, Math.floor(exponential * (0.75 + random() * 0.5)));
}

function isActiveAsrGatewayError(error: unknown): boolean {
  return error instanceof JanitorDomainGatewayError &&
    error.status === 409 &&
    error.code === "FILE_ARTIFACT_CLEANUP_ACTIVE_ASR";
}

function isRetryable(error: unknown): boolean {
  return !(error instanceof JanitorDomainGatewayError) || error.retryable;
}

export async function processFileArtifactCleanupJob(params: {
  job: FileArtifactCleanupJobRecord;
  store: FileArtifactCleanupJobStore;
  gateway: JanitorDomainGateway;
  workerId: string;
  leaseMs: number;
  activeAsrRetryMs: number;
  baseBackoffMs: number;
  maxBackoffMs: number;
  maxAttempts: number;
  random: () => number;
  stopping?: () => boolean;
  signal?: AbortSignal;
  now?: () => Date;
}): Promise<"success" | "deferred_active_asr" | "retry" | "dead" | "released" | "lost_lease"> {
  const now = params.now ?? (() => new Date());
  const startedAt = performance.now();
  let heartbeatInFlight = false;
  let lostLease = false;
  const heartbeat = setInterval(() => {
    if (heartbeatInFlight || lostLease) return;
    heartbeatInFlight = true;
    void params.store.heartbeat(params.job.id, params.workerId, params.leaseMs)
      .then((owned) => { lostLease = !owned; })
      .catch((error) => {
        logger.warn({ jobId: params.job.id, error: errorText(error) }, "cleanup job heartbeat failed");
      })
      .finally(() => { heartbeatInFlight = false; });
  }, Math.max(1_000, Math.floor(params.leaseMs / 3)));
  heartbeat.unref?.();

  try {
    if (params.job.payloadVersion !== 1) {
      const attempts = params.job.attempts + 1;
      await params.store.fail(params.job.id, params.workerId, {
        attempts,
        nextRetryAt: null,
        error: `Unsupported file artifact cleanup payload version: ${params.job.payloadVersion}`,
      });
      fileArtifactCleanupJobsTotal.inc({ outcome: "dead" });
      return "dead";
    }

    if (await params.store.hasActiveAsr(params.job)) {
      const nextRetryAt = new Date(now().getTime() + params.activeAsrRetryMs);
      const owned = await params.store.deferForActiveAsr(params.job.id, params.workerId, nextRetryAt);
      fileArtifactCleanupJobsTotal.inc({ outcome: owned ? "deferred_active_asr" : "lost_lease" });
      return owned ? "deferred_active_asr" : "lost_lease";
    }

    try {
      await params.gateway.cleanupFileArtifacts({
        version: 1,
        jobId: params.job.id,
        workspaceId: params.job.workspaceId,
        resourceType: params.job.resourceType,
        resourceId: params.job.resourceId,
        reason: params.job.reason,
        artifact: params.job.payload,
      }, params.signal);
    } catch (error) {
      if (params.stopping?.() && params.signal?.aborted) {
        const owned = await params.store.release(params.job.id, params.workerId);
        fileArtifactCleanupJobsTotal.inc({ outcome: owned ? "released" : "lost_lease" });
        return owned ? "released" : "lost_lease";
      }
      if (isActiveAsrGatewayError(error)) {
        const nextRetryAt = new Date(now().getTime() + params.activeAsrRetryMs);
        const owned = await params.store.deferForActiveAsr(params.job.id, params.workerId, nextRetryAt);
        fileArtifactCleanupJobsTotal.inc({ outcome: owned ? "deferred_active_asr" : "lost_lease" });
        return owned ? "deferred_active_asr" : "lost_lease";
      }

      const attempts = params.job.attempts + 1;
      const retry = isRetryable(error) && attempts < params.maxAttempts;
      const nextRetryAt = retry
        ? new Date(now().getTime() + nextBackoffMs(attempts, params.baseBackoffMs, params.maxBackoffMs, params.random))
        : null;
      const owned = await params.store.fail(params.job.id, params.workerId, {
        attempts,
        nextRetryAt,
        error: errorText(error),
      });
      const outcome = !owned ? "lost_lease" : retry ? "retry" : "dead";
      fileArtifactCleanupJobsTotal.inc({ outcome });
      logger[retry ? "warn" : "error"](
        { jobId: params.job.id, attempts, retry, error: errorText(error) },
        "file artifact cleanup failed",
      );
      return outcome;
    }

    if (lostLease) {
      fileArtifactCleanupJobsTotal.inc({ outcome: "lost_lease" });
      return "lost_lease";
    }
    const owned = await params.store.complete(params.job.id, params.workerId);
    fileArtifactCleanupJobsTotal.inc({ outcome: owned ? "success" : "lost_lease" });
    return owned ? "success" : "lost_lease";
  } finally {
    clearInterval(heartbeat);
    fileArtifactCleanupJobDurationSeconds.observe((performance.now() - startedAt) / 1000);
  }
}

export function startFileArtifactCleanupWorker(
  options: FileArtifactCleanupWorkerOptions,
): FileArtifactCleanupWorkerHandle {
  const store = options.store ?? createFileArtifactCleanupJobStore();
  const workerId = options.workerId ?? `${process.pid}:${randomUUID()}`;
  const concurrency = options.concurrency ?? positiveInt(process.env.FILE_ARTIFACT_CLEANUP_CONCURRENCY, 2);
  const pollMs = options.pollMs ?? positiveInt(process.env.FILE_ARTIFACT_CLEANUP_POLL_MS, 2_000);
  const leaseMs = options.leaseMs ?? positiveInt(process.env.FILE_ARTIFACT_CLEANUP_LEASE_MS, 90_000);
  const activeAsrRetryMs = options.activeAsrRetryMs ?? positiveInt(process.env.FILE_ARTIFACT_CLEANUP_ACTIVE_ASR_RETRY_MS, 30_000);
  const baseBackoffMs = options.baseBackoffMs ?? positiveInt(process.env.FILE_ARTIFACT_CLEANUP_BACKOFF_BASE_MS, 5_000);
  const maxBackoffMs = options.maxBackoffMs ?? positiveInt(process.env.FILE_ARTIFACT_CLEANUP_BACKOFF_MAX_MS, 60 * 60_000);
  const maxAttempts = options.maxAttempts ?? positiveInt(process.env.FILE_ARTIFACT_CLEANUP_MAX_ATTEMPTS, 12);
  const statsRefreshMs = options.statsRefreshMs ?? positiveInt(process.env.FILE_ARTIFACT_CLEANUP_STATS_REFRESH_MS, 15_000);
  const random = options.random ?? Math.random;

  let stopping = false;
  let wake: (() => void) | null = null;
  const activeControllers = new Set<AbortController>();
  let lastStatsAt = 0;

  const waitForPoll = () => new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      wake = null;
      resolve();
    }, pollMs);
    wake = () => {
      clearTimeout(timer);
      wake = null;
      resolve();
    };
  });

  const refreshStats = async () => {
    const now = Date.now();
    if (now - lastStatsAt < statsRefreshMs) return;
    lastStatsAt = now;
    const stats = await store.stats();
    fileArtifactCleanupQueueJobs.set({ status: "pending" }, stats.pending);
    fileArtifactCleanupQueueJobs.set({ status: "processing" }, stats.processing);
    fileArtifactCleanupQueueJobs.set({ status: "error" }, stats.error);
    fileArtifactCleanupQueueJobs.set({ status: "dead" }, stats.dead);
    fileArtifactCleanupOldestReadyAgeSeconds.set(stats.oldestReadyAgeSeconds);
  };

  const runSlot = async () => {
    while (!stopping) {
      try {
        await refreshStats();
        const job = await store.claim(workerId, leaseMs);
        if (!job) {
          await waitForPoll();
          continue;
        }
        fileArtifactCleanupJobsTotal.inc({ outcome: "claimed" });
        const controller = new AbortController();
        activeControllers.add(controller);
        try {
          await processFileArtifactCleanupJob({
            job,
            store,
            gateway: options.gateway,
            workerId,
            leaseMs,
            activeAsrRetryMs,
            baseBackoffMs,
            maxBackoffMs,
            maxAttempts,
            random,
            stopping: () => stopping,
            signal: controller.signal,
          });
        } finally {
          activeControllers.delete(controller);
        }
      } catch (error) {
        logger.error({ error: errorText(error) }, "file artifact cleanup worker loop failed");
        await waitForPoll();
      }
    }
  };

  const slots = Array.from({ length: Math.max(1, concurrency) }, () => runSlot());
  logger.info({ workerId, concurrency, leaseMs }, "file artifact cleanup worker started");

  return {
    workerId,
    async stop() {
      stopping = true;
      wake?.();
      for (const controller of activeControllers) controller.abort();
      await Promise.allSettled(slots);
      logger.info({ workerId }, "file artifact cleanup worker stopped");
    },
  };
}
