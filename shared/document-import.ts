import type {
  KnowledgeDocumentImportOcrDecision,
  KnowledgeDocumentImportJobPhase,
  KnowledgeDocumentImportJobStatus,
  KnowledgeDocumentImportMode,
  KnowledgeDocumentImportPipeline,
  KnowledgeDocumentImportSourceKind,
} from "./schema";

export interface CreateKnowledgeDocumentImportJobResponse {
  jobId: string;
  status: "pending";
  phase: "queued";
}

export interface GetActiveKnowledgeDocumentImportResponse {
  jobId: string | null;
  status: KnowledgeDocumentImportJobStatus | null;
}

export interface KnowledgeDocumentImportJobTiming {
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  durationSeconds: number | null;
}

export interface GetKnowledgeDocumentImportJobResponse {
  jobId: string;
  baseId: string;
  baseName: string;
  status: KnowledgeDocumentImportJobStatus;
  phase: KnowledgeDocumentImportJobPhase;
  percent: number;
  importMode: KnowledgeDocumentImportMode;
  file: {
    fileName: string;
    fileSize: number;
    fileKey: string;
    mimeType: string | null;
    kind: KnowledgeDocumentImportSourceKind;
  };
  timing: KnowledgeDocumentImportJobTiming;
  pipelineUsed: KnowledgeDocumentImportPipeline | null;
  ocrProviderId: string | null;
  ocrModel: string | null;
  ocrRecommendation: KnowledgeDocumentImportOcrDecision | null;
  ocrUsed: boolean | null;
  doclingAttempts: number;
  fallbackReasonCode: string | null;
  fallbackReasonMessage: string | null;
  warningCode: string | null;
  warningMessage: string | null;
  lastError: string | null;
  createdDocumentNodeId: string | null;
  createdDocumentId: string | null;
  createdVersionId: string | null;
}
