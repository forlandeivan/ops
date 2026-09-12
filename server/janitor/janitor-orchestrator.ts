import { createLogger } from "../lib/logger";
import { extendLock, releaseLock, tryAcquireLock, type RedisLockHandle } from "../lib/redis-lock";
import {
  janitorDeletedItemsTotal,
  janitorFreedBytesTotal,
  janitorLastSuccessTimestampSeconds,
  janitorRunDurationSeconds,
  janitorRunsTotal,
} from "../monitoring/janitor-metrics";
import type {
  CleanupMode,
  CleanupPolicyDto,
  CleanupPreviewResultDto,
  CleanupRunReportDto,
  CleanupRunStatus,
  CleanupRunTrigger,
} from "@shared/cleanup-policies";

import {
  JANITOR_TASKS,
  getJanitorTask,
  operationsOf,
  storageOf,
  type JanitorTaskDefinition,
} from "./janitor-task-registry";
import {
  failStaleRunningRuns,
  listResolvedPolicies,
  recordRun,
  recordRunFinish,
  recordRunProgress,
  recordRunStart,
} from "./janitor-policy-service";
import { findMissingColumns, requiredColumnsForOperation } from "./schema-guard";
import { defaultStores, type JanitorStores } from "./default-stores";
import { DEFAULT_MAX_BATCHES_PER_RUN, runRetentionTask } from "./tasks/pg-retention-task";
import {
  runS3RetentionTask,
  type S3CandidateFilter,
  type S3RetentionStore,
} from "./tasks/s3-retention-task";
import { runQdrantOrphanGcTask } from "./tasks/qdrant-orphan-gc-task";
import { runStorageOrphanTask } from "./tasks/storage-orphan-task";

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

/**
 * Фоновый прогон держит короткий лок и продлевает его по ходу: после падения процесса политика
 * освобождается за один TTL, а не через часы.
 */
const BACKGROUND_LOCK_TTL_MS = 10 * MINUTE_MS;
const BACKGROUND_LOCK_RENEW_MS = 3 * MINUTE_MS;
const STALE_RUN_MESSAGE = "прогон оборван перезапуском сервиса уборки";

/** Контекст реконсиляции по содержимому хранилища. */
interface ReconcileRunContext {
  mode: CleanupMode;
  retentionDays: number;
  batchSize: number;
  now: Date;
  shouldAbort?: () => boolean;
  onProgress?: (report: CleanupRunReportDto, matched: number) => Promise<void>;
}

interface ReconcileRunResult {
  matched: number;
  /** Удалено или поставлено на удаление в очередь. */
  deleted: number;
  freedBytes: number;
  aborted: boolean;
  report: CleanupRunReportDto | null;
}

/**
 * Исполнители реконсиляции по содержимому хранилища. Адрес исполнителя — ключ политики.
 *
 * Отсутствие записи означает, что метаданные политики в реестре уже есть, а исполнителя в
 * сервисе ещё нет. Такой прогон обязан падать: однажды ветка `s3_reconcile` уводила любую такую
 * политику в чужую уборку и удалила бы файлы под чужим ключом.
 */
const S3_RECONCILE_RUNNERS: Record<
  string,
  (stores: JanitorStores, context: ReconcileRunContext) => Promise<ReconcileRunResult>
> = {
  "s3.storage.orphans": async (stores, context) => {
    const result = await runStorageOrphanTask(stores.storageOrphans, context);
    return {
      matched: result.matched,
      deleted: result.queuedObjects,
      freedBytes: result.queuedBytes,
      aborted: result.aborted,
      report: result.report,
    };
  },
};

function resolveReconcileRunner(
  task: JanitorTaskDefinition,
): (typeof S3_RECONCILE_RUNNERS)[string] {
  const runner = S3_RECONCILE_RUNNERS[task.key];
  if (!runner) {
    throw new Error(
      `janitor: no storage reconcile executor registered for policy "${task.key}"; run refused`,
    );
  }
  return runner;
}

function resolveS3Store(stores: JanitorStores, task: JanitorTaskDefinition): S3RetentionStore {
  const store = stores.s3[task.table];
  if (!store) {
    throw new Error(`janitor: no S3 store registered for table "${task.table}" (task ${task.key})`);
  }
  return store;
}

