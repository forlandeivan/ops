import { z } from "zod";

import {
  DEFAULT_INDEXING_RULES,
  MAX_MAX_CONTEXT_TOKENS,
  MAX_RETRIEVAL_WEIGHT,
  MAX_TOP_K,
  MIN_MAX_CONTEXT_TOKENS,
  MIN_RELEVANCE_THRESHOLD,
  MIN_RETRIEVAL_WEIGHT,
  MIN_TOP_K,
} from "./indexing-rules";

export const searchProfileStrategies = ["rrf", "weighted_thresholded", "union"] as const;
export type SearchProfileStrategy = (typeof searchProfileStrategies)[number];

const optionalNullableString = z.string().trim().max(255).nullable().optional();

export const searchProfileBaseSchema = z.object({
  name: z.string().trim().min(1, "Укажите название профиля").max(120),
  description: z.string().trim().max(4000).nullable().optional(),
  strategy: z.enum(searchProfileStrategies),
  topK: z.number().int().min(MIN_TOP_K).max(MAX_TOP_K),
  maxContextTokens: z
    .number()
    .int()
    .min(MIN_MAX_CONTEXT_TOKENS, `maxContextTokens должно быть не меньше ${MIN_MAX_CONTEXT_TOKENS}`)
    .max(MAX_MAX_CONTEXT_TOKENS, `maxContextTokens должно быть не больше ${MAX_MAX_CONTEXT_TOKENS}`)
    .nullable(),
  bm25Limit: z.number().int().min(1).max(50),
  vectorLimit: z.number().int().min(1).max(50),
  bm25Weight: z.number().min(MIN_RETRIEVAL_WEIGHT).max(MAX_RETRIEVAL_WEIGHT),
  vectorWeight: z.number().min(MIN_RETRIEVAL_WEIGHT).max(MAX_RETRIEVAL_WEIGHT),
  bm25Threshold: z.number().min(MIN_RELEVANCE_THRESHOLD).max(1).nullable(),
  vectorThreshold: z.number().min(MIN_RELEVANCE_THRESHOLD).max(1).nullable(),
  rrfK: z.number().int().min(1).max(500),
  queryRewriteEnabled: z.boolean(),
  queryRewriteModel: z.string().trim().max(255).nullable().optional(),
  queryRewritePrompt: z.string().trim().max(20000).nullable().optional(),
  rerankEnabled: z.boolean(),
  rerankProviderId: z.string().trim().max(255).nullable().optional(),
  rerankModel: z.string().trim().max(255).nullable().optional(),
  rerankPrompt: z.string().trim().max(20000).nullable().optional(),
  rerankCandidateCount: z.number().int().min(1).max(50),
});

export const createSearchProfileSchema = searchProfileBaseSchema.superRefine((value, ctx) => {
  if (value.rerankEnabled && (!value.rerankModel || value.rerankModel.trim().length === 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["rerankModel"],
      message: "Укажите модель rerank при включённом rerank",
    });
  }
});
export const updateSearchProfileSchema = searchProfileBaseSchema.partial().superRefine((value, ctx) => {
  if (value.rerankEnabled && (!value.rerankModel || value.rerankModel.trim().length === 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["rerankModel"],
      message: "Укажите модель rerank при включённом rerank",
    });
  }
});

export const searchProfileDtoSchema = createSearchProfileSchema.extend({
  id: z.string().min(1),
  isActive: z.boolean(),
  isSystem: z.boolean(),
  version: z.number().int().min(1),
  createdBy: optionalNullableString,
  updatedBy: optionalNullableString,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type SearchProfileDto = z.infer<typeof searchProfileDtoSchema>;
export type CreateSearchProfileDto = z.infer<typeof createSearchProfileSchema>;
export type UpdateSearchProfileDto = z.infer<typeof updateSearchProfileSchema>;

const DEFAULT_QUERY_REWRITE_PROMPT = [
  "Ты помощник, который улучшает поисковые запросы для системы RAG (Retrieval Augmented Generation).",
  "Твоя задача: переформулировать вопрос пользователя так, чтобы он стал самодостаточным поисковым запросом.",
  "",
  "Правила:",
  "1. Если вопрос содержит ссылки на предыдущий контекст (например, \"об этом\", \"подробнее\", \"какие ещё\", \"исключения\"), раскрой эти ссылки используя историю диалога.",
  "2. Если вопрос уже самодостаточный — верни его без изменений.",
  "3. Сохраняй суть вопроса, не добавляй лишнюю информацию.",
  "4. Отвечай ТОЛЬКО переформулированным запросом, без пояснений и кавычек.",
].join("\n");

const DEFAULT_RERANK_PROMPT = [
  "Ты ранжируешь фрагменты знаний для RAG.",
  "Верни только JSON вида {\"orderedCandidateIds\":[...]} без пояснений.",
  "Порядок должен отражать релевантность запросу пользователя.",
  "Не добавляй идентификаторы, которых нет среди кандидатов.",
].join("\n");

export const DEFAULT_RRF_SEARCH_PROFILE_INPUT: CreateSearchProfileDto = {
  name: "Default (RRF)",
  description: "Новый глобальный профиль поиска по умолчанию на основе Reciprocal Rank Fusion.",
  strategy: "rrf",
  topK: DEFAULT_INDEXING_RULES.topK,
  maxContextTokens: DEFAULT_INDEXING_RULES.maxContextTokens,
  bm25Limit: DEFAULT_INDEXING_RULES.bm25Limit,
  vectorLimit: DEFAULT_INDEXING_RULES.vectorLimit,
  bm25Weight: DEFAULT_INDEXING_RULES.bm25Weight,
  vectorWeight: DEFAULT_INDEXING_RULES.vectorWeight,
  bm25Threshold: 0.2,
  vectorThreshold: 0.2,
  rrfK: 60,
  queryRewriteEnabled: true,
  queryRewriteModel: null,
  queryRewritePrompt: DEFAULT_QUERY_REWRITE_PROMPT,
  rerankEnabled: false,
  rerankProviderId: null,
  rerankModel: null,
  rerankPrompt: DEFAULT_RERANK_PROMPT,
  rerankCandidateCount: 12,
};

export const DEFAULT_WEIGHTED_SEARCH_PROFILE_INPUT: CreateSearchProfileDto = {
  ...DEFAULT_RRF_SEARCH_PROFILE_INPUT,
  name: "Weighted Thresholded",
  description: "Гибридный профиль с независимыми порогами BM25 и vector и весами только для ранжирования.",
  strategy: "weighted_thresholded",
  bm25Threshold: 0.2,
  vectorThreshold: 0.2,
};

export const DEFAULT_UNION_SEARCH_PROFILE_INPUT: CreateSearchProfileDto = {
  ...DEFAULT_RRF_SEARCH_PROFILE_INPUT,
  name: "Union",
  description: "Профиль без слияния score: берёт union кандидатов из BM25 и vector и сортирует детерминированно.",
  strategy: "union",
};

export const DEFAULT_RERANK_PROMPT_TEMPLATE = DEFAULT_RERANK_PROMPT;
export const DEFAULT_QUERY_REWRITE_PROMPT_TEMPLATE = DEFAULT_QUERY_REWRITE_PROMPT;
