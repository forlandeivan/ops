import type { JsonValue } from "./json-types";

/**
 * Assistant execution logging model.
 *
 * Основные цели:
 * - Отражать полный пайплайн обработки пользовательского сообщения в системном ассистенте Unica Chat
 *   и в других ассистентах (структура пайплайна одинакова).
 * - Фиксировать каждый шаг, его входы/выходы и итоговый статус, чтобы администратор мог построить
 *   блок-схему ("канвас").
 *
 * Текущий фактический пайплайн (по состоянию на server/routes.ts и server/chat-service.ts):
 * 1. `/api/chat/sessions/:chatId/messages/llm` (routes.ts) принимает HTTP-запрос.
 * 2. `addUserMessage` (chat-service.ts) пишет сообщение пользователя в chat_messages.
 * 3. `buildChatLlmContext` подтягивает конфигурацию ассистента, глобальный UnicaChatConfig,
 *    провайдера LLM и историю чата.
 * 4. `fetchAccessToken` выдаёт OAuth-токен для выбранного провайдера.
 * 5. `executeLlmCompletion` обращается к LLM (stream/sync) и стримит результат на фронт.
 * 6. `addAssistantMessage` записывает ответ ассистента, `forwardLlmStreamEvents` гонит события SSE.
 *
 * Эти шаги и нужно отображать в журнале.
 */

/**
 * Общий статус запуска ассистента.
 */
export const AGENT_RESPONSE_EXECUTION_STATUS = {
  PENDING: "pending",
  RUNNING: "running",
  SUCCESS: "success",
  ERROR: "error",
  TIMEOUT: "timeout",
  CANCELLED: "cancelled",
} as const;
export type AgentResponseExecutionStatus = (typeof AGENT_RESPONSE_EXECUTION_STATUS)[keyof typeof AGENT_RESPONSE_EXECUTION_STATUS];

/**
 * Источник запуска (Unica Chat, кастомный ассистент, playground и т.д.).
 */
export type AgentResponseExecutionSource =
  | "system_unica_chat"
  | "manual_action"
  | "auto_action"
  | "workspace_agent"
  | "playground"
  | "api";

/**
 * Описание запуска ассистента.
 *
 * Рекомендуемые индексы:
 * - (workspaceId, startedAt DESC) — фильтрация по воркспейсу и времени.
 * - (assistantId, startedAt DESC) — анализ конкретного ассистента.
 * - (userId, startedAt DESC) — разбор активности пользователя.
 * - (chatId) — переход из UI чата к журналу.
 */
export interface AgentResponseExecutionRecord {
  id: string;
  workspaceId: string;
  userId: string | null;
  agentId: string;
  chatId: string | null;
  userMessageId: string | null;
  agentMessageId: string | null;
  modelId?: string | null;
  modelKey?: string | null;
  modelName?: string | null;
  source: AgentResponseExecutionSource;
  status: AgentResponseExecutionStatus;
  hasStepErrors: boolean;
  startedAt: Date;
  finishedAt: Date | null;
  /**
   * Дополнительные агрегированные сведения (например, tags).
   * Сюда нельзя класть токены/секреты — только служебные пометки.
   */
  metadata?: JsonValue;
}

/**
 * Набор типов шагов. Список синхронизирован с фактическим пайплайном (routes.ts + chat-service.ts
 * + llm-client.ts). При добавлении шагов реальной логики надо расширять enum и pipeline ниже.
 */
