import { z } from "zod";

import { KNOWLEDGE_IMPORT_TIMEOUT_MS } from "./constants";

export const MIN_KNOWLEDGE_DOCUMENT_IMPORT_TIMEOUT_MS = 5 * 60_000;
export const MAX_KNOWLEDGE_DOCUMENT_IMPORT_TIMEOUT_MS = 120 * 60_000;

const doclingTimeoutMsSchema = z
  .number()
  .int()
  .min(MIN_KNOWLEDGE_DOCUMENT_IMPORT_TIMEOUT_MS)
  .max(MAX_KNOWLEDGE_DOCUMENT_IMPORT_TIMEOUT_MS);

// ── Параллелизм OCR-импорта БЗ (админ-настройки, выносятся из env) ───────────────────────────────
//
// Три ручки управляют суммарным параллелизмом растрового (vision-LLM) OCR. NULL в хранилище = «не
// задано админом» → fallback на env → встроенный дефолт ниже. env сохранён как deploy-override, чтобы
// вынос ручек в админку не менял поведение существующих деплоев. См.
// docs/agent-kb-ai-import-ocr-hardening-design.md §6–7 и server/ocr-concurrency-config.ts.
export const MIN_OCR_CONCURRENCY = 1;
export const MAX_OCR_CONCURRENCY = 64;

/** Сколько страниц ОДНОГО документа распознаются одновременно (env KB_AI_OCR_PAGE_CONCURRENCY). */
export const DEFAULT_AI_OCR_PAGE_CONCURRENCY = 2;
/** Сколько ДОКУМЕНТОВ обрабатываются параллельно (env KB_DOCUMENT_IMPORT_WORKER_CONCURRENCY). */
export const DEFAULT_DOCUMENT_IMPORT_WORKER_CONCURRENCY = 4;
/** Глобальный потолок одновременных запросов к OCR-модели — общий для чата и БЗ (env VISION_OCR_MAX_CONCURRENCY). */
export const DEFAULT_VISION_OCR_MAX_CONCURRENCY = 8;

const ocrConcurrencySchema = z
  .number()
  .int()
  .min(MIN_OCR_CONCURRENCY)
  .max(MAX_OCR_CONCURRENCY)
  .nullable();

export const DEFAULT_KNOWLEDGE_DOCUMENT_IMPORT_SETTINGS = {
  doclingTimeoutMs: KNOWLEDGE_IMPORT_TIMEOUT_MS,
  // null = админ не переопределял → действует env/дефолт (см. server/ocr-concurrency-config.ts).
  aiOcrPageConcurrency: null,
  documentImportWorkerConcurrency: null,
  visionOcrMaxConcurrency: null,
} as const;

export const knowledgeDocumentImportSettingsSchema = z.object({
  doclingTimeoutMs: doclingTimeoutMsSchema,
  aiOcrPageConcurrency: ocrConcurrencySchema,
  documentImportWorkerConcurrency: ocrConcurrencySchema,
  visionOcrMaxConcurrency: ocrConcurrencySchema,
});

export const updateKnowledgeDocumentImportSettingsSchema = knowledgeDocumentImportSettingsSchema.partial();

export type KnowledgeDocumentImportSettingsDto = z.infer<typeof knowledgeDocumentImportSettingsSchema>;
export type UpdateKnowledgeDocumentImportSettingsDto = z.infer<typeof updateKnowledgeDocumentImportSettingsSchema>;

/** Эффективные (разрешённые админ→env→дефолт) значения параллелизма — для отображения в админке. */
export type EffectiveOcrConcurrencyDto = {
  aiOcrPageConcurrency: number;
  documentImportWorkerConcurrency: number;
  visionOcrMaxConcurrency: number;
};
