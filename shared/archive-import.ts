import type {
  ArchiveImportConflictPolicy,
  ArchiveImportItemStatus,
  ArchiveImportJobStatus,
} from "./schema";

export type ArchiveFormat = "zip" | "rar" | "7z" | "unknown";
export const archiveImportErrorCategories = [
  "archive_structure",
  "unsupported_file",
  "limits",
  "timeout_transient",
  "processing_internal",
] as const;
export type ArchiveImportErrorCategory = (typeof archiveImportErrorCategories)[number];

export interface ArchiveImportProgress {
  totalItems: number;
  processedItems: number;
  activeItems?: number;
  createdItems: number;
  failedItems: number;
  skippedItems: number;
  percent: number;
}

export interface ArchiveImportTiming {
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  durationSeconds: number | null;
}

export interface ArchiveImportErrorItem {
  itemId: string;
  filePath: string;
  status: ArchiveImportItemStatus;
  errorCode: string | null;
  message: string | null;
  retryCount: number;
  category: ArchiveImportErrorCategory;
  hint: string;
  retryable: boolean;
}

export interface ArchiveImportErrorsSummary {
  total: number;
  retryable: number;
  nonRetryable: number;
  byCategory: Record<ArchiveImportErrorCategory, number>;
}

export interface CreateArchiveImportRequest {
  fileKey: string;
  fileName: string;
  fileSize: number;
  archiveFormat?: ArchiveFormat;
  parentId?: string | null;
  conflictPolicy?: ArchiveImportConflictPolicy;
}

export interface CreateArchiveImportResponse {
  jobId: string;
  status: "pending";
}

export interface GetArchiveImportStatusResponse {
  jobId: string;
  baseId: string;
  baseName: string;
  status: ArchiveImportJobStatus;
  conflictPolicy: ArchiveImportConflictPolicy;
  archive: {
    fileName: string;
    fileSize: number;
    fileKey: string;
    format: ArchiveFormat;
  };
  progress: ArchiveImportProgress;
  timing: ArchiveImportTiming;
  recentErrors: ArchiveImportErrorItem[];
  hasMoreErrors: boolean;
}

export interface GetArchiveImportErrorsResponse {
  jobId: string;
  status: ArchiveImportJobStatus;
  total: number;
  summary: ArchiveImportErrorsSummary;
  errors: ArchiveImportErrorItem[];
}

export interface RetryArchiveImportFailuresRequest {
  sourceJobId: string;
}

export interface RetryArchiveImportFailuresResponse {
  jobId: string;
  status: "pending";
  sourceJobId: string;
}

export interface GetActiveArchiveImportResponse {
  jobId: string | null;
  status: ArchiveImportJobStatus | null;
}

