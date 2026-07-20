import { sql } from "drizzle-orm";

import { db } from "../../db";
import type { CleanupMode } from "@shared/cleanup-policies";

import { computeCutoff, DEFAULT_MAX_BATCHES_PER_RUN } from "./pg-retention-task";

/**
 * Исполнитель retention-операций для объектного хранилища (S3/MinIO). По образцу
 * pg-retention-task: движок generic над инъецируемым стором, чтобы тестироваться
 * детерминированно без живого S3. Семья A («по базе»): источник правды — строка БД,
 * по адресу из неё удаляем объект в хранилище, а адрес в строке обнуляем
 * (строку и связанные данные, напр. транскрипт, сохраняем).
 */

/** Фильтр отбора строк-кандидатов на удаление файла. */
export interface S3CandidateFilter {
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
  /** Сколько объектов удалено (и адресов обнулено) за батч. */
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

/** Доменные операции удаления вложений чата — боевая сборка в default-stores.ts. */
export interface ChatAttachmentS3StoreDeps {
  /** Удаляет объект и производные (превью, манифест, шарды) — доменная логика чата. */
  deleteArtifacts: (workspaceId: string, attachment: ChatAttachmentArtifactRef) => Promise<unknown>;
  /** Обнуляет адреса в строке chat_attachments (строка и транскрипт сохраняются). */
  markCleaned: (attachmentId: string) => Promise<void>;
}

/**
 * Стор для вложений чата (таблица chat_attachments). Удаление идёт через инъецируемый
 * deleteArtifacts (чистит и производные: превью, манифест, шарды) и markCleaned
 * (обнуляет адреса), чтобы поведение совпадало с прежним фоновым джобом уборки.
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
      )} LIMIT ${cap}) AS sub`;
      return firstCount(await database.execute(query));
    },

    async purgeBatch({ filter, cutoff, batchSize }) {
      const timeId = sql.identifier(filter.timeColumn);
      const query = sql`SELECT id, workspace_id, chat_id, filename, mime_type, storage_key, document_version, derived_manifest_object_key, preview_object_key, size_bytes FROM chat_attachments WHERE ${whereFragment(
        filter,
        cutoff,
      )} ORDER BY ${timeId} LIMIT ${batchSize}`;
      const result = (await database.execute(query)) as { rows?: Array<Record<string, unknown>> };
      const rows = result.rows ?? [];

      let deleted = 0;
      let freedBytes = 0;
      for (const row of rows) {
        const workspaceId = String(row.workspace_id);
        await deps.deleteArtifacts(workspaceId, {
          id: String(row.id),
          chatId: String(row.chat_id),
          filename: String(row.filename ?? ""),
          mimeType: row.mime_type == null ? null : String(row.mime_type),
          storageKey: String(row.storage_key),
          documentVersion: toNumber(row.document_version),
          derivedManifestObjectKey:
            row.derived_manifest_object_key == null ? null : String(row.derived_manifest_object_key),
          previewObjectKey: row.preview_object_key == null ? null : String(row.preview_object_key),
        });
        await deps.markCleaned(String(row.id));
        deleted += 1;
        freedBytes += toNumber(row.size_bytes);
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
