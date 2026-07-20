import { z } from "zod";

const genericMetadataSchema = z.record(z.string(), z.unknown());

export const documentSourceTypeValues = [
  "chat_attachment",
  "canvas_document",
  "knowledge_document",
  "inline_text",
] as const;
export type DocumentSourceType = (typeof documentSourceTypeValues)[number];

export const documentSourceRoleValues = [
  "primary",
  "supporting",
  "reference",
  "template",
] as const;
export type DocumentSourceRole = (typeof documentSourceRoleValues)[number];

export const documentWorkingSetStatusValues = ["draft", "frozen"] as const;
export type DocumentWorkingSetStatus = (typeof documentWorkingSetStatusValues)[number];

export const documentResultPackageStatusValues = [
  "draft",
  "in_progress",
  "ready_for_review",
  "exported",
] as const;
export type DocumentResultPackageStatus = (typeof documentResultPackageStatusValues)[number];

export const documentSourceBlockKindValues = ["paragraph", "page", "section", "table"] as const;
export type DocumentSourceBlockKind = (typeof documentSourceBlockKindValues)[number];

export const chatAttachmentSourceRefSchema = z.object({
  type: z.literal("chat_attachment"),
  attachmentId: z.string().trim().min(1),
  role: z.enum(documentSourceRoleValues).optional(),
  label: z.string().trim().min(1).optional(),
});

export const canvasDocumentSourceRefSchema = z.object({
  type: z.literal("canvas_document"),
  documentId: z.string().trim().min(1),
  role: z.enum(documentSourceRoleValues).optional(),
  label: z.string().trim().min(1).optional(),
});

export const knowledgeDocumentSourceRefSchema = z.object({
  type: z.literal("knowledge_document"),
  baseId: z.string().trim().min(1),
  nodeId: z.string().trim().min(1),
  role: z.enum(documentSourceRoleValues).optional(),
  label: z.string().trim().min(1).optional(),
});

export const inlineTextSourceRefSchema = z.object({
  type: z.literal("inline_text"),
  title: z.string().trim().min(1),
  text: z.string().trim().min(1),
  role: z.enum(documentSourceRoleValues).optional(),
  label: z.string().trim().min(1).optional(),
  metadata: genericMetadataSchema.optional(),
});

export const documentSourceRefSchema = z.discriminatedUnion("type", [
  chatAttachmentSourceRefSchema,
  canvasDocumentSourceRefSchema,
  knowledgeDocumentSourceRefSchema,
  inlineTextSourceRefSchema,
]);
export type DocumentSourceRef = z.infer<typeof documentSourceRefSchema>;

export const documentSourcePageBoundarySchema = z.object({
  pageNumber: z.number().int().positive(),
  charStart: z.number().int().nonnegative(),
  charEnd: z.number().int().nonnegative(),
});
export type DocumentSourcePageBoundary = z.infer<typeof documentSourcePageBoundarySchema>;

export const documentSourceBlockSchema = z.object({
  id: z.string().trim().min(1),
  kind: z.enum(documentSourceBlockKindValues),
  label: z.string().trim().min(1).nullable().optional(),
  pageNumber: z.number().int().positive().nullable().optional(),
  charStart: z.number().int().nonnegative(),
  charEnd: z.number().int().nonnegative(),
  excerpt: z.string().default(""),
});
export type DocumentSourceBlock = z.infer<typeof documentSourceBlockSchema>;

export const documentSourceMapSchema = z.object({
  pageBoundaries: z.array(documentSourcePageBoundarySchema).default([]),
  blocks: z.array(documentSourceBlockSchema).default([]),
});
export type DocumentSourceMap = z.infer<typeof documentSourceMapSchema>;

