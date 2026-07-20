// WD4.4b: type-поверхность направления 1 (17 операций монолит→рантайм + resume/findWaiting), вынесена из
// движка в @shared — порт клиента type-only без каталога server/workflow-runtime/*.
//
// Контракт «монолит ↔ workflow» (gateway-contract.md v1). Все DTO ниже JSON-сериализуемы: это HTTP-тело
// direction-1 сервера. Форма ДОЛЖНА совпадать 1:1 с сигнатурами функций движка
// (`assistant-workflow-runtime-service.ts`) — иначе HTTP-путь разъедется с in-process семантикой.
//
// Что переиспользуется, а не дублируется:
// - `WorkflowEnqueuePayload`, `WorkflowRunAwaitResult` — @shared/workflow-enqueue-types (ре-экспорт ниже).
// - `WorkflowRunSummaryDto` / `WorkflowRunDetailDto` / `WorkflowRunEventDto` — @shared/workflows.
// - `AssistantWorkflow*Summary` / `*Submission` / `*Decision` — @shared/assistants.
// - `AssistantWorkflowRun` — @shared/schema.

import type { AssistantWorkflowRun } from "@shared/schema";
import type { WorkflowRunSummaryDto } from "@shared/workflows";

// Ре-экспорт контрактных типов постановки/ожидания (SoT — @shared/workflow-enqueue-types), чтобы порт
// клиента брал ВСЮ type-поверхность направления 1 из одного модуля.
export type {
  WorkflowChatInputEnvelope,
  WorkflowEnqueuePayload,
  WorkflowInputActorContext,
  WorkflowInputKind,
  WorkflowRunAwaitResult,
} from "@shared/workflow-enqueue-types";

// ── Постановка / жизненный цикл прогона ──────────────────────────────────────────────────────────

/** Результат `enqueueAssistantWorkflowRun`. */
export type WorkflowEnqueueResultDto = {
  runId: string;
  queuePosition: number;
  resolvedWorkflowVersionId: string;
  resolvedWorkflowVersionNo: number;
};

/** Параметры `awaitWorkflowRunResult` (long-poll синхронного вебхука). */
export type AwaitWorkflowRunResultParams = {
  runId: string;
  timeoutMs: number;
  pollIntervalMs?: number;
};

/** Параметры `cancelWorkflowRun`. */
export type CancelWorkflowRunParams = {
  workspaceId: string;
  runId: string;
  actorUserId: string | null;
  /** Причина отмены; без неё рантайм ставит обычные RUN_CANCELLED / «Остановлено пользователем». */
  errorCode?: string | null;
  errorMessage?: string | null;
};

/** Результат `cancelWorkflowRun`. */
export type WorkflowRunCancelResultDto = {
  run: WorkflowRunSummaryDto;
  cancellationRequested: boolean;
};

/** Параметры `appendWorkflowRunCallbackEvents` (agent-events рантайма). */
export type AppendWorkflowRunCallbackEventsParams = {
  runId: string;
  events: Record<string, unknown>[];
};

// ── Step-debug D2.3: управление пошаговым исполнением дебаг-прогона ───────────────────────────────

/** Общие параметры операций step/continue дебаг-прогона. */
export type WorkflowDebugRunControlParams = {
  workspaceId: string;
  runId: string;
  /** Опциональная строгая привязка прогона к дефиниции (прокси-роут монолита передаёт всегда). */
  workflowDefinitionId?: string | null;
};

/** Параметры `runWorkflowDebugRunToNode` (частичный перезапуск до узла-назначения). */
export type WorkflowDebugRunToNodeParams = WorkflowDebugRunControlParams & {
  destinationNodeId: string;
  dirtyNodeIds?: string[];
  /** D3.4: true → только оценка (dirty-каскад + llmRerunNodeIds), прогон не трогается. */
  dryRun?: boolean;
};

/** Параметры `runWorkflowDebugSingleNode` (перезапуск ровно одного узла). */
export type WorkflowDebugRunSingleNodeParams = WorkflowDebugRunControlParams & {
  nodeId: string;
  dryRun?: boolean;
};

/** Результат операций step/continue/run-to-node/run-single-node. */
export type WorkflowDebugRunControlResultDto = {
  runId: string;
  status: string;
  attemptNo: number | null;
  destinationNodeId: string | null;
  /** Узлы, чьи выходы вычищены dirty-каскадом (только у rerun-операций; у step/continue пуст). */
  dirtyNodeIds: string[];
  /**
   * D3.4: пред-прогонная оценка стоимости — непинованные LLM-узлы префикса назначения, которые
   * перевыстрелят этим перезапуском (только rerun-операции; оценка консервативна по ветвлениям).
   */
  llmRerunNodeIds?: string[];
};

// ── Step-debug D3: пины дебаг-сессии + применение перекомпилированного бандла (операции 23–25) ────

/** Параметры `putWorkflowDebugPin` (upsert по (debugSessionId, nodeId)). */
export type WorkflowDebugPinPutParams = {
  workspaceId: string;
  debugSessionId: string;
  nodeId: string;
  workflowDefinitionId?: string | null;
  /** Задан → «Edit output» (editable=true по умолчанию); нет → заморозка выхода из захваченного прогона. */
  pinnedOutput?: Record<string, unknown>;
  editable?: boolean;
  actorUserId?: string | null;
};

