import { z } from "zod";

import { indexingProfileBaseSchema } from "./indexing-profiles";

export const indexingArenaRunStatuses = [
  "pending",
  "running",
  "completed",
  "completed_with_errors",
  "failed",
] as const;
export type IndexingArenaRunStatus = (typeof indexingArenaRunStatuses)[number];

export const indexingArenaCleanupStatuses = [
  "pending",
  "completed",
  "failed",
  "skipped",
] as const;
export type IndexingArenaCleanupStatus = (typeof indexingArenaCleanupStatuses)[number];

export const indexingArenaConfigSchema = indexingProfileBaseSchema.omit({
  name: true,
  description: true,
}).extend({
  embeddingsProvider: z.string().trim().min(1, "Укажите провайдера эмбеддингов"),
  embeddingsModel: z.string().trim().min(1, "Укажите модель эмбеддингов"),
});

export const indexingArenaStageTimingsSchema = z.object({
  preparationMs: z.number().min(0),
  chunkingMs: z.number().min(0),
  embeddingsMs: z.number().min(0),
  upsertMs: z.number().min(0),
  finalizeMs: z.number().min(0),
});

export const indexingArenaMetricsSchema = z.object({
  totalDurationMs: z.number().min(0),
  totalDocuments: z.number().int().min(0),
  processedDocuments: z.number().int().min(0),
  failedDocuments: z.number().int().min(0),
  totalChunks: z.number().int().min(0),
  totalEmbeddingTokens: z.number().int().min(0),
  totalQdrantPoints: z.number().int().min(0),
  collectionPointsCount: z.number().int().min(0).nullable(),
  collectionVectorsCount: z.number().int().min(0).nullable(),
  collectionStorageBytes: z.number().int().min(0).nullable(),
});

export const indexingArenaRunErrorSchema = z.object({
  documentId: z.string().trim().min(1).nullable(),
  documentTitle: z.string().trim().min(1).nullable(),
  stage: z.enum(["preparation", "chunking", "embeddings", "upsert", "finalize"]),
  message: z.string().trim().min(1),
  timestamp: z.string().datetime(),
});

export const indexingArenaKnowledgeBaseDtoSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  workspaceId: z.string().trim().min(1),
  workspaceName: z.string().trim().min(1),
  documentsCount: z.number().int().min(0),
  updatedAt: z.string().datetime(),
});

export const createIndexingArenaRunSchema = z.object({
  baseId: z.string().trim().min(1, "Укажите базу знаний"),
  sourceProfileId: z.string().trim().min(1).nullable().optional(),
  config: indexingArenaConfigSchema,
});

export const saveIndexingArenaRunProfileSchema = z.object({
  name: z.string().trim().min(1, "Укажите название профиля").max(120),
  description: z.string().trim().max(4000).nullable().optional(),
});

export const indexingArenaRunSummaryDtoSchema = z.object({
  id: z.string().trim().min(1),
  workspaceId: z.string().trim().min(1),
  workspaceName: z.string().trim().min(1),
  baseId: z.string().trim().min(1),
  baseName: z.string().trim().min(1),
  sourceProfileId: z.string().trim().min(1).nullable(),
  sourceProfileName: z.string().trim().min(1).nullable(),
  status: z.enum(indexingArenaRunStatuses),
  cleanupStatus: z.enum(indexingArenaCleanupStatuses),
  cleanupError: z.string().trim().min(1).nullable(),
  tempCollectionName: z.string().trim().min(1).nullable(),
  config: indexingArenaConfigSchema,
  metrics: indexingArenaMetricsSchema,
  stageTimings: indexingArenaStageTimingsSchema,
  errorsCount: z.number().int().min(0),
  createdBy: z.string().trim().min(1).nullable(),
  createdAt: z.string().datetime(),
  startedAt: z.string().datetime().nullable(),
  finishedAt: z.string().datetime().nullable(),
  updatedAt: z.string().datetime(),
});

export const indexingArenaRunDetailDtoSchema = indexingArenaRunSummaryDtoSchema.extend({
  errors: z.array(indexingArenaRunErrorSchema),
});

export type IndexingArenaConfigDto = z.infer<typeof indexingArenaConfigSchema>;
export type IndexingArenaStageTimingsDto = z.infer<typeof indexingArenaStageTimingsSchema>;
export type IndexingArenaMetricsDto = z.infer<typeof indexingArenaMetricsSchema>;
export type IndexingArenaRunErrorDto = z.infer<typeof indexingArenaRunErrorSchema>;
export type IndexingArenaKnowledgeBaseDto = z.infer<typeof indexingArenaKnowledgeBaseDtoSchema>;
export type CreateIndexingArenaRunDto = z.infer<typeof createIndexingArenaRunSchema>;
export type SaveIndexingArenaRunProfileDto = z.infer<typeof saveIndexingArenaRunProfileSchema>;
export type IndexingArenaRunSummaryDto = z.infer<typeof indexingArenaRunSummaryDtoSchema>;
export type IndexingArenaRunDetailDto = z.infer<typeof indexingArenaRunDetailDtoSchema>;

export const EMPTY_INDEXING_ARENA_METRICS: IndexingArenaMetricsDto = {
  totalDurationMs: 0,
  totalDocuments: 0,
  processedDocuments: 0,
  failedDocuments: 0,
  totalChunks: 0,
  totalEmbeddingTokens: 0,
  totalQdrantPoints: 0,
  collectionPointsCount: null,
  collectionVectorsCount: null,
  collectionStorageBytes: null,
};

export const EMPTY_INDEXING_ARENA_STAGE_TIMINGS: IndexingArenaStageTimingsDto = {
  preparationMs: 0,
  chunkingMs: 0,
  embeddingsMs: 0,
  upsertMs: 0,
  finalizeMs: 0,
};
