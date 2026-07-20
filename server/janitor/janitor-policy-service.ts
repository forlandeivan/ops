import { desc, eq, sql } from "drizzle-orm";

import { db } from "../db";
import {
  cleanupPolicies,
  cleanupPolicyAuditLog,
  cleanupRunLog,
  users,
  type CleanupPolicyRow,
} from "@shared/schema";
import {
  cleanupModes,
  cleanupRunTriggers,
  type CleanupMode,
  type CleanupPolicyDto,
  type CleanupRunJournalEntryDto,
  type CleanupRunStatus,
  type CleanupRunSummaryDto,
  type CleanupRunTrigger,
  type UpdateCleanupPolicyDto,
} from "@shared/cleanup-policies";

import { JANITOR_TASKS, getJanitorTask, type JanitorTaskDefinition } from "./janitor-task-registry";

export class CleanupPolicyError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "CleanupPolicyError";
    this.status = status;
  }
}

function coerceMode(value: string | null | undefined, fallback: CleanupMode): CleanupMode {
  return cleanupModes.includes(value as CleanupMode) ? (value as CleanupMode) : fallback;
}

function coerceTrigger(value: string | null | undefined): CleanupRunTrigger {
  return cleanupRunTriggers.includes(value as CleanupRunTrigger) ? (value as CleanupRunTrigger) : "auto";
}

function toIso(value: unknown): string | null {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
  }
  return null;
}