export const documentSourceSnapshotSchema = z.object({
  sourceType: z.enum(documentSourceTypeValues),
  role: z.enum(documentSourceRoleValues).default("primary"),
  sourceId: z.string().trim().min(1),
  sourceVersion: z.string().trim().min(1).nullable().optional(),
  title: z.string().trim().min(1),
  contentText: z.string(),
  sourceRef: documentSourceRefSchema,
  sourceMap: documentSourceMapSchema.default({
    pageBoundaries: [],
    blocks: [],
  }),
  metadata: genericMetadataSchema.default({}),
});
export type DocumentSourceSnapshot = z.infer<typeof documentSourceSnapshotSchema>;

export const documentStoredShardKindValues = ["content", "blocks", "pages"] as const;
export type DocumentStoredShardKind = (typeof documentStoredShardKindValues)[number];

export const documentStoredContentShardSchema = z.object({
  index: z.number().int().nonnegative(),
  kind: z.enum(documentStoredShardKindValues),
  objectKey: z.string().trim().min(1),
  byteLength: z.number().int().nonnegative().nullable().optional(),
  charStart: z.number().int().nonnegative().nullable().optional(),
  charEnd: z.number().int().nonnegative().nullable().optional(),
  blockStart: z.number().int().nonnegative().nullable().optional(),
  blockEnd: z.number().int().nonnegative().nullable().optional(),
});
export type DocumentStoredContentShard = z.infer<typeof documentStoredContentShardSchema>;

export const documentSourceContentManifestSchema = z.object({
  sourceType: z.enum(documentSourceTypeValues),
  sourceId: z.string().trim().min(1),
  sourceVersion: z.string().trim().min(1).nullable().optional(),
  title: z.string().trim().min(1),
  mimeType: z.string().trim().min(1).nullable().optional(),
  contentHash: z.string().trim().min(1),
  extractionEngine: z.string().trim().min(1).nullable().optional(),
  createdAt: z.string().trim().min(1),
  charCount: z.number().int().nonnegative().default(0),
  pageCount: z.number().int().nonnegative().default(0),
  blockCount: z.number().int().nonnegative().default(0),
  previewObjectKey: z.string().trim().min(1).nullable().optional(),
  pageMapObjectKey: z.string().trim().min(1).nullable().optional(),
  contentShards: z.array(documentStoredContentShardSchema).default([]),
  blockShards: z.array(documentStoredContentShardSchema).default([]),
  metadata: genericMetadataSchema.default({}),
});
export type DocumentSourceContentManifest = z.infer<typeof documentSourceContentManifestSchema>;

export const documentSourceContentResponseFormatValues = [
  "preview",
  "plain_text",
  "blocks",
  "manifest",
] as const;
export type DocumentSourceContentResponseFormat = (typeof documentSourceContentResponseFormatValues)[number];

export const documentSourceContentResponseSchema = z.object({
  sourceType: z.enum(documentSourceTypeValues),
  sourceId: z.string().trim().min(1),
  format: z.enum(documentSourceContentResponseFormatValues),
  title: z.string().trim().min(1),
  segmentIndex: z.number().int().nonnegative().nullable().optional(),
  segmentCount: z.number().int().positive().nullable().optional(),
  totalSegments: z.number().int().positive().default(1),
  contentText: z.string().default(""),
  blocks: z.array(documentSourceBlockSchema).default([]),
  manifest: documentSourceContentManifestSchema.nullish(),
  metadata: genericMetadataSchema.default({}),
});
export type DocumentSourceContentResponse = z.infer<typeof documentSourceContentResponseSchema>;

export const documentCitationSchema = z.object({
  sourceItemId: z.string().trim().min(1),
  pageNumber: z.number().int().positive().nullable().optional(),
  blockId: z.string().trim().min(1).nullable().optional(),
  charStart: z.number().int().nonnegative().nullable().optional(),
  charEnd: z.number().int().nonnegative().nullable().optional(),
  excerpt: z.string().nullable().optional(),
  quote: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
});
export type DocumentCitation = z.infer<typeof documentCitationSchema>;

