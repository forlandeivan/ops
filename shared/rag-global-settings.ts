import { z } from "zod";

import { MAX_CONTEXT_INPUT_LIMIT, MIN_CONTEXT_INPUT_LIMIT } from "./indexing-rules";

const nullableEmbeddingStringSchema = z.string().trim().max(255).nullable();

// Верхняя граница размерности dense-вектора в Qdrant.
export const MAX_EMBEDDING_VECTOR_SIZE = 65536;

const ragGlobalSettingsBaseSchema = z.object({
  contextInputLimit: z
    .number()
    .int()
    .min(MIN_CONTEXT_INPUT_LIMIT, `contextInputLimit должно быть не меньше ${MIN_CONTEXT_INPUT_LIMIT}`)
    .max(MAX_CONTEXT_INPUT_LIMIT, `contextInputLimit должно быть не больше ${MAX_CONTEXT_INPUT_LIMIT}`)
    .nullable(),
  citationsEnabled: z.boolean(),
  embeddingProviderId: nullableEmbeddingStringSchema,
  embeddingModel: nullableEmbeddingStringSchema,
  // Размерность вектора глобальной embedding-модели. Источник истины для путей,
  // где размер нельзя определить по живому ответу модели (инвентарь/миграция
  // КБ-коллекций, планирование имени workspace-коллекции). Должна совпадать
  // с фактической размерностью модели — расхождение ловится при индексации.
  embeddingVectorSize: z
    .number()
    .int()
    .positive("Размерность вектора должна быть положительным числом")
    .max(MAX_EMBEDDING_VECTOR_SIZE, `Размерность вектора не может превышать ${MAX_EMBEDDING_VECTOR_SIZE}`)
    .nullable(),
});

function validateEmbeddingPair(
  value: Pick<z.infer<typeof ragGlobalSettingsBaseSchema>, "embeddingProviderId" | "embeddingModel">,
  ctx: z.RefinementCtx,
) {
    const hasProvider = Boolean(value.embeddingProviderId);
    const hasModel = Boolean(value.embeddingModel);
    if (hasProvider === hasModel) {
      return;
    }

    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: hasProvider ? ["embeddingModel"] : ["embeddingProviderId"],
      message: "Провайдер и модель эмбеддингов должны быть заполнены вместе",
    });
}

export const ragGlobalSettingsSchema = ragGlobalSettingsBaseSchema.superRefine(validateEmbeddingPair);

export const updateRagGlobalSettingsSchema = ragGlobalSettingsBaseSchema.partial();

export const globalProfileAssignmentsSchema = z.object({
  activeIndexingProfileId: z.string().min(1),
  activeSearchProfileId: z.string().min(1),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
});

export type RagGlobalSettingsDto = z.infer<typeof ragGlobalSettingsSchema>;
export type UpdateRagGlobalSettingsDto = z.infer<typeof updateRagGlobalSettingsSchema>;
export type GlobalProfileAssignmentsDto = z.infer<typeof globalProfileAssignmentsSchema>;

export const DEFAULT_RAG_GLOBAL_SETTINGS: RagGlobalSettingsDto = {
  contextInputLimit: null,
  citationsEnabled: true,
  embeddingProviderId: null,
  embeddingModel: null,
  embeddingVectorSize: null,
};
