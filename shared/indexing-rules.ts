import { z } from "zod";

export const MIN_CHUNK_SIZE = 200;
export const MAX_CHUNK_SIZE = 8_000;
export const MIN_TOP_K = 1;
export const MAX_TOP_K = 20;
export const MIN_RELEVANCE_THRESHOLD = 0;
export const MAX_RELEVANCE_THRESHOLD = 1;
export const MIN_RETRIEVAL_WEIGHT = 0;
export const MAX_RETRIEVAL_WEIGHT = 1;
export const MIN_MAX_CONTEXT_TOKENS = 500;
export const MAX_MAX_CONTEXT_TOKENS = 20_000;
export const MIN_CONTEXT_INPUT_LIMIT = 100;
export const MAX_CONTEXT_INPUT_LIMIT = 50_000;

export const indexingRulesSchema = z.object({
  chunkSize: z
    .number()
    .int()
    .min(MIN_CHUNK_SIZE, `Размер чанка должен быть не меньше ${MIN_CHUNK_SIZE}`)
    .max(MAX_CHUNK_SIZE, `Размер чанка должен быть не больше ${MAX_CHUNK_SIZE}`),
  chunkOverlap: z.number().int().min(0, "chunkOverlap должно быть >= 0"),
  topK: z
    .number()
    .int()
    .min(MIN_TOP_K, `topK должно быть не меньше ${MIN_TOP_K}`)
    .max(MAX_TOP_K, `topK должно быть не больше ${MAX_TOP_K}`),
  bm25Weight: z
    .number()
    .min(MIN_RETRIEVAL_WEIGHT, `bm25Weight должно быть от ${MIN_RETRIEVAL_WEIGHT} до ${MAX_RETRIEVAL_WEIGHT}`)
    .max(MAX_RETRIEVAL_WEIGHT, `bm25Weight должно быть от ${MIN_RETRIEVAL_WEIGHT} до ${MAX_RETRIEVAL_WEIGHT}`),
  bm25Limit: z
    .number()
    .int()
    .min(MIN_TOP_K, `bm25Limit должно быть не меньше ${MIN_TOP_K}`)
    .max(MAX_TOP_K, `bm25Limit должно быть не больше ${MAX_TOP_K}`),
  vectorWeight: z
    .number()
    .min(MIN_RETRIEVAL_WEIGHT, `vectorWeight должно быть от ${MIN_RETRIEVAL_WEIGHT} до ${MAX_RETRIEVAL_WEIGHT}`)
    .max(MAX_RETRIEVAL_WEIGHT, `vectorWeight должно быть от ${MIN_RETRIEVAL_WEIGHT} до ${MAX_RETRIEVAL_WEIGHT}`),
  vectorLimit: z
    .number()
    .int()
    .min(MIN_TOP_K, `vectorLimit должно быть не меньше ${MIN_TOP_K}`)
    .max(MAX_TOP_K, `vectorLimit должно быть не больше ${MAX_TOP_K}`),
  relevanceThreshold: z
    .number()
    .min(MIN_RELEVANCE_THRESHOLD, `relevanceThreshold должно быть от ${MIN_RELEVANCE_THRESHOLD} до ${MAX_RELEVANCE_THRESHOLD}`)
    .max(MAX_RELEVANCE_THRESHOLD, `relevanceThreshold должно быть от ${MIN_RELEVANCE_THRESHOLD} до ${MAX_RELEVANCE_THRESHOLD}`),
  maxContextTokens: z
    .number()
    .int()
    .min(MIN_MAX_CONTEXT_TOKENS, `maxContextTokens должно быть не меньше ${MIN_MAX_CONTEXT_TOKENS}`)
    .max(MAX_MAX_CONTEXT_TOKENS, `maxContextTokens должно быть не больше ${MAX_MAX_CONTEXT_TOKENS}`)
    .nullable(),
  contextInputLimit: z
    .number()
    .int()
    .min(MIN_CONTEXT_INPUT_LIMIT, `contextInputLimit должно быть не меньше ${MIN_CONTEXT_INPUT_LIMIT}`)
    .max(MAX_CONTEXT_INPUT_LIMIT, `contextInputLimit должно быть не больше ${MAX_CONTEXT_INPUT_LIMIT}`)
    .nullable(),
  citationsEnabled: z.boolean(),
});

export const updateIndexingRulesSchema = indexingRulesSchema
  .partial()
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

export type IndexingRulesDto = z.infer<typeof indexingRulesSchema>;
export type UpdateIndexingRulesDto = z.infer<typeof updateIndexingRulesSchema>;

export const DEFAULT_INDEXING_RULES: IndexingRulesDto = {
  chunkSize: 800,
  chunkOverlap: 200,
  topK: 6,
  bm25Weight: 0.5,
  bm25Limit: 6,
  vectorWeight: 0.5,
  vectorLimit: 8,
  relevanceThreshold: 0.5,
  maxContextTokens: 3000,
  contextInputLimit: null,
  citationsEnabled: true,
};
