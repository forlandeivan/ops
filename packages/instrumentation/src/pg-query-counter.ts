/**
 * Счётчик PG-запросов на один HTTP-запрос (перф-инструментация, env-gated).
 *
 * Механика:
 *  - per-request состояние живёт в собственном AsyncLocalStorage (не трогаем
 *    RequestLogContext, чтобы не менять его контракт);
 *  - server/db.ts при включённом флаге PERF_PG_COUNTER_ENABLED вызывает
 *    `recordSqlForPerfCounter(sql)` из колбэка Drizzle `logQuery`;
 *  - `perfPgQueryCounterMiddleware` оборачивает запрос в счётчик и по завершении
 *    пишет лог-строку `perf.pg_query_count` (и best-effort заголовок).
 *
 * Когда флаг выключен — этот модуль не подключается к горячему пути:
 *  - db.ts оставляет `logger: false` (нулевые накладные),
 *  - middleware не регистрируется в server/index.ts.
 *
 * Источник/контекст: docs/degradation-protection-contour.md (Слой 3).
 */

import { AsyncLocalStorage } from "node:async_hooks";
import type { RequestHandler } from "express";

import { createLogger } from "@unica/observability/lib/logger";

const logger = createLogger("perf-pg-counter");

export type PgQueryVerb = "select" | "insert" | "update" | "delete" | "other";

export interface PgQueryCounts {
  select: number;
  insert: number;
  update: number;
  delete: number;
  other: number;
  total: number;
}

const counterStorage = new AsyncLocalStorage<PgQueryCounts>();

export function createEmptyPgQueryCounts(): PgQueryCounts {
  return { select: 0, insert: 0, update: 0, delete: 0, other: 0, total: 0 };
}

/** Определяет ведущий SQL-глагол. Регистронезависимо, устойчиво к ведущим пробелам/переносам. */
export function classifySqlVerb(sql: string): PgQueryVerb {
  const normalized = sql.replace(/^[\s(]+/, "").toLowerCase();
  if (normalized.startsWith("select")) return "select";
  if (normalized.startsWith("insert")) return "insert";
  if (normalized.startsWith("update")) return "update";
  if (normalized.startsWith("delete")) return "delete";
  return "other";
}

/**
 * Инкремент счётчика для текущего запроса. No-op вне scope (фоновые воркеры,
 * запросы без активного middleware) — безопасно для любого вызова из db.ts.
 */
export function recordSqlForPerfCounter(sql: string): void {
  const counts = counterStorage.getStore();
  if (!counts) {
    return;
  }
  counts[classifySqlVerb(sql)] += 1;
  counts.total += 1;
}

/** Снимок счётчика текущего запроса (или null вне scope). */
export function getPgQueryCounts(): PgQueryCounts | null {
  const counts = counterStorage.getStore();
  return counts ? { ...counts } : null;
}

/** Выполняет fn в scope свежего счётчика; колбэк получает изменяемый объект счётчиков. */
export function runWithPgQueryCounter<T>(fn: (counts: PgQueryCounts) => T): T {
  const counts = createEmptyPgQueryCounts();
  return counterStorage.run(counts, () => fn(counts));
}

/**
 * Express middleware. Регистрируется ТОЛЬКО при включённом флаге
 * (см. server/index.ts). По завершении ответа пишет лог-строку с разбивкой
 * счётчиков и best-effort заголовок `x-perf-pg-queries` (для не-SSE ответов).
 */
export const perfPgQueryCounterMiddleware: RequestHandler = (req, res, next) => {
  runWithPgQueryCounter((counts) => {
    res.on("finish", () => {
      logger.info(
        {
          event_name: "perf.pg_query_count",
          method: req.method,
          path: req.originalUrl || req.url,
          status_code: res.statusCode,
          pg_select: counts.select,
          pg_insert: counts.insert,
          pg_update: counts.update,
          pg_delete: counts.delete,
          pg_other: counts.other,
          pg_total: counts.total,
        },
        "[perf] PG queries per request",
      );
    });

    // Best-effort заголовок: для большинства не-SSE ответов заголовки уже
    // отправлены к моменту finish, поэтому это сработает не всегда — основной
    // источник правды — лог-строка perf.pg_query_count.
    res.on("close", () => {
      if (!res.headersSent) {
        try {
          res.setHeader("x-perf-pg-queries", String(counts.total));
        } catch {
          // заголовки уже ушли — игнорируем
        }
      }
    });

    next();
  });
};