function s3FilterOf(task: JanitorTaskDefinition): S3CandidateFilter {
  return {
    policyKey: task.key,
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
  /** Почему фоновый прогон не запущен: уже идёт или занят другим экземпляром. */
  reason?: "already_running" | "locked";
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

function observeRun(
  resourceKey: string,
  trigger: RunPolicyTrigger,
  result: { status: CleanupRunStatus; deleted: number; freedBytes: number; durationMs: number; finishedAt: Date },
): void {
  janitorRunsTotal.inc({ policy: resourceKey, status: result.status, trigger: trigger.triggeredBy });
  janitorRunDurationSeconds.observe({ policy: resourceKey }, result.durationMs / 1000);
  if (result.deleted > 0) {
    janitorDeletedItemsTotal.inc({ policy: resourceKey }, result.deleted);
  }
  if (result.freedBytes > 0) {
    janitorFreedBytesTotal.inc({ policy: resourceKey }, result.freedBytes);
  }
  if (result.status === "success") {
    janitorLastSuccessTimestampSeconds.set({ policy: resourceKey }, result.finishedAt.getTime() / 1000);
  }
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
  // Чаты, удалённые дренажной фазой двухфазного purge; в deleted (корни) не входят.
  let drainedChats = 0;
  let aborted = false;
  let report: CleanupRunReportDto | null = null;

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
      const result = await resolveReconcileRunner(task)(stores, {
        mode: "enforce",
        retentionDays: policy.retentionDays,
        batchSize: policy.batchSize,
        now: startedAt,
        shouldAbort,
      });
      matched += result.matched;
      deleted += result.deleted;
      freedBytes += result.freedBytes;
      aborted = aborted || result.aborted;
      report = result.report;
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
        drainedChats += result.drainedChildren;
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
      report,
    });
  } catch (error) {
    logger.error(
      { resource: policy.resourceKey, err: error instanceof Error ? error.message : String(error) },
      "janitor failed to record run log",
    );
  }

  const durationMs = finishedAt.getTime() - startedAt.getTime();
  observeRun(policy.resourceKey, trigger, { status, deleted, freedBytes, durationMs, finishedAt });

  logger.info(
    {
      event_name: "janitor.run",
      resource: policy.resourceKey,
      mode: "enforce",
      action: policy.action,
      status,
      matched,
      deleted,
      drained_chats: drainedChats,
      freed_bytes: freedBytes,
      duration_ms: durationMs,
    },
    "janitor enforce: retention applied",
  );

  return { status, matched, deleted, freedBytes };
}

// ── Фоновые прогоны ───────────────────────────────────────────────────────────
//
// Сверка хранилища занимает минуты и не укладывается в синхронный вызов из админки. Такой
// прогон стартует в фоне: журнал сразу получает строку со статусом running, по ходу — отчёт,
// в конце — итог. Предпросмотр фоновой политики — такой же прогон в режиме dry_run.

const backgroundRuns = new Map<string, Promise<void>>();
const startingRuns = new Set<string>();
let backgroundStopping = false;

export type BackgroundStartResult =
  | { started: true; runId: string }
  | { started: false; reason: "already_running" | "locked" };

interface BackgroundRunParams {
  policy: CleanupPolicyDto;
  task: JanitorTaskDefinition;
  stores: JanitorStores;
  trigger: RunPolicyTrigger;
  mode: CleanupMode;
  runId: string;
  startedAt: Date;
  lock: RedisLockHandle;
}

