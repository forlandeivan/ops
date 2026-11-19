import { z } from "zod";

export const AGENT_LLM_POLICY_ID = "singleton";

export const agentLlmPolicyEffectiveSources = ["configured", "fallback", "none"] as const;
export type AgentLlmPolicyEffectiveSource = (typeof agentLlmPolicyEffectiveSources)[number];

export const agentLlmPolicyEffectiveStatuses = [
  "configured",
  "fallback_default_missing",
  "fallback_default_unavailable",
  "no_available_model",
] as const;
export type AgentLlmPolicyEffectiveStatus = (typeof agentLlmPolicyEffectiveStatuses)[number];

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

export const updateAgentLlmPolicySchema = z.object({
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

export const agentLlmPolicyEffectiveSchema = z.object({
  modelId: z.string().nullable(),
  modelKey: z.string().nullable(),
  providerId: z.string().nullable(),
  displayName: z.string().nullable(),
  providerName: z.string().nullable(),
  source: z.enum(agentLlmPolicyEffectiveSources),
  status: z.enum(agentLlmPolicyEffectiveStatuses),
});

export const agentLlmPolicySchema = z.object({
  defaultModelId: z.string().nullable(),
  disabledModelIds: z.array(z.string()),
  effective: agentLlmPolicyEffectiveSchema,
  remediatedAgents: z.number().int().nonnegative().optional(),
});

export type AgentLlmPolicyDto = z.infer<typeof agentLlmPolicySchema>;
export type UpdateAgentLlmPolicyDto = z.infer<typeof updateAgentLlmPolicySchema>;
