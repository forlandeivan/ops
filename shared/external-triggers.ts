import { z } from "zod";

export const externalTriggerProviders = ["telegram", "custom_webhook"] as const;
export const externalTriggerEventKeys = ["message", "webhook"] as const;
export const externalTriggerMessageKinds = ["text", "document", "json"] as const;
export const externalTriggerAuthModes = ["provider_managed", "none", "bearer_personal_token"] as const;
export const externalTriggerReceiptStatuses = [
  "received",
  "ignored",
  "queued",
  "processed",
  "failed",
] as const;
export const externalTriggerDeliveryStatuses = [
  "pending",
  "sent",
  "skipped",
  "failed",
] as const;
export const externalTriggerConnectionTypeFullKeys = [
  "builtin.external_trigger_channels:telegram_bot",
  "builtin.external_trigger_channels:custom_webhook",
] as const;

export type ExternalTriggerProvider = (typeof externalTriggerProviders)[number];
export type ExternalTriggerEventKey = (typeof externalTriggerEventKeys)[number];
export type ExternalTriggerMessageKind = (typeof externalTriggerMessageKinds)[number];
export type ExternalTriggerAuthMode = (typeof externalTriggerAuthModes)[number];
export type ExternalTriggerReceiptStatus = (typeof externalTriggerReceiptStatuses)[number];
export type ExternalTriggerDeliveryStatus = (typeof externalTriggerDeliveryStatuses)[number];
export type ExternalTriggerConnectionTypeFullKey = (typeof externalTriggerConnectionTypeFullKeys)[number];

export const externalTriggerProviderSchema = z.enum(externalTriggerProviders);
export const externalTriggerEventKeySchema = z.enum(externalTriggerEventKeys);
export const externalTriggerMessageKindSchema = z.enum(externalTriggerMessageKinds);
export const externalTriggerAuthModeSchema = z.enum(externalTriggerAuthModes);
export const externalTriggerReceiptStatusSchema = z.enum(externalTriggerReceiptStatuses);
export const externalTriggerDeliveryStatusSchema = z.enum(externalTriggerDeliveryStatuses);
export const externalTriggerConnectionTypeFullKeySchema = z.enum(externalTriggerConnectionTypeFullKeys);

const optionalTrimmedString = (max: number) => z.string().trim().max(max).nullable().optional();
const stringArraySchema = z.array(z.string().trim().min(1).max(255)).default([]);

export const externalTriggerFilterSchema = z.object({
  conversationAllowlist: stringArraySchema,
  threadAllowlist: stringArraySchema,
  messageKinds: z.array(externalTriggerMessageKindSchema).default([]),
  commandPrefix: optionalTrimmedString(64),
});

export const externalTriggerDeliveryPolicySchema = z.object({
  textOnly: z.boolean().default(true),
  splitLongMessages: z.boolean().default(true),
  maxMessageChars: z.number().int().min(1).max(4096).default(4096),
});

export const externalTriggerAuthPolicySchema = z.object({
  mode: externalTriggerAuthModeSchema.default("provider_managed"),
});

export const externalTriggerChannelDocumentSchema = z.object({
  fileId: z.string().trim().min(1),
  fileUniqueId: z.string().trim().min(1).nullable().optional(),
  fileName: z.string().trim().min(1).nullable().optional(),
  mimeType: z.string().trim().min(1).nullable().optional(),
  sizeBytes: z.number().int().nonnegative().nullable().optional(),
  caption: z.string().nullable().optional(),
});

export const externalTriggerChannelWebhookSchema = z.object({
  method: z.string().trim().min(1),
  body: z.unknown(),
  query: z.record(z.string(), z.unknown()).default({}),
  headers: z.record(z.string(), z.unknown()).default({}),
});

export const externalTriggerChannelInputSchema = z.object({
  provider: externalTriggerProviderSchema,
  connectionId: z.string().uuid(),
  bindingId: z.string().uuid().nullable().optional(),
  providerEventId: z.string().trim().min(1),
  externalConversationKey: z.string().trim().min(1),
  externalThreadKey: z.string().trim().min(1).nullable().optional(),
  externalUserKey: z.string().trim().min(1).nullable().optional(),
  messageKind: externalTriggerMessageKindSchema,
  text: z.string(),
  document: externalTriggerChannelDocumentSchema.nullable().optional(),
  webhook: externalTriggerChannelWebhookSchema.nullable().optional(),
  rawEventMeta: z.record(z.string(), z.unknown()).default({}),
});

