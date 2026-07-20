/**
 * @shared-фасад агентского кластера для workflow-runtime (W2/S8 Tier-2, deep-cascade,
 * docs/w2-workflow-packaging-plan.md §5). Сигнатуры функций agent-runtime, которые ядро
 * зовёт через `WorkflowGateway.agent`, + структурные типы результатов
 * (`AgentRuntimeResult`, `AgentKnowledgePrefetchResult`, source-grounding) — чтобы поддерево
 * рантайма компилировалось без type-импортов `../agent-runtime/*`.
 *
 * `AgentRuntimeResult` и `AgentKnowledgePrefetchResult` ослаблять НЕЛЬЗЯ (ядро читает все
 * поля). Возвраты `listAgentArtifacts`/`listCompletedIdempotentToolCalls` ослаблены до
 * читаемых полей. Дрейф ловится на wire.
 */

import type { JsonObject } from "@shared/plugin-system";
import type {
  AgentCapabilityOptimizationProfile,
  ResolvedKbPrefetchConfig,
} from "@shared/workflow-runtime-config-types";

// ── executeAgentRuntime ──────────────────────────────────────────────────────

/** server/agent-runtime/runtime-provider.ts AgentRuntimeResult — итог прогона рантайма агента. */
export type AgentRuntimeResult = {
  status: "success" | "partial" | "error";
  result: string | null;
  finalText: string | null;
  finalPayload: JsonObject | null;
  stepsUsed: number;
  toolCallsUsed: number;
  usedTools: string[];
  usedSkills: string[];
  providerRunId: string | null;
  trace: JsonObject[];
  events: JsonObject[];
  warnings: string[];
  errors: string[];
  meta: JsonObject;
};

/**
 * server/agent-runtime/agent-runtime-service.ts executeAgentRuntime — параметр
 * (`Omit<AgentRuntimeRequest, "model" | "capabilities">` + обёртка модель/способности).
 */
export type ExecuteAgentRuntimeFacade = (params: {
  providerId: "unica_agent";
  goal: string;
  context: JsonObject;
  finishSchema: JsonObject | null;
  limits: {
    maxSteps: number | null;
    maxToolCalls: number | null;
    timeoutSec: number | null;
    maxCostUsd: number | null;
  };
  writePolicy: "approval_required" | "read_only";
  traceLevel: "basic" | "verbose";
  callbacks?: {
    events?: { url: string; token: string | null; executionId?: string | null } | null;
  } | null;
  invocation: {
    runId: string;
    stepId: string;
    nodeId: string;
    workspaceId: string;
    chatId: string;
    userId: string | null;
  };
  runtimeCapacity?: {
    maxConcurrentRuns?: number;
    maxConcurrentCodeExec?: number;
    retryAfterSec?: number;
  } | null;
  runtimeResilience?: {
    guardRetryMaxPerRun: number;
    guardRetryMinRemainingSec: number;
    deadlineSafetyMarginSec: number;
    roundMinRemainingSec: number;
    retryEchoMaxChars: number;
  } | null;
  modelId?: string | null;
  optimizationProfile?: AgentCapabilityOptimizationProfile | null;
  capabilityIds: {
    actionIds: string[];
    operationIds: string[];
    systemOperationKeys: string[];
    skillIds: string[];
    connectionIds: string[];
  };
  includeAllWorkspaceMcpTools?: boolean;
  assistantId?: string | null;
  signal?: AbortSignal;
}) => Promise<AgentRuntimeResult>;

// ── knowledge-prefetch ───────────────────────────────────────────────────────

/** server/agent-runtime/knowledge-prefetch.ts — статус инлайна привязанной БЗ в контекст. */
export type AgentKnowledgePrefetchStatus = "inlined" | "toc_only" | "skipped";

/** server/agent-runtime/knowledge-prefetch.ts — причина итогового статуса prefetch. */
export type AgentKnowledgePrefetchReason =
  | "ok"
  | "disabled"
  | "no_knowledge_scope"
  | "over_char_budget"
  | "over_doc_budget"
  | "acl_denied"
  | "empty"
  | "error";

/** server/agent-runtime/knowledge-prefetch.ts — инлайн-документ БЗ. */
export type AgentInlineKnowledgeDocument = {
  baseId: string;
  baseName: string;
  nodeId: string;
  title: string;
  text: string;
  truncated: false;
  breadcrumbs?: string[];
  updatedAt?: string;
};

/** server/agent-runtime/knowledge-prefetch.ts — элемент инвентаря БЗ. */
export type AgentKnowledgeInventoryItem = {
  baseId: string;
  baseName: string;
  nodeId: string;
  title: string;
  updatedAt: string | null;
  charCount: number;
  inlined: boolean;
};

