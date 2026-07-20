/**
 * @shared-фасад chat-домена для workflow-runtime (W2/S8 Tier-2, deep-cascade,
 * docs/w2-workflow-packaging-plan.md §5). Сигнатуры 13 функций chat-service, которые ядро
 * зовёт через `WorkflowGateway.chat`, + структурные копии `ChatLlmContext` (и вложенных)
 * и `MappedChatMessage` — чтобы поддерево рантайма компилировалось без type-импорта
 * `../chat-service`.
 *
 * ВАЖНО: `ChatLlmContext` ослаблять НЕЛЬЗЯ — ядро и конструирует его (литерал), и передаёт
 * обратно в `buildChatCompletionRequestBody`; воспроизведён все 10 полей точно. Возвраты
 * `MappedChatMessage`-функций ядро читает только по `.id`, но тип скопирован целиком (дешевле
 * и безопаснее по assignability). Дрейф ловится на wire (`wireWorkflowGateway`).
 */

import type {
  AssistantActionType,
  BotAction,
  BotActionStatus,
  ChatCard,
  ChatMessageRole,
  ChatStatus,
  LlmProvider,
  LlmRequestConfig,
  Model,
  Transcript,
  TranscriptStatus,
} from "@shared/schema";
import type { AssistantDto } from "@shared/assistants";

/** Дескриптор файла в спроецированном сообщении чата (общий для `files[]` и `file`). */
export type MappedChatMessageFile = {
  attachmentId: string | null;
  filename: string;
  mimeType: string | null;
  sizeBytes: number | null;
  kind: "image" | "document" | "audio" | "video" | null;
  uploadedByUserId: string | null;
  downloadUrl: string;
  expiresAt: string | null;
};

/** server/chat-service.ts mapMessage — спроецированная форма сообщения чата (возврат ~15 функций). */
export type MappedChatMessage = {
  id: string;
  chatId: string;
  role: "user" | "assistant" | "system";
  type: "text" | "file" | "card";
  cardId: string | null;
  content: string;
  metadata: Record<string, unknown>;
  files?: MappedChatMessageFile[];
  file?: MappedChatMessageFile;
  createdAt: string;
};

/** server/chat-service.ts — сводка чата (+ денормализованные поля ассистента и текущего действия). */
export type ChatSummary = {
  id: string;
  workspaceId: string;
  userId: string;
  assistantId: string;
  status: ChatStatus;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
  assistantName: string | null;
  assistantIsSystem: boolean;
  assistantSystemKey: string | null;
  assistantStatus: string | null;
  lastMessageSnippet?: string | null;
  currentAssistantActionType?: AssistantActionType | null;
  currentAssistantActionText?: string | null;
  currentAssistantActionTriggerMessageId?: string | null;
  currentAssistantActionUpdatedAt?: Date | string | null;
  currentAssistantAction?: {
    type: AssistantActionType;
    text: string | null;
    triggerMessageId: string | null;
    updatedAt: string | null;
  } | null;
};

/** server/chat-service.ts — вид ассистента для LLM-контекста чата. */
export type ChatAssistantType = "UNICA_CHAT" | "RAG_SKILL" | "LLM_SKILL";

/** server/chat-service.ts — контекст ассистента внутри `ChatLlmContext`. */
export type ChatAssistantContext = {
  id: string;
  name: string | null;
  isSystem: boolean;
  systemKey: string | null;
  type: ChatAssistantType;
  isUnicaChat: boolean;
  isRagAssistant: boolean;
  mode: "rag" | "llm";
};

/** server/chat-service.ts — сообщение истории беседы для LLM (role+content). */
export type ChatConversationMessage = {
  role: ChatMessageRole;
  content: string;
};

/** server/chat-service.ts — собранный LLM-контекст чата (ядро конструирует и читает целиком). */
export type ChatLlmContext = {
  chat: ChatSummary;
  assistant: ChatAssistantContext;
  assistantConfig: AssistantDto;
  provider: LlmProvider;
  requestConfig: LlmRequestConfig;
  model: string | null;
  modelInfo: Model | null;
  messages: ChatConversationMessage[];
  contextInputLimit: number | null;
  retrievedContext?: string[];
};

/** server/chat-service.ts — опции `buildChatLlmContext`. */
export type BuildChatLlmContextOptions = {
  executionId?: string | null;
};