export const externalTriggerBindingSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().min(1),
  connectionId: z.string().uuid(),
  provider: externalTriggerProviderSchema,
  eventKey: externalTriggerEventKeySchema,
  assistantId: z.string().min(1),
  workflowDefinitionId: z.string().uuid(),
  actorUserId: z.string().min(1),
  title: z.string().trim().min(1).max(255),
  filters: externalTriggerFilterSchema,
  authPolicy: externalTriggerAuthPolicySchema,
  deliveryPolicy: externalTriggerDeliveryPolicySchema,
  webhookUrl: z.string().trim().url().nullable().optional(),
  isActive: z.boolean(),
  createdByUserId: z.string().nullable(),
  updatedByUserId: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const externalTriggerSessionSchema = z.object({
  id: z.string().uuid(),
  bindingId: z.string().uuid(),
  connectionId: z.string().uuid(),
  workspaceId: z.string().min(1),
  externalConversationKey: z.string().trim().min(1).max(255),
  externalUserKey: z.string().trim().max(255).nullable(),
  internalChatId: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const externalTriggerReceiptSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().min(1),
  connectionId: z.string().uuid(),
  bindingId: z.string().uuid().nullable(),
  provider: externalTriggerProviderSchema,
  providerEventId: z.string().trim().min(1).max(255),
  externalConversationKey: z.string().trim().max(255).nullable(),
  status: externalTriggerReceiptStatusSchema,
  workflowRunId: z.string().uuid().nullable(),
  userMessageId: z.string().nullable(),
  errorCode: z.string().trim().max(128).nullable(),
  errorMessage: z.string().trim().max(4000).nullable(),
  rawEventMeta: z.record(z.string(), z.unknown()),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const externalTriggerDeliverySchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().min(1),
  bindingId: z.string().uuid(),
  connectionId: z.string().uuid(),
  workflowRunId: z.string().uuid(),
  internalMessageId: z.string().min(1),
  providerMessageId: z.string().trim().max(255).nullable(),
  status: externalTriggerDeliveryStatusSchema,
  deliveryIndex: z.number().int().min(1),
  errorCode: z.string().trim().max(128).nullable(),
  errorMessage: z.string().trim().max(4000).nullable(),
  sentAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const createExternalTriggerBindingSchema = z.object({
  assistantId: z.string().trim().min(1),
  workflowDefinitionId: z.string().uuid(),
  actorUserId: z.string().trim().min(1),
  title: z.string().trim().min(1).max(255),
  eventKey: externalTriggerEventKeySchema.default("message"),
  filters: externalTriggerFilterSchema.default({
    conversationAllowlist: [],
    threadAllowlist: [],
    messageKinds: [],
    commandPrefix: null,
  }),
  authPolicy: externalTriggerAuthPolicySchema.default({
    mode: "provider_managed",
  }),
  deliveryPolicy: externalTriggerDeliveryPolicySchema.default({
    textOnly: true,
    splitLongMessages: true,
    maxMessageChars: 4096,
  }),
  isActive: z.boolean().optional().default(true),
});

export const updateExternalTriggerBindingSchema = z.object({
  assistantId: z.string().trim().min(1).optional(),
  workflowDefinitionId: z.string().uuid().optional(),
  actorUserId: z.string().trim().min(1).optional(),
  title: z.string().trim().min(1).max(255).optional(),
  filters: externalTriggerFilterSchema.optional(),
  authPolicy: externalTriggerAuthPolicySchema.optional(),
  deliveryPolicy: externalTriggerDeliveryPolicySchema.optional(),
  isActive: z.boolean().optional(),
});

export const externalTriggerWebhookStatusSchema = z.object({
  provider: externalTriggerProviderSchema,
  webhookUrl: z.string().trim().url().nullable(),
  hasCustomCertificate: z.boolean().default(false),
  pendingUpdateCount: z.number().int().nonnegative().default(0),
  lastErrorDate: z.number().int().nullable(),
  lastErrorMessage: z.string().nullable(),
  maxConnections: z.number().int().nullable(),
  allowedUpdates: z.array(z.string().trim().min(1)).default([]),
  secretTokenConfigured: z.boolean().default(false),
});

export const externalTriggerSyncWebhookResponseSchema = z.object({
  connectionId: z.string().uuid(),
  provider: externalTriggerProviderSchema,
  webhookUrl: z.string().trim().url(),
  secretToken: z.string().trim().min(1),
  allowedUpdates: z.array(z.string().trim().min(1)).default([]),
  status: externalTriggerWebhookStatusSchema,
});

export const externalTriggerBindingListResponseSchema = z.object({
  bindings: z.array(externalTriggerBindingSchema),
});

export const externalTriggerReceiptListResponseSchema = z.object({
  receipts: z.array(externalTriggerReceiptSchema),
});

export const externalTriggerDeliveryListResponseSchema = z.object({
  deliveries: z.array(externalTriggerDeliverySchema),
});

export type ExternalTriggerFilter = z.infer<typeof externalTriggerFilterSchema>;
export type ExternalTriggerDeliveryPolicy = z.infer<typeof externalTriggerDeliveryPolicySchema>;
export type ExternalTriggerAuthPolicy = z.infer<typeof externalTriggerAuthPolicySchema>;
export type ExternalTriggerChannelDocument = z.infer<typeof externalTriggerChannelDocumentSchema>;
export type ExternalTriggerChannelWebhook = z.infer<typeof externalTriggerChannelWebhookSchema>;
export type ExternalTriggerChannelInput = z.infer<typeof externalTriggerChannelInputSchema>;
export type ExternalTriggerBinding = z.infer<typeof externalTriggerBindingSchema>;
export type ExternalTriggerSession = z.infer<typeof externalTriggerSessionSchema>;
export type ExternalTriggerReceipt = z.infer<typeof externalTriggerReceiptSchema>;
export type ExternalTriggerDelivery = z.infer<typeof externalTriggerDeliverySchema>;
export type CreateExternalTriggerBindingInput = z.infer<typeof createExternalTriggerBindingSchema>;
export type UpdateExternalTriggerBindingInput = z.infer<typeof updateExternalTriggerBindingSchema>;
export type ExternalTriggerWebhookStatus = z.infer<typeof externalTriggerWebhookStatusSchema>;
export type ExternalTriggerSyncWebhookResponse = z.infer<typeof externalTriggerSyncWebhookResponseSchema>;
