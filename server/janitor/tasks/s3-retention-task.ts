import { sql } from "drizzle-orm";

import { db } from "../../db";
import type { CleanupMode } from "@shared/cleanup-policies";

import { computeCutoff, DEFAULT_MAX_BATCHES_PER_RUN } from "./pg-retention-task";

/**
 * Исполнитель retention-операций для объектного хранилища (S3/MinIO). По образцу
 * pg-retention-task: движок generic над инъецируемым стором, чтобы тестироваться
 * детерминированно без живого S3. Семья A («по базе»): источник правды — строка БД.
 * Для chat_attachments стор ставит durable snapshot в очередь, а для лёгких ресурсов
 * может завершить удаление синхронно. Связанные данные (например, транскрипт) сохраняются.
 */

/** Фильтр отбора строк-кандидатов на удаление файла. */
export interface S3CandidateFilter {
  /** Ключ политики, который попадёт в reason durable cleanup-задачи. */
  policyKey?: string;
  /** Колонка-время для отбора по возрасту (cutoff = now - retentionDays). */
  timeColumn: string;
  /** Префиксы mime для отбора (напр. ["audio/", "video/"]); пусто — без фильтра по типу. */
  mimePrefixes: string[];
  /** true — отбирать строки, чей mime НЕ из mimePrefixes (включая mime IS NULL). */
  mimePrefixExclude: boolean;
  /** Колонка, которая должна быть NULL для отбора (напр. message_id для черновиков). */
  isNullColumn: string | null;
}

export interface S3CountParams {
  filter: S3CandidateFilter;
  cutoff: Date;
  cap: number;
}

export interface S3PurgeParams {
  filter: S3CandidateFilter;
  cutoff: Date;
  batchSize: number;
}

export interface S3PurgeResult {
  /** Сколько объектов удалено либо durable-задач поставлено за батч. */
  deleted: number;
  /** Сколько байт освобождено за батч (оценка по размеру основного файла). */
  freedBytes: number;
}

/**
 * Стор-исполнитель. countMatches — сколько кандидатов (для dry_run). purgeBatch —
 * выбрать батч, удалить объекты, обнулить адреса, вернуть счётчики. После обнуления
 * адреса строка больше не матчится → прогресс гарантирован, повтор идемпотентен.
 */
export interface S3RetentionStore {
  countMatches(params: S3CountParams): Promise<number>;
  purgeBatch(params: S3PurgeParams): Promise<S3PurgeResult>;
}

export interface S3ResolvedRetention {
  mode: CleanupMode;
  retentionDays: number;
  batchSize: number;
}

export interface S3RetentionOptions {
  now?: Date;
  maxBatchesPerRun?: number;
  dryRunCap?: number;
  pauseBetweenBatchesMs?: number;
  /** Кооперативная остановка (graceful shutdown): true → прерваться перед следующим батчем. */
  shouldAbort?: () => boolean;
}