export type AgentResponseExecutionStepType =
  | "RECEIVE_HTTP_REQUEST"
  | "VALIDATE_REQUEST"
  | "WRITE_USER_MESSAGE"
  | "DISPATCH_WORKFLOW_RUN"
  | "EXECUTE_WORKFLOW_STEP"
  | "WAIT_FOR_EXTERNAL_OPERATION"
  | "WAIT_FOR_WORKFLOW_APPROVAL"
  | "WAIT_FOR_WORKFLOW_DELAY"
  | "BUILD_ASSISTANT_CONTEXT"
  | "RESOLVE_LLM_CONFIG"
  | "LOAD_ASSISTANT_CONFIG"
  | "RESOLVE_LLM_PROVIDER_CONFIG"
  | "FETCH_PROVIDER_TOKEN"
  /**
   * RAG specific steps.
   *
   * Детализированные шаги RAG пайплайна для отладки:
   * - CALL_RAG_PIPELINE: Общий контейнер RAG-вызова
   * - VECTOR_SEARCH: Результаты векторного поиска (чанки, scores)
   * - BUILD_RAG_CONTEXT: Сборка контекста из найденных чанков
   * - BUILD_LLM_PROMPT: Итоговый промпт, отправляемый на LLM
   */
  | "CALL_RAG_PIPELINE"
  /** Результаты векторного и BM25 поиска */
  | "VECTOR_SEARCH"
  /** Сборка контекста из найденных чанков для LLM */
  | "BUILD_RAG_CONTEXT"
  /** Итоговый промпт/запрос, отправляемый на LLM */
  | "BUILD_LLM_PROMPT"
  | "CALL_LLM"
  | "STREAM_TO_CLIENT_START"
  | "STREAM_TO_CLIENT_FINISH"
  | "WRITE_ASSISTANT_MESSAGE"
  | "UPDATE_CHAT_TITLE"
  | "FINALIZE_EXECUTION";

/**
 * Статус шага. Для канваса достаточно success/error/skipped.
 */
export const AGENT_RESPONSE_EXECUTION_STEP_STATUS = {
  PENDING: "pending",
  RUNNING: "running",
  SUCCESS: "success",
  ERROR: "error",
  SKIPPED: "skipped",
} as const;
export type AgentResponseExecutionStepStatus = (typeof AGENT_RESPONSE_EXECUTION_STEP_STATUS)[keyof typeof AGENT_RESPONSE_EXECUTION_STEP_STATUS];

/**
 * Запись шага выполнения.
 *
 * Входные/выходные данные храним в JSON (jsonb). Перед записью обязательно:
 * - удалять/маскировать LLM токены, Authorization headers и прочие секреты;
 * - при необходимости маскировать PII (например, вытаскивать только длину строки или hash),
 *   чтобы журнал можно было безопасно показывать в UI.
 */
export interface AgentResponseExecutionStepRecord {
  id: string;
  executionId: string;
  order: number;
  type: AgentResponseExecutionStepType;
  status: AgentResponseExecutionStepStatus;
  startedAt: Date;
  finishedAt: Date | null;
  inputPayload: JsonValue;
  outputPayload: JsonValue;
  errorCode?: string;
  errorMessage?: string;
  diagnosticInfo?: string;
}

/**
 * Формальная последовательность шагов пайплайна для системного Unica Chat.
 * Для других источников (playground, API) может отличаться.
 */
export const UNICA_CHAT_PIPELINE: readonly AgentResponseExecutionStepType[] = [
  "RECEIVE_HTTP_REQUEST",
  "VALIDATE_REQUEST",
  "WRITE_USER_MESSAGE",
  "BUILD_ASSISTANT_CONTEXT",
  "RESOLVE_LLM_CONFIG",
  "FETCH_PROVIDER_TOKEN",
  "CALL_LLM",
  "STREAM_TO_CLIENT_START",
  "STREAM_TO_CLIENT_FINISH",
  "WRITE_ASSISTANT_MESSAGE",
  "FINALIZE_EXECUTION",
] as const;

/**
 * Вспомогательные статусы: помогает быстро понять, завершён ли запуск.
 */
export function isTerminalExecutionStatus(status: AgentResponseExecutionStatus): boolean {
  return (
    status === AGENT_RESPONSE_EXECUTION_STATUS.SUCCESS ||
    status === AGENT_RESPONSE_EXECUTION_STATUS.ERROR ||
    status === AGENT_RESPONSE_EXECUTION_STATUS.TIMEOUT ||
    status === AGENT_RESPONSE_EXECUTION_STATUS.CANCELLED
  );
}

/**
 * Проверяет, может ли шаг иметь данные стрима. Например, STREAM_TO_CLIENT_START/FINISH.
 */
export function canStepEmitStreamData(type: AgentResponseExecutionStepType): boolean {
  return type === "STREAM_TO_CLIENT_START" || type === "STREAM_TO_CLIENT_FINISH";
}
