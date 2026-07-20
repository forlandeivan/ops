import { sql, type SQL } from "drizzle-orm";

import { db } from "../../db";
import type { CleanupAction, CleanupMode } from "@shared/cleanup-policies";
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
