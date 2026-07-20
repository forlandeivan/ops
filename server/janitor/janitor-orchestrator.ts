import { createLogger } from "../lib/logger";
import { releaseLock, tryAcquireLock } from "../lib/redis-lock";
import {
  janitorDeletedItemsTotal,
  janitorFreedBytesTotal,
  janitorLastSuccessTimestampSeconds,
  janitorRunDurationSeconds,
  janitorRunsTotal,
} from "../monitoring/janitor-metrics";
import type { CleanupPolicyDto, CleanupRunStatus, CleanupRunTrigger } from "@shared/cleanup-policies";

import { getJanitorTask, operationsOf, storageOf, type JanitorTaskDefinition } from "./janitor-task-registry";
import { listResolvedPolicies, recordRun } from "./janitor-policy-service";
import { findMissingColumns, requiredColumnsForOperation } from "./schema-guard";
import { defaultStores, type JanitorStores } from "./default-stores";
import { DEFAULT_MAX_BATCHES_PER_RUN, runRetentionTask } from "./tasks/pg-retention-task";
import {
  runS3RetentionTask,
  type S3CandidateFilter,
  type S3RetentionStore,
} from "./tasks/s3-retention-task";
import { runQdrantOrphanGcTask } from "./tasks/qdrant-orphan-gc-task";
import { runFeedbackAttachmentOrphanTask } from "./tasks/s3-feedback-attachment-orphan-task";

// Тип сторов живёт в default-stores; реэкспорт сохраняет прежние импорты потребителей.
export type { JanitorStores } from "./default-stores";

const logger = createLogger("janitor-orchestrator");