export const documentRetrievalScopeValues = [
  "workspace_kb",
  "bases",
  "documents",
  "working_set",
] as const;
export type DocumentRetrievalScope = (typeof documentRetrievalScopeValues)[number];

export const documentRetrievalIntentValues = [
  "lookup",
  "compare",
  "summarize",
  "draft_support",
  "validation",
] as const;
export type DocumentRetrievalIntent = (typeof documentRetrievalIntentValues)[number];

export const documentRetrievalProfileValues = ["auto", "precision", "recall"] as const;
export type DocumentRetrievalProfile = (typeof documentRetrievalProfileValues)[number];

export const documentEvidenceHitDispositionValues = [
  "support",
  "alternative",
  "conflict",
  "missing",
] as const;
export type DocumentEvidenceHitDisposition = (typeof documentEvidenceHitDispositionValues)[number];

export const documentEvidenceHitSchema = z.object({
  id: z.string().trim().min(1),
  sourceType: z.enum(documentSourceTypeValues),
  sourceId: z.string().trim().min(1),
  sourceItemId: z.string().trim().min(1).nullable().optional(),
  title: z.string().trim().min(1),
  score: z.number().finite(),
  rank: z.number().int().positive().nullable().optional(),
  disposition: z.enum(documentEvidenceHitDispositionValues).default("support"),
  excerpt: z.string().default(""),
  pageNumber: z.number().int().positive().nullable().optional(),
  blockId: z.string().trim().min(1).nullable().optional(),
  charStart: z.number().int().nonnegative().nullable().optional(),
  charEnd: z.number().int().nonnegative().nullable().optional(),
  sectionLabel: z.string().trim().min(1).nullable().optional(),
  strategy: z.string().trim().min(1).nullable().optional(),
  citation: documentCitationSchema.nullish(),
  metadata: genericMetadataSchema.default({}),
});
export type DocumentEvidenceHit = z.infer<typeof documentEvidenceHitSchema>;

export const documentRetrievalTraceSchema = z.object({
  scope: z.enum(documentRetrievalScopeValues),
  intent: z.enum(documentRetrievalIntentValues),
  profile: z.enum(documentRetrievalProfileValues),
  strategy: z.string().trim().min(1),
  rewriteApplied: z.boolean().default(false),
  rerankApplied: z.boolean().default(false),
  candidateCountBeforeRerank: z.number().int().nonnegative().default(0),
  candidateCountAfterRerank: z.number().int().nonnegative().default(0),
  sourceMix: genericMetadataSchema.default({}),
  latencyMs: z.number().nonnegative().default(0),
  abstentionSuggested: z.boolean().default(false),
  warnings: z.array(z.string().trim().min(1)).default([]),
});
export type DocumentRetrievalTrace = z.infer<typeof documentRetrievalTraceSchema>;

export const documentSourceCanonicalizationEntrySchema = z.object({
  canonicalKey: z.string().trim().min(1),
  sourceType: z.enum(documentSourceTypeValues),
  sourceId: z.string().trim().min(1),
  sourceItemId: z.string().trim().min(1).nullable().optional(),
  sourceVersion: z.string().trim().min(1).nullable().optional(),
  role: z.enum(documentSourceRoleValues).nullable().optional(),
  title: z.string().trim().min(1),
  reason: z.string().trim().min(1),
});
export type DocumentSourceCanonicalizationEntry = z.infer<typeof documentSourceCanonicalizationEntrySchema>;

export const documentSourceCanonicalizationDuplicateSchema = documentSourceCanonicalizationEntrySchema.extend({
  duplicateOfCanonicalKey: z.string().trim().min(1),
});
export type DocumentSourceCanonicalizationDuplicate = z.infer<typeof documentSourceCanonicalizationDuplicateSchema>;

export const documentSourceCanonicalizationResultSchema = z.object({
  canonicalSources: z.array(documentSourceCanonicalizationEntrySchema).default([]),
  duplicates: z.array(documentSourceCanonicalizationDuplicateSchema).default([]),
  versionWarnings: z.array(z.string().trim().min(1)).default([]),
});
export type DocumentSourceCanonicalizationResult = z.infer<typeof documentSourceCanonicalizationResultSchema>;

