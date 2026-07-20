/**
 * @shared-фасад RAG/knowledge-подсистемы для workflow-runtime (W2/S8 Tier-2, deep-cascade,
 * docs/w2-workflow-packaging-plan.md §5). Сигнатуры `callRagForAssistantChat` (chat-rag) и
 * `runKnowledgeBaseRagPipeline` (lib/rag-pipeline), которые ядро зовёт через
 * `WorkflowGateway.knowledge` — без type-импортов `../chat-rag` / `../lib/rag-pipeline`.
 *
 * Возвраты обеих функций уже `Promise<unknown>` (ядро парсит через normalizeRecord) —
 * ослаблять нечего. RAG-payload скопирован структурно. `req` — express `Request` (npm-тип,
 * не `server/**`; ядро передаёт `fakeRequest as Request`). Дрейф ловится на wire.
 */

import type { Request } from "express";
import type { AssistantDto } from "@shared/assistants";
import type { WorkflowKnowledgeRagConfig } from "@shared/workflow-compiler";
import type { RagPipelineExecutionSource } from "@shared/rag-errors";
import type { SearchProfileDto } from "@shared/search-profiles";
import type { RagGlobalSettingsDto } from "@shared/rag-global-settings";
import type { ChatConversationMessage } from "@shared/workflow-runtime-chat-facade";

/** server/chat-rag.ts — стрим-колбэк RAG-пайплайна. */
export type RagPipelineStream = {
  onEvent: (eventName: string, payload?: unknown) => void;
};

/** server/chat-rag.ts — предзагруженная RAG-конфигурация (профиль поиска + глобальные настройки). */
export type RagPipelinePrefetchedConfig = {
  activeSearchProfile?: SearchProfileDto | null;
  ragGlobalSettings?: RagGlobalSettingsDto | null;
};

/** server/chat-rag.ts — контекст вызова RAG-пайплайна. */
export type RagPipelineInvocationContext = {
  source?: RagPipelineExecutionSource;
  assistantExecutionId?: string | null;
  prefetchedConfig?: RagPipelinePrefetchedConfig;
};

/** server/chat-rag.ts — payload запроса к RAG-пайплайну БЗ. */
export type KnowledgeRagRequestPayload = {
  q: string;
  original_query_for_embedding?: string;
  kb_id?: string;
  kb_ids?: string[];
  top_k: number;
  min_score?: number;
  max_context_tokens?: number;
  collection?: string;
  collections?: string[];
  restrict_document_ids?: string[];
  assistant_id?: string;
  workspace_id?: string;
  conversation_history?: ChatConversationMessage[];
  chat_id?: string;
  hybrid: {
    bm25: { weight?: number; limit?: number };
    vector: {
      weight?: number;
      limit?: number;
      collection?: string;
      collections?: string[];
      embedding_provider_id?: string;
      embedding_model?: string;
    };
  };
  search?: {
    strategy?: "rrf" | "weighted_thresholded" | "union";
    bm25_threshold?: number;
    vector_threshold?: number;
    rrf_k?: number;
    query_rewrite?: { enabled?: boolean; model?: string; prompt?: string };
    rerank?: {
      enabled?: boolean;
      provider_id?: string;
      model?: string;
      prompt?: string;
      candidate_count?: number;
    };
  };
  llm: {
    provider: string;
    model?: string;
    temperature?: number;
    max_completion_tokens?: number;
    system_prompt?: string;
    response_format?: string;
  };
  stream?: boolean;
};

/** server/chat-rag.ts — телеметрия собранного RAG-payload. */
export type AssistantRagPayloadTelemetry = {
  knowledgeBaseId: string | null;
  collections: string[];
  searchProfileId: string | null;
  searchProfileVersion: number | null;
  searchStrategy: "rrf" | "weighted_thresholded" | "union";
  embeddingProviderId: string | null;
  embeddingModel: string | null;
  llmProviderId: string;
  llmModel: string;
  stream: boolean;
  topK: number;
  bm25Weight: number;
  bm25Limit: number;
  vectorWeight: number;
  vectorLimit: number;
  queryRewriteEnabled: boolean;
  rerankEnabled: boolean;
  rerankModel: string | null;
  responseFormat: string;
};

/** server/lib/rag-pipeline.ts runKnowledgeBaseRagPipeline. */
export type RunKnowledgeBaseRagPipeline = (options: {
  req: Request;
  body: KnowledgeRagRequestPayload;
  stream?: RagPipelineStream | null;
  abortSignal?: AbortSignal;
  context?: RagPipelineInvocationContext;
}) => Promise<unknown>;

/** server/chat-rag.ts callRagForAssistantChat. */
export type CallRagForAssistantChatFacade = (options: {
  req: Request;
  assistant: AssistantDto;
  workspaceId: string;
  userMessage: string;
  chatId?: string;
  excludeMessageId?: string;
  userId?: string;
  runPipeline: RunKnowledgeBaseRagPipeline;
  stream?: RagPipelineStream | null;
  abortSignal?: AbortSignal;
  workflowRagConfig?: WorkflowKnowledgeRagConfig | null;
  ragSource?: RagPipelineExecutionSource;
  assistantExecutionId?: string | null;
  onPayloadBuilt?: (
    payload: KnowledgeRagRequestPayload,
    telemetry: AssistantRagPayloadTelemetry,
  ) => void;
}) => Promise<unknown>;

/** KB-search: единый callback в RAG-подсистему монолита (§2.5 карты декаплинга). */
export type WorkflowGatewayKnowledgePort = {
  callRagForAssistantChat: CallRagForAssistantChatFacade;
  runKnowledgeBaseRagPipeline: RunKnowledgeBaseRagPipeline;
};
