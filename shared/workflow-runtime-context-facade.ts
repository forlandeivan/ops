/**
 * @shared-фасад контекст-резолверов workflow-runtime (W2/S8 Tier-2,
 * docs/w2-workflow-packaging-plan.md §5). Сигнатуры функций context-refs / chat-tabs /
 * assistants / assistant-context-loader / model-service, которые ядро зовёт через
 * `WorkflowGateway.context` — без type-импортов соответствующих `server/**`.
 *
 * Параметры скопированы точно; тяжёлые возвраты ослаблены до полей, читаемых ядром.
 * `ContextRef`/`ComposerPart`/`ResolvedContextRef`, `AssistantDto`, `Model`/`ModelType`,
 * `DocumentTabType` уже в `@shared`.
 */

import type {
  ComposerPart,
  ContextRef,
  ContextRefSource,
  ResolvedContextRef,
} from "@shared/context-refs";
import type { AssistantDto } from "@shared/assistants";
import type { DocumentTabType, Model, ModelType } from "@shared/schema";

/** Контекст исполнения: ассистент, контекст-ссылки, вкладки чата, модели. */
export type WorkflowGatewayContextPort = {
  resolveContextRefsForMessage(params: {
    workspaceId: string;
    userId: string;
    chatId: string;
    contextRefs?: ContextRef[];
    composerParts?: ComposerPart[];
    source: ContextRefSource;
  }): Promise<{
    contextRefs: ContextRef[];
    resolvedContextRefs: ResolvedContextRef[];
  }>;
  listChatTabSources(params: {
    workspaceId: string;
    chatId: string;
    transcriptId?: string | null;
  }): Promise<
    Array<{
      sourceType: "transcript" | "canvas_document";
      tabType: DocumentTabType;
      tabId: string;
      transcriptId: string | null;
      title: string;
      snippet: string;
    }>
  >;
  getAssistantById(workspaceId: string, assistantId: string): Promise<AssistantDto | null>;
  composeChatInstructionsBlock(params: {
    workspaceId: string;
    assistantId?: string | null;
    assistantInstruction?: string | null;
    maxChars?: number | null;
  }): Promise<string>;
  ensureModelAvailable(
    modelKeyOrId: string,
    opts?: { expectedType?: ModelType; requireActive?: boolean; providerId?: string | null },
  ): Promise<Model>;
  getModelByKeyOrId(
    input: string,
    opts?: { requireActive?: boolean; expectedType?: ModelType; providerId?: string | null },
  ): Promise<Model | null>;
};
