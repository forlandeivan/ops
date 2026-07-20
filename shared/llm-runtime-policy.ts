import { z } from "zod";

export const assistantActionSchedulerModes = ["fair", "fifo"] as const;
export type AssistantActionSchedulerMode = (typeof assistantActionSchedulerModes)[number];

export const MIN_LLM_COMPLETION_REQUEST_TIMEOUT_MS = 5_000;
export const MAX_LLM_COMPLETION_REQUEST_TIMEOUT_MS = 60 * 60 * 1000;
export const MIN_ASSISTANT_ACTION_WORKER_CONCURRENCY = 1;
export const MAX_ASSISTANT_ACTION_WORKER_CONCURRENCY = 64;
export const MIN_ASSISTANT_ACTION_LEASE_TTL_MS = 5_000;
export const MAX_ASSISTANT_ACTION_LEASE_TTL_MS = 30 * 60 * 1000;
export const MIN_ASSISTANT_ACTION_HEARTBEAT_INTERVAL_MS = 1_000;
export const MAX_ASSISTANT_ACTION_HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000;
export const MIN_ASSISTANT_ACTION_TENANT_LIMIT = 1;
export const MAX_ASSISTANT_ACTION_TENANT_LIMIT = 64;

const llmRuntimePolicyBaseSchema = z.object({
  llmCompletionRequestTimeoutMs: z
    .number()
    .int()
    .min(MIN_LLM_COMPLETION_REQUEST_TIMEOUT_MS)
    .max(MAX_LLM_COMPLETION_REQUEST_TIMEOUT_MS),
  assistantActionWorkerConcurrency: z
    .number()
    .int()
    .min(MIN_ASSISTANT_ACTION_WORKER_CONCURRENCY)
    .max(MAX_ASSISTANT_ACTION_WORKER_CONCURRENCY),
  assistantActionLeaseTtlMs: z
    .number()
    .int()
    .min(MIN_ASSISTANT_ACTION_LEASE_TTL_MS)
    .max(MAX_ASSISTANT_ACTION_LEASE_TTL_MS),
  assistantActionHeartbeatIntervalMs: z
    .number()
    .int()
    .min(MIN_ASSISTANT_ACTION_HEARTBEAT_INTERVAL_MS)
    .max(MAX_ASSISTANT_ACTION_HEARTBEAT_INTERVAL_MS),
  assistantActionMaxConcurrentPerWorkspace: z
    .number()
    .int()
    .min(MIN_ASSISTANT_ACTION_TENANT_LIMIT)
    .max(MAX_ASSISTANT_ACTION_TENANT_LIMIT),
  assistantActionMaxConcurrentPerAssistant: z
    .number()
    .int()
    .min(MIN_ASSISTANT_ACTION_TENANT_LIMIT)
    .max(MAX_ASSISTANT_ACTION_TENANT_LIMIT),
  assistantActionMaxConcurrentPerUser: z
    .number()
    .int()
    .min(MIN_ASSISTANT_ACTION_TENANT_LIMIT)
    .max(MAX_ASSISTANT_ACTION_TENANT_LIMIT),
  assistantActionSchedulerMode: z.enum(assistantActionSchedulerModes),
});

export const llmRuntimePolicySchema = llmRuntimePolicyBaseSchema
  .refine(
    (value) => value.assistantActionHeartbeatIntervalMs < value.assistantActionLeaseTtlMs,
    {
      message: "Интервал сигнала жизни должен быть меньше срока аренды задачи.",
      path: ["assistantActionHeartbeatIntervalMs"],
    },
  );

export const updateLlmRuntimePolicySchema = llmRuntimePolicyBaseSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Нужно передать хотя бы одно поле параметров выполнения.",
  })
  .refine(
    (value) => {
      if (
        value.assistantActionLeaseTtlMs === undefined ||
        value.assistantActionHeartbeatIntervalMs === undefined
      ) {
        return true;
      }
      return value.assistantActionHeartbeatIntervalMs < value.assistantActionLeaseTtlMs;
    },
    {
      message: "Интервал сигнала жизни должен быть меньше срока аренды задачи.",
      path: ["assistantActionHeartbeatIntervalMs"],
    },
  );

export type LlmRuntimePolicyDto = z.infer<typeof llmRuntimePolicySchema>;
export type UpdateLlmRuntimePolicyDto = z.infer<typeof updateLlmRuntimePolicySchema>;
