import type {
  KnowledgeNodeSourceType,
  KnowledgeDocumentStatus,
  KnowledgeBaseIndexStatus,
  KnowledgeDocumentIndexStatus,
  ImageRef,
  KnowledgeExcelImportWarning,
} from "./schema";
import type { KnowledgeBaseRagChunkMetadata, KnowledgeBaseRagMetadata } from "./knowledge-base-search";

export type KnowledgeBaseCrawlSelectorConfig = {
  title?: string | null;
  content?: string | null;
};

export type KnowledgeBaseCrawlAuthHeaders = Record<string, string>;

export type KnowledgeBaseCrawlAuthConfig = {
  headers?: KnowledgeBaseCrawlAuthHeaders;
};

export type KnowledgeBaseCrawlConfig = {
  startUrls: string[];
  sitemapUrl?: string | null;
  allowedDomains?: string[];
  include?: string[];
  exclude?: string[];
  maxPages?: number | null;
  maxDepth?: number | null;
  rateLimitRps?: number | null;
  robotsTxt?: boolean;
  userAgent?: string | null;
  selectors?: KnowledgeBaseCrawlSelectorConfig | null;
  language?: string | null;
  version?: string | null;
  auth?: KnowledgeBaseCrawlAuthConfig | null;
};

export type KnowledgeBaseCrawlJobPhase =
  | "created"
  | "crawling"
  | "extracting"
  | "chunking"
  | "embedding"
  | "indexing"
  | "paused"
  | "canceled"
  | "done"
  | "failed";

export type KnowledgeBaseCrawlJobStatus = {
  jobId: string;
  baseId: string;
  workspaceId: string;
  folderId: string;
  folderTitle: string;
  siteHost: string;
  parentId: string | null;
  phase: KnowledgeBaseCrawlJobPhase;
  percent: number;
  discovered: number;
  queued: number;
  fetched: number;
  extracted: number;
  saved: number;
  failed: number;
  etaSec?: number | null;
  lastUrl?: string | null;
  lastError?: string | null;
  startedAt: string;
  updatedAt: string;
  finishedAt?: string | null;
  pagesTotal?: number | null;
  pagesNew?: number | null;
  pagesUpdated?: number | null;
  pagesSkipped?: number | null;
  errorsCount?: number | null;
  durationSec?: number | null;
  status: "running" | "paused" | "canceled" | "failed" | "done";
};

export type KnowledgeBaseCrawlJobEvent = KnowledgeBaseCrawlJobStatus;

export type KnowledgeBaseCrawlJobResponse = {
  kbId: string;
  jobId: string;
};

export type GetKnowledgeBaseCrawlJobsResponse = {
  jobs: KnowledgeBaseCrawlJobStatus[];
};

export type KnowledgeBaseNodeType = "folder" | "document";

export const knowledgeDocumentContentFormats = [
  "legacy_html",
  "blocknote_json",
] as const;
export type KnowledgeDocumentContentFormat =
  (typeof knowledgeDocumentContentFormats)[number];
export type KnowledgeDocumentEditorJson = Record<string, unknown>[];

export type KnowledgeDocumentChunkConfig = {
  maxTokens?: number | null;
  maxChars?: number | null;
  overlapTokens?: number | null;
  overlapChars?: number | null;
  splitByPages: boolean;
  respectHeadings: boolean;
};

export type KnowledgeDocumentContentStats = {
  blockCount: number;
  plainTextLength: number;
  htmlLength: number;
  markdownLength: number;
  isLarge: boolean;
};

export type KnowledgeDocumentRenderSummary = {
  versionId: string | null;
  segmentCount: number;
  totalChars: number;
  isReady: boolean;
};

export type KnowledgeDocumentRenderSegment = {
  id: string;
  index: number;
  blockId: string | null;
  blockType: string;
  html: string;
  plainText: string;
  charCount: number;
  contentHash: string;
};

export type KnowledgeDocumentRenderSegmentsResponse = {
  documentId: string;
  versionId: string | null;
  totalSegments: number;
  offset: number;
  limit: number;
  segments: KnowledgeDocumentRenderSegment[];
};

