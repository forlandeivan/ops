/**
 * Тайминги этапов пайплайна (перф-инструментация, env-gated).
 *
 * `withStage(name, fn)` оборачивает этап и при включённом флаге
 * PERF_STAGE_TIMINGS_ENABLED логирует его длительность. Когда флаг выключен —
 * просто `await fn()` без замера (нулевые накладные, кроме одного if).
 *
 * В Сессии 1 (Волна 0) поставляется ТОЛЬКО утилита + юнит-тест; горячий путь
 * НЕ оборачивается. Обёртка этапов (preflight / история / embed / retrieval /
 * LLM-TTFT) — задача Волн 1-2 под этим флагом.
 *
 * Источник/контекст: docs/degradation-protection-contour.md (Слой 3).
 */

import { performance } from "node:perf_hooks";

import { createLogger } from "@unica/observability/lib/logger";
import { isStageTimingsEnabled } from "./perf-config";

const logger = createLogger("perf-stage-timings");

export interface StageTimingContext {
  /** Логический поток (напр. chatId/requestId) для группировки этапов. */
  scope?: string;
}

function emitStageTiming(name: string, durationMs: number, context?: StageTimingContext): void {
  logger.info(
    {
      event_name: "perf.stage_timing",
      stage: name,
      duration_ms: Math.round(durationMs * 1000) / 1000,
      scope: context?.scope ?? null,
    },
    "[perf] stage timing",
  );
}

/**
 * Замеряет длительность асинхронного этапа. При выключенном флаге — прозрачный
 * проброс без измерения.
 */
export async function withStage<T>(
  name: string,
  fn: () => Promise<T>,
  context?: StageTimingContext,
): Promise<T> {
  if (!isStageTimingsEnabled()) {
    return fn();
  }

  const start = performance.now();
  try {
    return await fn();
  } finally {
    emitStageTiming(name, performance.now() - start, context);
  }
}

/** Ручная отметка длительности этапа (когда нельзя обернуть в withStage). */
export function markStage(name: string, durationMs: number, context?: StageTimingContext): void {
  if (!isStageTimingsEnabled()) {
    return;
  }
  emitStageTiming(name, durationMs, context);
}
