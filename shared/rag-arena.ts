import { z } from "zod";

import { MAX_RELEVANCE_THRESHOLD, MAX_TOP_K, MIN_RELEVANCE_THRESHOLD, MIN_TOP_K } from "./indexing-rules";
import { ragPipelineErrorDetailsSchema, ragPipelineExecutionSourceSchema } from "./rag-errors";
import { searchProfileStrategies } from "./search-profiles";

export const ragArenaExperimentStatuses = [
  "pending",
  "running",
  "completed",
  "completed_with_errors",
  "failed",
] as const;
export type RagArenaExperimentStatus = (typeof ragArenaExperimentStatuses)[number];

export const ragArenaResultStatuses = [
  "pending",
  "running",
  "completed",
  "failed",
] as const;
export type RagArenaResultStatus = (typeof ragArenaResultStatuses)[number];

export const ragArenaReviewVerdicts = [
  "correct",
  "partially_correct",
  "incomplete",
  "dangerous_error",
] as const;
export type RagArenaReviewVerdict = (typeof ragArenaReviewVerdicts)[number];

const nullableShortString = z.string().trim().max(255).nullable().optional();
const nullableLongString = z.string().trim().max(20000).nullable().optional();
const ragArenaKeywordSchema = z.string().trim().min(1).max(255);
export const ragArenaCaseCategorySchema = z.string().trim().min(1, "Укажите категорию кейса").max(120);

export const ragArenaGoldRefSchema = z.object({
  label: nullableShortString,
  locator: nullableShortString,
  chunkId: nullableShortString,
  documentId: nullableShortString,
  sectionTitle: z.string().trim().max(1000).nullable().optional(),
  matchText: z.string().trim().max(5000).nullable().optional(),
  keywords: z.array(ragArenaKeywordSchema).max(50).default([]),
  relevance: z.number().int().min(0).max(3).default(3),
}).superRefine((value, ctx) => {
  const hasMarker = Boolean(
    value.label ||
      value.locator ||
      value.chunkId ||
      value.documentId ||
      value.sectionTitle ||
      value.matchText ||
      (Array.isArray(value.keywords) && value.keywords.length > 0),
  );

  if (!hasMarker) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Укажите хотя бы один ориентир: chunkId, documentId, locator, sectionTitle, matchText, label или keywords.",
    });
  }
});
export type RagArenaGoldRef = z.infer<typeof ragArenaGoldRefSchema>;

export const ragArenaBenchmarkBaseSchema = z.object({
  baseId: z.string().trim().min(1, "Укажите базу знаний"),
  name: z.string().trim().min(1, "Укажите название бенчмарка").max(120),
  description: z.string().trim().max(4000).nullable().optional(),
  targetEdition: nullableShortString,
});

export const createRagArenaBenchmarkSchema = ragArenaBenchmarkBaseSchema;
export const updateRagArenaBenchmarkSchema = ragArenaBenchmarkBaseSchema.partial().omit({ baseId: true });

export const ragArenaCaseBaseSchema = z.object({
  sortOrder: z.number().int().min(0).default(0),
  bucket: ragArenaCaseCategorySchema,
  question: z.string().trim().min(1, "Укажите вопрос").max(4000),
  targetEdition: nullableShortString,
  expectedAbstention: z.boolean().default(false),
  goldRefs: z.array(ragArenaGoldRefSchema).max(100).default([]),
  mustHaveFacts: z.array(z.string().trim().min(1).max(2000)).max(100).default([]),
  acceptableParaphrases: z.array(z.string().trim().min(1).max(2000)).max(100).default([]),
  criticalFailures: z.array(z.string().trim().min(1).max(2000)).max(100).default([]),
  notes: z.string().trim().max(8000).nullable().optional(),
});

export const createRagArenaCaseSchema = ragArenaCaseBaseSchema;
export const updateRagArenaCaseSchema = ragArenaCaseBaseSchema.partial();

