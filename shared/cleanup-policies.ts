import { z } from "zod";

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

export const cleanupRunStatuses = [
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
  lastRun: CleanupRunSummaryDto | null;
}

export const updateCleanupPolicySchema = z
  .object({
    enabled: z.boolean().optional(),
    retentionDays: z.number().int().min(RETENTION_DAYS_MIN).max(RETENTION_DAYS_MAX).optional(),
    batchSize: z.number().int().min(BATCH_SIZE_MIN).max(BATCH_SIZE_MAX).optional(),
  })
  .strict();
export type UpdateCleanupPolicyDto = z.infer<typeof updateCleanupPolicySchema>;
