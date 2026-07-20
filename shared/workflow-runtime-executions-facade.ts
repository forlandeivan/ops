/**
 * @shared-фасад исполнения чужих операций для workflow-runtime (W2/S8 Tier-2, deep-cascade,
 * docs/w2-workflow-packaging-plan.md §5). Сигнатуры system-operations / плагинов / кастом-нод /
 * action-engine, которые ядро зовёт через `WorkflowGateway.executions` — без type-импортов
 * соответствующих `server/**`.
 *
 * `OperationResult`/`SkillPackageManifest` уже в `@shared/plugin-system`;
 * `ActionExecutionResourceType`/`ActionExecutionTrigger` — в `@shared/schema`.
 * `executeAction`: вход — подтип реального `ActionExecutionInput` (обёртка wire требует
 * assignable К движку → `resource.type`/`trigger` строго @shared-юнионы); возврат ослаблен до
 * читаемых ядром полей (`applierInfo`/`appliedChanges`/`outputArtifacts` опущены). Дрейф на wire.
 */

import type { OperationResult, SkillPackageManifest } from "@shared/plugin-system";
import type { ActionExecutionResourceType, ActionExecutionTrigger } from "@shared/schema";

/** server/system-operations/system-operations-service.ts — параметры системной операции. */
export type ExecuteSystemOperationParams = {
  workspaceId: string;
  chatId: string;
  actorUserId: string | null;
  runId?: string | null;
  stepId?: string | null;
  nodeId?: string | null;
  key: string;
  input: Record<string, unknown>;
};

/**
 * server/action-execution-engine.ts ActionExecutionInput — подтип (опущены `bindingRef`/
 * `placement`/`assistant`, которые ядро не задаёт; остальное assignable к реальному входу).
 */
export type ActionExecutionInputFacade = {
  workspaceId: string;
  actionId: string;
  resource: {
    type: ActionExecutionResourceType;
    id: string;
  };
  trigger?: ActionExecutionTrigger;
  actorUserId?: string | null;
  input?: {
    selectionText?: string;
    fullTextOverride?: string;
    metadata?: Record<string, unknown>;
  };
  assistantId?: string | null;
  context?: Record<string, unknown>;
  executionOptions?: { dryRun?: boolean; traceLevel?: string };
  runtime?: {
    abortSignal?: AbortSignal;
    onLlmDelta?: (delta: string) => void;
    requestTimeoutMs?: number;
  };
  llmExecutionLogId?: string | null;
};

/** server/action-execution-engine.ts ActionExecutionResult — ослаблен до читаемых ядром полей. */
export type ActionExecutionResultFacade = {
  executionId: string;
  result: {
    text: string;
    applied: boolean;
  };
  usage: {
    providerId: string | null;
    modelId: string | null;
    usageTokens: number | null;
    creditsCharged: number;
  };
};

/** server/system-operations — исполнение системной операции. */
export type ExecuteSystemOperationFacade = (
  params: ExecuteSystemOperationParams,
) => Promise<OperationResult>;

/** server/plugin-system — исполнение workspace-операции плагина. */
export type ExecuteWorkspaceOperationFacade = (
  workspaceId: string,
  operationId: string,
  rawInput: unknown,
) => Promise<OperationResult>;

/** server/plugin-system — манифест установленного скилла воркспейса. */
export type GetInstalledSkillManifestForWorkspaceFacade = (
  workspaceId: string,
  skillId: string,
) => Promise<SkillPackageManifest | null>;

/** server/custom-node-library-service — исполнение опубликованной версии кастом-ноды. */
export type ExecutePublishedCustomNodeVersionFacade = (params: {
  nodeVersionId: string;
  input: unknown;
}) => Promise<Record<string, unknown>>;

/** server/action-execution-engine — исполнение действия (декаплинг движка = W3). */
export type ExecuteActionFacade = (
  input: ActionExecutionInputFacade,
) => Promise<ActionExecutionResultFacade>;
