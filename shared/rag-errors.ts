import { z } from "zod";

export const ragPipelineExecutionSources = [
  "assistant_chat",
  "workflow",
  "rag_arena",
  "system_operation",
] as const;
export const ragPipelineExecutionSourceSchema = z.enum(ragPipelineExecutionSources);
export type RagPipelineExecutionSource = z.infer<typeof ragPipelineExecutionSourceSchema>;

const nullableShortStringSchema = z.string().trim().min(1).max(255).nullable().optional();
const nullableLongStringSchema = z.string().max(4000).nullable().optional();

export const ragPipelineErrorCauseSchema = z.object({
  name: nullableShortStringSchema,
  code: nullableShortStringSchema,
  message: z.string().trim().min(1).max(2000),
  detail: nullableLongStringSchema,
  hint: nullableLongStringSchema,
  stack: nullableLongStringSchema,
});
export type RagPipelineErrorCause = z.infer<typeof ragPipelineErrorCauseSchema>;

export const ragPipelineErrorProviderSchema = z.object({
  id: nullableShortStringSchema,
  name: nullableShortStringSchema,
  type: nullableShortStringSchema,
  url: nullableLongStringSchema,
});
export type RagPipelineErrorProvider = z.infer<typeof ragPipelineErrorProviderSchema>;

export const ragPipelineErrorDetailsSchema = z.object({
  stage: z.string().trim().min(1).max(120),
  code: nullableShortStringSchema,
  message: z.string().trim().min(1).max(4000),
  httpStatus: z.number().int().min(100).max(599).nullable().optional(),
  retryable: z.boolean().nullable().optional(),
  provider: ragPipelineErrorProviderSchema.nullable().optional(),
  model: nullableShortStringSchema,
  embeddingProviderId: nullableShortStringSchema,
  embeddingModel: nullableShortStringSchema,
  llmProviderId: nullableShortStringSchema,
  llmModel: nullableShortStringSchema,
  knowledgeBaseId: nullableShortStringSchema,
  collections: z.array(z.string().trim().min(1).max(255)).max(100).nullable().optional(),
  askAiRunId: nullableShortStringSchema,
  responseExcerpt: nullableLongStringSchema,
  cause: z.array(ragPipelineErrorCauseSchema).max(10).nullable().optional(),
});
export type RagPipelineErrorDetails = z.infer<typeof ragPipelineErrorDetailsSchema>;

export function isRagPipelineErrorDetails(value: unknown): value is RagPipelineErrorDetails {
  return ragPipelineErrorDetailsSchema.safeParse(value).success;
}
