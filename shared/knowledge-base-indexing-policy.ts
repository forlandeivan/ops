import { z } from "zod";
import { collectionFieldTypes } from "./vectorization";

export const MIN_CHUNK_SIZE = 200;
export const MAX_CHUNK_SIZE = 8_000;
export const DEFAULT_KB_INDEXING_WORKER_CONCURRENCY = 4;
/**
 * Размер embedding-пачки. Значение 24 выбрано по замерам конвейера приёма на dev.unica-ai.ru
 * (04.09.2026): 15 текстовых документов судебной практики, средний размер 36 КБ, ~600 фрагментов
 * суммарно. Стадия indexing занимает 97% времени обработки, и её длительность обратно
 * пропорциональна размеру пачки: 600 фрагментов при пачке 8 — это 75 обращений к модели и 832.7 с
 * векторизации, при 24 — 25 обращений и 279.8 с (1.0 → 2.5 док/мин). Отказов при пачке 24 не было.
 *
 * Соседние параметры проверены тем же методом и эффекта не дали: embeddingBatchMaxTokens 12000
 * вместо 4000 — 318 с против 280 с, workerConcurrency 8 вместо 4 — 312 с против 280 с (разброс
 * между прогонами). Модель эмбеддингов уже насыщена: около сотни фрагментов в работе видеокарта
 * считает с постоянной скоростью независимо от раскладки по запросам.
 *
 * Условия замера: стенд dev.unica-ai.ru (k8s, локальные Qwen3-Embedding-8B и Gemma-4-12B, одна
 * видеокарта), размер фрагмента 1000 знаков, перекрытие 200, текстовые документы без изображений.
 * На файлах с картинками и сканами добавляются стадии vision/OCR — тот профиль расхода этим
 * замером не покрыт.
 */
export const DEFAULT_EMBEDDING_BATCH_MAX_CHUNKS = 24;
export const DEFAULT_EMBEDDING_BATCH_MAX_TOKENS = 4_000;
export const DEFAULT_QDRANT_UPSERT_MAX_BYTES = 5_000_000;

export const collectionSchemaFieldSchema = z.object({
  name: z.string().trim().min(1, "Название поля обязательно"),
  type: z.enum(collectionFieldTypes, {
    error: "Недопустимый тип поля",
  }),
  isArray: z.boolean(),
  template: z.string(),
});

export const knowledgeBaseIndexingPolicySchema = z.object({
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

export const updateKnowledgeBaseIndexingPolicySchema = knowledgeBaseIndexingPolicySchema
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

export type KnowledgeBaseIndexingPolicyDto = z.infer<typeof knowledgeBaseIndexingPolicySchema> & {
  policyHash?: string | null;
};
export type UpdateKnowledgeBaseIndexingPolicyDto = z.infer<typeof updateKnowledgeBaseIndexingPolicySchema>;

export const DEFAULT_KNOWLEDGE_BASE_INDEXING_POLICY: KnowledgeBaseIndexingPolicyDto = {
  chunkSize: 800,
  chunkOverlap: 200,
  workerConcurrency: DEFAULT_KB_INDEXING_WORKER_CONCURRENCY,
  embeddingBatchMaxChunks: DEFAULT_EMBEDDING_BATCH_MAX_CHUNKS,
  embeddingBatchMaxTokens: DEFAULT_EMBEDDING_BATCH_MAX_TOKENS,
  qdrantUpsertMaxPoints: DEFAULT_EMBEDDING_BATCH_MAX_CHUNKS,
  qdrantUpsertMaxBytes: DEFAULT_QDRANT_UPSERT_MAX_BYTES,
  policyHash: null,
  defaultSchema: [
    { name: "content", type: "string", isArray: false, template: "{{ chunk.text }}" },
    {
      name: "title",
      type: "string",
      isArray: false,
      template: "{{ chunk.heading | default: document.title }}",
    },
    {
      name: "document_url",
      type: "string",
      isArray: false,
      template: "{{ documentUrl }}",
    },
    {
      name: "url",
      type: "string",
      isArray: false,
      template: "{{ chunk.deepLink | default: document.path }}",
    },
    { name: "chunk_id", type: "string", isArray: false, template: "{{ chunk.id }}" },
    { name: "chunk_index", type: "double", isArray: false, template: "{{ chunk.index }}" },
  ],
};

