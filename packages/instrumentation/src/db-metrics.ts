/**
 * Централизованная Prometheus-инструментация слоя доступа к PostgreSQL.
 *
 * Единая точка вместо размазывания по вызовам: оборачиваем pg.Pool так, чтобы
 * КАЖДЫЙ SQL-запрос (и обычный, и внутри транзакции) проходил через один хук.
 *
 * Почему обёртка pool.connect + client.query покрывает всё без дублей:
 *  - drizzle (node-postgres) для НЕ-транзакций вызывает pool.query(...), а pg
 *    внутри делает this.connect((err, client) => client.query(...)) —
 *    т.е. идёт через pool.connect и client.query выданного клиента;
 *  - для транзакций drizzle берёт клиента через pool.connect() и сам зовёт
 *    client.query(...).
 * Значит, обернув pool.connect (acquire-wait + инструментирование клиента) и
 * client.query выданных клиентов (длительность/счётчики/таймауты/tx-состояние),
 * мы ловим оба пути ровно по одному разу. pool.query НЕ оборачиваем отдельно —
 * иначе был бы двойной учёт.
 *
 * Значения gauge (занятость пула, in-flight, idle-in-transaction) отдаются
 * ЛЕНИВО на каждый scrape через провайдер в metrics.ts — без отдельного таймера.
 */

import {
  dbQueriesTotal,
  dbQueryDuration,
  dbStatementTimeoutsTotal,
  dbPoolAcquireWaitSeconds,
  setDbStatsProvider,
  type DbStatsSnapshot,
} from "@unica/observability/monitoring/metrics";
import { createLogger } from "@unica/observability/lib/logger";

const logger = createLogger("db-metrics");

/** Единственный основной пул приложения — статичная метка для acquire-wait. */
const POOL_LABEL = "primary";

/** PG SQLSTATE для запроса, отменённого по statement_timeout / query_canceled. */
const STATEMENT_TIMEOUT_CODE = "57014";

const INSTRUMENTED_CLIENT = Symbol("unicaDbMetricsInstrumentedClient");
const INSTRUMENTED_POOL = Symbol("unicaDbMetricsInstrumentedPool");
const TX_STATE = Symbol("unicaDbMetricsTxState");

type TxState = "none" | "idle" | "active";

interface InstrumentedClient {
  query: (...args: unknown[]) => unknown;
  [INSTRUMENTED_CLIENT]?: boolean;
  [TX_STATE]?: TxState;
}

// In-process счётчики рантайма (читаются провайдером на scrape).
let activeQueries = 0;
let idleInTransaction = 0;

interface PoolLike {
  connect: (...args: unknown[]) => unknown;
  totalCount?: number;
  idleCount?: number;
  waitingCount?: number;
  [INSTRUMENTED_POOL]?: boolean;
}

// ---------------------------------------------------------------------------
// Разбор SQL для меток (operation/table) и классификации источника таймаута.
// drizzle параметризует значения ($1, $2 …), поэтому в тексте остаются только
// идентификаторы схемы — кардинальность метки `table` ограничена набором таблиц.
// ---------------------------------------------------------------------------

export type SqlOperation = "select" | "insert" | "update" | "delete" | "other";

