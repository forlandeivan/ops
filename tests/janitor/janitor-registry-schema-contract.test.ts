import { describe, expect, it } from "vitest";
import { getTableColumns, getTableName, is } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";

import * as schema from "@shared/schema";
import {
  JANITOR_TASKS,
  operationsOf,
  storageOf,
  type JanitorTaskDefinition,
} from "../../server/janitor/janitor-task-registry";
import { requiredColumnsForOperation } from "../../server/janitor/schema-guard";

/**
 * Контракт «реестр janitor ↔ схема БД» (J2.4): каждая таблица/колонка, которую
 * задачи уборки собираются читать или удалять, существует в drizzle-схеме
 * (`shared/schema.ts` — SoT). Ловит дрейф «переименовали колонку — забыли janitor»
 * на CI, ДО тихой рантайм-деградации через schema-guard (задача скипается →
 * ретенция незаметно перестаёт работать). Особенно важен при выносе janitor
 * в отдельный репозиторий (волна J2): этот тест остаётся в CI монолита.
 */

/** Таблицы вне drizzle-схемы (управляются сторонними библиотеками). */
const EXTERNAL_TABLES: Record<string, string[]> = {
  // express-session / connect-pg-simple: создаётся библиотекой, в shared/schema.ts не описана.
  session: ["sid", "sess", "expire"],
};

function collectSchemaTables(): Map<string, Set<string>> {
  const tables = new Map<string, Set<string>>();
  for (const exported of Object.values(schema)) {
    if (!is(exported, PgTable)) {
      continue;
    }
    const name = getTableName(exported);
    const columns = new Set(Object.values(getTableColumns(exported)).map((column) => column.name));
    tables.set(name, columns);
  }
  for (const [name, columns] of Object.entries(EXTERNAL_TABLES)) {
    tables.set(name, new Set(columns));
  }
  return tables;
}

function requiredColumnsForS3Task(task: JanitorTaskDefinition): string[] {
  const columns = new Set<string>([task.timeColumn]);
  if (task.isNullColumn) {
    columns.add(task.isNullColumn);
  }
  for (const column of task.strippedColumns) {
    columns.add(column);
  }
  return [...columns];
}

describe("janitor registry ↔ shared/schema contract", () => {
  const tables = collectSchemaTables();

  it("каждая PG-операция реестра указывает на существующие таблицу и колонки", () => {
    const errors: string[] = [];
    for (const task of JANITOR_TASKS) {
      if (storageOf(task) !== "postgres") {
        continue;
      }
      for (const op of operationsOf(task)) {
        const columns = tables.get(op.table);
        if (!columns) {
          errors.push(`${task.key}: таблица "${op.table}" отсутствует в shared/schema.ts`);
          continue;
        }
        for (const column of requiredColumnsForOperation(op)) {
          if (!columns.has(column)) {
            errors.push(`${task.key}: колонка "${op.table}.${column}" отсутствует в shared/schema.ts`);
          }
        }
      }
    }
    expect(errors).toEqual([]);
  });

  it("каждая S3/Qdrant-задача указывает на существующие таблицу и колонки отбора", () => {
    const errors: string[] = [];
    for (const task of JANITOR_TASKS) {
      if (storageOf(task) === "postgres") {
        continue;
      }
      const columns = tables.get(task.table);
      if (!columns) {
        errors.push(`${task.key}: таблица "${task.table}" отсутствует в shared/schema.ts`);
        continue;
      }
      for (const column of requiredColumnsForS3Task(task)) {
        if (!columns.has(column)) {
          errors.push(`${task.key}: колонка "${task.table}.${column}" отсутствует в shared/schema.ts`);
        }
      }
    }
    expect(errors).toEqual([]);
  });

  it("санити: контракт реально сверяет все 30 задач против непустой схемы", () => {
    expect(JANITOR_TASKS.length).toBeGreaterThanOrEqual(30);
    expect(tables.size).toBeGreaterThan(100);
  });
});