async function executeBackgroundRun(params: BackgroundRunParams): Promise<void> {
  const { policy, task, stores, trigger, mode, runId, startedAt, lock } = params;
  const renew = setInterval(() => {
    void extendLock(lock, BACKGROUND_LOCK_TTL_MS).then((extended) => {
      if (!extended) {
        logger.warn({ resource: policy.resourceKey, runId }, "janitor background run could not extend its lock");
      }
    });
  }, BACKGROUND_LOCK_RENEW_MS);
  renew.unref?.();

  let status: CleanupRunStatus = "success";
  let errorMessage: string | null = null;
  let result: ReconcileRunResult | null = null;
  try {
    result = await resolveReconcileRunner(task)(stores, {
      mode,
      retentionDays: policy.retentionDays,
      batchSize: policy.batchSize,
      now: startedAt,
      shouldAbort: () => backgroundStopping,
      onProgress: (report, matched) => recordRunProgress(runId, { matchedCount: matched, report }),
    });
    if (result.aborted) {
      status = "partial";
      errorMessage = "прерван при остановке процесса; остаток доберёт следующий прогон";
    }
  } catch (error) {
    status = "failed";
    errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(
      { event_name: "janitor.run.failed", resource: policy.resourceKey, mode, err: errorMessage },
      "janitor background run failed",
    );
  } finally {
    clearInterval(renew);
    await releaseLock(lock);
  }

  const finishedAt = new Date();
  const durationMs = finishedAt.getTime() - startedAt.getTime();
  const deleted = mode === "enforce" ? (result?.deleted ?? 0) : 0;
  const freedBytes = mode === "enforce" ? (result?.freedBytes ?? 0) : 0;
  try {
    await recordRunFinish(runId, {
      status,
      matchedCount: result?.matched ?? 0,
      deletedCount: deleted,
      freedBytes,
      durationMs,
      errorMessage,
      finishedAt,
      ...(result?.report ? { report: result.report } : {}),
    });
  } catch (error) {
    logger.error(
      { resource: policy.resourceKey, runId, err: error instanceof Error ? error.message : String(error) },
      "janitor failed to record background run result",
    );
  }

  if (mode === "enforce") {
    observeRun(policy.resourceKey, trigger, { status, deleted, freedBytes, durationMs, finishedAt });
  }
  logger.info(
    {
      event_name: "janitor.run",
      resource: policy.resourceKey,
      mode,
      status,
      matched: result?.matched ?? 0,
      deleted,
      freed_bytes: freedBytes,
      duration_ms: durationMs,
    },
    "janitor background run finished",
  );
}

/**
 * Запускает фоновый прогон и сразу возвращает ответ. Повторный запуск, пока прогон идёт здесь
 * или в другом экземпляре сервиса, не стартует.
 */
export async function startPolicyInBackground(
  policy: CleanupPolicyDto,
  stores: JanitorStores,
  trigger: RunPolicyTrigger,
  mode: CleanupMode,
): Promise<BackgroundStartResult> {
  const key = policy.resourceKey;
  const task = getJanitorTask(key);
  if (!task) {
    throw new Error(`janitor: unknown policy "${key}"`);
  }
  if (backgroundRuns.has(key) || startingRuns.has(key)) {
    return { started: false, reason: "already_running" };
  }
  if (backgroundStopping) {
    return { started: false, reason: "locked" };
  }

  startingRuns.add(key);
  let lock: RedisLockHandle | null = null;
  try {
    lock = await tryAcquireLock(`janitor:${key}`, BACKGROUND_LOCK_TTL_MS, { failClosed: lockFailClosed() });
    if (!lock) {
      return { started: false, reason: "locked" };
    }
    // Лок у нас: строки «идёт» этой политики остались от оборванного прогона.
    await failStaleRunningRuns({ resourceKey: key, startedBefore: new Date(), message: STALE_RUN_MESSAGE });
    const startedAt = new Date();
    const runId = await recordRunStart({
      resourceKey: key,
      mode,
      startedAt,
      triggeredBy: trigger.triggeredBy,
      triggeredByAdminId: trigger.actorId,
    });
    const run = executeBackgroundRun({ policy, task, stores, trigger, mode, runId, startedAt, lock })
      .catch((error: unknown) => {
        logger.error(
          { resource: key, runId, err: error instanceof Error ? error.message : String(error) },
          "janitor background run crashed",
        );
      })
      .finally(() => {
        backgroundRuns.delete(key);
      });
    backgroundRuns.set(key, run);
    lock = null; // лок передан прогону, он и отпустит
    return { started: true, runId };
  } finally {
    startingRuns.delete(key);
    if (lock) {
      await releaseLock(lock);
    }
  }
}