export interface S3RetentionResult {
  matched: number;
  deleted: number;
  freedBytes: number;
  batches: number;
  /** Прогон прерван shouldAbort до исчерпания кандидатов (хвост доберёт следующий тик). */
  aborted: boolean;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Прогон одной S3 retention-задачи. dry_run — только считает кандидатов, ничего не
 * трогает. enforce — удаляет объекты батчами до исчерпания или maxBatchesPerRun.
 */
export async function runS3RetentionTask(
  filter: S3CandidateFilter,
  resolved: S3ResolvedRetention,
  store: S3RetentionStore,
  options: S3RetentionOptions = {},
): Promise<S3RetentionResult> {
  const now = options.now ?? new Date();
  const cutoff = computeCutoff(now, resolved.retentionDays);
  const maxBatches = options.maxBatchesPerRun ?? DEFAULT_MAX_BATCHES_PER_RUN;
  const dryRunCap = options.dryRunCap ?? maxBatches * resolved.batchSize;

  if (resolved.mode === "dry_run") {
    const matched = await store.countMatches({ filter, cutoff, cap: dryRunCap });
    return { matched, deleted: 0, freedBytes: 0, batches: 0, aborted: false };
  }

  let deleted = 0;
  let freedBytes = 0;
  let batches = 0;
  let aborted = false;
  while (batches < maxBatches) {
    if (options.shouldAbort?.()) {
      aborted = true;
      break;
    }
    const result = await store.purgeBatch({ filter, cutoff, batchSize: resolved.batchSize });
    deleted += result.deleted;
    freedBytes += result.freedBytes;
    batches += 1;
    if (result.deleted < resolved.batchSize) {
      break;
    }
    if (options.pauseBetweenBatchesMs && options.pauseBetweenBatchesMs > 0) {
      await delay(options.pauseBetweenBatchesMs);
    }
  }
  return { matched: deleted, deleted, freedBytes, batches, aborted };
}

type S3Executor = { execute(query: unknown): Promise<unknown> };

function firstCount(result: unknown): number {
  const typed = result as { rows?: Array<Record<string, unknown>> };
  const raw = typed.rows?.[0]?.count;
  const parsed = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toNumber(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Общее WHERE для S3-кандидатов: возраст + (опц.) NULL-колонка + (опц.) mime-фильтр. */
function whereFragment(filter: S3CandidateFilter, cutoff: Date) {
  const timeId = sql.identifier(filter.timeColumn);
  const base = sql`${timeId} < ${cutoff} AND storage_key IS NOT NULL AND storage_key <> ''`;
  const isNull = filter.isNullColumn
    ? sql` AND ${sql.identifier(filter.isNullColumn)} IS NULL`
    : sql``;
  let mime = sql``;
  if (filter.mimePrefixes.length > 0) {
    const likes = sql.join(
      filter.mimePrefixes.map((prefix) => sql`mime_type LIKE ${prefix + "%"}`),
      sql` OR `,
    );
    mime = filter.mimePrefixExclude
      ? sql` AND (mime_type IS NULL OR NOT (${likes}))`
      : sql` AND (${likes})`;
  }
  return sql`${base}${isNull}${mime}`;
}

/**
 * Вложения чата не планируются повторно и не планируются во время активной ASR.
 * Финальная проверка повторяется исполнителем очереди и монолитом, поэтому гонка
 * между SELECT и стартом транскрибации безопасна.
 */
function chatAttachmentQueueGuardFragment() {
  return sql`
    AND NOT EXISTS (
      SELECT 1
      FROM file_artifact_cleanup_jobs AS cleanup
      WHERE COALESCE(cleanup.payload->>'attachmentId', '') = chat_attachments.id
        AND COALESCE(cleanup.payload->>'storageKey', '') = chat_attachments.storage_key
        AND COALESCE(cleanup.payload->>'externalUri', '') = COALESCE((
          SELECT files.external_uri FROM files WHERE files.id = chat_attachments.file_id
        ), '')
        AND NOT (cleanup.status = 'error' AND cleanup.next_retry_at IS NULL)
    )
    AND NOT EXISTS (
      SELECT 1
      FROM asr_completion_jobs AS completion
      WHERE completion.status NOT IN ('success', 'error', 'cancelled')
        AND (
          (chat_attachments.file_id IS NOT NULL AND completion.file_id = chat_attachments.file_id)
          OR (
            completion.external_file_uri IS NOT NULL
            AND completion.external_file_uri = (
              SELECT files.external_uri FROM files WHERE files.id = chat_attachments.file_id
            )
          )
        )
    )
    AND NOT EXISTS (
      SELECT 1
      FROM asr_executions AS execution
      WHERE COALESCE(execution.lifecycle_status, execution.status, 'accepted')
          NOT IN ('completed', 'failed', 'cancelled', 'expired')
        AND (
          (chat_attachments.file_id IS NOT NULL AND execution.file_id = chat_attachments.file_id)
          OR execution.attachment_id::text = chat_attachments.id
          OR (
            execution.external_file_uri IS NOT NULL
            AND execution.external_file_uri = (
              SELECT files.external_uri FROM files WHERE files.id = chat_attachments.file_id
            )
          )
        )
    )
  `;
}

/** Строка-вложение, которую доменный deleteArtifacts чистит вместе с производными. */
export interface ChatAttachmentArtifactRef {
  id: string;
  chatId: string;
  filename: string;
  mimeType: string | null;
  storageKey: string;
  documentVersion: number;
  derivedManifestObjectKey: string | null;
  previewObjectKey: string | null;
}

export interface ChatAttachmentCleanupSnapshot {
  attachmentId: string;
  chatId: string;
  fileId: string | null;
  filename: string;
  mimeType: string | null;
  storageKey: string;
  documentVersion: number;
  derivedManifestObjectKey: string | null;
  previewObjectKey: string | null;
  externalUri: string | null;
}

/** Доменные операции удаления вложений чата — боевая сборка в default-stores.ts. */
export interface ChatAttachmentS3StoreDeps {
  /** Создаёт durable snapshot; фактическое удаление исполняется через gateway монолита. */
  enqueueCleanup: (params: {
    workspaceId: string;
    resourceType: "chat_attachment";
    resourceId: string;
    reason: string;
    payload: ChatAttachmentCleanupSnapshot;
  }) => Promise<boolean>;
}

/**
 * Стор для вложений чата (таблица chat_attachments). Политика только ставит durable
 * snapshot в очередь; единый worker позже вызывает версионированный gateway монолита.
 */
export function createChatAttachmentS3Store(
  database: S3Executor = db as unknown as S3Executor,
  deps: ChatAttachmentS3StoreDeps,
): S3RetentionStore {
  return {
    async countMatches({ filter, cutoff, cap }) {
      const query = sql`SELECT count(*)::int AS count FROM (SELECT 1 FROM chat_attachments WHERE ${whereFragment(
        filter,
        cutoff,
      )}${chatAttachmentQueueGuardFragment()} LIMIT ${cap}) AS sub`;
      return firstCount(await database.execute(query));
    },

    async purgeBatch({ filter, cutoff, batchSize }) {
      const timeId = sql.identifier(filter.timeColumn);
      const query = sql`SELECT id, workspace_id, chat_id, file_id, filename, mime_type, storage_key,
          document_version, derived_manifest_object_key, preview_object_key, size_bytes,
          (SELECT files.external_uri FROM files WHERE files.id = chat_attachments.file_id) AS external_uri
        FROM chat_attachments WHERE ${whereFragment(
        filter,
        cutoff,
      )}${chatAttachmentQueueGuardFragment()} ORDER BY ${timeId} LIMIT ${batchSize}`;
      const result = (await database.execute(query)) as { rows?: Array<Record<string, unknown>> };
      const rows = result.rows ?? [];

      let deleted = 0;
      let freedBytes = 0;
      for (const row of rows) {
        const workspaceId = String(row.workspace_id);
        const enqueued = await deps.enqueueCleanup({
          workspaceId,
          resourceType: "chat_attachment",
          resourceId: String(row.id),
          reason: filter.policyKey ?? "scheduled_retention",
          payload: {
            attachmentId: String(row.id),
            chatId: String(row.chat_id),
            fileId: row.file_id == null ? null : String(row.file_id),
            filename: String(row.filename ?? ""),
            mimeType: row.mime_type == null ? null : String(row.mime_type),
            storageKey: String(row.storage_key),
            documentVersion: toNumber(row.document_version),
            derivedManifestObjectKey:
              row.derived_manifest_object_key == null ? null : String(row.derived_manifest_object_key),
            previewObjectKey: row.preview_object_key == null ? null : String(row.preview_object_key),
            externalUri: row.external_uri == null ? null : String(row.external_uri),
          },
        });
        if (enqueued) {
          deleted += 1;
          // Это оценка будущего освобождения; фактическую успешность показывает queue metric.
          freedBytes += toNumber(row.size_bytes);
        }
      }
      return { deleted, freedBytes };
    },
  };
}

/**
 * Стор для скриншотов отзывов (таблица chat_feedback_attachments). В отличие от
 * chat_attachments здесь нет производных артефактов (превью/манифест) — просто удаляем
 * объект в хранилище (инъецируемый deleteObject) и обнуляем storage_key в этой же таблице.
 */
export function createChatFeedbackAttachmentS3Store(
  database: S3Executor = db as unknown as S3Executor,
  deps: { deleteObject: (workspaceId: string, storageKey: string) => Promise<void> },
): S3RetentionStore {
  return {
    async countMatches({ filter, cutoff, cap }) {
      const query = sql`SELECT count(*)::int AS count FROM (SELECT 1 FROM chat_feedback_attachments WHERE ${whereFragment(
        filter,
        cutoff,
      )} LIMIT ${cap}) AS sub`;
      return firstCount(await database.execute(query));
    },

    async purgeBatch({ filter, cutoff, batchSize }) {
      const timeId = sql.identifier(filter.timeColumn);
      const query = sql`SELECT id, workspace_id, storage_key, size_bytes FROM chat_feedback_attachments WHERE ${whereFragment(
        filter,
        cutoff,
      )} ORDER BY ${timeId} LIMIT ${batchSize}`;
      const result = (await database.execute(query)) as { rows?: Array<Record<string, unknown>> };
      const rows = result.rows ?? [];

      let deleted = 0;
      let freedBytes = 0;
      for (const row of rows) {
        await deps.deleteObject(String(row.workspace_id), String(row.storage_key));
        // storage_key — NOT NULL, поэтому обнуляем пустой строкой (как markChatAttachmentCleaned),
        // а не NULL: иначе UPDATE падает и задача отказывает на каждом тике. Пустой ключ
        // выводит строку из выборки (whereFragment: storage_key <> '') → прогресс гарантирован.
        await database.execute(sql`UPDATE chat_feedback_attachments SET storage_key = '' WHERE id = ${row.id}`);
        deleted += 1;
        freedBytes += toNumber(row.size_bytes);
      }
      return { deleted, freedBytes };
    },
  };
}

/**
 * Стор рабочих файлов конвейера приёма (таблица ingest_sources, C12 монолита).
 * Чистит ТОЛЬКО объекты под префиксом ingest/ (жёсткий гард в WHERE): blob_key
 * терминального источника может указывать и на оригинал (kb-uploads/...) — оригиналы
 * этой политикой не трогаются (П14), кэш canonical/ по возрасту не удаляется вовсе.
 */
export function createIngestSourceWorkdirS3Store(
  database: S3Executor = db as unknown as S3Executor,
  deps: { deleteObject: (workspaceId: string, storageKey: string) => Promise<void> },
): S3RetentionStore {
  const where = (filter: S3CandidateFilter, cutoff: Date) =>
    sql`${sql.identifier(filter.timeColumn)} IS NOT NULL
      AND ${sql.identifier(filter.timeColumn)} < ${cutoff}
      AND blob_key IS NOT NULL AND blob_key <> ''
      AND blob_key LIKE 'ingest/%'`;

  return {
    async countMatches({ filter, cutoff, cap }) {
      const query = sql`SELECT count(*)::int AS count FROM (SELECT 1 FROM ingest_sources WHERE ${where(
        filter,
        cutoff,
      )} LIMIT ${cap}) AS sub`;
      return firstCount(await database.execute(query));
    },

    async purgeBatch({ filter, cutoff, batchSize }) {
      const timeId = sql.identifier(filter.timeColumn);
      const query = sql`SELECT id, workspace_id, blob_key, bytes FROM ingest_sources WHERE ${where(
        filter,
        cutoff,
      )} ORDER BY ${timeId} LIMIT ${batchSize}`;
      const result = (await database.execute(query)) as { rows?: Array<Record<string, unknown>> };
      const rows = result.rows ?? [];

      let deleted = 0;
      let freedBytes = 0;
      for (const row of rows) {
        await deps.deleteObject(String(row.workspace_id), String(row.blob_key));
        // blob_key обнуляем пустой строкой: строка источника и его история сохраняются.
        await database.execute(sql`UPDATE ingest_sources SET blob_key = '' WHERE id = ${row.id}`);
        deleted += 1;
        freedBytes += toNumber(row.bytes);
      }
      return { deleted, freedBytes };
    },
  };
}

/**
 * Стор для исходных файлов JSON-импорта БЗ (таблица json_import_jobs, E15 монолита).
 * Колонка ключа здесь source_file_key (не storage_key), поэтому общий whereFragment не
 * подходит — фильтр собирается на месте: finished_at старше cutoff + непустой ключ.
 * Производных артефактов нет: удаляем объект и обнуляем ключ пустой строкой (колонка NOT
 * NULL — как в chat_feedback_attachments), строка задачи и её статистика сохраняются.
 */
export function createJsonImportJobS3Store(
  database: S3Executor = db as unknown as S3Executor,
  deps: { deleteObject: (workspaceId: string, storageKey: string) => Promise<void> },
): S3RetentionStore {
  const where = (filter: S3CandidateFilter, cutoff: Date) =>
    sql`${sql.identifier(filter.timeColumn)} < ${cutoff} AND source_file_key IS NOT NULL AND source_file_key <> ''`;

  return {
    async countMatches({ filter, cutoff, cap }) {
      const query = sql`SELECT count(*)::int AS count FROM (SELECT 1 FROM json_import_jobs WHERE ${where(
        filter,
        cutoff,
      )} LIMIT ${cap}) AS sub`;
      return firstCount(await database.execute(query));
    },

    async purgeBatch({ filter, cutoff, batchSize }) {
      const timeId = sql.identifier(filter.timeColumn);
      const query = sql`SELECT id, workspace_id, source_file_key, source_file_size FROM json_import_jobs WHERE ${where(
        filter,
        cutoff,
      )} ORDER BY ${timeId} LIMIT ${batchSize}`;
      const result = (await database.execute(query)) as { rows?: Array<Record<string, unknown>> };
      const rows = result.rows ?? [];

      let deleted = 0;
      let freedBytes = 0;
      for (const row of rows) {
        await deps.deleteObject(String(row.workspace_id), String(row.source_file_key));
        await database.execute(sql`UPDATE json_import_jobs SET source_file_key = '' WHERE id = ${row.id}`);
        deleted += 1;
        freedBytes += toNumber(row.source_file_size);
      }
      return { deleted, freedBytes };
    },
  };
}