/** Ведущий SQL-глагол. Регистронезависимо, устойчив к ведущим пробелам/скобкам. */
export function classifySqlOperation(sql: string): SqlOperation {
  const normalized = sql.replace(/^[\s(]+/, "").toLowerCase();
  if (normalized.startsWith("select")) return "select";
  if (normalized.startsWith("insert")) return "insert";
  if (normalized.startsWith("update")) return "update";
  if (normalized.startsWith("delete")) return "delete";
  return "other";
}

/** Нормализует идентификатор таблицы: снимает кавычки и схему (public.users → users). */
function normalizeTable(raw: string | undefined): string {
  if (!raw) return "unknown";
  const cleaned = raw.replace(/"/g, "").trim();
  if (!cleaned) return "unknown";
  const parts = cleaned.split(".");
  return parts[parts.length - 1] || "unknown";
}

/** Извлекает целевую таблицу из SQL по ведущему глаголу. Неизвестно → "unknown". */
export function extractSqlTable(sql: string, operation: SqlOperation): string {
  let match: RegExpMatchArray | null = null;
  switch (operation) {
    case "select":
    case "delete":
      match = sql.match(/\bfrom\s+([\w".]+)/i);
      break;
    case "insert":
      match = sql.match(/\binto\s+([\w".]+)/i);
      break;
    case "update":
      match = sql.match(/\bupdate\s+(?:only\s+)?([\w".]+)/i);
      break;
    default:
      match = null;
  }
  return normalizeTable(match?.[1]);
}

/** Метки запроса по сырому SQL. */
export function parseSqlTarget(sql: string): { operation: SqlOperation; table: string } {
  const operation = classifySqlOperation(sql);
  return { operation, table: extractSqlTable(sql, operation) };
}

const FTS_MARKERS = /to_tsquery|plainto_tsquery|phraseto_tsquery|websearch_to_tsquery|tsvector|ts_rank|@@/i;

/** Источник запроса, отменённого по таймауту: полнотекстовый поиск vs обычный SQL. */
export function classifyTimeoutSource(sql: string): "fts" | "sql" {
  return FTS_MARKERS.test(sql) ? "fts" : "sql";
}

/** Глагол управления транзакцией для отслеживания idle-in-transaction. */
function classifyTxVerb(sql: string): "begin" | "end" | "other" {
  const n = sql.replace(/^[\s(]+/, "").toLowerCase();
  if (n.startsWith("begin") || n.startsWith("start transaction")) return "begin";
  if (n.startsWith("commit") || n.startsWith("rollback") || n.startsWith("end")) return "end";
  return "other";
}

/** Достаёт текст SQL из аргумента client.query (строка или config-объект). */
function extractSqlText(arg: unknown): string {
  if (typeof arg === "string") return arg;
  if (arg && typeof arg === "object" && typeof (arg as { text?: unknown }).text === "string") {
    return (arg as { text: string }).text;
  }
  return "";
}

function getErrorCode(error: unknown): string | undefined {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" ? code : undefined;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Обёртка client.query — длительность, счётчики, таймауты, tx-состояние.
// ---------------------------------------------------------------------------

function onQueryStart(client: InstrumentedClient): void {
  activeQueries += 1;
  // Вход в исполнение внутри открытой транзакции: соединение больше не "idle".
  if (client[TX_STATE] === "idle") {
    idleInTransaction = Math.max(0, idleInTransaction - 1);
    client[TX_STATE] = "active";
  }
}

function onQuerySettle(
  client: InstrumentedClient,
  sql: string,
  operation: SqlOperation,
  table: string,
  endTimer: () => void,
  error: unknown,
): void {
  endTimer();
  activeQueries = Math.max(0, activeQueries - 1);

  const status = error ? "error" : "success";
  dbQueriesTotal.inc({ operation, table, status });

  if (error && getErrorCode(error) === STATEMENT_TIMEOUT_CODE) {
    dbStatementTimeoutsTotal.inc({ table, source: classifyTimeoutSource(sql) });
  }

  // Переходы состояния транзакции (балансируем idle_in_transaction-gauge).
  const txVerb = classifyTxVerb(sql);
  if (txVerb === "begin") {
    if (!error) {
      client[TX_STATE] = "idle";
      idleInTransaction += 1;
    }
  } else if (txVerb === "end") {
    client[TX_STATE] = "none";
  } else if (client[TX_STATE] === "active") {
    // Запрос внутри транзакции завершён — соединение снова висит idle-in-tx.
    client[TX_STATE] = "idle";
    idleInTransaction += 1;
  }
}

function instrumentClient(client: InstrumentedClient | undefined | null): InstrumentedClient | undefined | null {
  if (!client || typeof client.query !== "function" || client[INSTRUMENTED_CLIENT]) {
    return client;
  }
  client[INSTRUMENTED_CLIENT] = true;
  client[TX_STATE] = "none";

  const originalQuery = client.query.bind(client) as (...args: unknown[]) => unknown;

  client.query = function instrumentedQuery(...args: unknown[]): unknown {
    const sql = extractSqlText(args[0]);
    const { operation, table } = parseSqlTarget(sql);
    const endTimer = dbQueryDuration.startTimer({ operation, table });
    onQueryStart(client);

    const settle = (error: unknown) => onQuerySettle(client, sql, operation, table, endTimer, error);

    // Callback-форма: client.query(text, values, cb) — используется pg.Pool.query.
    const last = args[args.length - 1];
    if (typeof last === "function") {
      const originalCb = last as (...cbArgs: unknown[]) => void;
      args[args.length - 1] = (err: unknown, ...rest: unknown[]) => {
        settle(err);
        originalCb(err, ...rest);
      };
      try {
        return originalQuery(...args);
      } catch (error) {
        settle(error);
        throw error;
      }
    }

    // Promise-форма: client.query(config, params) — используется drizzle.
    try {
      const result = originalQuery(...args);
      if (result && typeof (result as { then?: unknown }).then === "function") {
        return (result as Promise<unknown>).then(
          (value) => {
            settle(undefined);
            return value;
          },
          (error) => {
            settle(error);
            throw error;
          },
        );
      }
      settle(undefined);
      return result;
    } catch (error) {
      settle(error);
      throw error;
    }
  };

  return client;
}

// ---------------------------------------------------------------------------
// Публичная точка входа: инструментирование пула.
// ---------------------------------------------------------------------------

/**
 * Подключает Prometheus-инструментацию к pg.Pool. Идемпотентно (повторный вызов
 * на том же пуле — no-op). Безопасно для любого pg-совместимого пула: при
 * отсутствии ожидаемого API деградирует с предупреждением, не роняя процесс.
 */
export function instrumentDatabasePool(pool: unknown): void {
  if (!pool || typeof pool !== "object") {
    return;
  }
  const target = pool as PoolLike;
  if (target[INSTRUMENTED_POOL]) {
    return;
  }
  if (typeof target.connect !== "function") {
    logger.warn("[db-metrics] pool.connect отсутствует — инструментация пропущена");
    return;
  }
  target[INSTRUMENTED_POOL] = true;

  // Провайдер снимка состояния для ленивого collect() gauge-метрик.
  setDbStatsProvider((): DbStatsSnapshot => {
    const total = Number(target.totalCount ?? 0);
    const idle = Number(target.idleCount ?? 0);
    return {
      total,
      idle,
      active: Math.max(0, total - idle),
      waiting: Number(target.waitingCount ?? 0),
      activeQueries,
      idleInTransaction,
    };
  });

  const originalConnect = target.connect.bind(target) as (...args: unknown[]) => unknown;

  target.connect = function instrumentedConnect(...args: unknown[]): unknown {
    const start = process.hrtime.bigint();
    const observeAcquire = () => {
      const seconds = Number(process.hrtime.bigint() - start) / 1e9;
      dbPoolAcquireWaitSeconds.observe({ pool: POOL_LABEL }, seconds);
    };

    // Callback-форма: pool.connect((err, client, done) => …) — путь pg.Pool.query.
    const maybeCb = args[0];
    if (typeof maybeCb === "function") {
      const originalCb = maybeCb as (...cbArgs: unknown[]) => void;
      return originalConnect((err: unknown, client: unknown, done: unknown) => {
        observeAcquire();
        if (!err) {
          instrumentClient(client as InstrumentedClient);
        }
        originalCb(err, client, done);
      });
    }

    // Promise-форма: const client = await pool.connect() — путь транзакций drizzle.
    const result = originalConnect(...args);
    if (result && typeof (result as { then?: unknown }).then === "function") {
      return (result as Promise<unknown>).then(
        (client) => {
          observeAcquire();
          return instrumentClient(client as InstrumentedClient);
        },
        (error) => {
          observeAcquire();
          throw error;
        },
      );
    }
    return result;
  };

  logger.debug("[db-metrics] PostgreSQL-инструментация подключена к пулу");
}

/**
 * Сброс in-process счётчиков рантайма. Только для тестов (изоляция между кейсами).
 */
export function __resetDbRuntimeCountersForTests(): void {
  activeQueries = 0;
  idleInTransaction = 0;
}
