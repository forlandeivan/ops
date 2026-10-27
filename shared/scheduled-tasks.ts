import { z } from "zod";
import { scheduledTaskScheduleSchema } from "./scheduled-task-schedule";

export const scheduledTaskStates = [
  "active",
  "paused",
  "completed",
  "archived",
] as const;
export const scheduledTaskRunStatuses = [
  "queued",
  "dispatching",
  "running",
  "waiting",
  "succeeded",
  "failed",
  "canceled",
  "timed_out",
  "skipped",
] as const;
export type ScheduledTaskRunStatus = (typeof scheduledTaskRunStatuses)[number];
export const scheduledTaskModes = ["ask", "auto", "bypass"] as const;
export type ScheduledTaskMode = (typeof scheduledTaskModes)[number];
export const scheduledTaskNotifyPolicies = ["on_findings", "on_failure", "always", "never"] as const;
export type ScheduledTaskNotifyPolicy = (typeof scheduledTaskNotifyPolicies)[number];
/** Missing policy on existing revisions means on_findings. Human waits are mandatory. */
export function scheduledTaskNotificationKind(status: string, outcome: string, policy: ScheduledTaskNotifyPolicy = "on_findings"): "scheduled.completed" | "scheduled.failed" | "scheduled.attention" | null {
  if (status === "waiting") return "scheduled.attention";
  if (policy === "never" || status === "canceled" || status === "skipped") return null;
  if (status === "failed" || status === "timed_out" || outcome === "failed") return "scheduled.failed";
  if (status !== "succeeded" || policy === "on_failure") return null;
  return policy === "always" || outcome === "completed" || outcome === "attention" ? "scheduled.completed" : null;
}
export const scheduledTaskDefinitionSchema = z
  .object({
    name: z.string().trim().min(1, "Укажите название").max(160),
    instruction: z.string().trim().min(1, "Опишите задачу").max(32_000),
    assistantId: z.string().min(1),
    actorUserId: z.string().min(1),
    execution: z.enum(["agent", "workflow"]),
    mode: z.enum(scheduledTaskModes).default("ask"),
    notifyPolicy: z.enum(scheduledTaskNotifyPolicies).optional(),
    timezone: z.string().min(1).max(100),
    schedule: scheduledTaskScheduleSchema,
  })
  .strict();
export type ScheduledTaskDefinition = z.infer<
  typeof scheduledTaskDefinitionSchema
>;

export const scheduledTaskSettingsSchema = z
  .object({
    enabled: z.boolean().default(true),
    maxConcurrentRuns: z.number().int().min(1).max(100).default(3),
    maxConcurrentRunsPerWorkspace: z.number().int().min(1).max(20).default(1),
    maxTasksPerWorkspace: z.number().int().min(1).max(1000).default(20),
    minIntervalMinutesAgent: z.number().int().min(1).max(1440).default(60),
    minIntervalMinutesWorkflow: z.number().int().min(1).max(1440).default(15),
    catchUpWindowMinutes: z.number().int().min(1).max(10080).default(360),
    maxActiveMinutes: z.number().int().min(1).max(1440).default(30),
    maxWaitingHours: z.number().int().min(1).max(720).default(72),
    autoPauseFailureThreshold: z.number().int().min(1).max(100).default(5),
    startJitterMaxSeconds: z.number().int().min(0).max(600).default(600),
    chatRetentionDays: z.number().int().min(1).max(3650).default(30),
    chatRetentionPerTask: z.number().int().min(1).max(1000).default(50),
    allowedHours: z
      .object({
        from: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
        to: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
        timezone: z.string().min(1),
      })
      .nullable()
      .default(null),
  })
  .strict();
export type ScheduledTaskSettings = z.infer<typeof scheduledTaskSettingsSchema>;
export const DEFAULT_SCHEDULED_TASK_SETTINGS =
  scheduledTaskSettingsSchema.parse({});

export type ScheduledTaskDto = {
  id: string;
  name: string;
  state: (typeof scheduledTaskStates)[number];
  revision: number;
  ownerUserId: string | null;
  actorUserId: string | null;
  assistantId: string | null;
  nextRunAt: string | null;
  lastStartedAt: string | null;
  updatedAt: string;
  canEdit: boolean;
  canReadContent: boolean;
  definition: ScheduledTaskDefinition | null;
  lastRun: ScheduledTaskRunDto | null;
  activeRun: ScheduledTaskRunDto | null;
};
export type ScheduledTaskRunDto = {
  id: string;
  taskId: string;
  revision: number;
  trigger: "schedule" | "manual";
  status: ScheduledTaskRunStatus;
  scheduledFor: string;
  startedAt: string | null;
  finishedAt: string | null;
  waitKind: string | null;
  chatId: string | null;
  outcome: string | null;
  summary: string | null;
  errorMessage: string | null;
  cancelRequested: boolean;
};

export const SCHEDULED_TASK_STATUS_LABELS: Record<
  ScheduledTaskRunStatus,
  string
> = {
  queued: "Ожидает запуска",
  dispatching: "Запускается",
  running: "Выполняется",
  waiting: "Нужен ответ",
  succeeded: "Завершено",
  failed: "Ошибка",
  canceled: "Отменено",
  timed_out: "Истекло время",
  skipped: "Пропущено",
};