export type KnowledgeDocumentChunkItem = {
  id: string;
  index: number;
  text: string;
  charStart: number;
  charEnd: number;
  tokenCount: number;
  charCount?: number | null;
  wordCount?: number | null;
  excerpt?: string | null;
  pageNumber?: number | null;
  sectionPath?: string[];
  contentHash: string;
  chunkOrdinal?: number | null;
  vectorId?: string | null;
  revisionId?: string | null;
  metadata: Record<string, unknown>;
  vectorRecordId?: string | null;
  imageRefs?: ImageRef[];
};

export type KnowledgeDocumentChunkSet = {
  id: string;
  documentId: string;
  versionId: string;
  revisionId?: string | null;
  documentHash?: string | null;
  chunkCount: number;
  totalTokens: number;
  totalChars: number;
  maxChunkTokens?: number | null;
  maxChunkIndex?: number | null;
  maxChunkId?: string | null;
  createdAt: string;
  updatedAt: string;
  config: KnowledgeDocumentChunkConfig;
  chunks: KnowledgeDocumentChunkItem[];
};

export type KnowledgeDocumentChunkSetSummary = Omit<KnowledgeDocumentChunkSet, "chunks">;

export type KnowledgeDocumentChunksPage = {
  chunkSet: KnowledgeDocumentChunkSetSummary | null;
  offset: number;
  limit: number;
  chunks: KnowledgeDocumentChunkItem[];
};

export type KnowledgeDocumentChunkPreview = {
  documentId: string;
  versionId: string;
  versionNumber?: number | null;
  revisionId?: string | null;
  documentHash?: string | null;
  generatedAt: string;
  totalChunks: number;
  totalTokens: number;
  totalChars: number;
  maxChunkTokens?: number | null;
  maxChunkIndex?: number | null;
  maxChunkId?: string | null;
  config: KnowledgeDocumentChunkConfig;
  items: KnowledgeDocumentChunkItem[];
};

export type KnowledgeDocumentVectorizationJobResult = {
  message?: string | null;
  pointsCount: number;
  collectionName: string;
  vectorSize?: number | null;
  totalUsageTokens?: number | null;
  collectionCreated?: boolean;
  recordIds: string[];
  chunkSize: number;
  chunkOverlap: number;
  documentId?: string | null;
  provider?: {
    id?: string;
    name?: string;
  } | null;
};

export type KnowledgeDocumentVectorizationJobStatus = {
  id: string;
  documentId: string;
  status: "pending" | "running" | "completed" | "failed";
  totalChunks: number;
  processedChunks: number;
  startedAt: string;
  finishedAt: string | null;
  error?: string | null;
  result?: KnowledgeDocumentVectorizationJobResult | null;
};

export type KnowledgeBaseRagConfigWeights = {
  weight?: number | null;
  limit?: number | null;
};

export type KnowledgeBaseRagVectorConfig = KnowledgeBaseRagConfigWeights & {
  embeddingProviderId?: string | null;
  collection?: string | null;
};

export type KnowledgeBaseRagConfig = {
  workspaceId: string;
  knowledgeBaseId: string;
  topK?: number | null;
  bm25?: KnowledgeBaseRagConfigWeights | null;
  vector?: KnowledgeBaseRagVectorConfig | null;
  recordedAt?: string | null;
};

export type KnowledgeBaseRagConfigResponse = {
  config: KnowledgeBaseRagConfig;
};

export type KnowledgeFolderIndexSummary = {
  worstStatus: "up_to_date" | "outdated" | "error";
  errorDocuments: number;
  needsIndexingDocuments: number;
  upToDateDocuments: number;
};

export type KnowledgeBaseTreeNode = {
  id: string;
  title: string;
  type: KnowledgeBaseNodeType;
  position?: number;
  childCount?: number;
  sourceType?: KnowledgeNodeSourceType;
  importFileName?: string | null;
  indexStatus?: KnowledgeDocumentIndexStatus | null;
  indexError?: string | null;
  indexedAt?: string | null;
  folderIndexSummary?: KnowledgeFolderIndexSummary | null;
  children?: KnowledgeBaseTreeNode[];
};

