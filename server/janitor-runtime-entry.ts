import "./load-env";

import { sql } from "drizzle-orm";

import { closeCache } from "./cache";
import { getAppProcessRole, isJanitorProcessRole } from "./config/process-role";
import { db } from "./db";
import { createLogger } from "./lib/logger";
import { startJanitorHealthServer, type JanitorHealthState } from "./janitor/health-server";
import { startJanitorOrchestrator, type JanitorOrchestratorHandle } from "./janitor/janitor-orchestrator";
import { startJanitorRuntimeApiServer } from "./janitor/runtime-api-server";

const logger = createLogger("janitor-runtime-entry");

const DB_READY_RETRY_MS = 3_000;
const DB_READY_LOG_EVERY_ATTEMPTS = 5;

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function validateRuntimeConfiguration(): void {
  const isProduction = process.env.NODE_ENV === "production";
  if (!isProduction) {
    return;
  }

  const hasCustomDb =
    Boolean(process.env.PG_HOST) &&
    Boolean(process.env.PG_USER) &&
    Boolean(process.env.PG_PASSWORD) &&
    Boolean(process.env.PG_DATABASE);
  const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);

  if (!hasCustomDb && !hasDatabaseUrl) {
    throw new Error("Database not configured: set DATABASE_URL or PG_* variables");
  }
}

/**
 * Готовность БД для janitor: соединение живо и таблица политик существует
 * (то есть миграции применены). Janitor намеренно НЕ гоняет boot-DDL
 * (`ensureDatabaseSchema`) — DDL-владельцы это migration-сервис и api-процесс,
 * а от расхождений схемы чистимых таблиц прогоны защищает schema-guard.
 */
async function probeDatabaseReady(): Promise<{ ready: boolean; reason: string | null }> {
  try {
    const result = await db.execute(
      sql`SELECT to_regclass('public.cleanup_policies') IS NOT NULL AS ready`,
    );
    const rows = (result as { rows?: Array<Record<string, unknown>> }).rows ?? [];
    const ready = rows[0]?.ready === true;
    return { ready, reason: ready ? null : "cleanup_policies table not found (migrations not applied yet)" };
  } catch (error) {
    return { ready: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function bootstrapRuntime(): Promise<void> {
  validateRuntimeConfiguration();

  const role = getAppProcessRole();
  if (!isJanitorProcessRole()) {
    throw new Error(`janitor entry started with unsupported APP_ROLE=${role}`);
  }

  logger.info({ role }, "[janitor-runtime-entry] starting");

  const enabled = (process.env.JANITOR_ENABLED ?? "true").trim().toLowerCase() !== "false";
  const state: JanitorHealthState = {
    startedAt: new Date().toISOString(),
    databaseReady: false,
    orchestratorStarted: false,
    enabled,
    tickMinutes: parsePositiveInt(process.env.JANITOR_TICK_MINUTES, 15),
  };

  let shuttingDown = false;
  let orchestrator: JanitorOrchestratorHandle | null = null;
  let healthServer: Awaited<ReturnType<typeof startJanitorHealthServer>> | null = null;
  let runtimeApiServer: Awaited<ReturnType<typeof startJanitorRuntimeApiServer>> | null = null;

  // Health-сервер поднимаем ДО ожидания БД: liveness должен отвечать сразу,
  // readiness остаётся 503, пока БД не готова. JANITOR_HEALTH_PORT=0 выключает сервер.
  const healthPort = parsePositiveInt(process.env.JANITOR_HEALTH_PORT, 5003);
  const healthDisabled = (process.env.JANITOR_HEALTH_PORT ?? "").trim() === "0";
  if (!healthDisabled) {
    healthServer = await startJanitorHealthServer({ port: healthPort, getState: () => ({ ...state }) });
    logger.info({ port: healthServer.port }, "[janitor-runtime-entry] health server listening");
  }

  const shutdown = async (signal: string) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logger.info({ signal }, "[janitor-runtime-entry] shutting down");
    const shutdownTimeoutMs = parsePositiveInt(process.env.JANITOR_SHUTDOWN_TIMEOUT_MS, 25_000);
    const shutdownTimeout = setTimeout(() => {
      logger.error("[janitor-runtime-entry] shutdown timeout exceeded");
      process.exit(1);
    }, shutdownTimeoutMs);

    try {
      // stop() прерывает текущий проход между батчами и дожидается его завершения,
      // чтобы pool.end() не оборвал бегущий SQL на полуслове.
      await orchestrator?.stop();

      const { pool } = await import("./db");
      if (pool && typeof pool.end === "function") {
        await pool.end();
      }

      await closeCache();
      await runtimeApiServer?.close();
      await healthServer?.close();

      clearTimeout(shutdownTimeout);
      logger.info("[janitor-runtime-entry] shutdown complete");
      process.exit(0);
    } catch (error) {
      clearTimeout(shutdownTimeout);
      logger.error({ error }, "[janitor-runtime-entry] shutdown failed");
      process.exit(1);
    }
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  // Ожидание готовности БД вместо фиксированного sleep в entrypoint: порядок старта
  // контейнеров не гарантирует тайминга (особенно в k8s), честный ретрай — гарантирует.
  let attempt = 0;
  for (;;) {
    if (shuttingDown) {
      return;
    }
    const probe = await probeDatabaseReady();
    if (probe.ready) {
      break;
    }
    attempt += 1;
    if (attempt === 1 || attempt % DB_READY_LOG_EVERY_ATTEMPTS === 0) {
      logger.warn(
        { attempt, reason: probe.reason },
        "[janitor-runtime-entry] database not ready yet, retrying",
      );
    }
    await delay(DB_READY_RETRY_MS);
  }
  state.databaseReady = true;
  logger.info("[janitor-runtime-entry] database is ready");

  // Runtime-RPC (preview/run-now из api) поднимаем до оркестратора: он нужен и при
  // выключенном плановом тике (JANITOR_ENABLED=false), а к моменту ready уже слушает.
  // JANITOR_RUNTIME_PORT=0 выключает RPC-сервер (монолит тогда работает in-process).
  const runtimeApiPort = parsePositiveInt(process.env.JANITOR_RUNTIME_PORT, 5004);
  const runtimeApiDisabled = (process.env.JANITOR_RUNTIME_PORT ?? "").trim() === "0";
  if (!runtimeApiDisabled) {
    runtimeApiServer = await startJanitorRuntimeApiServer({ port: runtimeApiPort });
    logger.info({ port: runtimeApiServer.port }, "[janitor-runtime-entry] runtime API listening");
  }

  orchestrator = startJanitorOrchestrator();
  state.orchestratorStarted = orchestrator !== null;
}

void bootstrapRuntime().catch((error) => {
  logger.error({ error }, "[janitor-runtime-entry] startup failed");
  process.exit(1);
});
