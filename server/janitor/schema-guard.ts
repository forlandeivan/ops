import { sql } from "drizzle-orm";

import { db } from "../db";
import type { JanitorOperation } from "./janitor-task-registry";

/**
 * Защита удаляющего сервиса: перед enforce-прогоном убеждаемся, что целевая
 * таблица и нужные колонки реально существуют в БД. Это страхует от рассинхрона
 * схемы (напр. колонку переименовали/дропнули), чтобы janitor не удалял по
 * устаревшему представлению. Кэшируем набор колонок на короткий TTL.
 */
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { columns: Set<string>; expiresAt: number }>();

async function loadColumns(table: string): Promise<Set<string>> {
  const now = Date.now();
  const cached = cache.get(table);
  if (cached && cached.expiresAt > now) {
    return cached.columns;
  }
  const result = await (db as unknown as { execute(query: unknown): Promise<unknown> }).execute(
    sql`SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ${table}`,
  );
  const rows = ((result as { rows?: Array<Record<string, unknown>> }).rows ?? []) as Array<
    Record<string, unknown>
  >;
  const columns = new Set(rows.map((row) => String(row.column_name)));
  cache.set(table, { columns, expiresAt: now + CACHE_TTL_MS });
  return columns;
}

export function requiredColumnsForOperation(op: JanitorOperation): string[] {
  const columns = new Set<string>([op.timeColumn, op.pkColumn]);
  if (op.equalsFilter) {
    columns.add(op.equalsFilter.column);
  }
  if (op.action === "strip_columns") {
    for (const column of op.strippedColumns) {
      columns.add(column);
    }
  }
  return [...columns];
}

/** Возвращает список отсутствующих колонок (пустой — всё на месте). */
export async function findMissingColumns(table: string, columns: string[]): Promise<string[]> {
  const existing = await loadColumns(table);
  return columns.filter((column) => !existing.has(column));
}
