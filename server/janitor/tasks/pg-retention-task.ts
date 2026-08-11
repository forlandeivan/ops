import { sql, type SQL } from "drizzle-orm";

import { db } from "../../db";
import type { CleanupAction, CleanupMode } from "@shared/cleanup-policies";
import { FILE_ARTIFACT_CLEANUP_REDRIVE_DELAY_MS } from "../file-artifact-cleanup-job-store";
import type { JanitorOperation } from "../janitor-task-registry";

const DAY_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_MAX_BATCHES_PER_RUN = 50;

/**
 * Хранилище-исполнитель retention-операций. Инъекция нужна, чтобы движок
 * тестировался детерминированно без живой БД; в проде это createPgRetentionStore.
 */
/** Доп. условие равенства по колонке (напр. source='autosave'). */
export interface ColumnEquals {
  column: string;
  value: string;
}
export interface CountMatchesParams {
  table: string;
  timeColumn: string;
  cutoff: Date;
  requireNonNullAny?: string[];
  equalsFilter?: ColumnEquals;
  cap: number;
}
export interface DeleteBatchParams {
  table: string;
  timeColumn: string;
  pkColumn: string;
  cutoff: Date;
  equalsFilter?: ColumnEquals;
  batchSize: number;
}
export interface StripBatchParams {
  table: string;
  timeColumn: string;
  pkColumn: string;
  columns: string[];
  cutoff: Date;
  equalsFilter?: ColumnEquals;
  batchSize: number;
}
export interface RetentionStore {
  countMatches(params: CountMatchesParams): Promise<number>;
  deleteBatch(params: DeleteBatchParams): Promise<number>;
  stripBatch(params: StripBatchParams): Promise<number>;
}

export interface ResolvedRetention {
  action: CleanupAction;
  mode: CleanupMode;
  retentionDays: number;
  batchSize: number;
}

export interface RetentionOptions {
  now?: Date;
  maxBatchesPerRun?: number;
  dryRunCap?: number;
  pauseBetweenBatchesMs?: number;
  /** Кооперативная остановка (graceful shutdown): true → прерваться перед следующим батчем. */
  shouldAbort?: () => boolean;
}

export interface RetentionResult {
  matched: number;
  deleted: number;
  batches: number;
  /** Прогон прерван shouldAbort до исчерпания кандидатов (хвост доберёт следующий тик). */
  aborted: boolean;
}

