/**
 * Конфигурация перф-инструментации аудита оптимальности (Чат+RAG+OCR).
 *
 * ВСЕ флаги по умолчанию ВЫКЛЮЧЕНЫ. Когда выключены — инструментация не должна
 * добавлять ни одной операции в горячий путь (см. server/db.ts: при выключенном
 * счётчике `logger` остаётся `false`, а middleware не регистрируется в server/index.ts).
 *
 * Источник/контекст: docs/degradation-protection-contour.md (Слой 3 — замеры).
 * Паттерн скопирован с server/lib/multi-query-runtime-config.ts.
 */

export interface PerfInstrumentationConfig {
  /** Счётчик PG-запросов на 1 HTTP-запрос (через хук logQuery в server/db.ts). */
  pgCounterEnabled: boolean;
  /** Тайминги этапов пайплайна (withStage/markStage). */
  stageTimingsEnabled: boolean;
}

const parseEnvBoolean = (
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: boolean,
): boolean => {
  const raw = env[name];
  if (!raw) {
    return fallback;
  }

  const normalized = raw.trim().toLowerCase();
  if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") {
    return true;
  }
  if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") {
    return false;
  }

  return fallback;
};

export function resolvePerfInstrumentationConfig(
  env: NodeJS.ProcessEnv = process.env,
): PerfInstrumentationConfig {
  return {
    pgCounterEnabled: parseEnvBoolean(env, "PERF_PG_COUNTER_ENABLED", false),
    stageTimingsEnabled: parseEnvBoolean(env, "PERF_STAGE_TIMINGS_ENABLED", false),
  };
}

/**
 * Снимок конфигурации на момент запуска процесса. db.ts и index.ts читают флаги
 * один раз при инициализации (как существующий `LOG_SQL`).
 */
export const PERF_INSTRUMENTATION_CONFIG = resolvePerfInstrumentationConfig();

export function isPgCounterEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return parseEnvBoolean(env, "PERF_PG_COUNTER_ENABLED", false);
}

export function isStageTimingsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return parseEnvBoolean(env, "PERF_STAGE_TIMINGS_ENABLED", false);
}