const MINUTE_MS = 60 * 1000;

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function parseNonNegativeInt(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

function isEnabled(): boolean {
  return (process.env.JANITOR_ENABLED ?? "true").trim().toLowerCase() !== "false";
}

/**
 * Fail-closed режим лока прогонов: без доступного Redis прогон НЕ стартует
 * (`skipped_locked`), чтобы плановый тик janitor-контейнера и run-now из api
 * не исполняли одну политику конкурентно. В production — включён по умолчанию;
 * для single-node dev без Redis отключается `JANITOR_LOCK_ALLOW_NOOP=true`.
 */
function lockFailClosed(): boolean {
  const allowNoop = (process.env.JANITOR_LOCK_ALLOW_NOOP ?? "").trim().toLowerCase();
  if (allowNoop === "true") {
    return false;
  }
  if (allowNoop === "false") {
    return true;
  }
  return process.env.NODE_ENV === "production";
}

const TICK_MINUTES = parsePositiveInt(process.env.JANITOR_TICK_MINUTES, 15);
const LOCK_TTL_MS = parsePositiveInt(process.env.JANITOR_LOCK_TTL_MS, 10 * MINUTE_MS);
const MAX_BATCHES_PER_RUN = parsePositiveInt(
  process.env.JANITOR_MAX_BATCHES_PER_RUN,
  DEFAULT_MAX_BATCHES_PER_RUN,
);
const BATCH_PAUSE_MS = parseNonNegativeInt(process.env.JANITOR_BATCH_PAUSE_MS, 0);

function resolveS3Store(stores: JanitorStores, task: JanitorTaskDefinition): S3RetentionStore {
  const store = stores.s3[task.table];
  if (!store) {
    throw new Error(`janitor: no S3 store registered for table "${task.table}" (task ${task.key})`);
  }
  return store;
}

function s3FilterOf(task: JanitorTaskDefinition): S3CandidateFilter {
  return {
    timeColumn: task.timeColumn,
    mimePrefixes: task.mimePrefixes ?? [],
    mimePrefixExclude: task.mimePrefixExclude ?? false,
    isNullColumn: task.isNullColumn ?? null,
  };
}

function isDue(policy: CleanupPolicyDto, now: Date): boolean {
  const task = getJanitorTask(policy.resourceKey);
  if (!task) {
    return false;
  }
  const lastStartedAt = policy.lastRun?.startedAt ? new Date(policy.lastRun.startedAt).getTime() : 0;
  return now.getTime() - lastStartedAt >= task.intervalMinutes * MINUTE_MS;
}

export interface RunPolicyOutcome {
  status: CleanupRunStatus;
  matched: number;
  deleted: number;
  freedBytes: number;
}

/** Кто инициировал прогон: плановый по расписанию ('auto') или администратор ('manual'). */
export interface RunPolicyTrigger {
  triggeredBy: CleanupRunTrigger;
  actorId: string | null;
}

const AUTO_TRIGGER: RunPolicyTrigger = { triggeredBy: "auto", actorId: null };

/** Рантайм-контекст прогона: кооперативная остановка при graceful shutdown процесса. */
export interface RunPolicyRuntime {
  shouldAbort?: () => boolean;
}

/** Прогон одной политики под распределённым локом с записью в журнал прогонов. */
export async function runPolicy(
  policy: CleanupPolicyDto,
  stores: JanitorStores = defaultStores(),
  trigger: RunPolicyTrigger = AUTO_TRIGGER,
  runtime: RunPolicyRuntime = {},
): Promise<RunPolicyOutcome> {
  const task = getJanitorTask(policy.resourceKey);
  if (!task) {
    return { status: "skipped_disabled", matched: 0, deleted: 0, freedBytes: 0 };
  }

  const lock = await tryAcquireLock(`janitor:${policy.resourceKey}`, LOCK_TTL_MS, {
    failClosed: lockFailClosed(),
  });
  if (!lock) {
    logger.debug({ resource: policy.resourceKey }, "janitor run skipped (locked by another instance)");
    return { status: "skipped_locked", matched: 0, deleted: 0, freedBytes: 0 };
  }

  const shouldAbort = runtime.shouldAbort;
  const startedAt = new Date();
  let status: CleanupRunStatus = "success";
  let errorMessage: string | null = null;
  let matched = 0;
  let deleted = 0;
  let freedBytes = 0;
  let aborted = false;

  try {
    if (storageOf(task) === "qdrant") {
      const result = await runQdrantOrphanGcTask(
        { mode: "enforce", retentionDays: policy.retentionDays, batchSize: policy.batchSize },
        stores.qdrant,
        {
          now: startedAt,
          maxBatchesPerRun: MAX_BATCHES_PER_RUN,
          pauseBetweenBatchesMs: BATCH_PAUSE_MS,
          shouldAbort,
        },
      );
      matched += result.matched;
      deleted += result.deleted;
      freedBytes += result.freedBytes;
      aborted = aborted || result.aborted;
    } else if (storageOf(task) === "s3_reconcile") {
      const result = await runFeedbackAttachmentOrphanTask(
        { mode: "enforce", retentionDays: policy.retentionDays, batchSize: policy.batchSize },
        stores.feedbackAttachmentOrphans,
        { now: startedAt, maxBatchesPerRun: MAX_BATCHES_PER_RUN, shouldAbort },
      );
      matched += result.matched;
      deleted += result.deleted;
      freedBytes += result.freedBytes;
      aborted = aborted || result.aborted;
    } else if (storageOf(task) === "s3") {
      const result = await runS3RetentionTask(
        s3FilterOf(task),
        { mode: "enforce", retentionDays: policy.retentionDays, batchSize: policy.batchSize },
        resolveS3Store(stores, task),
        {
          now: startedAt,
          maxBatchesPerRun: MAX_BATCHES_PER_RUN,
          pauseBetweenBatchesMs: BATCH_PAUSE_MS,
          shouldAbort,
        },
      );
      matched += result.matched;
      deleted += result.deleted;
      freedBytes += result.freedBytes;
      aborted = aborted || result.aborted;
    } else {
      for (const op of operationsOf(task)) {
        if (shouldAbort?.()) {
          aborted = true;
          break;
        }
        const missing = await findMissingColumns(op.table, requiredColumnsForOperation(op));
        if (missing.length > 0) {
          throw new Error(
            `schema guard: columns [${missing.join(", ")}] missing on ${op.table}; run skipped`,
          );
        }
        const result = await runRetentionTask(
          op,
          {
            action: op.action,
            mode: "enforce",
            retentionDays: policy.retentionDays,
            batchSize: policy.batchSize,
          },
          stores.pg,
          {
            now: startedAt,
            maxBatchesPerRun: MAX_BATCHES_PER_RUN,
            pauseBetweenBatchesMs: BATCH_PAUSE_MS,
            shouldAbort,
          },
        );
        matched += result.matched;
        deleted += result.deleted;
        aborted = aborted || result.aborted;
      }
    }

    if (aborted) {
      status = "partial";
      errorMessage = "прерван при остановке процесса; хвост доберёт следующий тик";
    }
  } catch (error) {
    status = "failed";
    errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(
      { event_name: "janitor.run.failed", resource: policy.resourceKey, err: errorMessage },
      "janitor retention run failed",
    );
  } finally {
    await releaseLock(lock);
  }

  const finishedAt = new Date();
  try {
    await recordRun({
      resourceKey: policy.resourceKey,
      mode: "enforce",
      status,
      matchedCount: matched,
      deletedCount: deleted,
      freedBytes,
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      errorMessage,
      startedAt,
      finishedAt,
      triggeredBy: trigger.triggeredBy,
      triggeredByAdminId: trigger.actorId,
    });
  } catch (error) {
    logger.error(
      { resource: policy.resourceKey, err: error instanceof Error ? error.message : String(error) },
      "janitor failed to record run log",
    );
  }

  const durationMs = finishedAt.getTime() - startedAt.getTime();
  janitorRunsTotal.inc({ policy: policy.resourceKey, status, trigger: trigger.triggeredBy });
  janitorRunDurationSeconds.observe({ policy: policy.resourceKey }, durationMs / 1000);
  if (deleted > 0) {
    janitorDeletedItemsTotal.inc({ policy: policy.resourceKey }, deleted);
  }
  if (freedBytes > 0) {
    janitorFreedBytesTotal.inc({ policy: policy.resourceKey }, freedBytes);
  }
  if (status === "success") {
    janitorLastSuccessTimestampSeconds.set({ policy: policy.resourceKey }, finishedAt.getTime() / 1000);
  }

  logger.info(
    {
      event_name: "janitor.run",
      resource: policy.resourceKey,
      mode: "enforce",
      action: policy.action,
      status,
      matched,
      deleted,
      freed_bytes: freedBytes,
      duration_ms: durationMs,
    },
    "janitor enforce: retention applied",
  );

  return { status, matched, deleted, freedBytes };
}

/** Внеплановый прогон конкретной политики (для admin run-now). Пишется как 'manual'. */
export async function runPolicyNow(
  resourceKey: string,
  stores: JanitorStores = defaultStores(),
  actorId: string | null = null,
): Promise<RunPolicyOutcome> {
  const policies = await listResolvedPolicies();
  const policy = policies.find((item) => item.resourceKey === resourceKey);
  if (!policy) {
    return { status: "skipped_disabled", matched: 0, deleted: 0, freedBytes: 0 };
  }
  return runPolicy(policy, stores, { triggeredBy: "manual", actorId });
}

/** Предпросмотр: всегда dry_run, без записи в журнал. Возвращает «удалил бы N». */
export async function previewPolicy(
  resourceKey: string,
  stores: JanitorStores = defaultStores(),
): Promise<{ matched: number }> {
  const policies = await listResolvedPolicies();
  const policy = policies.find((item) => item.resourceKey === resourceKey);
  const taskDef = getJanitorTask(resourceKey);
  if (!policy || !taskDef) {
    return { matched: 0 };
  }

  if (storageOf(taskDef) === "qdrant") {
    const result = await runQdrantOrphanGcTask(
      { mode: "dry_run", retentionDays: policy.retentionDays, batchSize: policy.batchSize },
      stores.qdrant,
      { maxBatchesPerRun: MAX_BATCHES_PER_RUN },
    );
    return { matched: result.matched };
  }

  if (storageOf(taskDef) === "s3_reconcile") {
    const result = await runFeedbackAttachmentOrphanTask(
      { mode: "dry_run", retentionDays: policy.retentionDays, batchSize: policy.batchSize },
      stores.feedbackAttachmentOrphans,
      { maxBatchesPerRun: MAX_BATCHES_PER_RUN },
    );
    return { matched: result.matched };
  }

  if (storageOf(taskDef) === "s3") {
    const result = await runS3RetentionTask(
      s3FilterOf(taskDef),
      { mode: "dry_run", retentionDays: policy.retentionDays, batchSize: policy.batchSize },
      resolveS3Store(stores, taskDef),
      { maxBatchesPerRun: MAX_BATCHES_PER_RUN },
    );
    return { matched: result.matched };
  }

  let matched = 0;
  for (const op of operationsOf(taskDef)) {
    const result = await runRetentionTask(
      op,
      {
        action: op.action,
        mode: "dry_run",
        retentionDays: policy.retentionDays,
        batchSize: policy.batchSize,
      },
      stores.pg,
      { maxBatchesPerRun: MAX_BATCHES_PER_RUN },
    );
    matched += result.matched;
  }
  return { matched };
}

/** Один проход оркестратора: прогоняет все включённые и "созревшие" политики. */
export async function runDuePoliciesOnce(
  stores: JanitorStores = defaultStores(),
  now: Date = new Date(),
  shouldStop?: () => boolean,
): Promise<void> {
  const policies = await listResolvedPolicies();
  for (const policy of policies) {
    if (shouldStop?.()) {
      return;
    }
    if (!policy.enabled) {
      continue;
    }
    if (!isDue(policy, now)) {
      continue;
    }
    await runPolicy(policy, stores, AUTO_TRIGGER, { shouldAbort: shouldStop });
  }
}

export interface JanitorOrchestratorHandle {
  /** Останавливает тикер и дожидается завершения текущего прохода (прерывается между батчами). */
  stop(): Promise<void>;
}

export function startJanitorOrchestrator(): JanitorOrchestratorHandle | null {
  if (!isEnabled()) {
    logger.info("janitor orchestrator disabled (JANITOR_ENABLED=false)");
    return null;
  }

  const stores = defaultStores();
  let stopped = false;
  let currentPass: Promise<void> | null = null;

  const tick = () => {
    if (stopped) {
      return;
    }
    if (currentPass) {
      // Предыдущий проход ещё идёт (долгая уборка) — не наслаиваем второй.
      logger.debug("janitor tick skipped: previous pass still running");
      return;
    }
    currentPass = runDuePoliciesOnce(stores, new Date(), () => stopped)
      .catch((error) => {
        logger.error(
          { err: error instanceof Error ? error.message : String(error) },
          "janitor orchestrator tick failed",
        );
      })
      .finally(() => {
        currentPass = null;
      });
  };

  const timer = setInterval(() => {
    if (!stopped) {
      tick();
    }
  }, TICK_MINUTES * MINUTE_MS);
  timer.unref?.();

  // первый прогон сразу, но неблокирующе
  tick();

  logger.info(
    { event_name: "janitor.orchestrator.started", tick_minutes: TICK_MINUTES },
    "janitor orchestrator started",
  );

  return {
    async stop() {
      stopped = true;
      clearInterval(timer);
      if (currentPass) {
        await currentPass.catch(() => undefined);
      }
    },
  };
}