export const importRagArenaCasesSchema = z.object({
  replaceExisting: z.boolean().default(false),
  cases: z.array(createRagArenaCaseSchema).min(1, "Добавьте хотя бы один кейс"),
});

export const ragArenaExperimentOverridesSchema = z.object({
  strategy: z.enum(searchProfileStrategies).optional(),
  llmProviderId: z.string().trim().min(1).optional(),
  llmModel: z.string().trim().min(1).optional(),
  topK: z.number().int().min(MIN_TOP_K).max(MAX_TOP_K).optional(),
  bm25Weight: z.number().min(0).max(1).optional(),
  bm25Limit: z.number().int().min(1).max(50).optional(),
  vectorWeight: z.number().min(0).max(1).optional(),
  vectorLimit: z.number().int().min(1).max(50).optional(),
  bm25Threshold: z.number().min(MIN_RELEVANCE_THRESHOLD).max(MAX_RELEVANCE_THRESHOLD).nullable().optional(),
  vectorThreshold: z.number().min(MIN_RELEVANCE_THRESHOLD).max(MAX_RELEVANCE_THRESHOLD).nullable().optional(),
  rrfK: z.number().int().min(1).max(500).optional(),
  queryRewriteEnabled: z.boolean().optional(),
  rerankEnabled: z.boolean().optional(),
  rerankCandidateCount: z.number().int().min(1).max(50).optional(),
  multiQueryEnabled: z.boolean().optional(),
});
export type RagArenaExperimentOverrides = z.infer<typeof ragArenaExperimentOverridesSchema>;

export const createRagArenaExperimentSchema = z.object({
  benchmarkId: z.string().trim().min(1, "Укажите бенчмарк"),
  sourceSearchProfileId: z.string().trim().min(1).nullable().optional(),
  name: z.string().trim().max(120).nullable().optional(),
  overrides: ragArenaExperimentOverridesSchema.default({}),
});

export const ragArenaExperimentSnapshotConfigSchema = z.object({
  indexRevision: z.string().trim().min(1).nullable(),
  sourceSearchProfileId: z.string().trim().min(1).nullable(),
  sourceSearchProfileName: z.string().trim().min(1).nullable(),
  sourceSearchProfileVersion: z.number().int().min(1).nullable(),
  search: z.object({
    strategy: z.enum(searchProfileStrategies),
    topK: z.number().int().min(MIN_TOP_K).max(MAX_TOP_K),
    bm25Weight: z.number().min(0).max(1),
    bm25Limit: z.number().int().min(1).max(50),
    vectorWeight: z.number().min(0).max(1),
    vectorLimit: z.number().int().min(1).max(50),
    bm25Threshold: z.number().min(MIN_RELEVANCE_THRESHOLD).max(MAX_RELEVANCE_THRESHOLD).nullable(),
    vectorThreshold: z.number().min(MIN_RELEVANCE_THRESHOLD).max(MAX_RELEVANCE_THRESHOLD).nullable(),
    rrfK: z.number().int().min(1).max(500),
    queryRewriteEnabled: z.boolean(),
    queryRewriteModel: nullableShortString,
    queryRewritePrompt: nullableLongString,
    rerankEnabled: z.boolean(),
    rerankProviderId: nullableShortString,
    rerankModel: nullableShortString,
    rerankPrompt: nullableLongString,
    rerankCandidateCount: z.number().int().min(1).max(50),
    multiQueryEnabled: z.boolean(),
  }),
  llm: z.object({
    providerId: z.string().trim().min(1),
    model: z.string().trim().min(1),
    temperature: z.number().min(0).max(2).nullable(),
    maxCompletionTokens: z.number().int().min(16).max(4096).nullable(),
    systemPrompt: z.string().trim().max(40000).nullable(),
    responseFormat: z.enum(["text", "markdown", "html"]).nullable(),
  }),
  embedding: z.object({
    providerId: z.string().trim().min(1),
    model: z.string().trim().min(1),
    vectorCollection: z.string().trim().min(1),
  }),
});
export type RagArenaExperimentSnapshotConfig = z.infer<typeof ragArenaExperimentSnapshotConfigSchema>;

