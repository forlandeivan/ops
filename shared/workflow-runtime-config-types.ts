/**
 * @shared-фасады простых конфиг-/значение-типов для дерева workflow-runtime (W2/S8 Tier-2,
 * дешёвый срез, docs/w2-workflow-packaging-plan.md §5). Чистые struct/литеральные типы из
 * доменов монолита, которые ядро и порт используют в аннотациях — вынесены в @shared, чтобы
 * поддерево компилировалось без server/**-импортов для этих типов.
 *
 * Резолверы (resolveAgentOverloadConfig и т.п.) и их регистрация остаются в монолите; сюда
 * вынесена только форма результата. Глубокие каскады (ChatLlmContext, AgentKnowledgePrefetchResult,
 * executeAgentRuntime-граф) отложены на W3.
 */

/** server/config/process-role.ts — роль процесса приложения. */
export type AppProcessRole = "api" | "janitor" | "worker";

/** server/text-extraction.ts PageBoundary — границы страницы PDF в извлечённом тексте. */
export interface PageBoundary {
  pageNumber: number;
  charStart: number;
  charEnd: number;
}

/** server/agent-runtime/agent-capability-classifier.ts — профиль оптимизации способностей. */
export type AgentCapabilityOptimizationProfile = "universal_agent_v1";

/**
 * server/agent-runtime/agent-overload-config.ts ResolvedAgentOverloadConfig — резолвнутые
 * лимиты контроля перегрузки рантайма агента (per-replica + глобальные через Redis, 5.1).
 */
export interface ResolvedAgentOverloadConfig {
  maxConcurrentRuns: number | null;
  maxConcurrentCodeExec: number | null;
  capacityRetryAfterSec: number;
  maxCapacityRetries: number;
  maxConcurrentRunsPerWorkspace: number;
  retryBucketCapacity: number;
  retryBucketRefillPerMin: number;
}

/**
 * server/agent-runtime/agent-resilience-config.ts ResolvedAgentResilienceConfig — бюджеты
 * guard-повторов и дедлайн-запасы прогона агента (Волна 1D).
 */
export interface ResolvedAgentResilienceConfig {
  guardRetryMaxPerRun: number;
  guardRetryMinRemainingSec: number;
  deadlineSafetyMarginSec: number;
  roundMinRemainingSec: number;
  retryEchoMaxChars: number;
}

/**
 * server/agent-runtime/agent-kb-prefetch-config.ts ResolvedKbPrefetchConfig — флаг включения
 * и лимиты инлайна привязанной БЗ в контекст агента (Волна 2A).
 */
export interface ResolvedKbPrefetchConfig {
  enabled: boolean;
  charLimit: number;
  maxDocs: number;
}
