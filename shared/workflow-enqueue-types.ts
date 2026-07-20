// WD4.4b: контрактные типы постановки workflow, вынесены из движка в @shared (продьюсер монолита +
// порт клиента направления 1 + слим-хендлер соседнего репо).

import type { WorkflowBundleV1Dto } from "@shared/workflows";
import type {
  AssistantWorkflowRunDispatchSource,
  AssistantWorkflowRunStatus,
} from "@shared/schema";

export type WorkflowInputKind = "message" | "transcript" | "file";

export type WorkflowChatInputEnvelope = {
  id: string;
  kind: WorkflowInputKind;
  text: string;
  attachmentIds: string[];
  transcriptText: string | null;
  messageId: string | null;
  metadata: Record<string, unknown>;
  executionLogId: string | null;
  enqueuedAt: string;
};

export type WorkflowInputActorContext = {
  userId: string | null;
  userEmail: string | null;
  userFullName: string | null;
  workspaceRole: string | null;
};

/**
 * Аддитивный debug-блок enqueue-payload (step-debug D1, контракт v1 — только добавление опциональных полей).
 * Присутствует ТОЛЬКО у захваченных дебаг-прогонов (`dispatchSource='debug'`): монолитный капчер подменяет
 * bundle на draft-бандл armed-сессии, а этим блоком передаёт привязку прогона к сессии.
 */
export type WorkflowEnqueueDebugContext = {
  debugSessionId: string;
  /** Ключ отдельной очереди дебаг-прогонов: `debug:<debugSessionId>` (снимает пер-чат сериализацию). */
  queueKey: string;
  /** Пауза перед входным узлом. В D1 поле контрактное (резерв): движок начнёт обрабатывать его в D2. */
  pauseBeforeEntry?: boolean;
};

/**
 * Payload постановки прогона (контракт §«Форма доставки IR», схема `EnqueueRequest`). Собирается ПРОДЬЮСЕРОМ
 * (`resolveWorkflowEnqueuePayload`, monolith-side: нужен definition-port + storage) и передаётся
 * ТРАНСПОРТНО-АГНОСТИЧНО слим-хендлеру `enqueueAssistantWorkflowRun`: in-process на монолите сегодня, по HTTP
 * (`POST /v1/workflow-runs/enqueue`) после cutover WD4.2f. Все поля JSON-сериализуемы.
 */
export type WorkflowEnqueuePayload = {
  workspaceId: string;
  assistantId: string;
  chatId: string;
  userId: string | null;
  userMessageId?: string | null;
  dispatchSource?: AssistantWorkflowRunDispatchSource;
  // Входы резолва версии — эхо для аудита/контракта (резолв уже выполнен продьюсером; хендлер их НЕ использует).
  workflowDefinitionIdOverride?: string | null;
  allowNonWorkflowAssistant?: boolean;
  envelope: WorkflowChatInputEnvelope;
  resolvedVersion: {
    workflowDefinitionId: string;
    versionId: string;
    versionNo: number;
    contentHash: string;
    entryStepId: string | null;
  };
  bundle: WorkflowBundleV1Dto;
  actorContext: WorkflowInputActorContext;
  initialInputs: Record<string, unknown>;
  // Step-debug (D1): привязка захваченного дебаг-прогона к дебаг-сессии; у обычных прогонов отсутствует.
  debug?: WorkflowEnqueueDebugContext;
};

export type WorkflowRunAwaitResult = {
  /** Терминальный статус рана, либо "timeout" (включая вход в waiting-паузу), либо "not_found". */
  status: AssistantWorkflowRunStatus | "timeout" | "not_found";
  responsePayload: Record<string, unknown> | null;
  errorCode: string | null;
  errorMessage: string | null;
};