export const documentEvidenceBundleSchema = z.object({
  resultPackageId: z.string().trim().min(1).nullable().optional(),
  sectionId: z.string().trim().min(1).nullable().optional(),
  claimId: z.string().trim().min(1).nullable().optional(),
  query: z.string().trim().min(1).nullable().optional(),
  supports: z.array(documentEvidenceHitSchema).default([]),
  alternatives: z.array(documentEvidenceHitSchema).default([]),
  conflicts: z.array(documentEvidenceHitSchema).default([]),
  missingEvidence: z.array(z.string().trim().min(1)).default([]),
  trace: documentRetrievalTraceSchema.nullish(),
  canonicalization: documentSourceCanonicalizationResultSchema.nullish(),
});
export type DocumentEvidenceBundle = z.infer<typeof documentEvidenceBundleSchema>;

export const documentEvidenceCompressionModeValues = [
  "balanced",
  "aggressive",
  "preserve_citations",
] as const;
export type DocumentEvidenceCompressionMode = (typeof documentEvidenceCompressionModeValues)[number];

export const documentEvidenceCompressionResultSchema = z.object({
  compressedHits: z.array(documentEvidenceHitSchema).default([]),
  removedCount: z.number().int().nonnegative().default(0),
  compressionSummary: z.string().trim().min(1),
});
export type DocumentEvidenceCompressionResult = z.infer<typeof documentEvidenceCompressionResultSchema>;

export const documentDraftSectionStatusValues = [
  "planned",
  "draft",
  "validated",
  "needs_review",
] as const;
export type DocumentDraftSectionStatus = (typeof documentDraftSectionStatusValues)[number];

export const documentDraftSectionSchema = z.object({
  id: z.string().trim().min(1),
  title: z.string().trim().min(1),
  order: z.number().int().nonnegative(),
  content: z.string().default(""),
  requiredFacts: z.array(z.string().trim().min(1)).default([]),
  missingFacts: z.array(z.string().trim().min(1)).default([]),
  citations: z.array(documentCitationSchema).default([]),
  notes: z.string().nullable().optional(),
  status: z.enum(documentDraftSectionStatusValues).default("planned"),
});
export type DocumentDraftSection = z.infer<typeof documentDraftSectionSchema>;

export const documentClaimSupportStatusValues = [
  "supported",
  "partial",
  "unsupported",
  "unverified",
] as const;
export type DocumentClaimSupportStatus = (typeof documentClaimSupportStatusValues)[number];

export const documentClaimLedgerEntrySchema = z.object({
  id: z.string().trim().min(1),
  claimText: z.string().trim().min(1),
  sectionId: z.string().trim().min(1).nullable().optional(),
  citations: z.array(documentCitationSchema).default([]),
  confidence: z.number().min(0).max(1).nullable().optional(),
  status: z.enum(documentClaimSupportStatusValues).default("unverified"),
  notes: z.string().nullable().optional(),
});
export type DocumentClaimLedgerEntry = z.infer<typeof documentClaimLedgerEntrySchema>;

export const documentSourceSummarySchema = z.object({
  sourceItemId: z.string().trim().min(1),
  title: z.string().trim().min(1),
  role: z.enum(documentSourceRoleValues),
  summary: z.string().default(""),
  keyFacts: z.array(z.string().trim().min(1)).default([]),
  stats: genericMetadataSchema.default({}),
});
export type DocumentSourceSummary = z.infer<typeof documentSourceSummarySchema>;

export const documentWorkingSetSummarySchema = z.object({
  workingSetId: z.string().trim().min(1),
  aggregateSummary: z.string().default(""),
  sourceSummaries: z.array(documentSourceSummarySchema).default([]),
  themes: z.array(z.string().trim().min(1)).default([]),
});
export type DocumentWorkingSetSummary = z.infer<typeof documentWorkingSetSummarySchema>;

