import type {
  KnowledgeImportEntry,
  KnowledgeImportEntryKind,
  KnowledgeImportEntryProgress,
  KnowledgeImportEntryStatus,
} from "./schema";

export type KnowledgeImportEntryEvent =
  | {
      type: "upsert";
      entry: PublicKnowledgeImportEntry;
    }
  | {
      type: "remove";
      entryId: string;
      baseId: string;
    };

export type PublicKnowledgeImportEntry = {
  id: string;
  workspaceId: string;
  baseId: string;
  parentId: string | null;
  slotPosition: number;
  kind: KnowledgeImportEntryKind;
  title: string;
  status: KnowledgeImportEntryStatus;
  phase: string | null;
  progress: KnowledgeImportEntryProgress;
  sourcePayload: Record<string, unknown>;
  configDraft: Record<string, unknown>;
  executorKind: string | null;
  executorJobId: string | null;
  resultNodeId: string | null;
  resultSummary: Record<string, unknown>;
  errorMessage: string | null;
  createdByUserId: string | null;
  dismissedAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type GetKnowledgeImportEntriesResponse = {
  entries: PublicKnowledgeImportEntry[];
};

export type CreateKnowledgeImportEntryRequest = {
  parentId?: string | null;
  kind: KnowledgeImportEntryKind;
  title: string;
  status?: KnowledgeImportEntryStatus;
  phase?: string | null;
  progress?: KnowledgeImportEntryProgress;
  sourcePayload?: Record<string, unknown>;
  configDraft?: Record<string, unknown>;
  autoStart?: boolean;
};

export type UpdateKnowledgeImportEntryRequest = {
  title?: string;
  status?: KnowledgeImportEntryStatus;
  phase?: string | null;
  progress?: KnowledgeImportEntryProgress;
  sourcePayload?: Record<string, unknown>;
  configDraft?: Record<string, unknown>;
  resultNodeId?: string | null;
  resultSummary?: Record<string, unknown>;
  errorMessage?: string | null;
};

export type StartKnowledgeImportEntryRequest = {
  configDraft?: Record<string, unknown>;
  sourcePayload?: Record<string, unknown>;
};

export type StartKnowledgeImportEntryResponse = {
  entry: PublicKnowledgeImportEntry;
};

export type RetryKnowledgeImportEntryResponse = {
  entry: PublicKnowledgeImportEntry;
};

export type DismissKnowledgeImportEntryResponse = {
  success: true;
};

export function toPublicKnowledgeImportEntry(entry: KnowledgeImportEntry): PublicKnowledgeImportEntry {
  return {
    id: entry.id,
    workspaceId: entry.workspaceId,
    baseId: entry.baseId,
    parentId: entry.parentId ?? null,
    slotPosition: entry.slotPosition ?? 0,
    kind: entry.kind,
    title: entry.title,
    status: entry.status,
    phase: entry.phase ?? null,
    progress: (entry.progress ?? {}) as KnowledgeImportEntryProgress,
    sourcePayload: (entry.sourcePayload ?? {}) as Record<string, unknown>,
    configDraft: (entry.configDraft ?? {}) as Record<string, unknown>,
    executorKind: entry.executorKind ?? null,
    executorJobId: entry.executorJobId ?? null,
    resultNodeId: entry.resultNodeId ?? null,
    resultSummary: (entry.resultSummary ?? {}) as Record<string, unknown>,
    errorMessage: entry.errorMessage ?? null,
    createdByUserId: entry.createdByUserId ?? null,
    dismissedAt: entry.dismissedAt?.toISOString() ?? null,
    startedAt: entry.startedAt?.toISOString() ?? null,
    finishedAt: entry.finishedAt?.toISOString() ?? null,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  };
}