export const ragArenaResultMetricsSchema = z.object({
  hitAt5: z.number().min(0).max(1).nullable(),
  recallAt5: z.number().min(0).max(1).nullable(),
  mrrAt10: z.number().min(0).max(1).nullable(),
  ndcgAt10: z.number().min(0).max(1).nullable(),
  citationPrecision: z.number().min(0).max(1).nullable(),
  noiseRate: z.number().min(0).max(1).nullable(),
  retrievalMs: z.number().min(0).nullable(),
  totalMs: z.number().min(0).nullable(),
  citationsCount: z.number().int().min(0).nullable(),
  candidateCount: z.number().int().min(0).nullable(),
});
export type RagArenaResultMetrics = z.infer<typeof ragArenaResultMetricsSchema>;

export const ragArenaReviewSchema = z.object({
  verdict: z.enum(ragArenaReviewVerdicts).nullable(),
  supportedAnswer: z.boolean().nullable(),
  criticalError: z.boolean().nullable(),
  reviewerNotes: z.string().trim().max(8000).nullable(),
  reviewedAt: z.string().datetime().nullable(),
  reviewedBy: z.string().trim().min(1).nullable(),
});
export type RagArenaReview = z.infer<typeof ragArenaReviewSchema>;

export const updateRagArenaReviewSchema = z.object({
  verdict: z.enum(ragArenaReviewVerdicts).nullable().optional(),
  supportedAnswer: z.boolean().nullable().optional(),
  criticalError: z.boolean().nullable().optional(),
  reviewerNotes: z.string().trim().max(8000).nullable().optional(),
});

export const ragArenaExperimentSummaryMetricsSchema = z.object({
  totalCases: z.number().int().min(0),
  completedCases: z.number().int().min(0),
  failedCases: z.number().int().min(0),
  reviewedCases: z.number().int().min(0),
  avgHitAt5: z.number().min(0).max(1).nullable(),
  avgRecallAt5: z.number().min(0).max(1).nullable(),
  avgMrrAt10: z.number().min(0).max(1).nullable(),
  avgNdcgAt10: z.number().min(0).max(1).nullable(),
  avgCitationPrecision: z.number().min(0).max(1).nullable(),
  avgNoiseRate: z.number().min(0).max(1).nullable(),
  avgRetrievalMs: z.number().min(0).nullable(),
  avgTotalMs: z.number().min(0).nullable(),
  supportedAnswerRate: z.number().min(0).max(1).nullable(),
  criticalErrorRate: z.number().min(0).max(1).nullable(),
  verdictCounts: z.object({
    correct: z.number().int().min(0),
    partiallyCorrect: z.number().int().min(0),
    incomplete: z.number().int().min(0),
    dangerousError: z.number().int().min(0),
  }),
});
export type RagArenaExperimentSummaryMetrics = z.infer<typeof ragArenaExperimentSummaryMetricsSchema>;