/** Доставка в чат: сообщения, карточки, стрим-чанки, статус ассистента. */
export type WorkflowGatewayChatPort = {
  addAssistantMessage(
    chatId: string,
    workspaceId: string,
    userId: string,
    content: string,
    metadata?: Record<string, unknown>,
  ): Promise<MappedChatMessage>;
  buildChatCompletionRequestBody(
    context: ChatLlmContext,
    options?: { stream?: boolean },
  ): Record<string, unknown>;
  buildChatLlmContext(
    chatId: string,
    workspaceId: string,
    userId: string,
    options?: BuildChatLlmContextOptions,
  ): Promise<ChatLlmContext>;
  clearAssistantActionForChat(opts: {
    workspaceId: string;
    chatId: string;
    triggerMessageId?: string | null;
  }): Promise<void>;
  setChatAssistantAction(opts: {
    workspaceId: string;
    chatId: string;
    actionType?: AssistantActionType | null;
    actionText?: string | null;
    triggerMessageId?: string | null;
    occurredAt?: string | Date | null;
  }): Promise<ChatSummary>;
  upsertBotActionForChat(opts: {
    workspaceId: string;
    chatId: string;
    actionId: string;
    actionType: string;
    status: BotActionStatus;
    displayText?: string | null | undefined;
    payload?: Record<string, unknown> | null;
    userId?: string | null;
    expectedAssistantId?: string | null;
  }): Promise<BotAction>;
  upsertChatEffectMessage(opts: {
    chatId: string;
    workspaceId: string;
    role: ChatMessageRole;
    content: string;
    messageType?: "text" | "card";
    messageId?: string | null;
    cardId?: string | null;
    triggerMessageId?: string | null;
    assistantActionTriggerMessageId?: string | null;
    metadata?: Record<string, unknown> | null;
    expectedAssistantId?: string | null;
    clearAssistantAction?: boolean;
  }): Promise<MappedChatMessage>;
  upsertChatStreamChunk(opts: {
    workspaceId: string;
    chatId: string;
    streamId: string;
    triggerMessageId: string;
    chunkId: string;
    assistantActionTriggerMessageId?: string | null;
    delta?: string | null;
    role?: ChatMessageRole;
    isFinal?: boolean;
    seq?: number | null;
    messageId?: string | null;
    clearAssistantAction?: boolean;
    expectedAssistantId?: string | null;
  }): Promise<MappedChatMessage>;
  upsertDocumentCardMessage(opts: {
    workspaceId: string;
    chatId: string;
    documentId: string;
    title?: string | null;
    previewText?: string | null;
    cardId?: string | null;
    messageId?: string | null;
    triggerMessageId?: string | null;
    sourceMessageId?: string | null;
    assistantActionTriggerMessageId?: string | null;
    expectedAssistantId?: string | null;
    metadata?: Record<string, unknown> | null;
  }): Promise<{ card: ChatCard; message: MappedChatMessage }>;
  upsertTranscriptCardMessage(opts: {
    workspaceId: string;
    chatId: string;
    transcriptId: string;
    title?: string | null;
    previewText?: string | null;
    cardId?: string | null;
    messageId?: string | null;
    triggerMessageId?: string | null;
    assistantActionTriggerMessageId?: string | null;
    expectedAssistantId?: string | null;
    metadata?: Record<string, unknown> | null;
  }): Promise<{ card: ChatCard; message: MappedChatMessage }>;
  upsertTranscriptForChat(opts: {
    workspaceId: string;
    chatId: string;
    transcriptId?: string | null;
    fullText: string;
    previewText?: string | null;
    title?: string | null;
    status?: TranscriptStatus | null;
    expectedAssistantId?: string | null;
  }): Promise<Transcript>;
  upsertWorkflowContextRequestCardMessage(opts: {
    workspaceId: string;
    chatId: string;
    contextRequestId: string;
    question: string;
    previewText?: string | null;
    payload?: Record<string, unknown> | null;
    cardId?: string | null;
    messageId?: string | null;
    triggerMessageId?: string | null;
    assistantActionTriggerMessageId?: string | null;
    expectedAssistantId?: string | null;
    metadata?: Record<string, unknown> | null;
  }): Promise<{ card: ChatCard; message: MappedChatMessage }>;
  upsertWorkflowFormCardMessage(opts: {
    workspaceId: string;
    chatId: string;
    formRequestId: string;
    title: string;
    description?: string | null;
    payload?: Record<string, unknown> | null;
    cardId?: string | null;
    messageId?: string | null;
    triggerMessageId?: string | null;
    assistantActionTriggerMessageId?: string | null;
    expectedAssistantId?: string | null;
    metadata?: Record<string, unknown> | null;
  }): Promise<{ card: ChatCard; message: MappedChatMessage }>;
};
