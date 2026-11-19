// WD4.4b: контрактные типы постановки workflow, вынесены из движка в @shared (продьюсер монолита +
// порт клиента направления 1 + слим-хендлер соседнего репо).

import type { WorkflowBundleV1Dto } from "@shared/workflows";
import type {
  AgentWorkflowRunDispatchSource,
  AgentWorkflowRunStatus,
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
  /** Repeat transport attempts with exactly the persisted payload. Scoped to workspace. */
  idempotencyKey?: string;
  workspaceId: string;
  agentId: string;
  chatId: string;
  userId: string | null;
  userMessageId?: string | null;
  dispatchSource?: AgentWorkflowRunDispatchSource;
  // Входы резолва версии — эхо для аудита/контракта (резолв уже выполнен продьюсером; хендлер их НЕ использует).
  workflowDefinitionIdOverride?: string | null;
  allowNonWorkflowAgent?: boolean;
  envelope: WorkflowChatInputEnvelope;
  resolvedVersion: {
    workflowDefinitionId: string;
    /** null — только у отладочного прогона (`debug` задан) черновика без опубликованной версии. */
    versionId: string | null;
    versionNo: number | null;
    contentHash: string;
    entryStepId: string | null;
  };
  bundle: WorkflowBundleV1Dto;
  actorContext: WorkflowInputActorContext;
  initialInputs: Record<string, unknown>;
  // Step-debug (D1): привязка захваченного дебаг-прогона к дебаг-сессии; у обычных прогонов отсутствует.
  debug?: WorkflowEnqueueDebugContext;
};

/** Queue rows written before the rename can be dispatched after an upgrade. */
type StoredEnqueuePayload = Omit<WorkflowEnqueuePayload, "agentId"> & {
  agentId?: string;
  assistantId?: string;
  allowNonWorkflowAssistant?: boolean;
};

export function normalizeStoredEnqueuePayload(payload: StoredEnqueuePayload): WorkflowEnqueuePayload {
  const { assistantId, allowNonWorkflowAssistant, ...current } = payload;
  if (current.agentId !== undefined && assistantId !== undefined && current.agentId !== assistantId) {
    throw new Error("Workflow enqueue payload contains conflicting agent IDs");
  }
  if (current.allowNonWorkflowAgent !== undefined && allowNonWorkflowAssistant !== undefined
      && current.allowNonWorkflowAgent !== allowNonWorkflowAssistant) {
    throw new Error("Workflow enqueue payload contains conflicting execution flags");
  }
  const agentId = current.agentId ?? assistantId;
  if (typeof agentId !== "string" || !agentId.trim()) throw new Error("Workflow enqueue payload requires an agent ID");
  return allowNonWorkflowAssistant === undefined
    ? { ...current, agentId }
    : { ...current, agentId, allowNonWorkflowAgent: current.allowNonWorkflowAgent ?? allowNonWorkflowAssistant };
}

export type WorkflowRunAwaitResult = {
  /** Терминальный статус рана, либо "timeout" (включая вход в waiting-паузу), либо "not_found". */
  status: AgentWorkflowRunStatus | "timeout" | "not_found";
  responsePayload: Record<string, unknown> | null;
  errorCode: string | null;
  errorMessage: string | null;
};
