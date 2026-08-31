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
  /**
   * Фаза A двухфазного purge (target.drainChildrenFirst): один стейтмент дренажа —
   * удаляет до batchSize ДОЧЕРНИХ строк (chat_sessions) у корней-кандидатов, чтобы
   * объём работы каждого стейтмента был ограничен независимо от размера корня.
   * Возвращает число удалённых дочерних строк.
   */
  drainChildrenBatch?(params: DeleteBatchParams): Promise<number>;
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
  /** Дочерние строки (чаты), удалённые дренажными стейтментами фазы A; в deleted не входят. */
  drainedChildren: number;
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
 *
 * Для целей с drainChildrenFirst (двухфазный purge) прогон начинается с фазы A:
 * дренажные стейтменты удаляют дочерние chat_sessions кандидатов порциями по
 * batchSize ЧАТОВ, и только когда дренаж исчерпан, фаза B удаляет сами корни
 * порциями по batchSize КОРНЕЙ. Каждый стейтмент обеих фаз — отдельный батч
 * (maxBatchesPerRun, pauseBetweenBatchesMs и shouldAbort действуют между ними);
 * прерванный прогон оставляет консистентное состояние — хвост доберёт следующий тик.
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
    return { matched, deleted: 0, batches: 0, drainedChildren: 0, aborted: false };
  }

  let deleted = 0;
  let drainedChildren = 0;
  let batches = 0;
  let aborted = false;
  // Фаза A активна, пока дренажные стейтменты возвращают полный батч; неполный
  // батч означает «дренировать больше нечего» — переключаемся на фазу B (корни).
  let draining =
    resolved.action === "delete_rows" &&
    target.drainChildrenFirst === true &&
    typeof store.drainChildrenBatch === "function";
  while (batches < maxBatches) {
    if (options.shouldAbort?.()) {
      aborted = true;
      break;
    }
    if (draining && store.drainChildrenBatch) {
      const drained = await store.drainChildrenBatch({
        table: target.table,
        timeColumn: target.timeColumn,
        pkColumn: target.pkColumn,
        cutoff,
        equalsFilter,
        batchSize: resolved.batchSize,
      });
      drainedChildren += drained;
      batches += 1;
      if (drained < resolved.batchSize) {
        draining = false;
      }
    } else {
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
    }
    if (options.pauseBetweenBatchesMs && options.pauseBetweenBatchesMs > 0) {
      await delay(options.pauseBetweenBatchesMs);
    }
  }
  return { matched: deleted, deleted, batches, drainedChildren, aborted };
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
 * Общий хвост cascade-safe стейтментов: snapshots вложений кандидатов (+ адрес
 * Files-копии) и атомарный enqueue в durable file-cleanup очередь. Барьер
 * enqueue_barrier заставляет DELETE дождаться фиксации snapshots в том же CTE.
 */
function attachmentCleanupCtes(attachmentSource: SQL, reason: string): SQL {
  return sql`snapshots AS MATERIALIZED (
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
    )`;
}

/**
 * `chat_sessions` и `assistants` каскадят chat_attachments. Один data-modifying
 * CTE сначала фиксирует immutable snapshots в durable-очереди и только затем
 * удаляет корневые строки. Любая ошибка откатывает и enqueue, и DELETE.
 *
 * Для `assistants` это фаза B двухфазного purge: удаляются только кандидаты,
 * у которых уже НЕ осталось chat_sessions (их порциями снесла фаза A —
 * drainAssistantChatSessions), поэтому snapshots здесь заведомо пустые, а каскад
 * ограничен мелкими конфиг-таблицами самого ассистента.
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
  const noRemainingChildren = params.table === "assistants"
    ? sql`
        AND NOT EXISTS (
          SELECT 1 FROM chat_sessions AS child
          WHERE child.assistant_id = root.id
        )`
    : sql``;
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
        AND ${noActiveAsr}${noRemainingChildren}
      ORDER BY root.${timeId}, root.${pkId}
      FOR UPDATE OF root SKIP LOCKED
      LIMIT ${params.batchSize}
    ), ${attachmentCleanupCtes(attachmentSource, reason)}, deleted AS (
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
 * Фаза A двухфазного purge архивных ассистентов: удаляет порцию chat_sessions
 * кандидатов (условия кандидата те же, что в фазе B, но БЕЗ требования «чатов не
 * осталось»; deleted_at чата не учитывается — дренируются ВСЕ его чаты). Порция
 * считается в ЧАТАХ, поэтому объём стейтмента ограничен batchSize независимо от
 * размера ассистента. Snapshots вложений порции атомарно enqueue-ятся, как в
 * политике pg.chat_sessions; idempotency_key делает повтор после отката безопасным.
 */
async function drainAssistantChatSessions(
  database: RetentionExecutor,
  params: DeleteBatchParams,
): Promise<number> {
  const timeId = sql.identifier(params.timeColumn);
  const pkId = sql.identifier(params.pkColumn);
  const equals = cascadeRootEqualsFragment(params.equalsFilter);
  const noActiveAsr = rootHasNoActiveAsr("assistants");
  const attachmentSource = sql`chat_attachments AS attachment
          JOIN candidates ON candidates.id = attachment.chat_id`;

  const query = sql`
    WITH candidates AS MATERIALIZED (
      SELECT chat.id AS id
      FROM chat_sessions AS chat
      JOIN assistants AS root ON root.id = chat.assistant_id
      WHERE root.${timeId} < ${params.cutoff}${equals}
        AND ${noActiveAsr}
      ORDER BY root.${timeId}, root.${pkId}, chat.id
      FOR UPDATE OF chat, root SKIP LOCKED
      LIMIT ${params.batchSize}
    ), ${attachmentCleanupCtes(attachmentSource, "pg.assistants.archived")}, deleted AS (
      DELETE FROM chat_sessions AS chat
      USING candidates, enqueue_barrier
      WHERE chat.id = candidates.id
      RETURNING chat.id
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

    async drainChildrenBatch({ table, timeColumn, pkColumn, cutoff, equalsFilter, batchSize }) {
      if (table !== "assistants") {
        throw new Error(`pg retention: drainChildrenBatch поддерживает только assistants, получена таблица "${table}"`);
      }
      return drainAssistantChatSessions(database, {
        table,
        timeColumn,
        pkColumn,
        cutoff,
        equalsFilter,
        batchSize,
      });
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