/** Результат `putWorkflowDebugPin`. */
export type WorkflowDebugPinResultDto = {
  id: string;
  debugSessionId: string;
  nodeId: string;
  pinnedOutput: Record<string, unknown>;
  editable: boolean;
  pinnedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Параметры `deleteWorkflowDebugPin` (идемпотентный unpin). */
export type WorkflowDebugPinDeleteParams = {
  workspaceId: string;
  debugSessionId: string;
  nodeId: string;
  workflowDefinitionId?: string | null;
};

/** Результат `deleteWorkflowDebugPin`. */
export type WorkflowDebugPinDeleteResultDto = {
  nodeId: string;
  removed: boolean;
};

/** Параметры `applyWorkflowDebugRunBundle` (D3.3: PATCH params → recompile → новый бандл прогону). */
export type WorkflowDebugApplyBundleParams = {
  workspaceId: string;
  runId: string;
  workflowDefinitionId?: string | null;
  contentHash: string;
  workflowJson: Record<string, unknown>;
  ir: Record<string, unknown>;
};

/** Результат `applyWorkflowDebugRunBundle`. */
export type WorkflowDebugApplyBundleResultDto = {
  runId: string;
  status: string;
  workflowContentHash: string;
};

// ── Step-debug D4.1: read-API инспектора (операция 26) ────────────────────────────────────────────

/**
 * Параметры `getWorkflowDebugNodeRunData` (run-data одного узла дебаг-прогона для NDV-инспектора).
 * DTO ответа — `WorkflowDebugNodeRunDataDto` из @shared/workflows (зеркалится в workflow-сервис).
 */
export type GetWorkflowDebugNodeRunDataParams = {
  workspaceId: string;
  runId: string;
  nodeId: string;
  workflowDefinitionId?: string | null;
  /** true → маскировать значения секретных глобалок в output/pinnedOutput/availableVariables. */
  maskSecretValues?: boolean;
};

// ── Чтения ───────────────────────────────────────────────────────────────────────────────────────

/** Параметры `getWorkflowRunDetails`. */
export type GetWorkflowRunDetailsParams = {
  workspaceId: string;
  workflowDefinitionId: string;
  runId: string;
  /** true → маскировать значения секретных глобальных переменных в outputPayload шагов. */
  maskSecretValues?: boolean;
};

/** Параметры `listWorkflowRunEvents`. */
export type ListWorkflowRunEventsParams = {
  workspaceId: string;
  runId: string;
  workflowDefinitionId?: string;
};

/** Параметры `listWorkflowRunsForDefinition`. */
export type ListWorkflowRunsForDefinitionParams = {
  workspaceId: string;
  workflowDefinitionId: string;
  limit?: number;
};

/** Параметры `getActiveWorkflowRunForChat`. */
export type GetActiveWorkflowRunForChatParams = {
  workspaceId: string;
  chatId: string;
};

// ── Транскрипция: resume + поиск ожидающего рана (операции 17 и 18) ────────────────────────────────

/** Параметры `resumeWorkflowRunAfterTranscription`. */
export type ResumeWorkflowRunAfterTranscriptionParams = {
  workspaceId: string;
  operationId: string;
  asrExecutionId: string | null;
  transcriptId: string | null;
  transcriptText: string;
  transcriptMessageId: string | null;
};

/** Результат `resumeWorkflowRunAfterTranscription`. */
export type ResumeWorkflowRunAfterTranscriptionResult = { runId: string } | null;

/**
 * Ветка externalWait рантайма для транскрипции (снимок из `RuntimeState.externalWait`, kind:"transcription").
 * Явная структура: `RuntimeState` целиком в движке и в @shared не выносится — направлению 1 достаточно
 * транскрипционного варианта, который читает `transcribe.routes.ts` (attachmentId/fileId/messageId и пр.).
 */
export type WorkflowExternalTranscriptionWait = {
  kind: "transcription";
  operationId: string;
  asrExecutionId: string | null;
  attachmentId: string | null;
  messageId: string | null;
  fileId: string | null;
  requestedByNodeId: string;
  requestedByStepId: string;
  startedAt: string;
};

// JSON-снимок ряда прогона в HTTP-ответе op #18: через шов (`res.json`) `Date`-поля ряда
// (createdAt/updatedAt/…) сериализуются в ISO-строки. Типизируем `run` ЧЕСТНО (Date→string), а не как
// сырой `AssistantWorkflowRun` (тип-ложь: Date-методы в HTTP-режиме недоступны). Единственный текущий
// потребитель (transcribe.routes) читает только `externalWait.*` и `run` не трогает.
type JsonDateToString<V> = V extends Date ? string : V;
type JsonSerializedWorkflowRun = {
  [K in keyof AssistantWorkflowRun]: JsonDateToString<AssistantWorkflowRun[K]>;
};

/** Результат `findWaitingExternalTranscriptionContextByOperationId`. */
export type FindWaitingExternalTranscriptionContextResult = {
  run: JsonSerializedWorkflowRun;
  externalWait: WorkflowExternalTranscriptionWait;
} | null;