export const ragArenaBenchmarkDtoSchema = z.object({
  id: z.string().trim().min(1),
  workspaceId: z.string().trim().min(1),
  baseId: z.string().trim().min(1),
  baseName: z.string().trim().min(1),
  workspaceName: z.string().trim().min(1),
  name: z.string().trim().min(1),
  description: z.string().trim().min(1).nullable(),
  targetEdition: z.string().trim().min(1).nullable(),
  indexRevision: z.string().trim().min(1).nullable(),
  casesCount: z.number().int().min(0),
  createdBy: z.string().trim().min(1).nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const ragArenaCaseDtoSchema = z.object({
  id: z.string().trim().min(1),
  benchmarkId: z.string().trim().min(1),
  sortOrder: z.number().int().min(0),
  bucket: ragArenaCaseCategorySchema,
  question: z.string().trim().min(1),
  targetEdition: z.string().trim().min(1).nullable(),
  expectedAbstention: z.boolean(),
  goldRefs: z.array(ragArenaGoldRefSchema),
  mustHaveFacts: z.array(z.string()),
  acceptableParaphrases: z.array(z.string()),
  criticalFailures: z.array(z.string()),
  notes: z.string().trim().min(1).nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const ragArenaExperimentDtoSchema = z.object({
  id: z.string().trim().min(1),
  workspaceId: z.string().trim().min(1),
  workspaceName: z.string().trim().min(1),
  baseId: z.string().trim().min(1),
  baseName: z.string().trim().min(1),
  benchmarkId: z.string().trim().min(1),
  benchmarkName: z.string().trim().min(1),
  name: z.string().trim().min(1),
  status: z.enum(ragArenaExperimentStatuses),
  snapshotConfig: ragArenaExperimentSnapshotConfigSchema,
  summaryMetrics: ragArenaExperimentSummaryMetricsSchema,
  errorsCount: z.number().int().min(0),
  createdBy: z.string().trim().min(1).nullable(),
  createdAt: z.string().datetime(),
  startedAt: z.string().datetime().nullable(),
  finishedAt: z.string().datetime().nullable(),
  updatedAt: z.string().datetime(),
});

export const ragArenaAskAiRunDetailSchema = z.object({
  id: z.string().trim().min(1),
  prompt: z.string(),
  normalizedQuery: z.string().nullable(),
  status: z.string().trim().min(1),
  errorMessage: z.string().nullable(),
  errorDetails: ragPipelineErrorDetailsSchema.nullable().optional(),
  source: ragPipelineExecutionSourceSchema.nullable().optional(),
  assistantExecutionId: z.string().trim().min(1).nullable().optional(),
  searchProfileId: z.string().nullable(),
  searchProfileVersion: z.number().int().nullable(),
  searchStrategy: z.enum(searchProfileStrategies).nullable(),
  queryRewriteEnabled: z.boolean().nullable(),
  rewrittenQuery: z.string().nullable(),
  rerankEnabled: z.boolean().nullable(),
  rerankModel: z.string().nullable(),
  indexingProfileId: z.string().nullable(),
  indexingProfileVersion: z.number().int().nullable(),
  topK: z.number().int().nullable(),
  bm25Weight: z.number().nullable(),
  bm25Limit: z.number().int().nullable(),
  vectorWeight: z.number().nullable(),
  vectorLimit: z.number().int().nullable(),
  vectorCollection: z.string().nullable(),
  embeddingProviderId: z.string().nullable(),
  llmProviderId: z.string().nullable(),
  llmModel: z.string().nullable(),
  bm25ResultCount: z.number().int().nullable(),
  vectorResultCount: z.number().int().nullable(),
  vectorDocumentCount: z.number().int().nullable(),
  combinedResultCount: z.number().int().nullable(),
  retrievalDurationMs: z.number().nullable(),
  bm25DurationMs: z.number().nullable(),
  vectorDurationMs: z.number().nullable(),
  llmDurationMs: z.number().nullable(),
  totalDurationMs: z.number().nullable(),
  isMultiQuery: z.boolean().nullable(),
  chunksCount: z.number().int().nullable(),
  successfulChunksCount: z.number().int().nullable(),
  failedChunksCount: z.number().int().nullable(),
  rrfApplied: z.boolean().nullable(),
  rrfInputDocuments: z.number().int().nullable(),
  rrfOutputDocuments: z.number().int().nullable(),
  startedAt: z.string().datetime().nullable(),
  finishedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  responseText: z.string().nullable(),
  responseFormat: z.string().nullable(),
  citations: z.array(z.unknown()).nullable(),
  combinedResults: z.array(z.unknown()).nullable(),
  combinedResultsBeforeRerank: z.array(z.unknown()).nullable(),
  combinedResultsAfterRerank: z.array(z.unknown()).nullable(),
  pipelineLog: z.array(z.unknown()).nullable(),
  searchConfigSnapshot: z.record(z.string(), z.unknown()).nullable(),
});

export const ragArenaExperimentResultDtoSchema = z.object({
  id: z.string().trim().min(1),
  experimentId: z.string().trim().min(1),
  caseId: z.string().trim().min(1),
  askAiRunId: z.string().trim().min(1).nullable(),
  status: z.enum(ragArenaResultStatuses),
  metrics: ragArenaResultMetricsSchema,
  review: ragArenaReviewSchema,
  errorMessage: z.string().trim().min(1).nullable(),
  startedAt: z.string().datetime().nullable(),
  finishedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  case: ragArenaCaseDtoSchema,
  askAiRun: ragArenaAskAiRunDetailSchema.nullable().optional(),
});

export const saveRagArenaExperimentProfileSchema = z.object({
  name: z.string().trim().min(1, "Укажите название профиля").max(120),
  description: z.string().trim().max(4000).nullable().optional(),
});

export type RagArenaBenchmarkDto = z.infer<typeof ragArenaBenchmarkDtoSchema>;
export type RagArenaCaseDto = z.infer<typeof ragArenaCaseDtoSchema>;
export type RagArenaExperimentDto = z.infer<typeof ragArenaExperimentDtoSchema>;
export type RagArenaExperimentResultDto = z.infer<typeof ragArenaExperimentResultDtoSchema>;
export type RagArenaAskAiRunDetailDto = z.infer<typeof ragArenaAskAiRunDetailSchema>;
export type CreateRagArenaBenchmarkDto = z.infer<typeof createRagArenaBenchmarkSchema>;
export type UpdateRagArenaBenchmarkDto = z.infer<typeof updateRagArenaBenchmarkSchema>;
export type CreateRagArenaCaseDto = z.infer<typeof createRagArenaCaseSchema>;
export type UpdateRagArenaCaseDto = z.infer<typeof updateRagArenaCaseSchema>;
export type ImportRagArenaCasesDto = z.infer<typeof importRagArenaCasesSchema>;
export type CreateRagArenaExperimentDto = z.infer<typeof createRagArenaExperimentSchema>;
export type UpdateRagArenaReviewDto = z.infer<typeof updateRagArenaReviewSchema>;
export type SaveRagArenaExperimentProfileDto = z.infer<typeof saveRagArenaExperimentProfileSchema>;

export const EMPTY_RAG_ARENA_EXPERIMENT_SUMMARY: RagArenaExperimentSummaryMetrics = {
  totalCases: 0,
  completedCases: 0,
  failedCases: 0,
  reviewedCases: 0,
  avgHitAt5: null,
  avgRecallAt5: null,
  avgMrrAt10: null,
  avgNdcgAt10: null,
  avgCitationPrecision: null,
  avgNoiseRate: null,
  avgRetrievalMs: null,
  avgTotalMs: null,
  supportedAnswerRate: null,
  criticalErrorRate: null,
  verdictCounts: {
    correct: 0,
    partiallyCorrect: 0,
    incomplete: 0,
    dangerousError: 0,
  },
};

export const EMPTY_RAG_ARENA_RESULT_METRICS: RagArenaResultMetrics = {
  hitAt5: null,
  recallAt5: null,
  mrrAt10: null,
  ndcgAt10: null,
  citationPrecision: null,
  noiseRate: null,
  retrievalMs: null,
  totalMs: null,
  citationsCount: null,
  candidateCount: null,
};

export const EMPTY_RAG_ARENA_REVIEW: RagArenaReview = {
  verdict: null,
  supportedAnswer: null,
  criticalError: null,
  reviewerNotes: null,
  reviewedAt: null,
  reviewedBy: null,
};
