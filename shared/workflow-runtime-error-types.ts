/**
 * @shared-фасады error-классов для дерева workflow-runtime (W2/S8 Tier-2, дешёвый срез,
 * docs/w2-workflow-packaging-plan.md §5). Структурные интерфейсы публичной поверхности
 * доменных Error-классов монолита — чтобы порт (workflow-gateway-port) и ядро типизировали
 * errors.*-гарды БЕЗ импорта server/**.
 *
 * Реализация (реальные классы + instanceof) остаётся в монолите; wire-guard'ы `error is
 * <ServerClass>` присваиваются полю порта `error is <этот интерфейс>` — tsc проверяет
 * ServerClass ⊆ интерфейс на wireWorkflowGateway (дрейф ловится там, без `implements`).
 * Дорогие typeof-функции портов (chat/agent/rag/action-engine) остаются в W3.
 */

/** server/context-refs.ts ContextRefAccessError — ACL/доступ к context-ref (HTTP status/code). */
export interface ContextRefAccessError extends Error {
  readonly status: number;
  readonly code: string;
}

/** server/text-extraction.ts TextExtractionError — извлечение текста (код + retryable). */
export interface TextExtractionError extends Error {
  readonly code:
    | "TEXT_EXTRACTION_FAILED"
    | "TEXT_EMPTY_AFTER_EXTRACTION"
    | "TEXT_UNSUPPORTED"
    | "STORAGE_UNAVAILABLE";
  readonly retryable: boolean;
}

/** server/agent-runtime/agent-runtime-service.ts AgentRuntimeServiceError — 503-back-pressure. */
export interface AgentRuntimeServiceError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: Record<string, unknown> | null;
  /** Задача 5.1: Retry-After (сек) при 503-перегрузке рантайма, иначе null. */
  readonly retryAfterSec: number | null;
}

/** server/custom-node-library-service.ts CustomNodeServiceError — валидация кастомных нод. */
export interface CustomNodeServiceError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;
}
