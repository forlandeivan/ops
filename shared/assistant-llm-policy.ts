import { z } from "zod";

export const ASSISTANT_LLM_POLICY_ID = "singleton";

export const assistantLlmPolicyEffectiveSources = ["configured", "fallback", "none"] as const;
export type AssistantLlmPolicyEffectiveSource = (typeof assistantLlmPolicyEffectiveSources)[number];

export const assistantLlmPolicyEffectiveStatuses = [
  "configured",
  "fallback_default_missing",
  "fallback_default_unavailable",
  "no_available_model",
] as const;
export type AssistantLlmPolicyEffectiveStatus = (typeof assistantLlmPolicyEffectiveStatuses)[number];

function normalizeModelIdList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const unique = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string") {
      continue;
    }
    const trimmed = item.trim();
    if (trimmed.length > 0) {
      unique.add(trimmed);
    }
  }
  return Array.from(unique);
}

export const updateAssistantLlmPolicySchema = z.object({
  defaultModelId: z
    .union([z.string(), z.null()])
    .optional()
    .transform((value) => {
      if (typeof value !== "string") {
        return null;
      }
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : null;
    }),
  disabledModelIds: z
    .array(z.string())
    .optional()
    .transform((value) => normalizeModelIdList(value)),
});

export const assistantLlmPolicyEffectiveSchema = z.object({
  modelId: z.string().nullable(),
  modelKey: z.string().nullable(),
  providerId: z.string().nullable(),
  displayName: z.string().nullable(),
  providerName: z.string().nullable(),
  source: z.enum(assistantLlmPolicyEffectiveSources),
  status: z.enum(assistantLlmPolicyEffectiveStatuses),
});

export const assistantLlmPolicySchema = z.object({
  defaultModelId: z.string().nullable(),
  disabledModelIds: z.array(z.string()),
  effective: assistantLlmPolicyEffectiveSchema,
  remediatedAssistants: z.number().int().nonnegative().optional(),
});

export type AssistantLlmPolicyDto = z.infer<typeof assistantLlmPolicySchema>;
export type UpdateAssistantLlmPolicyDto = z.infer<typeof updateAssistantLlmPolicySchema>;
