import { z } from "zod";

import type { StorageOrphanCategory } from "./storage-ownership";

/**
 * Контракт политик уборки (janitor). Общий для сервера и админ-клиента.
 *
 * Набор ресурсов и дефолты задаются реестром в коде (server/janitor/janitor-task-registry).
 * В БД (`cleanup_policies`) хранятся только переопределения; при чтении они мёржатся
 * поверх дефолтов реестра в "resolved" политику ниже.
 */

export const cleanupModes = ["dry_run", "enforce"] as const;
export type CleanupMode = (typeof cleanupModes)[number];

export const cleanupActions = ["delete_rows", "strip_columns", "delete_object", "delete_collection"] as const;
export type CleanupAction = (typeof cleanupActions)[number];

export const cleanupCategories = [
  "llm",
  "agent",
  "asr",
  "knowledge",
  "assistants",
  "logs",
  "events",
  "audit",
  "tokens",
  "content",
  "storage",
  "vector",
  "meta",
] as const;
export type CleanupCategory = (typeof cleanupCategories)[number];

/** `running` — фоновый прогон ещё идёт: журнал получает строку в начале и обновляет её по ходу. */
export const cleanupRunStatuses = [
  "running",
  "success",
  "partial",
  "failed",
  "skipped_locked",
  "skipped_disabled",
] as const;
export type CleanupRunStatus = (typeof cleanupRunStatuses)[number];

/** Инициатор прогона уборки: по расписанию или ручной запуск из админки. */
export const cleanupRunTriggers = ["auto", "manual"] as const;
export type CleanupRunTrigger = (typeof cleanupRunTriggers)[number];

export const RETENTION_DAYS_MIN = 1;
export const RETENTION_DAYS_MAX = 3650;
export const BATCH_SIZE_MIN = 1;
export const BATCH_SIZE_MAX = 100_000;

/** Единая политика поиска файлов-сирот в хранилище. */
export const STORAGE_ORPHANS_POLICY_KEY = "s3.storage.orphans";

/**
 * Строки отчёта сверки хранилища: категории сирот по карте владения и служебные строки.
 * `deleted_workspaces` — бакеты пространств, которых больше нет; `unrecognized` — папки вне
 * карты владения; `protected` — защищённые папки. Последние две не удаляются никогда.
 */
export type StorageOrphanReportCategory =
  | StorageOrphanCategory
  | "deleted_workspaces"
  | "unrecognized"
  | "protected";

export interface StorageOrphanCategoryStatsDto {
  category: StorageOrphanReportCategory;
  objects: number;
  bytes: number;
  /** Старше срока политики — к удалению. */
  maturedObjects: number;
  maturedBytes: number;
  /** Только у бакетов удалённых пространств: сколько бакетов найдено и сколько из них к удалению. */
  buckets?: number;
  maturedBuckets?: number;
  /** Несколько примеров путей; для бакетов удалённых пространств — имена бакетов. */
  samples: string[];
}

/** Отчёт сверки хранилища на сирот: пишется в журнал прогона и обновляется по ходу проверки. */
export interface StorageOrphanReportDto {
  kind: "storage_orphans";
  version: 1;
  retentionDays: number;
  progress: { bucketsTotal: number; bucketsScanned: number; objectsScanned: number };
  categories: StorageOrphanCategoryStatsDto[];
  /** Поставлено на удаление этим прогоном; у проверки без удаления — нули. */
  queued: { objects: number; bytes: number; buckets: number; jobs: number };
  /** Прогон упёрся в предел объектов за раз — остаток уйдёт следующим прогоном. */
  limitReached: boolean;
  errors: Array<{ bucket: string; message: string }>;
}

export type CleanupRunReportDto = StorageOrphanReportDto;

/** Сводка последнего прогона задачи уборки. */
export interface CleanupRunSummaryDto {
  mode: CleanupMode;
  status: CleanupRunStatus;
  matchedCount: number;
  deletedCount: number;
  /** Освобождено байт в объектном хранилище (для storage-политик; 0 для PostgreSQL). */
  freedBytes: number;
  durationMs: number;
  errorMessage: string | null;
  startedAt: string;
  finishedAt: string | null;
  /** Отчёт прогона, если политика его ведёт (сверка хранилища на сирот). */
  report?: CleanupRunReportDto | null;
}

/** Строка журнала очистки: один прогон любой политики (плоский список по всем). */
export interface CleanupRunJournalEntryDto {
  resourceKey: string;
  /** Человекочитаемое название политики (из реестра; если задачи нет — сам ключ). */
  label: string;
  startedAt: string;
  status: CleanupRunStatus;
  deletedCount: number;
  /** Освобождено байт в объектном хранилище (для storage-политик; 0 для PostgreSQL). */
  freedBytes: number;
  triggeredBy: CleanupRunTrigger;
  /** Имя администратора при ручном запуске; null для автоматического прогона. */
  actorName: string | null;
}

/** Итоговая (resolved) политика: дефолты реестра ⊕ override из БД + метаданные для UI. */
export interface CleanupPolicyDto {
  resourceKey: string;
  label: string;
  description: string;
  category: CleanupCategory;
  action: CleanupAction;
  enabled: boolean;
  retentionDays: number;
  batchSize: number;
  sensitive: boolean;
  /** Целевая таблица (для отображения и трассировки). */
  table: string;
  /** Обнуляемые колонки для action=strip_columns. */
  strippedColumns: string[];
  /** Поясняет каскадные удаления по FK, если есть. */
  cascadeNote: string | null;
  /** Предпросмотр и ручной запуск идут в фоне: ответ приходит сразу, итог — в журнале. */
  runsInBackground?: boolean;
  lastRun: CleanupRunSummaryDto | null;
}

/**
 * Ответ предпросмотра. У фоновой политики `started` сообщает, что проверка запущена, а
 * `reason` — почему не запущена (уже идёт или занята другим экземпляром уборщика).
 */
export interface CleanupPreviewResultDto {
  matched: number;
  started?: boolean;
  reason?: "already_running" | "locked";
}

/** Очередь удаления файлов `file_artifact_cleanup_jobs` глазами администратора. */
export interface FileCleanupQueueStatsDto {
  /** Ждут исполнителя, включая отложенные на время. */
  pending: number;
  processing: number;
  /** Упали, повтор уже запланирован. */
  retrying: number;
  /** Упали окончательно: без ручного повтора файлы не удалятся. */
  failed: number;
  oldestPendingAt: string | null;
  recentErrors: Array<{ message: string; count: number; lastAt: string }>;
}

export const updateCleanupPolicySchema = z
  .object({
    enabled: z.boolean().optional(),
    retentionDays: z.number().int().min(RETENTION_DAYS_MIN).max(RETENTION_DAYS_MAX).optional(),
    batchSize: z.number().int().min(BATCH_SIZE_MIN).max(BATCH_SIZE_MAX).optional(),
  })
  .strict();
export type UpdateCleanupPolicyDto = z.infer<typeof updateCleanupPolicySchema>;