export function computeCutoff(now: Date, retentionDays: number): Date {
  return new Date(now.getTime() - retentionDays * DAY_MS);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Прогон одной retention-задачи. В dry_run только считает кандидатов и НИЧЕГО не
 * меняет. В enforce удаляет/обнуляет батчами по первичному ключу до исчерпания или
 * до maxBatchesPerRun (ограничивает один прогон, чтобы не держать БД долго).
 */
export async function runRetentionTask(
  target: JanitorOperation,
  resolved: ResolvedRetention,
  store: RetentionStore,
  options: RetentionOptions = {},
): Promise<RetentionResult> {
  const now = options.now ?? new Date();
  const cutoff = computeCutoff(now, resolved.retentionDays);
  const maxBatches = options.maxBatchesPerRun ?? DEFAULT_MAX_BATCHES_PER_RUN;
  const dryRunCap = options.dryRunCap ?? maxBatches * resolved.batchSize;
  const requireNonNullAny = resolved.action === "strip_columns" ? target.strippedColumns : undefined;
  const equalsFilter = target.equalsFilter ?? undefined;

  if (resolved.mode === "dry_run") {
    const matched = await store.countMatches({
      table: target.table,
      timeColumn: target.timeColumn,
      cutoff,
      requireNonNullAny,
      equalsFilter,
      cap: dryRunCap,
    });
    return { matched, deleted: 0, batches: 0, aborted: false };
  }

  let deleted = 0;
  let batches = 0;
  let aborted = false;
  while (batches < maxBatches) {
    if (options.shouldAbort?.()) {
      aborted = true;
      break;
    }
    const affected =
      resolved.action === "delete_rows"
        ? await store.deleteBatch({
            table: target.table,
            timeColumn: target.timeColumn,
            pkColumn: target.pkColumn,
            cutoff,
            equalsFilter,
            batchSize: resolved.batchSize,
          })
        : await store.stripBatch({
            table: target.table,
            timeColumn: target.timeColumn,
            pkColumn: target.pkColumn,
            columns: target.strippedColumns,
            cutoff,
            equalsFilter,
            batchSize: resolved.batchSize,
          });
    deleted += affected;
    batches += 1;
    if (affected < resolved.batchSize) {
      break;
    }
    if (options.pauseBetweenBatchesMs && options.pauseBetweenBatchesMs > 0) {
      await delay(options.pauseBetweenBatchesMs);
    }
  }
  return { matched: deleted, deleted, batches, aborted };
}

type RetentionExecutor = { execute(query: SQL): Promise<unknown> };

function affectedRows(result: unknown): number {
  const typed = result as { rowCount?: number | null; rows?: unknown[] };
  if (typeof typed.rowCount === "number") {
    return typed.rowCount;
  }
  if (Array.isArray(typed.rows)) {
    return typed.rows.length;
  }
  return 0;
}

function firstCount(result: unknown): number {
  const typed = result as { rows?: Array<Record<string, unknown>> };
  const raw = typed.rows?.[0]?.count;
  const parsed = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function firstAffected(result: unknown): number {
  const typed = result as { rows?: Array<Record<string, unknown>> };
  const raw = typed.rows?.[0]?.affected;
  const parsed = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

type CascadeCleanupRoot = "chat_sessions" | "assistants";

function isCascadeCleanupRoot(table: string): table is CascadeCleanupRoot {
  return table === "chat_sessions" || table === "assistants";
}

function rootHasNoActiveAsr(table: CascadeCleanupRoot) {
  if (table === "chat_sessions") {
    return sql`
      NOT EXISTS (
        SELECT 1 FROM asr_completion_jobs AS completion
        WHERE completion.chat_id = root.id
          AND completion.status NOT IN ('success', 'error', 'cancelled')
      )
      AND NOT EXISTS (
        SELECT 1 FROM asr_executions AS execution
        WHERE execution.chat_id::text = root.id
          AND COALESCE(execution.lifecycle_status, execution.status, 'accepted')
              NOT IN ('completed', 'failed', 'cancelled', 'expired')
      )
    `;
  }
  return sql`
    NOT EXISTS (
      SELECT 1 FROM asr_completion_jobs AS completion
      WHERE completion.assistant_id = root.id
        AND completion.status NOT IN ('success', 'error', 'cancelled')
    )
    AND NOT EXISTS (
      SELECT 1 FROM asr_executions AS execution
      WHERE execution.assistant_id = root.id
        AND COALESCE(execution.lifecycle_status, execution.status, 'accepted')
            NOT IN ('completed', 'failed', 'cancelled', 'expired')
    )
  `;
}

function cascadeRootEqualsFragment(equalsFilter?: ColumnEquals) {
  return equalsFilter
    ? sql` AND root.${sql.identifier(equalsFilter.column)} = ${equalsFilter.value}`
    : sql``;
}

async function countCascadeSafeRoots(
  database: RetentionExecutor,
  params: CountMatchesParams & { table: CascadeCleanupRoot },
): Promise<number> {
  const tableId = sql.identifier(params.table);
  const timeId = sql.identifier(params.timeColumn);
  const equals = cascadeRootEqualsFragment(params.equalsFilter);
  const noActiveAsr = rootHasNoActiveAsr(params.table);
  const query = sql`
    SELECT count(*)::int AS count
    FROM (
      SELECT root.id
      FROM ${tableId} AS root
      WHERE root.${timeId} < ${params.cutoff}${equals}
        AND ${noActiveAsr}
      ORDER BY root.${timeId}, root.id
      LIMIT ${params.cap}
    ) AS eligible
  `;
  return firstCount(await database.execute(query));
}

/**
 * `chat_sessions` и `assistants` каскадят chat_attachments. Один data-modifying
 * CTE сначала фиксирует immutable snapshots в durable-очереди и только затем
 * удаляет корневые строки. Любая ошибка откатывает и enqueue, и DELETE.
 */
async function deleteCascadeSafeRoots(
  database: RetentionExecutor,
  params: DeleteBatchParams & { table: CascadeCleanupRoot },
): Promise<number> {
  const tableId = sql.identifier(params.table);
  const timeId = sql.identifier(params.timeColumn);
  const pkId = sql.identifier(params.pkColumn);
  const equals = cascadeRootEqualsFragment(params.equalsFilter);
  const noActiveAsr = rootHasNoActiveAsr(params.table);
  const reason = params.table === "chat_sessions" ? "pg.chat_sessions" : "pg.assistants.archived";
  const attachmentSource = params.table === "chat_sessions"
    ? sql`chat_attachments AS attachment
          JOIN candidates ON candidates.id = attachment.chat_id`
    : sql`chat_attachments AS attachment
          JOIN chat_sessions AS session ON session.id = attachment.chat_id
          JOIN candidates ON candidates.id = session.assistant_id`;

  const query = sql`
    WITH candidates AS MATERIALIZED (
      SELECT root.${pkId} AS id
      FROM ${tableId} AS root
      WHERE root.${timeId} < ${params.cutoff}${equals}
        AND ${noActiveAsr}
      ORDER BY root.${timeId}, root.${pkId}
      FOR UPDATE OF root SKIP LOCKED
      LIMIT ${params.batchSize}
    ), snapshots AS MATERIALIZED (
      SELECT
        attachment.id,
        attachment.workspace_id,
        attachment.chat_id,
        attachment.file_id,
        attachment.filename,
        attachment.mime_type,
        attachment.storage_key,
        attachment.document_version,
        attachment.derived_manifest_object_key,
        attachment.preview_object_key,
        files.external_uri
      FROM ${attachmentSource}
      LEFT JOIN files ON files.id = attachment.file_id
    ), enqueued AS (
      INSERT INTO file_artifact_cleanup_jobs (
        idempotency_key, workspace_id, resource_type, resource_id, reason,
        payload_version, payload, status, attempts, created_at, updated_at
      )
      SELECT
        'janitor:' || md5(concat_ws(chr(31),
          snapshots.workspace_id,
          'chat_attachment',
          snapshots.id,
          COALESCE(snapshots.storage_key, ''),
          COALESCE(snapshots.external_uri, ''),
          COALESCE(snapshots.document_version::text, '')
        )),
        snapshots.workspace_id,
        'chat_attachment',
        snapshots.id,
        ${reason},
        1,
        jsonb_build_object(
          'attachmentId', snapshots.id,
          'chatId', snapshots.chat_id,
          'fileId', snapshots.file_id,
          'filename', snapshots.filename,
          'mimeType', snapshots.mime_type,
          'storageKey', snapshots.storage_key,
          'documentVersion', snapshots.document_version,
          'derivedManifestObjectKey', snapshots.derived_manifest_object_key,
          'previewObjectKey', snapshots.preview_object_key,
          'externalUri', snapshots.external_uri
        ),
        'pending', 0, NOW(), NOW()
      FROM snapshots
      ON CONFLICT (idempotency_key) DO UPDATE
      SET status = 'pending',
          worker_id = NULL,
          lease_expires_at = NULL,
          next_retry_at = NOW() + (${FILE_ARTIFACT_CLEANUP_REDRIVE_DELAY_MS} * INTERVAL '1 millisecond'),
          updated_at = NOW()
      WHERE file_artifact_cleanup_jobs.status = 'error'
        AND file_artifact_cleanup_jobs.next_retry_at IS NULL
      RETURNING id
    ), enqueue_barrier AS (
      SELECT count(*) AS inserted FROM enqueued
    ), deleted AS (
      DELETE FROM ${tableId} AS root
      USING candidates, enqueue_barrier
      WHERE root.${pkId} = candidates.id
      RETURNING root.${pkId}
    )
    SELECT count(*)::int AS affected FROM deleted
  `;
  return firstAffected(await database.execute(query));
}

/**
 * Боевое хранилище поверх drizzle. Имена таблиц/колонок берутся ТОЛЬКО из реестра
 * в коде, но всё равно квотируются через sql.identifier (никакого пользовательского
 * ввода в идентификаторах).
 */
export function createPgRetentionStore(
  database: RetentionExecutor = db as unknown as RetentionExecutor,
): RetentionStore {
  const equalsFragment = (equalsFilter?: ColumnEquals) =>
    equalsFilter ? sql` AND ${sql.identifier(equalsFilter.column)} = ${equalsFilter.value}` : sql``;

  return {
    async countMatches({ table, timeColumn, cutoff, requireNonNullAny, equalsFilter, cap }) {
      if (isCascadeCleanupRoot(table)) {
        return countCascadeSafeRoots(database, {
          table,
          timeColumn,
          cutoff,
          requireNonNullAny,
          equalsFilter,
          cap,
        });
      }
      const tableId = sql.identifier(table);
      const timeId = sql.identifier(timeColumn);
      const equals = equalsFragment(equalsFilter);
      const nonNull =
        requireNonNullAny && requireNonNullAny.length > 0
          ? sql` AND (${sql.join(
              requireNonNullAny.map((column) => sql`${sql.identifier(column)} IS NOT NULL`),
              sql` OR `,
            )})`
          : sql``;
      const query = sql`SELECT count(*)::int AS count FROM (SELECT 1 FROM ${tableId} WHERE ${timeId} < ${cutoff}${equals}${nonNull} LIMIT ${cap}) AS sub`;
      return firstCount(await database.execute(query));
    },

    async deleteBatch({ table, timeColumn, pkColumn, cutoff, equalsFilter, batchSize }) {
      if (isCascadeCleanupRoot(table)) {
        return deleteCascadeSafeRoots(database, {
          table,
          timeColumn,
          pkColumn,
          cutoff,
          equalsFilter,
          batchSize,
        });
      }
      const tableId = sql.identifier(table);
      const timeId = sql.identifier(timeColumn);
      const pkId = sql.identifier(pkColumn);
      const equals = equalsFragment(equalsFilter);
      const query = sql`DELETE FROM ${tableId} WHERE ${pkId} IN (SELECT ${pkId} FROM ${tableId} WHERE ${timeId} < ${cutoff}${equals} ORDER BY ${timeId} LIMIT ${batchSize})`;
      return affectedRows(await database.execute(query));
    },

    async stripBatch({ table, timeColumn, pkColumn, columns, cutoff, equalsFilter, batchSize }) {
      const tableId = sql.identifier(table);
      const timeId = sql.identifier(timeColumn);
      const pkId = sql.identifier(pkColumn);
      const equals = equalsFragment(equalsFilter);
      const setList = sql.join(
        columns.map((column) => sql`${sql.identifier(column)} = NULL`),
        sql`, `,
      );
      const nonNull = sql.join(
        columns.map((column) => sql`${sql.identifier(column)} IS NOT NULL`),
        sql` OR `,
      );
      const query = sql`UPDATE ${tableId} SET ${setList} WHERE ${pkId} IN (SELECT ${pkId} FROM ${tableId} WHERE ${timeId} < ${cutoff}${equals} AND (${nonNull}) ORDER BY ${timeId} LIMIT ${batchSize})`;
      return affectedRows(await database.execute(query));
    },
  };
}