export const documentValidationSeverityValues = ["info", "warning", "error"] as const;
export type DocumentValidationSeverity = (typeof documentValidationSeverityValues)[number];

export const documentValidationStatusValues = ["passed", "warning", "failed"] as const;
export type DocumentValidationStatus = (typeof documentValidationStatusValues)[number];

export const documentValidationIssueSchema = z.object({
  code: z.string().trim().min(1),
  severity: z.enum(documentValidationSeverityValues),
  message: z.string().trim().min(1),
  sectionId: z.string().trim().min(1).nullable().optional(),
  claimId: z.string().trim().min(1).nullable().optional(),
  sourceItemId: z.string().trim().min(1).nullable().optional(),
  details: genericMetadataSchema.default({}),
});
export type DocumentValidationIssue = z.infer<typeof documentValidationIssueSchema>;

export const documentValidationResultSchema = z.object({
  validator: z.string().trim().min(1),
  status: z.enum(documentValidationStatusValues),
  summary: z.string().trim().min(1).nullable().optional(),
  issues: z.array(documentValidationIssueSchema).default([]),
  stats: genericMetadataSchema.default({}),
});
export type DocumentValidationResult = z.infer<typeof documentValidationResultSchema>;

export const documentReviewCheckpointStatusValues = ["ready", "needs_review", "blocked"] as const;
export type DocumentReviewCheckpointStatus = (typeof documentReviewCheckpointStatusValues)[number];

export const documentReviewCheckpointSchema = z.object({
  status: z.enum(documentReviewCheckpointStatusValues),
  summary: z.string().trim().min(1),
  unresolvedIssueCount: z.number().int().nonnegative().default(0),
  warnings: z.array(z.string().trim().min(1)).default([]),
  suggestedActions: z.array(z.string().trim().min(1)).default([]),
});
export type DocumentReviewCheckpoint = z.infer<typeof documentReviewCheckpointSchema>;

export const documentConfidenceRecommendationValues = [
  "grounded",
  "needs_review",
  "abstain",
] as const;
export type DocumentConfidenceRecommendation = (typeof documentConfidenceRecommendationValues)[number];

export const documentSectionConfidenceSchema = z.object({
  sectionId: z.string().trim().min(1),
  title: z.string().trim().min(1),
  confidence: z.number().min(0).max(1),
  recommendation: z.enum(documentConfidenceRecommendationValues),
  reasons: z.array(z.string().trim().min(1)).default([]),
  citedSourceItemIds: z.array(z.string().trim().min(1)).default([]),
});
export type DocumentSectionConfidence = z.infer<typeof documentSectionConfidenceSchema>;

export const documentConfidenceAssessmentSchema = z.object({
  status: z.enum(documentConfidenceRecommendationValues),
  summary: z.string().trim().min(1),
  sections: z.array(documentSectionConfidenceSchema).default([]),
  warnings: z.array(z.string().trim().min(1)).default([]),
});
export type DocumentConfidenceAssessment = z.infer<typeof documentConfidenceAssessmentSchema>;

export const documentResultPackagePayloadSchema = z.object({
  sections: z.array(documentDraftSectionSchema).default([]),
  claimLedger: z.array(documentClaimLedgerEntrySchema).default([]),
  validations: z.array(documentValidationResultSchema).default([]),
  reviewCheckpoint: documentReviewCheckpointSchema.nullish(),
  sourceSetSummary: documentWorkingSetSummarySchema.nullish(),
  confidenceAssessment: documentConfidenceAssessmentSchema.nullish(),
  finalContent: z.string().default(""),
  warnings: z.array(z.string().trim().min(1)).default([]),
  metadata: genericMetadataSchema.default({}),
});
export type DocumentResultPackagePayload = z.infer<typeof documentResultPackagePayloadSchema>;