export type KnowledgeBaseSummary = {
  id: string;
  name: string;
  description: string;
  updatedAt: string;
  rootChildCount: number;
  documentCount: number;
  hasContent: boolean;
  hasAccessRules?: boolean;
  indexStatus?: KnowledgeBaseIndexStatus;
  indexPolicyHash?: string | null;
  indexEmbeddingProviderId?: string | null;
  indexEmbeddingModel?: string | null;
  /**
   * Cross-workspace sharing (on-prem): база расшарена текущему пространству из другого пространства
   * (instance-share или грант). Заполняется на клиенте из GET /api/knowledge/shared-bases. Для таких
   * баз доступно только чтение (привязка к ассистенту/поиск); управление (документы/индексация/удаление)
   * недоступно. См. docs/knowledge-base-sharing-design.md.
   */
  shared?: boolean;
  /** Имя пространства-владельца расшаренной базы — для бейджа «из «…»». */
  ownerWorkspaceName?: string | null;
};

export type KnowledgeBaseIndexingSummary = {
  baseId: string;
  status: KnowledgeBaseIndexStatus;
  totalDocuments: number;
  outdatedDocuments: number;
  indexingDocuments: number;
  errorDocuments: number;
  upToDateDocuments: number;
  policyHash: string | null;
  embeddingProviderId?: string | null;
  embeddingModel?: string | null;
  updatedAt: string;
};

export type KnowledgeBaseIndexingChangeItem = {
  documentId: string;
  nodeId: string;
  title: string;
  status: KnowledgeDocumentIndexStatus;
  updatedAt: string;
};

export type KnowledgeBaseIndexingChangesResponse = {
  items: KnowledgeBaseIndexingChangeItem[];
  total: number;
};

export type CreateKnowledgeBasePayload = {
  id?: string;
  name: string;
  description?: string;
};

export type CreateKnowledgeBaseResponse = KnowledgeBaseSummary;

export type UpdateKnowledgeBasePayload = {
  name: string;
  description?: string;
};

export type UpdateKnowledgeBaseResponse = {
  id: string;
  name: string;
  description: string;
  updatedAt: string;
};

export type DeleteKnowledgeBasePayload = {
  confirmation: string;
};

export type DeleteKnowledgeBaseResponse = {
  deletedId: string;
};

export type KnowledgeBaseDeleteJobStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "canceled";

export type KnowledgeBaseDeleteJob = {
  id: string;
  baseId: string;
  status: KnowledgeBaseDeleteJobStatus;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  requestedByUserId: string | null;
  error: string | null;
};

export type DeleteKnowledgeBaseAcceptedResponse = {
  accepted: true;
  deduplicated: boolean;
  job: KnowledgeBaseDeleteJob;
};

export type GetKnowledgeBaseDeleteJobResponse = {
  job: KnowledgeBaseDeleteJob;
};

export type KnowledgeDeleteJobListItemKind = "base" | "folder" | "document";

export type KnowledgeDeleteJobListItem = {
  id: string;
  jobType: "delete_base" | "delete_node";
  itemKind: KnowledgeDeleteJobListItemKind;
  name: string;
  baseId: string;
  nodeId: string | null;
  status: KnowledgeBaseDeleteJobStatus;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  requestedByUserId: string | null;
  error: string | null;
};

export type ListKnowledgeDeleteJobsResponse = {
  jobs: KnowledgeDeleteJobListItem[];
};

export type CreateKnowledgeFolderPayload = {
  title: string;
  parentId?: string | null;
  sourceType?: KnowledgeNodeSourceType;
  sourceConfig?: Record<string, unknown> | null;
};