function toNumber(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Чистый мёрж: дефолты реестра ⊕ override из БД (+ сводка последнего прогона). */
export function resolvePolicy(
  task: JanitorTaskDefinition,
  override: CleanupPolicyRow | undefined,
  lastRun: CleanupRunSummaryDto | null,
): CleanupPolicyDto {
  return {
    resourceKey: task.key,
    label: task.label,
    description: task.description,
    category: task.category,
    action: task.action,
    enabled: override?.enabled ?? task.defaultEnabled,
    retentionDays: override?.retentionDays ?? task.defaultRetentionDays,
    batchSize: override?.batchSize ?? task.defaultBatchSize,
    sensitive: task.sensitive,
    table: task.table,
    strippedColumns: task.strippedColumns,
    cascadeNote: task.cascadeNote,
    lastRun,
  };
}

async function loadOverrides(): Promise<Map<string, CleanupPolicyRow>> {
  const rows = await db.select().from(cleanupPolicies);
  return new Map(rows.map((row) => [row.resourceKey, row]));
}

async function loadLatestRuns(): Promise<Map<string, CleanupRunSummaryDto>> {
  const result = await (db as unknown as { execute(query: unknown): Promise<unknown> }).execute(
    sql`SELECT DISTINCT ON (resource_key)
          resource_key, mode, status, matched_count, deleted_count, freed_bytes, duration_ms, error_message, started_at, finished_at
        FROM cleanup_run_log
        ORDER BY resource_key, started_at DESC`,
  );
  const rows = ((result as { rows?: Array<Record<string, unknown>> }).rows ?? []) as Array<
    Record<string, unknown>
  >;
  const map = new Map<string, CleanupRunSummaryDto>();
  for (const row of rows) {
    const key = String(row.resource_key);
    map.set(key, {
      mode: coerceMode(row.mode as string, "dry_run"),
      status: String(row.status) as CleanupRunStatus,
      matchedCount: toNumber(row.matched_count),
      deletedCount: toNumber(row.deleted_count),
      freedBytes: toNumber(row.freed_bytes),
      durationMs: toNumber(row.duration_ms),
      errorMessage: row.error_message == null ? null : String(row.error_message),
      startedAt: toIso(row.started_at) ?? new Date(0).toISOString(),
      finishedAt: toIso(row.finished_at),
    });
  }
  return map;
}

export async function listResolvedPolicies(): Promise<CleanupPolicyDto[]> {
  const [overrides, lastRuns] = await Promise.all([loadOverrides(), loadLatestRuns()]);
  return JANITOR_TASKS.map((task) =>
    resolvePolicy(task, overrides.get(task.key), lastRuns.get(task.key) ?? null),
  );
}

export async function getResolvedPolicy(resourceKey: string): Promise<CleanupPolicyDto> {
  const task = getJanitorTask(resourceKey);
  if (!task) {
    throw new CleanupPolicyError(`Unknown cleanup resource: ${resourceKey}`, 404);
  }
  const policies = await listResolvedPolicies();
  const found = policies.find((policy) => policy.resourceKey === resourceKey);
  if (!found) {
    throw new CleanupPolicyError(`Unknown cleanup resource: ${resourceKey}`, 404);
  }
  return found;
}

function auditSnapshot(policy: Pick<CleanupPolicyDto, "enabled" | "retentionDays" | "batchSize">) {
  return {
    enabled: policy.enabled,
    retentionDays: policy.retentionDays,
    batchSize: policy.batchSize,
  };
}

export async function updatePolicy(
  resourceKey: string,
  patch: UpdateCleanupPolicyDto,
  actorId: string | null,
): Promise<CleanupPolicyDto> {
  const task = getJanitorTask(resourceKey);
  if (!task) {
    throw new CleanupPolicyError(`Unknown cleanup resource: ${resourceKey}`, 404);
  }

  const overrides = await loadOverrides();
  const before = overrides.get(resourceKey);
  const current = resolvePolicy(task, before, null);
  const next = {
    enabled: patch.enabled ?? current.enabled,
    retentionDays: patch.retentionDays ?? current.retentionDays,
    batchSize: patch.batchSize ?? current.batchSize,
  };

  await db
    .insert(cleanupPolicies)
    .values({
      resourceKey,
      enabled: next.enabled,
      retentionDays: next.retentionDays,
      batchSize: next.batchSize,
      updatedByAdminId: actorId,
    })
    .onConflictDoUpdate({
      target: cleanupPolicies.resourceKey,
      set: {
        enabled: next.enabled,
        retentionDays: next.retentionDays,
        batchSize: next.batchSize,
        updatedByAdminId: actorId,
        updatedAt: sql`now()`,
      },
    });

  await db.insert(cleanupPolicyAuditLog).values({
    resourceKey,
    actorId,
    eventType: "policy_updated",
    before: before ? auditSnapshot(current) : null,
    after: auditSnapshot(next),
  });

  return getResolvedPolicy(resourceKey);
}

export interface CleanupRunRecord {
  resourceKey: string;
  mode: CleanupMode;
  status: CleanupRunStatus;
  matchedCount: number;
  deletedCount: number;
  freedBytes: number;
  durationMs: number;
  errorMessage: string | null;
  startedAt: Date;
  finishedAt: Date;
  /** Инициатор прогона: 'auto' (по расписанию) или 'manual' (ручной запуск из админки). */
  triggeredBy: CleanupRunTrigger;
  /** id администратора при ручном запуске; null для автоматического прогона. */
  triggeredByAdminId: string | null;
}

export async function recordRun(entry: CleanupRunRecord): Promise<void> {
  await db.insert(cleanupRunLog).values({
    resourceKey: entry.resourceKey,
    mode: entry.mode,
    status: entry.status,
    matchedCount: entry.matchedCount,
    deletedCount: entry.deletedCount,
    freedBytes: entry.freedBytes,
    durationMs: entry.durationMs,
    errorMessage: entry.errorMessage,
    startedAt: entry.startedAt,
    finishedAt: entry.finishedAt,
    triggeredBy: entry.triggeredBy,
    triggeredByAdminId: entry.triggeredByAdminId,
  });
}

/** Сырые поля строки журнала (из БД); маппятся в DTO чистой функцией ниже. */
export interface CleanupRunJournalRow {
  resourceKey: string;
  status: string;
  deletedCount: number;
  freedBytes: unknown;
  startedAt: unknown;
  triggeredBy: string | null;
  actorFullName: string | null;
  actorEmail: string | null;
}

/** Чистый маппинг строки журнала в DTO: резолв названия политики и имени инициатора. */
export function toJournalEntry(row: CleanupRunJournalRow): CleanupRunJournalEntryDto {
  const task = getJanitorTask(row.resourceKey);
  const actorName = row.actorFullName?.trim() || row.actorEmail || null;
  return {
    resourceKey: row.resourceKey,
    label: task?.label ?? row.resourceKey,
    startedAt: toIso(row.startedAt) ?? new Date(0).toISOString(),
    status: row.status as CleanupRunStatus,
    deletedCount: toNumber(row.deletedCount),
    freedBytes: toNumber(row.freedBytes),
    triggeredBy: coerceTrigger(row.triggeredBy),
    actorName,
  };
}

/** Плоский журнал последних прогонов по всем политикам (сначала новые). */
export async function listRecentRuns(limit = 100): Promise<CleanupRunJournalEntryDto[]> {
  const cap = Math.max(1, Math.min(limit, 500));
  const rows = await db
    .select({
      resourceKey: cleanupRunLog.resourceKey,
      status: cleanupRunLog.status,
      deletedCount: cleanupRunLog.deletedCount,
      freedBytes: cleanupRunLog.freedBytes,
      startedAt: cleanupRunLog.startedAt,
      triggeredBy: cleanupRunLog.triggeredBy,
      actorFullName: users.fullName,
      actorEmail: users.email,
    })
    .from(cleanupRunLog)
    .leftJoin(users, eq(cleanupRunLog.triggeredByAdminId, users.id))
    .orderBy(desc(cleanupRunLog.startedAt))
    .limit(cap);
  return rows.map((row) => toJournalEntry(row));
}

export async function listRuns(resourceKey: string, limit = 20): Promise<CleanupRunSummaryDto[]> {
  if (!getJanitorTask(resourceKey)) {
    throw new CleanupPolicyError(`Unknown cleanup resource: ${resourceKey}`, 404);
  }
  const rows = await db
    .select()
    .from(cleanupRunLog)
    .where(eq(cleanupRunLog.resourceKey, resourceKey))
    .orderBy(desc(cleanupRunLog.startedAt))
    .limit(Math.max(1, Math.min(limit, 100)));
  return rows.map((row) => ({
    mode: coerceMode(row.mode, "dry_run"),
    status: row.status as CleanupRunStatus,
    matchedCount: row.matchedCount,
    deletedCount: row.deletedCount,
    freedBytes: toNumber(row.freedBytes),
    durationMs: row.durationMs,
    errorMessage: row.errorMessage ?? null,
    startedAt: toIso(row.startedAt) ?? new Date(0).toISOString(),
    finishedAt: toIso(row.finishedAt),
  }));
}
