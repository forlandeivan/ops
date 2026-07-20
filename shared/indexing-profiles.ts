import { z } from "zod";

import {
  DEFAULT_EMBEDDING_BATCH_MAX_CHUNKS,
  DEFAULT_EMBEDDING_BATCH_MAX_TOKENS,
  DEFAULT_KB_INDEXING_WORKER_CONCURRENCY,
  DEFAULT_KNOWLEDGE_BASE_INDEXING_POLICY,
  DEFAULT_QDRANT_UPSERT_MAX_BYTES,
  MAX_CHUNK_SIZE,
  MIN_CHUNK_SIZE,
  collectionSchemaFieldSchema,
} from "./knowledge-base-indexing-policy";

const optionalNullableString = z.string().trim().max(255).nullable().optional();

export const indexingProfileBaseSchema = z.object({
  name: z.string().trim().min(1, "Укажите название профиля").max(120),
  description: z.string().trim().max(4000).nullable().optional(),
  chunkSize: z
    .number()
    .int()
    .min(MIN_CHUNK_SIZE, `Размер чанка должен быть не меньше ${MIN_CHUNK_SIZE}`)
    .max(MAX_CHUNK_SIZE, `Размер чанка должен быть не больше ${MAX_CHUNK_SIZE}`),
  chunkOverlap: z.number().int().min(0, "chunkOverlap должно быть >= 0"),
  workerConcurrency: z.number().int().min(1, "Количество параллельных задач должно быть больше 0"),
  embeddingBatchMaxChunks: z.number().int().min(1, "Размер batch по чанкам должен быть больше 0"),
  embeddingBatchMaxTokens: z.number().int().min(1, "Лимит токенов в batch должен быть больше 0"),
  qdrantUpsertMaxPoints: z.number().int().min(1, "Размер batch для Qdrant должен быть больше 0"),
  qdrantUpsertMaxBytes: z.number().int().min(1, "Лимит размера batch для Qdrant должен быть больше 0"),
  defaultSchema: z.array(collectionSchemaFieldSchema),
});

export const createIndexingProfileSchema = indexingProfileBaseSchema.refine(
  (value) => value.chunkOverlap < value.chunkSize,
  {
    message: "chunkOverlap должно быть меньше chunkSize",
    path: ["chunkOverlap"],
  },
);

export const updateIndexingProfileSchema = indexingProfileBaseSchema
  .partial()
  .extend({
    name: z.string().trim().min(1, "Укажите название профиля").max(120).optional(),
    description: z.string().trim().max(4000).nullable().optional(),
  })
  .refine(
    (value) => {
      if (value.chunkSize === undefined || value.chunkOverlap === undefined) {
        return true;
      }
      return value.chunkOverlap < value.chunkSize;
    },
    {
      message: "chunkOverlap должно быть меньше chunkSize",
      path: ["chunkOverlap"],
    },
  );

export const indexingProfileDtoSchema = createIndexingProfileSchema.extend({
  id: z.string().min(1),
  isActive: z.boolean(),
  isSystem: z.boolean(),
  version: z.number().int().min(1),
  createdBy: optionalNullableString,
  updatedBy: optionalNullableString,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type IndexingProfileDto = z.infer<typeof indexingProfileDtoSchema>;
export type CreateIndexingProfileDto = z.infer<typeof createIndexingProfileSchema>;
export type UpdateIndexingProfileDto = z.infer<typeof updateIndexingProfileSchema>;

export const DEFAULT_INDEXING_PROFILE_INPUT: CreateIndexingProfileDto = {
  name: "Default (migrated)",
  description: "Профиль, автоматически перенесённый из старой глобальной политики индексации.",
  chunkSize: DEFAULT_KNOWLEDGE_BASE_INDEXING_POLICY.chunkSize,
  chunkOverlap: DEFAULT_KNOWLEDGE_BASE_INDEXING_POLICY.chunkOverlap,
  workerConcurrency: DEFAULT_KNOWLEDGE_BASE_INDEXING_POLICY.workerConcurrency ?? DEFAULT_KB_INDEXING_WORKER_CONCURRENCY,
  embeddingBatchMaxChunks:
    DEFAULT_KNOWLEDGE_BASE_INDEXING_POLICY.embeddingBatchMaxChunks ?? DEFAULT_EMBEDDING_BATCH_MAX_CHUNKS,
  embeddingBatchMaxTokens:
    DEFAULT_KNOWLEDGE_BASE_INDEXING_POLICY.embeddingBatchMaxTokens ?? DEFAULT_EMBEDDING_BATCH_MAX_TOKENS,
  qdrantUpsertMaxPoints:
    DEFAULT_KNOWLEDGE_BASE_INDEXING_POLICY.qdrantUpsertMaxPoints ?? DEFAULT_EMBEDDING_BATCH_MAX_CHUNKS,
  qdrantUpsertMaxBytes:
    DEFAULT_KNOWLEDGE_BASE_INDEXING_POLICY.qdrantUpsertMaxBytes ?? DEFAULT_QDRANT_UPSERT_MAX_BYTES,
  defaultSchema: DEFAULT_KNOWLEDGE_BASE_INDEXING_POLICY.defaultSchema,
};