export type CreateKnowledgeDocumentPayload = {
  title: string;
  content?: string;
  contentMarkdown?: string | null;
  contentPlainText?: string | null;
  contentFormat?: KnowledgeDocumentContentFormat;
  contentEditorJson?: KnowledgeDocumentEditorJson | null;
  editorSchemaVersion?: number | null;
  migrationMeta?: Record<string, unknown> | null;
  parentId?: string | null;
  sourceType?: KnowledgeNodeSourceType;
  importFileName?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type CreateCrawledKnowledgeDocumentPayload = {
  url: string;
  parentId?: string | null;
  selectors?: KnowledgeBaseCrawlSelectorConfig | null;
  language?: string | null;
  version?: string | null;
  auth?: KnowledgeBaseCrawlAuthConfig | null;
};

export type CreateCrawledKnowledgeDocumentResponse = {
  status: "created" | "updated" | "skipped";
  document: KnowledgeBaseDocumentDetail;
};

export type UpdateKnowledgeDocumentPayload = {
  title: string;
  content?: string;
  contentMarkdown?: string | null;
  contentPlainText?: string | null;
  contentFormat?: KnowledgeDocumentContentFormat;
  contentEditorJson?: KnowledgeDocumentEditorJson | null;
  editorSchemaVersion?: number | null;
  migrationMeta?: Record<string, unknown> | null;
};

type KnowledgeNodeCreationBase = {
  id: string;
  title: string;
  parentId: string | null;
  updatedAt: string;
};

export type KnowledgeDocumentImportDiagnostics = {
  importSource: string | null;
  degradedImport: boolean;
  degradedReasonCode: string | null;
  degradedReasonMessage: string | null;
  originalPreferredSource: string | null;
  ocrRecommendation: "off" | "on" | "unsure" | null;
  ocrUsed: boolean | null;
  doclingAttempts: number | null;
  warningCode: string | null;
  warningMessage: string | null;
};

export type CreateKnowledgeFolderResponse = KnowledgeNodeCreationBase & {
  type: "folder";
};

export type CreateKnowledgeDocumentResponse = KnowledgeNodeCreationBase & {
  type: "document";
  content: string;
  html?: string | null;
  contentMarkdown?: string | null;
  contentPlainText?: string | null;
  contentFormat?: KnowledgeDocumentContentFormat;
  contentEditorJson?: KnowledgeDocumentEditorJson | null;
  editorSchemaVersion?: number | null;
  isLegacy?: boolean;
  sourceType: KnowledgeNodeSourceType;
  importFileName: string | null;
  importDiagnostics?: KnowledgeDocumentImportDiagnostics | null;
  documentId: string;
  status: KnowledgeDocumentStatus;
  versionId: string | null;
  versionNumber: number | null;
};

export type KnowledgeBaseBreadcrumb = {
  id: string;
  title: string;
  type: "base" | "folder";
};

export type KnowledgeBaseChildNode = {
  id: string;
  title: string;
  type: KnowledgeBaseNodeType;
  parentId: string | null;
  position?: number;
  childCount: number;
  updatedAt: string;
  sourceType?: KnowledgeNodeSourceType;
  importFileName?: string | null;
  indexStatus?: KnowledgeDocumentIndexStatus | null;
  indexError?: string | null;
  indexedAt?: string | null;
  folderIndexSummary?: KnowledgeFolderIndexSummary | null;
};

export type KnowledgeBaseOverview = {
  type: "base";
  id: string;
  name: string;
  description: string;
  updatedAt: string;
  childCount: number;
  rootChildCount: number;
  documentCount: number;
  hasContent: boolean;
  hasAccessRules?: boolean;
};

export type KnowledgeBaseFolderDetail = {
  type: "folder";
  id: string;
  title: string;
  parentId: string | null;
  updatedAt: string;
  breadcrumbs: KnowledgeBaseBreadcrumb[];
  childCount: number;
  folderIndexSummary?: KnowledgeFolderIndexSummary | null;
};

export type KnowledgeBaseDocumentDetail = {
  type: "document";
  id: string;
  title: string;
  parentId: string | null;
  content?: string;
  html?: string | null;
  contentMarkdown?: string | null;
  contentPlainText?: string | null;
  contentFormat?: KnowledgeDocumentContentFormat;
  contentEditorJson?: KnowledgeDocumentEditorJson | null;
  editorSchemaVersion?: number | null;
  migrationMeta?: Record<string, unknown> | null;
  isLegacy?: boolean;
  sourceUrl?: string | null;
  updatedAt: string;
  breadcrumbs: KnowledgeBaseBreadcrumb[];
  sourceType: KnowledgeNodeSourceType;
  importFileName: string | null;
  importDiagnostics?: KnowledgeDocumentImportDiagnostics | null;
  documentId: string;
  status: KnowledgeDocumentStatus;
  currentVersion?: {
    id: string;
    versionNo: number | null;
    createdAt: string;
  } | null;
  versionId: string | null;
  versionNumber: number | null;
  excelWorkbook?: {
    id: string;
    sheetCount: number;
    processedSheetCount: number;
    totalRowCount: number;
    maxColumnCount: number;
    totalCellCount: number;
    warnings: KnowledgeExcelImportWarning[];
    markers: string[];
  } | null;
  excelImport?: {
    kind: "structured_workbook" | "legacy_excel_document";
    markers: string[];
    rolloutEnabled: boolean;
  } | null;
  childCount: number;
  chunkSet?: KnowledgeDocumentChunkSet | null;
  chunkSummary?: KnowledgeDocumentChunkSetSummary | null;
  contentStats?: KnowledgeDocumentContentStats | null;
  renderSummary?: KnowledgeDocumentRenderSummary | null;
};

export type UpdateKnowledgeDocumentResponse = KnowledgeBaseDocumentDetail;

export type KnowledgeBaseNodeDetail =
  | KnowledgeBaseOverview
  | KnowledgeBaseFolderDetail
  | KnowledgeBaseDocumentDetail;

export type KnowledgeBaseChildrenSortField =
  | "position"
  | "title"
  | "updatedAt"
  | "type"
  | "indexStatus";

export type KnowledgeBaseChildrenSortDirection = "asc" | "desc";

export type KnowledgeBaseChildrenPage = {
  items: KnowledgeBaseChildNode[];
  nextCursor: string | null;
  total: number;
  sort: KnowledgeBaseChildrenSortField;
  dir: KnowledgeBaseChildrenSortDirection;
  query: string | null;
};

export type MoveKnowledgeNodePlacement = "before" | "after" | "end";

export type UpdateKnowledgeNodeParentRequest = {
  parentId?: string | null;
  position?: number | null;
  placement?: MoveKnowledgeNodePlacement | null;
  anchorNodeId?: string | null;
};

export type MoveKnowledgeNodeRequest = UpdateKnowledgeNodeParentRequest;

export type DeleteKnowledgeNodeResponse = {
  deletedIds: string[];
};

export type KnowledgeNodeDeleteJobStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "canceled";

export type KnowledgeNodeDeleteJob = {
  id: string;
  baseId: string;
  nodeId: string;
  status: KnowledgeNodeDeleteJobStatus;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  requestedByUserId: string | null;
  error: string | null;
};

export type DeleteKnowledgeNodeAcceptedResponse = {
  accepted: true;
  deduplicated: boolean;
  job: KnowledgeNodeDeleteJob;
};

export type GetKnowledgeNodeDeleteJobResponse = {
  job: KnowledgeNodeDeleteJob;
};

export type KnowledgeBaseSuggestSection = {
  chunkId: string;
  documentId: string;
  docTitle: string;
  sectionTitle: string | null;
  snippet: string;
  score: number;
  source: "sections" | "content";
  nodeId?: string | null;
  nodeSlug?: string | null;
};

export type KnowledgeBaseSuggestResponse = {
  query: string;
  knowledgeBaseId: string;
  normalizedQuery: string;
  sections: KnowledgeBaseSuggestSection[];
};

export type KnowledgeBaseRagChunk = {
  chunkId: string;
  docId: string;
  docTitle: string;
  sectionTitle: string | null;
  snippet: string;
  text?: string;
  score: number;
  scores?: { bm25?: number | null; vector?: number | null };
  nodeId?: string | null;
  nodeSlug?: string | null;
  metadata?: KnowledgeBaseRagChunkMetadata;
};

export type KnowledgeBaseRagAnswer = {
  answer: string;
  format?: "text" | "markdown" | "html";
  query?: string;
  kbId?: string;
  normalizedQuery?: string;
  citations: KnowledgeBaseRagChunk[];
  chunks?: KnowledgeBaseRagChunk[];
  usage?: { embeddingTokens?: number | null; llmTokens?: number | null };
  timings?: {
    total_ms?: number;
    retrieval_ms?: number;
    bm25_ms?: number;
    vector_ms?: number;
    llm_ms?: number;
  };
  metadata?: KnowledgeBaseRagMetadata;
};