/** server/agent-runtime/knowledge-prefetch.ts AgentKnowledgePrefetchResult — итог prefetch БЗ. */
export type AgentKnowledgePrefetchResult = {
  status: AgentKnowledgePrefetchStatus;
  reason: AgentKnowledgePrefetchReason;
  baseIds: string[];
  documents: AgentInlineKnowledgeDocument[];
  inventory: AgentKnowledgeInventoryItem[];
  complete: boolean;
  totalChars: number;
  inlinedChars: number;
  docCount: number;
};

/** server/agent-runtime/knowledge-prefetch.ts collectKnowledgeBaseIdsFromContextRefs. */
export type CollectKnowledgeBaseIdsFromContextRefsFacade = (value: unknown) => string[];

/** server/agent-runtime/knowledge-prefetch.ts prefetchKnowledgeForAgentRun. */
export type PrefetchKnowledgeForAgentRunFacade = (params: {
  workspaceId: string;
  actorUserId: string | null;
  assistantKnowledgeBaseIds: string[];
  contextRefKnowledgeBaseIds?: string[];
  requestText: string;
  recentChatMessages: Array<{ content: string }>;
  config: ResolvedKbPrefetchConfig;
}) => Promise<AgentKnowledgePrefetchResult>;

// ── artifacts / idempotency ──────────────────────────────────────────────────

/** server/agent-runtime/agent-artifacts.ts listAgentArtifacts — возврат ослаблен до читаемых полей. */
export type ListAgentArtifactsFacade = (params: {
  workspaceId: string;
  chatId: string | null;
  runId?: string | null;
  scope?: "current_chat" | "last_run" | "run";
  mutationKinds?: string[];
  resourceTypes?: string[];
  includeCleaned?: boolean;
  limit?: number;
}) => Promise<
  Array<{
    artifactId: string;
    operationKey: string;
    resourceId: string;
    title: string;
  }>
>;

/** server/agent-runtime/agent-tool-idempotency-service.ts — возврат ослаблен (без `completedAt`). */
export type ListCompletedIdempotentToolCallsFacade = (params: {
  runId: string;
  nodeId?: string | null;
}) => Promise<
  Array<{
    toolKind: string;
    toolRef: string;
    inputHash: string;
  }>
>;

// ── source-grounding ─────────────────────────────────────────────────────────

/** server/agent-runtime/source-grounding.ts — семейство источников. */
export type AgentSourceFamily = "attachments" | "chat_tabs" | "knowledge";

/** server/agent-runtime/source-grounding.ts — вход prefetch БЗ для грундинга. */
export type AgentSourceGroundingKnowledgePrefetch = {
  status: "inlined" | "toc_only" | "skipped";
  baseIds: string[];
  documents: ReadonlyArray<unknown>;
  inventory: ReadonlyArray<unknown>;
};

/** server/agent-runtime/source-grounding.ts — контракт грундинга источников. */
export type AgentSourceGroundingContract = {
  requiresGrounding: boolean;
  requiredSourceFamilies: AgentSourceFamily[];
  availableSourceFamilies: AgentSourceFamily[];
  comparisonRequested: boolean;
  inlineSourceBodiesAvailable: boolean;
  inlineKnowledgeDocumentsAvailable: boolean;
  sourceInventorySummary: string[];
};

/** server/agent-runtime/source-grounding.ts — инвентарь источников. */
export type AgentSourceInventory = {
  attachments: Array<{
    id: string;
    filename: string;
    kind: string;
    hasInlineText: boolean;
    hasTruncatedInlineText: boolean;
    canOcr: boolean;
  }>;
  chatTabs: Array<{
    tabId: string;
    title: string;
    sourceType: "transcript" | "canvas_document";
    tabType: "original" | "canvas_document";
    transcriptId: string | null;
  }>;
  knowledgeRefs: string[];
};

/** server/agent-runtime/source-grounding.ts buildAgentSourceGroundingContext. */
export type BuildAgentSourceGroundingContextFacade = (params: {
  requestText: string;
  recentChatMessages: Array<{ role: string; content: string }>;
  requestPrefersChatTabsOverAttachments: boolean;
  requestMentionsTranscriptOrTab: boolean;
  attachments: unknown;
  chatTabContext: unknown;
  transcriptText: string | null;
  knowledgePrefetch?: AgentSourceGroundingKnowledgePrefetch | null;
}) => {
  contract: AgentSourceGroundingContract;
  inventory: AgentSourceInventory;
};
