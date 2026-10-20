import { z } from "zod";

export const notificationCategories = [
  "results",
  "errors",
  "attention",
  "assistant_updates",
  "product_updates",
] as const;
export const notificationStreams = ["work", "updates"] as const;
export const notificationStates = [
  "all",
  "unread",
  "attention",
  "archived",
] as const;
export type NotificationCategory = (typeof notificationCategories)[number];
export type NotificationStream = (typeof notificationStreams)[number];
export type NotificationState = (typeof notificationStates)[number];
export const notificationEventKinds = [
  "ingest.completed",
  "ingest.failed",
  "scheduled.completed",
  "scheduled.failed",
  "scheduled.attention",
  "build.update_available",
  "announcement.published",
] as const;
export type NotificationEventKind = (typeof notificationEventKinds)[number];
export const NOTIFICATION_SCHEMA_VERSION = 1 as const;
export const MAX_NOTIFICATION_SOURCE_BATCH = 100;
export const notificationEventSchema = z
  .object({
    // Pre-versioning outbox rows decode as v1; producers persist the normalized version.
    schemaVersion: z
      .literal(NOTIFICATION_SCHEMA_VERSION)
      .default(NOTIFICATION_SCHEMA_VERSION),
    workspaceId: z.string().min(1).max(128),
    eventKey: z.string().min(1).max(240),
    kind: z.enum(notificationEventKinds),
    subjectKind: z.enum([
      "ingest_batch",
      "scheduled_run",
      "installed_build",
      "announcement",
    ]),
    subjectId: z.string().uuid(),
    recipientUserIds: z.array(z.string().min(1).max(128)).min(1).max(500),
    // Titles and bodies are rendered from the registry/current source, never untrusted errors.
    context: z
      .object({
        versionId: z.string().uuid().optional(),
        sourceCount: z.number().int().min(0).max(1_000_000).optional(),
        readyCount: z.number().int().min(0).max(1_000_000).optional(),
        failedCount: z.number().int().min(0).max(1_000_000).optional(),
      })
      .strict()
      .default({}),
  })
  .strict()
  .superRefine((event, ctx) => {
    const expected = event.kind.startsWith("ingest.")
      ? "ingest_batch"
      : event.kind.startsWith("scheduled.")
        ? "scheduled_run"
        : event.kind.startsWith("build.")
          ? "installed_build"
          : "announcement";
    if (event.subjectKind !== expected)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Subject does not match notification kind",
      });
    if (event.kind === "build.update_available" && !event.context.versionId)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Build update requires versionId",
      });
  });
export type NotificationEvent = z.input<typeof notificationEventSchema>;
export type ValidatedNotificationEvent = z.output<
  typeof notificationEventSchema
>;

export const resolvedNotificationSourceSchema = z
  .object({
    title: z.string().min(1).max(160),
    body: z.string().max(2000),
    href: z
      .string()
      .max(2048)
      .refine(
        (value) =>
          value.startsWith("/") &&
          !value.startsWith("//") &&
          !/[\\\s]/.test(value),
        "Expected a local product path",
      )
      .nullable(),
    actionRequired: z.boolean(),
  })
  .strict();
export type ResolvedNotificationSource = z.output<
  typeof resolvedNotificationSourceSchema
>;

const notificationSourceEntrySchema = z
  .object({
    key: z.string().min(1).max(128),
    userId: z.string().min(1).max(128),
    event: notificationEventSchema,
  })
  .strict();
export const notificationSourceBatchRequestSchema = z
  .object({
    schemaVersion: z.literal(NOTIFICATION_SCHEMA_VERSION),
    workspaceId: z.string().min(1).max(128),
    entries: z
      .array(notificationSourceEntrySchema)
      .min(1)
      .max(MAX_NOTIFICATION_SOURCE_BATCH),
  })
  .strict()
  .superRefine((request, ctx) => {
    const seen = new Set<string>();
    for (const entry of request.entries) {
      if (
        seen.has(entry.key) ||
        entry.event.workspaceId !== request.workspaceId ||
        !entry.event.recipientUserIds.includes(entry.userId)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Duplicate key or mismatched notification scope",
        });
      }
      seen.add(entry.key);
    }
  });
export const notificationSourceBatchResponseSchema = z
  .object({
    schemaVersion: z.literal(NOTIFICATION_SCHEMA_VERSION),
    entries: z
      .array(
        z
          .object({
            key: z.string().min(1).max(128),
            source: resolvedNotificationSourceSchema.nullable(),
          })
          .strict(),
      )
      .min(1)
      .max(MAX_NOTIFICATION_SOURCE_BATCH),
  })
  .strict();
export type NotificationSourceEntry = z.output<
  typeof notificationSourceEntrySchema
>;
export type NotificationSourceBatchRequest = z.output<
  typeof notificationSourceBatchRequestSchema
>;
export type NotificationSourceBatchResponse = z.output<
  typeof notificationSourceBatchResponseSchema
>;
export interface NotificationDto {
  id: string;
  category: NotificationCategory;
  stream: NotificationStream;
  title: string;
  body: string;
  createdAt: string;
  readAt: string | null;
  archivedAt: string | null;
  actionRequired: boolean;
  href: string | null;
}
export interface NotificationListDto {
  items: NotificationDto[];
  counts: { work: number; updates: number; attention: number };
  nextCursor: string | null;
  readBefore: string;
  /** Lower-bound counts when the unread candidate budget was exhausted. */
  countsLimited?: boolean;
}
export type NotificationSummaryDto = Pick<
  NotificationListDto,
  "counts" | "countsLimited"
>;
export type NotificationPreferences = Record<NotificationCategory, boolean>;
export const defaultNotificationPreferences: NotificationPreferences = {
  results: true,
  errors: true,
  attention: true,
  assistant_updates: true,
  product_updates: true,
};
export const notificationPreferencesSchema = z
  .object({
    results: z.boolean(),
    errors: z.boolean(),
    attention: z.literal(true),
    assistant_updates: z.boolean(),
    product_updates: z.boolean(),
  })
  .strict();
export function notificationPolicy(kind: NotificationEventKind): {
  category: NotificationCategory;
  stream: NotificationStream;
  mandatory: boolean;
} {
  const category: NotificationCategory =
    kind === "scheduled.attention"
      ? "attention"
      : kind === "scheduled.failed" || kind === "ingest.failed"
        ? "errors"
        : kind === "build.update_available"
          ? "assistant_updates"
          : kind === "announcement.published"
            ? "product_updates"
            : "results";
  return {
    category,
    stream: category.endsWith("updates") ? "updates" : "work",
    mandatory: kind === "scheduled.attention",
  };
}
export function shouldDeliverNotification(
  kind: NotificationEventKind,
  preferences: NotificationPreferences,
): boolean {
  const policy = notificationPolicy(kind);
  return policy.mandatory || preferences[policy.category];
}
