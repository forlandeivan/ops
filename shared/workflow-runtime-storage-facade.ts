/**
 * @shared-фасад data-порта workflow-runtime (W2/S8 Tier-2, deep-cascade,
 * docs/w2-workflow-packaging-plan.md §5). Узкий структурный интерфейс 15 методов
 * `DatabaseStorage`, которые ядро рантайма читает через `WorkflowGateway.data` — чтобы
 * поддерево `server/workflow-runtime/*` компилировалось без type-импорта `../storage`.
 *
 * Реализация (класс DatabaseStorage) остаётся в монолите; wire присваивает `data: storage`,
 * и tsc проверяет `DatabaseStorage ⊆ WorkflowGatewayDataPort` на `wireWorkflowGateway` —
 * дрейф сигнатур ловится там. 13/15 возвратов — drizzle-row-типы из `@shared/schema`;
 * два локально-доменных типа (`ChatMessageReadOptions`, `WorkspaceMembership`) скопированы
 * структурно.
 */

import type {
  CanvasDocument,
  CanvasDocumentInsert,
  ChatAttachment,
  ChatAttachmentInsert,
  ChatMessage,
  ChatSession,
  DocumentRevision,
  DocumentRevisionInsert,
  LlmProvider,
  UnicaChatConfig,
  User,
  Workspace,
  WorkspaceMember,
  WorkflowStatusTemplate,
} from "@shared/schema";
import type { WorkflowStatusTemplateAllowedNodeKind } from "@shared/workflow-status-templates";

/** server/storage.ts — опции чтения сообщений чата (гидрация текста вложений). */
export type ChatMessageReadOptions = {
  hydrateAttachmentText?: boolean;
};

/** server/storage.ts — статус членства в воркспейсе. */
export type WorkspaceMembershipStatus = "active" | "invited" | "removed" | "blocked";

/** server/storage.ts — членство пользователя в воркспейсе (row + статус). */
export type WorkspaceMembership = WorkspaceMember & { status: WorkspaceMembershipStatus };

/** Узкий data-фасад: 15 методов storage из импорт-аудита (§5 карты декаплинга). */
export type WorkflowGatewayDataPort = {
  getChatSessionById(chatId: string): Promise<
    | (ChatSession & {
        assistantName: string | null;
        assistantIsSystem: boolean;
        assistantSystemKey: string | null;
        assistantStatus: string | null;
        lastMessageSnippet: string | null;
      })
    | null
  >;
  getChatMessage(id: string, options?: ChatMessageReadOptions): Promise<ChatMessage | undefined>;
  listChatMessages(chatId: string, options?: ChatMessageReadOptions): Promise<ChatMessage[]>;
  getChatAttachmentsByIds(ids: string[]): Promise<ChatAttachment[]>;
  createChatAttachment(values: ChatAttachmentInsert): Promise<ChatAttachment>;
  getCanvasDocument(id: string): Promise<CanvasDocument | undefined>;
  createCanvasDocument(values: CanvasDocumentInsert): Promise<CanvasDocument>;
  updateCanvasDocument(
    id: string,
    updates: Partial<
      Pick<CanvasDocumentInsert, "title" | "content" | "contentJson" | "isDefault" | "revision">
    >,
  ): Promise<CanvasDocument | undefined>;
  createDocumentRevision(values: DocumentRevisionInsert): Promise<DocumentRevision>;
  getWorkspace(id: string): Promise<Workspace | undefined>;
  getWorkspaceMember(userId: string, workspaceId: string): Promise<WorkspaceMembership | undefined>;
  getUser(id: string): Promise<User | undefined>;
  getUnicaChatConfig(): Promise<UnicaChatConfig>;
  getLlmProvider(id: string, workspaceId?: string): Promise<LlmProvider | undefined>;
  listWorkflowStatusTemplates(options?: {
    ids?: string[];
    nodeKind?: WorkflowStatusTemplateAllowedNodeKind;
    activeOnly?: boolean;
  }): Promise<WorkflowStatusTemplate[]>;
};