/** Дожидается фоновых прогонов этого процесса. */
export async function waitForBackgroundRuns(): Promise<void> {
  await Promise.allSettled([...backgroundRuns.values()]);
}

/** Прерывает фоновые прогоны при остановке процесса: итог каждого пишется в журнал как partial. */
export async function stopBackgroundRuns(): Promise<void> {
  backgroundStopping = true;
  await waitForBackgroundRuns();
}

/**
 * Строки «идёт» фоновых политик, чей прогон оборвался вместе с процессом. Лок свободен — значит,
 * прогон нигде не идёт, и строку можно закрыть.
 */
async function reapStaleBackgroundRuns(): Promise<void> {
  for (const task of JANITOR_TASKS) {
    if (!task.backgroundRun || backgroundRuns.has(task.key) || startingRuns.has(task.key)) {
      continue;
    }
    const lock = await tryAcquireLock(`janitor:${task.key}`, MINUTE_MS, { failClosed: lockFailClosed() });
    if (!lock) {
      continue;
    }
    try {
      await failStaleRunningRuns({ resourceKey: task.key, startedBefore: new Date(), message: STALE_RUN_MESSAGE });
    } finally {
      await releaseLock(lock);
    }
  }
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
  const trigger: RunPolicyTrigger = { triggeredBy: "manual", actorId };
  if (getJanitorTask(resourceKey)?.backgroundRun) {
    const started = await startPolicyInBackground(policy, stores, trigger, "enforce");
    return started.started
      ? { status: "running", matched: 0, deleted: 0, freedBytes: 0 }
      : { status: "skipped_locked", matched: 0, deleted: 0, freedBytes: 0, reason: started.reason };
  }
  return runPolicy(policy, stores, trigger);
}

/**
 * Предпросмотр: dry_run, «удалил бы N». Обычная политика считает синхронно и в журнал не пишет.
 * Фоновая запускает проверку и отвечает сразу: отчёт появится в журнале.
 */
export async function previewPolicy(
  resourceKey: string,
  stores: JanitorStores = defaultStores(),
  actorId: string | null = null,
): Promise<CleanupPreviewResultDto> {
  const policies = await listResolvedPolicies();
  const policy = policies.find((item) => item.resourceKey === resourceKey);
  const taskDef = getJanitorTask(resourceKey);
  if (!policy || !taskDef) {
    return { matched: 0 };
  }

  if (taskDef.backgroundRun) {
    const matched = policy.lastRun?.matchedCount ?? 0;
    const started = await startPolicyInBackground(policy, stores, { triggeredBy: "manual", actorId }, "dry_run");
    return started.started ? { matched, started: true } : { matched, started: false, reason: started.reason };
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
    const result = await resolveReconcileRunner(taskDef)(stores, {
      mode: "dry_run",
      retentionDays: policy.retentionDays,
      batchSize: policy.batchSize,
      now: new Date(),
    });
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

/**
 * Один проход оркестратора: прогоняет все включённые и "созревшие" политики. Фоновые политики
 * только запускаются: проход их не ждёт.
 */
export async function runDuePoliciesOnce(
  stores: JanitorStores = defaultStores(),
  now: Date = new Date(),
  shouldStop?: () => boolean,
): Promise<void> {
  try {
    await reapStaleBackgroundRuns();
  } catch (error) {
    logger.warn(
      { err: error instanceof Error ? error.message : String(error) },
      "janitor could not close stale background runs",
    );
  }

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
    if (getJanitorTask(policy.resourceKey)?.backgroundRun) {
      const started = await startPolicyInBackground(policy, stores, AUTO_TRIGGER, "enforce");
      if (!started.started) {
        logger.debug({ resource: policy.resourceKey, reason: started.reason }, "janitor background run not started");
      }
      continue;
    }
    await runPolicy(policy, stores, AUTO_TRIGGER, { shouldAbort: shouldStop });
  }
}

export interface JanitorOrchestratorHandle {
  /** Останавливает тикер и дожидается завершения текущего прохода и фоновых прогонов. */
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
      await stopBackgroundRuns();
    },
  };
}
