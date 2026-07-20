import type {
  KnowledgeUploadImportKind,
  KnowledgeUploadItemProcessingStatus,
  KnowledgeUploadItemUploadStatus,
  KnowledgeUploadSession,
  KnowledgeUploadSessionItem,
  KnowledgeUploadSessionStatus,
  KnowledgeUploadSessionUploadedPart,
  KnowledgeUploadSourceKind,
  KnowledgeUploadStrategy,
} from "./schema";

export type PublicKnowledgeUploadSession = {
  id: string;
  workspaceId: string;
  baseId: string;
  parentId: string | null;
  createdByUserId: string | null;
  clientSessionKey: string;
  sourceKind: KnowledgeUploadSourceKind;
  status: KnowledgeUploadSessionStatus;
  totalItems: number;
  uploadingItems: number;
  uploadedItems: number;
  processingItems: number;
  completedItems: number;
  failedItems: number;
  canceledItems: number;
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
};

export type PublicKnowledgeUploadSessionItem = {
  id: string;
  sessionId: string;
  clientFileKey: string;
  relativePath: string | null;
  fileName: string;
  fileSize: number;
  mimeType: string | null;
  importKind: KnowledgeUploadImportKind;
  uploadStrategy: KnowledgeUploadStrategy;
  storageKey: string | null;
  multipartUploadId: string | null;
  chunkSize: number | null;
  totalParts: number | null;
  uploadedParts: KnowledgeUploadSessionUploadedPart[];
  uploadedBytes: number;
  uploadStatus: KnowledgeUploadItemUploadStatus;
  processingStatus: KnowledgeUploadItemProcessingStatus;
  importOptions: Record<string, unknown>;
  importEntryId: string | null;
  executorJobId: string | null;
  checksumSha256: string | null;
  lastError: string | null;
  createdAt: string;
  uploadStartedAt: string | null;
  uploadCompletedAt: string | null;
  processingStartedAt: string | null;
  processingCompletedAt: string | null;
  updatedAt: string;
};

export type CreateKnowledgeUploadSessionRequest = {
  parentId?: string | null;
  clientSessionKey: string;
  sourceKind: KnowledgeUploadSourceKind;
};

export type BulkRegisterKnowledgeUploadSessionItemsRequest = {
  items: Array<{
    clientFileKey: string;
    relativePath?: string | null;
    fileName: string;
    fileSize: number;
    mimeType?: string | null;
    importKind: KnowledgeUploadImportKind;
    importOptions?: Record<string, unknown>;
  }>;
};

export type StartKnowledgeUploadSessionItemResponse = {
  session: PublicKnowledgeUploadSession;
  item: PublicKnowledgeUploadSessionItem;
  chunkSize: number;
  totalParts: number;
  uploadedParts: KnowledgeUploadSessionUploadedPart[];
};

export type UploadKnowledgeUploadSessionItemPartResponse = {
  session: PublicKnowledgeUploadSession;
  item: PublicKnowledgeUploadSessionItem;
  partNumber: number;
  etag: string;
  alreadyUploaded: boolean;
};

export type CompleteKnowledgeUploadSessionItemResponse = {
  session: PublicKnowledgeUploadSession;
  item: PublicKnowledgeUploadSessionItem;
};

export type GetKnowledgeUploadSessionResponse = {
  session: PublicKnowledgeUploadSession;
  items: PublicKnowledgeUploadSessionItem[];
};

export type KnowledgeUploadSessionEvent =
  | {
      type: "session";
      session: PublicKnowledgeUploadSession;
    }
  | {
      type: "item";
      sessionId: string;
      item: PublicKnowledgeUploadSessionItem;
    };

export function toPublicKnowledgeUploadSession(session: KnowledgeUploadSession): PublicKnowledgeUploadSession {
  return {
    id: session.id,
    workspaceId: session.workspaceId,
    baseId: session.baseId,
    parentId: session.parentId ?? null,
    createdByUserId: session.createdByUserId ?? null,
    clientSessionKey: session.clientSessionKey,
    sourceKind: session.sourceKind,
    status: session.status,
    totalItems: session.totalItems ?? 0,
    uploadingItems: session.uploadingItems ?? 0,
    uploadedItems: session.uploadedItems ?? 0,
    processingItems: session.processingItems ?? 0,
    completedItems: session.completedItems ?? 0,
    failedItems: session.failedItems ?? 0,
    canceledItems: session.canceledItems ?? 0,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
    finishedAt: session.finishedAt?.toISOString() ?? null,
  };
}

export function toPublicKnowledgeUploadSessionItem(item: KnowledgeUploadSessionItem): PublicKnowledgeUploadSessionItem {
  return {
    id: item.id,
    sessionId: item.sessionId,
    clientFileKey: item.clientFileKey,
    relativePath: item.relativePath ?? null,
    fileName: item.fileName,
    fileSize: item.fileSize ?? 0,
    mimeType: item.mimeType ?? null,
    importKind: item.importKind,
    uploadStrategy: item.uploadStrategy,
    storageKey: item.storageKey ?? null,
    multipartUploadId: item.multipartUploadId ?? null,
    chunkSize: item.chunkSize ?? null,
    totalParts: item.totalParts ?? null,
    uploadedParts: Array.isArray(item.uploadedParts) ? item.uploadedParts : [],
    uploadedBytes: item.uploadedBytes ?? 0,
    uploadStatus: item.uploadStatus,
    processingStatus: item.processingStatus,
    importOptions: (item.importOptions ?? {}) as Record<string, unknown>,
    importEntryId: item.importEntryId ?? null,
    executorJobId: item.executorJobId ?? null,
    checksumSha256: item.checksumSha256 ?? null,
    lastError: item.lastError ?? null,
    createdAt: item.createdAt.toISOString(),
    uploadStartedAt: item.uploadStartedAt?.toISOString() ?? null,
    uploadCompletedAt: item.uploadCompletedAt?.toISOString() ?? null,
    processingStartedAt: item.processingStartedAt?.toISOString() ?? null,
    processingCompletedAt: item.processingCompletedAt?.toISOString() ?? null,
    updatedAt: item.updatedAt.toISOString(),
  };
}
