import { z } from "zod";
import { normalizeLegacyKeys } from "./legacy-keys";

export const agentActionSchedulerModes = ["fair", "fifo"] as const;
export type AgentActionSchedulerMode = (typeof agentActionSchedulerModes)[number];

export const MIN_LLM_COMPLETION_REQUEST_TIMEOUT_MS = 5_000;
export const MAX_LLM_COMPLETION_REQUEST_TIMEOUT_MS = 60 * 60 * 1000;
export const MIN_AGENT_ACTION_WORKER_CONCURRENCY = 1;
export const MAX_AGENT_ACTION_WORKER_CONCURRENCY = 64;
export const MIN_AGENT_ACTION_LEASE_TTL_MS = 5_000;
export const MAX_AGENT_ACTION_LEASE_TTL_MS = 30 * 60 * 1000;
export const MIN_AGENT_ACTION_HEARTBEAT_INTERVAL_MS = 1_000;
export const MAX_AGENT_ACTION_HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000;
export const MIN_AGENT_ACTION_TENANT_LIMIT = 1;
export const MAX_AGENT_ACTION_TENANT_LIMIT = 64;

const llmRuntimePolicyBaseSchema = z.object({
  llmCompletionRequestTimeoutMs: z
    .number()
    .int()
    .min(MIN_LLM_COMPLETION_REQUEST_TIMEOUT_MS)
    .max(MAX_LLM_COMPLETION_REQUEST_TIMEOUT_MS),
  agentActionWorkerConcurrency: z
    .number()
    .int()
    .min(MIN_AGENT_ACTION_WORKER_CONCURRENCY)
    .max(MAX_AGENT_ACTION_WORKER_CONCURRENCY),
  agentActionLeaseTtlMs: z
    .number()
    .int()
    .min(MIN_AGENT_ACTION_LEASE_TTL_MS)
    .max(MAX_AGENT_ACTION_LEASE_TTL_MS),
  agentActionHeartbeatIntervalMs: z
    .number()
    .int()
    .min(MIN_AGENT_ACTION_HEARTBEAT_INTERVAL_MS)
    .max(MAX_AGENT_ACTION_HEARTBEAT_INTERVAL_MS),
  agentActionMaxConcurrentPerWorkspace: z
    .number()
    .int()
    .min(MIN_AGENT_ACTION_TENANT_LIMIT)
    .max(MAX_AGENT_ACTION_TENANT_LIMIT),
  agentActionMaxConcurrentPerAgent: z
    .number()
    .int()
    .min(MIN_AGENT_ACTION_TENANT_LIMIT)
    .max(MAX_AGENT_ACTION_TENANT_LIMIT),
  agentActionMaxConcurrentPerUser: z
    .number()
    .int()
    .min(MIN_AGENT_ACTION_TENANT_LIMIT)
    .max(MAX_AGENT_ACTION_TENANT_LIMIT),
  agentActionSchedulerMode: z.enum(agentActionSchedulerModes),
});

export const llmRuntimePolicySchema = llmRuntimePolicyBaseSchema
  .refine(
    (value) => value.agentActionHeartbeatIntervalMs < value.agentActionLeaseTtlMs,
    {
      message: "Интервал сигнала жизни должен быть меньше срока аренды задачи.",
      path: ["agentActionHeartbeatIntervalMs"],
    },
  );

const legacyRuntimeKeys = {
  assistantActionWorkerConcurrency: "agentActionWorkerConcurrency",
  assistantActionLeaseTtlMs: "agentActionLeaseTtlMs",
  assistantActionHeartbeatIntervalMs: "agentActionHeartbeatIntervalMs",
  assistantActionMaxConcurrentPerWorkspace: "agentActionMaxConcurrentPerWorkspace",
  assistantActionMaxConcurrentPerAssistant: "agentActionMaxConcurrentPerAgent",
  assistantActionMaxConcurrentPerUser: "agentActionMaxConcurrentPerUser",
  assistantActionSchedulerMode: "agentActionSchedulerMode",
} as const;

export function withLegacyRuntimeKeys(policy: LlmRuntimePolicyDto) {
  return { ...policy, ...Object.fromEntries(Object.entries(legacyRuntimeKeys).map(([legacy, key]) => [legacy, policy[key]])) };
}

const runtimePolicyPatch = llmRuntimePolicyBaseSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Нужно передать хотя бы одно поле параметров выполнения.",
  })
  .refine(
    (value) => {
      if (
        value.agentActionLeaseTtlMs === undefined ||
        value.agentActionHeartbeatIntervalMs === undefined
      ) {
        return true;
      }
      return value.agentActionHeartbeatIntervalMs < value.agentActionLeaseTtlMs;
    },
    {
      message: "Интервал сигнала жизни должен быть меньше срока аренды задачи.",
      path: ["agentActionHeartbeatIntervalMs"],
    },
  );

export const updateLlmRuntimePolicySchema = z.preprocess(
  (input, ctx) => normalizeLegacyKeys(input, ctx, legacyRuntimeKeys),
  runtimePolicyPatch,
);

export type LlmRuntimePolicyDto = z.infer<typeof llmRuntimePolicySchema>;
export type UpdateLlmRuntimePolicyDto = z.infer<typeof updateLlmRuntimePolicySchema>;
