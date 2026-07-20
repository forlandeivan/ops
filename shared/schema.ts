import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  varchar,
  timestamp,
  date,
  integer,
  boolean,
  json,
  jsonb,
  customType,
  primaryKey,
  foreignKey,
  uniqueIndex,
  index,
  check,
  doublePrecision,
  real,
  uuid,
  bigint,
  bigserial,
  pgEnum,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import {
  workflowAuditActions,
  workflowDefinitionKinds,
  workflowDefinitionScopeKinds,
  workflowDefinitionStatuses,
  workflowTemplateSources,
} from "./workflows";
import { workflowNodeKinds } from "./workflow-compiler";
import type { GlobalVariableValueType } from "./global-variables";
import type {
  ReferenceSetActorType,
  ReferenceSetAuditAction,
  ReferenceSetCheckOutcome,
  ReferenceSetCreatedByType,
  ReferenceSetDiffSummary,
  ReferenceSetSourceDoc,
  ReferenceSetVersionStatus,
} from "./reference-sets";
import type {
  ExternalTriggerAuthPolicy,
  ExternalTriggerDeliveryPolicy,
  ExternalTriggerDeliveryStatus,
  ExternalTriggerEventKey,
  ExternalTriggerFilter,
  ExternalTriggerProvider,
  ExternalTriggerReceiptStatus,
} from "./external-triggers";
import type {
  IndexingArenaCleanupStatus,
  IndexingArenaConfigDto,
  IndexingArenaMetricsDto,
  IndexingArenaRunErrorDto,
  IndexingArenaRunStatus,
  IndexingArenaStageTimingsDto,
} from "./indexing-arena";
import type {
  RagArenaExperimentSnapshotConfig,
  RagArenaExperimentStatus,
  RagArenaExperimentSummaryMetrics,
  RagArenaResultMetrics,
  RagArenaResultStatus,
  RagArenaReview,
} from "./rag-arena";
import type {
  DocumentClaimLedgerEntry,
  DocumentDraftSection,
  DocumentResultPackageStatus,
  DocumentReviewCheckpoint,
  DocumentSourceMap,
  DocumentSourceRef,
  DocumentSourceRole,
  DocumentSourceType,
  DocumentValidationResult,
  DocumentWorkingSetStatus,
} from "./document-agent";
import type { WorkflowStatusTemplateAllowedNodeKind } from "./workflow-status-templates";
import type {
  CustomNodeDefinitionStatus,
  CustomNodeLibraryStatus,
  CustomNodeRuntimeConfig,
} from "./custom-nodes";
import type {
  ConfirmationPolicy,
  PackageBuildRunStatus,
  PackageDraftSourceKind,
  PackageDraftStatus,
  PackageKind,
  PackageValidationStatus,
  ConnectionStatus,
  EventSource,
  InstallLogAction,
  InstallLogStatus,
  InstallStatus,
  JsonObject,
  PackageIntegrityStatus,
  OperationPermissionLevel,
  OperationType,
  PackageSource,
  PackageStatus,
  PackageVisibility,
  PluginTrustLevel,
} from "./plugin-system";
import type {
  BuildVisibility,
  BuildStatus,
  BuildInstallStatus,
  InstallMode,
  BuildUpdatePolicy,
  BuildUpdateEvent,
} from "./builds";
import type {
  McpInstallationStatus,
  McpServerRegistryStatus,
  McpServerTrustTier,
  McpToolHealthStatus,
  McpToolPermissionLevel,
  McpTransport,
} from "./mcp";
import type { RagPipelineErrorDetails, RagPipelineExecutionSource } from "./rag-errors";
import type { ComposerPart, ContextRef, ResolvedContextRef, WorkflowContextRequestChatMetadata } from "./context-refs";
import type {
  FeatureAccessTargetKind,
  PlatformFeatureAccessRuleValue,
  PlatformFeatureKey,
} from "./feature-access";
import type { KnowledgeBaseIndexingOverride } from "./knowledge-base-indexing";
import type {
  ChatFeedbackKind,
  ChatFeedbackReasonCode,
  ChatFeedbackVote,
  GeneralFeedbackCategory,
} from "./chat-feedback";

const ltree = customType<{ data: string; driverData: string }>({
  dataType() {
    return "ltree";
  },
});

// Users table for platform authentication
export const userRoles = ["admin", "user"] as const;
export type UserRole = (typeof userRoles)[number];
export const userAvatarSources = ["custom", "google", "yandex", "initials"] as const;
export type UserAvatarSource = (typeof userAvatarSources)[number];

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email", { length: 255 }).notNull().unique(),
  fullName: varchar("full_name", { length: 255 }).notNull(),
  firstName: text("first_name").notNull().default(""),
  lastName: text("last_name").notNull().default(""),
  phone: text("phone").notNull().default(""),
  passwordHash: text("password_hash"),
  role: text("role").$type<UserRole>().notNull().default("user"),
  lastActiveAt: timestamp("last_active_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  isEmailConfirmed: boolean("is_email_confirmed").notNull().default(false),
  emailConfirmedAt: timestamp("email_confirmed_at", { withTimezone: true }),
  status: varchar("status", { length: 64 }).notNull().default("active"),
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  disablePersonalWorkspaceAutoCreate: boolean("disable_personal_workspace_auto_create").notNull().default(false),
  personalApiTokenHash: text("personal_api_token_hash"),
  personalApiTokenLastFour: text("personal_api_token_last_four"),
  personalApiTokenGeneratedAt: timestamp("personal_api_token_generated_at"),
  googleId: text("google_id").unique(),
  googleAvatar: text("google_avatar").notNull().default(""),
  googleEmailVerified: boolean("google_email_verified").notNull().default(false),
  yandexId: text("yandex_id").unique(),
  yandexAvatar: text("yandex_avatar").notNull().default(""),
  yandexEmailVerified: boolean("yandex_email_verified").notNull().default(false),
  avatarKey: text("avatar_key"),
  avatarUpdatedAt: timestamp("avatar_updated_at", { withTimezone: true }),
});

export const docsArticleProgress = pgTable(
  "docs_article_progress",
  {
    userId: varchar("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    trackId: varchar("track_id", { length: 128 }).notNull(),
    articleSlug: varchar("article_slug", { length: 255 }).notNull(),
    viewedAt: timestamp("viewed_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.trackId, table.articleSlug] }),
    userTrackUpdatedIdx: index("docs_article_progress_user_track_updated_idx").on(
      table.userId,
      table.trackId,
      table.updatedAt,
    ),
  }),
);

export const emailConfirmationTokens = pgTable("email_confirmation_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  token: varchar("token", { length: 255 }).notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  expiresAtIdx: index("email_confirmation_tokens_expires_at_idx").on(table.expiresAt),
  userIdx: index("email_confirmation_tokens_user_idx").on(table.userId),
  activeIdx: index("email_confirmation_tokens_active_idx").on(table.userId, table.expiresAt),
}));

export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  token: varchar("token", { length: 255 }).notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  expiresAtIdx: index("password_reset_tokens_expires_at_idx").on(table.expiresAt),
  userIdx: index("password_reset_tokens_user_idx").on(table.userId),
  activeIdx: index("password_reset_tokens_active_idx").on(table.userId, table.expiresAt),
}));

export const systemNotificationLogs = pgTable(
  "system_notification_logs",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    type: varchar("type", { length: 255 }).notNull(),
    toEmail: varchar("to_email", { length: 255 }).notNull(),
    subject: varchar("subject", { length: 255 }).notNull(),
    bodyPreview: varchar("body_preview", { length: 500 }),
    body: text("body"),
    status: varchar("status", { length: 255 }).notNull().default("queued"),
    errorMessage: text("error_message"),
    smtpResponse: text("smtp_response"),
    correlationId: varchar("correlation_id", { length: 255 }),
    triggeredByUserId: varchar("triggered_by_user_id").references(() => users.id, { onDelete: "set null" }),
  },
  (table) => ({
    createdAtIdx: index("system_notification_logs_created_at_idx").on(table.createdAt),
    toEmailIdx: index("system_notification_logs_to_email_idx").on(table.toEmail),
    typeIdx: index("system_notification_logs_type_idx").on(table.type),
    statusIdx: index("system_notification_logs_status_idx").on(table.status),
  }),
);

const workspacePlans = ["free", "team"] as const;
type WorkspacePlan = (typeof workspacePlans)[number];
const workspacePlanEnum = pgEnum("workspace_plan", workspacePlans);

export const modelTypes = ["LLM", "EMBEDDINGS", "ASR"] as const;
export type ModelType = (typeof modelTypes)[number];
const modelTypeEnum = pgEnum("model_type", modelTypes);

const modelConsumptionUnits = ["TOKENS_1K", "TOKENS_1M", "MINUTES"] as const;
export type ModelConsumptionUnit = (typeof modelConsumptionUnits)[number];
const modelConsumptionUnitEnum = pgEnum("model_consumption_unit", modelConsumptionUnits);

const modelCostLevels = ["FREE", "LOW", "MEDIUM", "HIGH", "VERY_HIGH"] as const;
export type ModelCostLevel = (typeof modelCostLevels)[number];
const modelCostLevelEnum = pgEnum("model_cost_level", modelCostLevels);

export const models = pgTable(
  "models",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    modelKey: text("model_key").notNull().unique(),
    displayName: text("display_name").notNull(),
    description: text("description"),
    modelType: modelTypeEnum("model_type").notNull(),
    consumptionUnit: modelConsumptionUnitEnum("consumption_unit").notNull(),
    costLevel: modelCostLevelEnum("cost_level").notNull().default("MEDIUM"),
    creditsPerUnit: integer("credits_per_unit").notNull().default(0),
    // Раздельные ставки для TOKENS_1M (центы кредита за 1 000 000 токенов):
    // input — за prompt-токены, output — за completion-токены. EMBEDDINGS используют только input.
    // ASR продолжает использовать creditsPerUnit (центы за минуту). См. price-calculator.ts.
    creditsPerMillionInput: integer("credits_per_million_input").notNull().default(0),
    creditsPerMillionOutput: integer("credits_per_million_output").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    sortOrder: integer("sort_order").notNull().default(0),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    maxCompletionTokens: integer("max_completion_tokens"),
    maxPromptTokensBudget: integer("max_prompt_tokens_budget"),
    providerId: text("provider_id"),
    providerType: text("provider_type"),
    providerModelKey: text("provider_model_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    typeActiveIdx: index("models_type_active_idx").on(table.modelType, table.isActive, table.sortOrder),
    providerUniqueIdx: uniqueIndex("models_provider_unique_idx").on(table.providerId, table.providerModelKey),
  }),
);

type FileStorageAuthType = "none" | "bearer";

export const fileStorageProviders = pgTable(
  "file_storage_providers",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    name: text("name").notNull(),
    baseUrl: text("base_url").notNull(),
    description: text("description"),
    authType: text("auth_type").$type<FileStorageAuthType>().notNull().default("none"),
    isActive: boolean("is_active").notNull().default(true),
    config: jsonb("config").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (table) => ({
    nameUniqueIdx: uniqueIndex("file_storage_providers_name_idx").on(sql`lower(${table.name})`),
    activeIdx: index("file_storage_providers_active_idx").on(table.isActive, table.updatedAt),
  }),
);

const fileKinds = ["attachment", "audio", "assistant_doc"] as const;
const fileKindsEnum = pgEnum("file_kind", fileKinds);

export const fileStorageTypes = ["standard_minio", "external_provider"] as const;
export type FileStorageType = (typeof fileStorageTypes)[number];
const fileStorageTypeEnum = pgEnum("file_storage_type", fileStorageTypes);

const fileStatuses = ["uploading", "ready", "failed"] as const;
const fileStatusEnum = pgEnum("file_status", fileStatuses);

export const files = pgTable(
  "files",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: varchar("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    assistantId: varchar("assistant_id"),
    chatId: varchar("chat_id"),
    messageId: varchar("message_id"),
    userId: varchar("user_id").references(() => users.id, { onDelete: "set null" }),
    kind: fileKindsEnum("kind").notNull(),
    name: text("name").notNull(),
    mimeType: text("mime_type"),
    sizeBytes: bigint("size_bytes", { mode: "bigint" }),
    storageType: fileStorageTypeEnum("storage_type").notNull(),
    bucket: text("bucket"),
    objectKey: text("object_key"),
    objectVersion: text("object_version"),
    externalUri: text("external_uri"),
    providerId: varchar("provider_id").references(() => fileStorageProviders.id, { onDelete: "set null" }),
    providerFileId: text("provider_file_id"),
    status: fileStatusEnum("status").notNull().default("ready"),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (table) => ({
    workspaceIdx: index("files_workspace_idx").on(table.workspaceId, table.createdAt),
    assistantIdx: index("files_assistant_idx").on(table.assistantId),
    chatIdx: index("files_chat_idx").on(table.chatId),
    messageIdx: index("files_message_idx").on(table.messageId),
  }),
);

// TODO(usage): workspace_usage_month will become the single usage aggregate keyed by workspace_id + period_code (see docs/workspace-usage-foundation.md)
export const workspaces = pgTable("workspaces", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  ownerId: varchar("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  plan: workspacePlanEnum("plan").$type<WorkspacePlan>().notNull().default("free"),
  tariffPlanId: varchar("tariff_plan_id")
    .references(() => tariffPlans.id),
  settings: jsonb("settings")
    .$type<Record<string, unknown>>()
    .notNull()
    .default(sql`'{}'::jsonb`),
  iconUrl: text("icon_url").default(""),
  iconKey: varchar("icon_key", { length: 255 }),
  storageBucket: varchar("storage_bucket", { length: 255 }),
  qdrantCollectionsCount: integer("qdrant_collections_count").notNull().default(0),
  qdrantPointsCount: bigint("qdrant_points_count", { mode: "bigint" }).notNull().default(0n),
  qdrantStorageBytes: bigint("qdrant_storage_bytes", { mode: "bigint" }).notNull().default(0n),
  defaultFileStorageProviderId: varchar("default_file_storage_provider_id").references(() => fileStorageProviders.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  // 0261: hot WHERE owner_id=$1 (листинг/счётчики пространств владельца, ACL break-glass) + FK→users CASCADE.
  ownerIdx: index("workspaces_owner_id_idx").on(table.ownerId),
}));

export const workspaceMemberRoles = ["owner", "manager", "user"] as const;
export type WorkspaceMemberRole = (typeof workspaceMemberRoles)[number];
const workspaceMemberRoleEnum = pgEnum("workspace_member_role", workspaceMemberRoles);

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    workspaceId: varchar("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: workspaceMemberRoleEnum("role").$type<WorkspaceMemberRole>().notNull().default("user"),
    createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.workspaceId, table.userId] }),
  }),
);

export const workspaceInvitations = pgTable(
  "workspace_invitations",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: varchar("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    email: varchar("email", { length: 255 }).notNull(),
    role: workspaceMemberRoleEnum("role").$type<WorkspaceMemberRole>().notNull().default("user"),
    token: varchar("token", { length: 255 }).notNull().unique(),
    invitedByUserId: varchar("invited_by_user_id").references(() => users.id, { onDelete: "set null" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (table) => ({
    workspaceIdx: index("workspace_invitations_workspace_idx").on(table.workspaceId),
    emailIdx: index("workspace_invitations_email_idx").on(table.email),
    expiresIdx: index("workspace_invitations_expires_idx").on(table.expiresAt),
  }),
);

export const workspaceUsageMonth = pgTable(
  "workspace_usage_month",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: varchar("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    periodYear: integer("period_year").notNull(),
    periodMonth: integer("period_month").notNull(),
    periodCode: varchar("period_code", { length: 7 }).notNull(),
    llmTokensTotal: bigint("llm_tokens_total", { mode: "bigint" }).notNull().default(0n),
    embeddingsTokensTotal: bigint("embeddings_tokens_total", { mode: "bigint" }).notNull().default(0n),
    asrMinutesTotal: doublePrecision("asr_minutes_total").notNull().default(0),
    storageBytesTotal: bigint("storage_bytes_total", { mode: "bigint" }).notNull().default(0n),
    assistantsCount: integer("assistants_count").notNull().default(0),
    actionsCount: integer("actions_count").notNull().default(0),
    knowledgeBasesCount: integer("knowledge_bases_count").notNull().default(0),
    membersCount: integer("members_count").notNull().default(0),
    extraMetrics: jsonb("extra_metrics")
      .$type<{ metric: string; value: number }[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    isClosed: boolean("is_closed").notNull().default(false),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (table) => ({
    uniqueWorkspacePeriod: uniqueIndex("workspace_usage_month_workspace_period_idx").on(
      table.workspaceId,
      table.periodCode,
    ),
  }),
);

type AdminAnalyticsInstallationType = "cloud" | "onprem";

export const adminAnalyticsFeatureAreas = [
  "chat",
  "rag",
  "asr",
  "knowledge_base",
  "documents",
  "assistants",
  "actions",
  "imports",
  "storage",
  "vector",
] as const;
export type AdminAnalyticsFeatureArea = (typeof adminAnalyticsFeatureAreas)[number];

export const adminAnalyticsEntityTypes = [
  "knowledge_base",
  "knowledge_document",
  "canvas_document",
  "transcript",
] as const;
export type AdminAnalyticsEntityType = (typeof adminAnalyticsEntityTypes)[number];

export const adminAnalyticsRollupState = pgTable(
  "admin_analytics_rollup_state",
  {
    pipelineKey: text("pipeline_key").primaryKey(),
    lastProcessedDay: date("last_processed_day"),
    lastRepairFrom: date("last_repair_from"),
    lastRepairTo: date("last_repair_to"),
    lastSuccessfulAt: timestamp("last_successful_at", { withTimezone: true }),
    lastError: text("last_error"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    updatedIdx: index("admin_analytics_rollup_state_updated_idx").on(table.updatedAt),
  }),
);

export const adminAnalyticsUserActivityDay = pgTable(
  "admin_analytics_user_activity_day",
  {
    day: date("day").notNull(),
    workspaceId: varchar("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    installationType: text("installation_type")
      .$type<AdminAnalyticsInstallationType>()
      .notNull()
      .default("cloud"),
    meaningfulActionsCount: integer("meaningful_actions_count").notNull().default(0),
    featureBreadth: integer("feature_breadth").notNull().default(0),
    featureAreas: text("feature_areas")
      .array()
      .$type<AdminAnalyticsFeatureArea[]>()
      .notNull()
      .default(sql`'{}'::text[]`),
    isNewUser: boolean("is_new_user").notNull().default(false),
    isReturningUser: boolean("is_returning_user").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.day, table.workspaceId, table.userId] }),
    workspaceDayIdx: index("admin_analytics_user_activity_day_workspace_idx").on(table.workspaceId, table.day),
    userDayIdx: index("admin_analytics_user_activity_day_user_idx").on(table.userId, table.day),
    installationDayIdx: index("admin_analytics_user_activity_day_installation_idx").on(
      table.installationType,
      table.day,
    ),
  }),
);

export const adminAnalyticsWorkspaceActivityDay = pgTable(
  "admin_analytics_workspace_activity_day",
  {
    day: date("day").notNull(),
    workspaceId: varchar("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    installationType: text("installation_type")
      .$type<AdminAnalyticsInstallationType>()
      .notNull()
      .default("cloud"),
    activeUsersCount: integer("active_users_count").notNull().default(0),
    meaningfulActionsCount: integer("meaningful_actions_count").notNull().default(0),
    featureBreadth: integer("feature_breadth").notNull().default(0),
    featureAreas: text("feature_areas")
      .array()
      .$type<AdminAnalyticsFeatureArea[]>()
      .notNull()
      .default(sql`'{}'::text[]`),
    isNewWorkspace: boolean("is_new_workspace").notNull().default(false),
    isReturningWorkspace: boolean("is_returning_workspace").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.day, table.workspaceId] }),
    dayIdx: index("admin_analytics_workspace_activity_day_day_idx").on(table.day),
    installationDayIdx: index("admin_analytics_workspace_activity_day_installation_idx").on(
      table.installationType,
      table.day,
    ),
    // 0260: FK-индекс под каскад удаления пространства (workspace_id; в PK он 2-й после day).
    workspaceIdx: index("admin_analytics_workspace_activity_day_workspace_id_idx").on(table.workspaceId),
  }),
);

export const adminAnalyticsFeatureUsageDay = pgTable(
  "admin_analytics_feature_usage_day",
  {
    day: date("day").notNull(),
    workspaceId: varchar("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    installationType: text("installation_type")
      .$type<AdminAnalyticsInstallationType>()
      .notNull()
      .default("cloud"),
    featureArea: text("feature_area").$type<AdminAnalyticsFeatureArea>().notNull(),
    provider: text("provider").notNull().default(""),
    model: text("model").notNull().default(""),
    uniqueUsersCount: integer("unique_users_count").notNull().default(0),
    uniqueWorkspacesCount: integer("unique_workspaces_count").notNull().default(1),
    createdCount: integer("created_count").notNull().default(0),
    usedCount: integer("used_count").notNull().default(0),
    reusedCount: integer("reused_count").notNull().default(0),
    successCount: integer("success_count").notNull().default(0),
    errorCount: integer("error_count").notNull().default(0),
    blockedCount: integer("blocked_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.day, table.workspaceId, table.featureArea, table.provider, table.model] }),
    featureDayIdx: index("admin_analytics_feature_usage_day_feature_idx").on(table.featureArea, table.day),
    workspaceDayIdx: index("admin_analytics_feature_usage_day_workspace_idx").on(table.workspaceId, table.day),
    providerModelIdx: index("admin_analytics_feature_usage_day_provider_model_idx").on(
      table.provider,
      table.model,
      table.day,
    ),
  }),
);

export const adminAnalyticsEntityLifecycleDay = pgTable(
  "admin_analytics_entity_lifecycle_day",
  {
    day: date("day").notNull(),
    workspaceId: varchar("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    installationType: text("installation_type")
      .$type<AdminAnalyticsInstallationType>()
      .notNull()
      .default("cloud"),
    entityType: text("entity_type").$type<AdminAnalyticsEntityType>().notNull(),
    createdCount: integer("created_count").notNull().default(0),
    usedCount: integer("used_count").notNull().default(0),
    reusedCount: integer("reused_count").notNull().default(0),
    uniqueCreators: integer("unique_creators").notNull().default(0),
    uniqueUsers: integer("unique_users").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.day, table.workspaceId, table.entityType] }),
    entityDayIdx: index("admin_analytics_entity_lifecycle_day_entity_idx").on(table.entityType, table.day),
    workspaceDayIdx: index("admin_analytics_entity_lifecycle_day_workspace_idx").on(table.workspaceId, table.day),
  }),
);

export const workspaceLlmUsageLedger = pgTable(
  "workspace_llm_usage_ledger",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: varchar("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    periodYear: integer("period_year").notNull(),
    periodMonth: integer("period_month").notNull(),
    periodCode: varchar("period_code", { length: 7 }).notNull(),
    executionId: varchar("execution_id").notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    modelId: varchar("model_id").references(() => models.id, { onDelete: "set null" }),
    tokensTotal: integer("tokens_total").notNull().default(0),
    tokensPrompt: integer("tokens_prompt"),
    tokensCompletion: integer("tokens_completion"),
    appliedCreditsPerUnit: integer("applied_credits_per_unit").notNull().default(0),
    creditsCharged: integer("credits_charged").notNull().default(0),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (table) => ({
    uniqueExecution: uniqueIndex("workspace_llm_usage_ledger_execution_idx").on(
      table.workspaceId,
      table.executionId,
    ),
    periodIdx: index("workspace_llm_usage_ledger_period_idx").on(table.workspaceId, table.periodCode),
    occurredIdx: index("workspace_llm_usage_ledger_occurred_idx").on(table.workspaceId, table.occurredAt),
    // 0261: одиночный occurred_at под ГЛОБАЛЬНУЮ admin-аналитику (WHERE occurred_at BETWEEN, без workspace_id).
    occurredAtIdx: index("workspace_llm_usage_ledger_occurred_at_idx").on(table.occurredAt),
    modelIdx: index("workspace_llm_usage_ledger_model_idx").on(
      table.workspaceId,
      table.periodCode,
      table.provider,
      table.model,
    ),
    modelIdIdx: index("workspace_llm_usage_ledger_model_id_idx").on(
      table.workspaceId,
      table.periodCode,
      table.modelId,
    ),
  }),
);

export const workspaceEmbeddingUsageLedger = pgTable(
  "workspace_embedding_usage_ledger",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: varchar("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    periodYear: integer("period_year").notNull(),
    periodMonth: integer("period_month").notNull(),
    periodCode: varchar("period_code", { length: 7 }).notNull(),
    operationId: varchar("operation_id").notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    modelId: varchar("model_id").references(() => models.id, { onDelete: "set null" }),
    tokensTotal: integer("tokens_total").notNull().default(0),
    contentBytes: bigint("content_bytes", { mode: "bigint" }),
    appliedCreditsPerUnit: integer("applied_credits_per_unit").notNull().default(0),
    creditsCharged: integer("credits_charged").notNull().default(0),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (table) => ({
    uniqueOperation: uniqueIndex("workspace_embedding_usage_ledger_operation_idx").on(
      table.workspaceId,
      table.operationId,
    ),
    periodIdx: index("workspace_embedding_usage_ledger_period_idx").on(table.workspaceId, table.periodCode),
    occurredIdx: index("workspace_embedding_usage_ledger_occurred_idx").on(table.workspaceId, table.occurredAt),
    // 0261: одиночный occurred_at под ГЛОБАЛЬНУЮ admin-аналитику (WHERE occurred_at BETWEEN, без workspace_id).
    occurredAtIdx: index("workspace_embedding_usage_ledger_occurred_at_idx").on(table.occurredAt),
    modelIdx: index("workspace_embedding_usage_ledger_model_idx").on(
      table.workspaceId,
      table.periodCode,
      table.provider,
      table.model,
    ),
    modelIdIdx: index("workspace_embedding_usage_ledger_model_id_idx").on(
      table.workspaceId,
      table.periodCode,
      table.modelId,
    ),
  }),
);

export const workspaceAsrUsageLedger = pgTable(
  "workspace_asr_usage_ledger",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: varchar("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    periodYear: integer("period_year").notNull(),
    periodMonth: integer("period_month").notNull(),
    periodCode: varchar("period_code", { length: 7 }).notNull(),
    asrJobId: varchar("asr_job_id").notNull(),
    provider: text("provider"),
    model: text("model"),
    modelId: varchar("model_id").references(() => models.id, { onDelete: "set null" }),
    durationSeconds: integer("duration_seconds").notNull(),
    appliedCreditsPerUnit: integer("applied_credits_per_unit").notNull().default(0),
    creditsCharged: integer("credits_charged").notNull().default(0),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (table) => ({
    uniqueJob: uniqueIndex("workspace_asr_usage_ledger_job_idx").on(table.workspaceId, table.asrJobId),
    periodIdx: index("workspace_asr_usage_ledger_period_idx").on(table.workspaceId, table.periodCode),
    occurredIdx: index("workspace_asr_usage_ledger_occurred_idx").on(table.workspaceId, table.occurredAt),
    providerModelIdx: index("workspace_asr_usage_ledger_provider_model_idx").on(
      table.workspaceId,
      table.periodCode,
      table.provider,
      table.model,
    ),
    modelIdIdx: index("workspace_asr_usage_ledger_model_id_idx").on(
      table.workspaceId,
      table.periodCode,
      table.modelId,
    ),
  }),
);

export const workspaceVectorCollections = pgTable("workspace_vector_collections", {
  collectionName: text("collection_name").primaryKey(),
  workspaceId: varchar("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// Журнал «первого обнаружения» осиротевших коллекций Qdrant для janitor-задачи
// `qdrant.orphaned_collections`. Qdrant API не отдаёт надёжный created_at коллекции,
// поэтому grace-период отсчитывается от first_seen_at: коллекция удаляется, только если
// непрерывно числится сиротой дольше срока политики. См. server/janitor/tasks/qdrant-orphan-gc-task.ts.
export const qdrantOrphanCandidates = pgTable("qdrant_orphan_candidates", {
  collectionName: text("collection_name").primaryKey(),
  firstSeenAt: timestamp("first_seen_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  lastSeenAt: timestamp("last_seen_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const workspaceEmbedKeys = pgTable(
  "workspace_embed_keys",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()::text`),
    workspaceId: varchar("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    knowledgeBaseId: varchar("knowledge_base_id")
      .notNull()
      .references(() => knowledgeBases.id, { onDelete: "cascade" }),
    collection: text("collection").notNull(),
    publicKey: text("public_key")
      .notNull()
      .unique()
      .default(sql`encode(gen_random_bytes(32), 'hex')`),
    createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (table) => ({
    workspaceCollectionUnique: uniqueIndex("workspace_embed_keys_workspace_collection_idx").on(
      table.workspaceId,
      table.collection,
    ),
    // 0260: FK-индекс под каскад удаления БЗ (knowledge_base_id).
    knowledgeBaseIdx: index("workspace_embed_keys_knowledge_base_id_idx").on(table.knowledgeBaseId),
  }),
);

export const workspaceEmbedKeyDomains = pgTable(
  "workspace_embed_key_domains",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()::text`),
    workspaceId: varchar("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    embedKeyId: varchar("embed_key_id")
      .notNull()
      .references(() => workspaceEmbedKeys.id, { onDelete: "cascade" }),
    domain: text("domain").notNull(),
    createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (table) => ({
    domainUnique: uniqueIndex("workspace_embed_key_domains_unique_idx").on(
      table.embedKeyId,
      table.domain,
    ),
  }),
);

export const personalApiTokens = pgTable("personal_api_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  lastFour: text("last_four").notNull(),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  revokedAt: timestamp("revoked_at"),
});

export const authProviders = pgTable("auth_providers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  provider: text("provider").$type<AuthProviderType>().notNull().unique(),
  isEnabled: boolean("is_enabled").notNull().default(false),
  clientId: text("client_id").notNull().default(""),
  clientSecret: text("client_secret").notNull().default(""),
  callbackUrl: text("callback_url").notNull().default("/api/auth/google/callback"),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const smtpSettings = pgTable("smtp_settings", {
  id: varchar("id").primaryKey().default("smtp_singleton"),
  host: varchar("host", { length: 255 }).notNull(),
  port: integer("port").notNull(),
  useTls: boolean("use_tls").notNull().default(false),
  useSsl: boolean("use_ssl").notNull().default(false),
  username: varchar("username", { length: 255 }),
  password: varchar("password", { length: 255 }),
  fromEmail: varchar("from_email", { length: 255 }).notNull(),
  fromName: varchar("from_name", { length: 255 }),
  updatedByAdminId: varchar("updated_by_admin_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
export type SmtpSettings = typeof smtpSettings.$inferSelect;
export type SmtpSettingsInsert = typeof smtpSettings.$inferInsert;

export const maintenanceModeSettings = pgTable("maintenance_mode_settings", {
  id: varchar("id").primaryKey().default("maintenance_mode_singleton"),
  scheduledStartAt: timestamp("scheduled_start_at"),
  scheduledEndAt: timestamp("scheduled_end_at"),
  forceEnabled: boolean("force_enabled").notNull().default(false),
  messageTitle: varchar("message_title", { length: 120 }).notNull().default(""),
  messageBody: text("message_body").notNull().default(""),
  publicEta: text("public_eta"),
  updatedByAdminId: varchar("updated_by_admin_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
export type MaintenanceModeSettings = typeof maintenanceModeSettings.$inferSelect;
export type MaintenanceModeSettingsInsert = typeof maintenanceModeSettings.$inferInsert;

export const maintenanceModeSchedules = pgTable(
  "maintenance_mode_schedules",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    scheduledStartAt: timestamp("scheduled_start_at").notNull(),
    scheduledEndAt: timestamp("scheduled_end_at").notNull(),
    createdByAdminId: varchar("created_by_admin_id").references(() => users.id, { onDelete: "set null" }),
    updatedByAdminId: varchar("updated_by_admin_id").references(() => users.id, { onDelete: "set null" }),
    messageTitle: varchar("message_title", { length: 120 }).notNull().default(""),
    messageBody: text("message_body").notNull().default(""),
    publicEta: text("public_eta"),
    createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    scheduledStartIdx: index("maintenance_mode_schedules_start_idx").on(table.scheduledStartAt),
    scheduledEndIdx: index("maintenance_mode_schedules_end_idx").on(table.scheduledEndAt),
  }),
);
export type MaintenanceModeSchedule = typeof maintenanceModeSchedules.$inferSelect;
export type MaintenanceModeScheduleInsert = typeof maintenanceModeSchedules.$inferInsert;

export const maintenanceModeForceSessions = pgTable(
  "maintenance_mode_force_sessions",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    startedAt: timestamp("started_at").notNull(),
    endedAt: timestamp("ended_at"),
    createdByAdminId: varchar("created_by_admin_id").references(() => users.id, { onDelete: "set null" }),
    endedByAdminId: varchar("ended_by_admin_id").references(() => users.id, { onDelete: "set null" }),
    messageTitle: varchar("message_title", { length: 120 }).notNull().default(""),
    messageBody: text("message_body").notNull().default(""),
    publicEta: text("public_eta"),
    createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    startedIdx: index("maintenance_mode_force_sessions_started_idx").on(table.startedAt),
    endedIdx: index("maintenance_mode_force_sessions_ended_idx").on(table.endedAt),
  }),
);
export type MaintenanceModeForceSession = typeof maintenanceModeForceSessions.$inferSelect;
export type MaintenanceModeForceSessionInsert = typeof maintenanceModeForceSessions.$inferInsert;

export const maintenanceModeAuditLog = pgTable(
  "maintenance_mode_audit_log",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    eventType: varchar("event_type", { length: 64 }).notNull(),
    actorAdminId: varchar("actor_admin_id").references(() => users.id, { onDelete: "set null" }),
    occurredAt: timestamp("occurred_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    payload: jsonb("payload").notNull().default(sql`'{}'::jsonb`),
  },
  (table) => ({
    occurredAtIdx: index("maintenance_mode_audit_log_occurred_at_idx").on(table.occurredAt),
    eventTypeIdx: index("maintenance_mode_audit_log_event_type_idx").on(table.eventType),
  }),
);
export type MaintenanceModeAuditLog = typeof maintenanceModeAuditLog.$inferSelect;
export type MaintenanceModeAuditLogInsert = typeof maintenanceModeAuditLog.$inferInsert;

export const indexingRules = pgTable("indexing_rules", {
  id: varchar("id").primaryKey().default("indexing_rules_singleton"),
  embeddingsProvider: varchar("embeddings_provider", { length: 255 }).notNull(),
  embeddingsModel: varchar("embeddings_model", { length: 255 }).notNull(),
  chunkSize: integer("chunk_size").notNull(),
  chunkOverlap: integer("chunk_overlap").notNull(),
  topK: integer("top_k").notNull(),
  bm25Weight: doublePrecision("bm25_weight").notNull().default(0.5),
  bm25Limit: integer("bm25_limit").notNull().default(6),
  vectorWeight: doublePrecision("vector_weight").notNull().default(0.5),
  vectorLimit: integer("vector_limit").notNull().default(8),
  relevanceThreshold: doublePrecision("relevance_threshold").notNull(),
  maxContextTokens: integer("max_context_tokens").default(3000),
  contextInputLimit: integer("context_input_limit"),
  llmMaxCompletionTokens: integer("llm_max_completion_tokens").default(4096),
  citationsEnabled: boolean("citations_enabled").notNull().default(false),
  updatedByAdminId: varchar("updated_by_admin_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
export type IndexingRules = typeof indexingRules.$inferSelect;
export type IndexingRulesInsert = typeof indexingRules.$inferInsert;

export const indexingProfiles = pgTable(
  "indexing_profiles",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()::text`),
    name: text("name").notNull(),
    description: text("description"),
    isActive: boolean("is_active").notNull().default(false),
    isSystem: boolean("is_system").notNull().default(false),
    version: integer("version").notNull().default(1),
    embeddingsProvider: varchar("embeddings_provider", { length: 255 }).notNull(),
    embeddingsModel: varchar("embeddings_model", { length: 255 }).notNull(),
    chunkSize: integer("chunk_size").notNull(),
    chunkOverlap: integer("chunk_overlap").notNull(),
    workerConcurrency: integer("worker_concurrency").notNull().default(4),
    embeddingBatchMaxChunks: integer("embedding_batch_max_chunks").notNull().default(8),
    embeddingBatchMaxTokens: integer("embedding_batch_max_tokens").notNull().default(4000),
    qdrantUpsertMaxPoints: integer("qdrant_upsert_max_points").notNull().default(8),
    qdrantUpsertMaxBytes: integer("qdrant_upsert_max_bytes").notNull().default(5000000),
    defaultSchema: jsonb("default_schema").notNull().default(sql`'[]'::jsonb`),
    createdByAdminId: varchar("created_by_admin_id").references(() => users.id, { onDelete: "set null" }),
    updatedByAdminId: varchar("updated_by_admin_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    activeIdx: index("indexing_profiles_active_idx").on(table.isActive, table.updatedAt),
    nameUniqueIdx: uniqueIndex("indexing_profiles_name_unique_idx").on(sql`lower(${table.name})`),
  }),
);
export type IndexingProfile = typeof indexingProfiles.$inferSelect;
export type IndexingProfileInsert = typeof indexingProfiles.$inferInsert;

export type SearchProfileStrategy = "rrf" | "weighted_thresholded" | "union";

export const searchProfiles = pgTable(
  "search_profiles",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()::text`),
    name: text("name").notNull(),
    description: text("description"),
    isActive: boolean("is_active").notNull().default(false),
    isSystem: boolean("is_system").notNull().default(false),
    version: integer("version").notNull().default(1),
    strategy: text("strategy").$type<SearchProfileStrategy>().notNull().default("rrf"),
    topK: integer("top_k").notNull(),
    maxContextTokens: integer("max_context_tokens"),
    bm25Limit: integer("bm25_limit").notNull().default(6),
    vectorLimit: integer("vector_limit").notNull().default(8),
    bm25Weight: doublePrecision("bm25_weight").notNull().default(0.5),
    vectorWeight: doublePrecision("vector_weight").notNull().default(0.5),
    bm25Threshold: doublePrecision("bm25_threshold"),
    vectorThreshold: doublePrecision("vector_threshold"),
    rrfK: integer("rrf_k").notNull().default(60),
    queryRewriteEnabled: boolean("query_rewrite_enabled").notNull().default(true),
    queryRewriteModel: text("query_rewrite_model"),
    queryRewritePrompt: text("query_rewrite_prompt"),
    rerankEnabled: boolean("rerank_enabled").notNull().default(false),
    rerankProviderId: varchar("rerank_provider_id").references(() => llmProviders.id, { onDelete: "set null" }),
    rerankModel: text("rerank_model"),
    rerankPrompt: text("rerank_prompt"),
    rerankCandidateCount: integer("rerank_candidate_count").notNull().default(12),
    createdByAdminId: varchar("created_by_admin_id").references(() => users.id, { onDelete: "set null" }),
    updatedByAdminId: varchar("updated_by_admin_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    activeIdx: index("search_profiles_active_idx").on(table.isActive, table.updatedAt),
    strategyIdx: index("search_profiles_strategy_idx").on(table.strategy, table.isActive),
    nameUniqueIdx: uniqueIndex("search_profiles_name_unique_idx").on(sql`lower(${table.name})`),
  }),
);
export type SearchProfile = typeof searchProfiles.$inferSelect;
export type SearchProfileInsert = typeof searchProfiles.$inferInsert;

export const globalProfileAssignments = pgTable("global_profile_assignments", {
  id: varchar("id").primaryKey().default("global_profile_assignments_singleton"),
  activeIndexingProfileId: varchar("active_indexing_profile_id")
    .notNull()
    .references(() => indexingProfiles.id, { onDelete: "restrict" }),
  activeSearchProfileId: varchar("active_search_profile_id")
    .notNull()
    .references(() => searchProfiles.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
export type GlobalProfileAssignment = typeof globalProfileAssignments.$inferSelect;
export type GlobalProfileAssignmentInsert = typeof globalProfileAssignments.$inferInsert;

export const ragGlobalSettings = pgTable("rag_global_settings", {
  id: varchar("id").primaryKey().default("rag_global_settings_singleton"),
  contextInputLimit: integer("context_input_limit"),
  citationsEnabled: boolean("citations_enabled").notNull().default(true),
  embeddingProviderId: varchar("embedding_provider_id", { length: 255 }).references(() => embeddingProviders.id, {
    onDelete: "set null",
  }),
  embeddingModel: text("embedding_model"),
  // Размерность вектора глобальной embedding-модели (см. shared/rag-global-settings.ts).
  embeddingVectorSize: integer("embedding_vector_size"),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
export type RagGlobalSettings = typeof ragGlobalSettings.$inferSelect;
export type RagGlobalSettingsInsert = typeof ragGlobalSettings.$inferInsert;

export const knowledgeDocumentImportSettings = pgTable("knowledge_document_import_settings", {
  id: varchar("id").primaryKey().default("knowledge_document_import_settings_singleton"),
  doclingTimeoutMs: integer("docling_timeout_ms").notNull().default(30 * 60_000),
  // Параллелизм OCR-импорта БЗ (выносится из env). NULL = «не задано админом» → fallback env → дефолт.
  // См. shared/knowledge-document-import-settings.ts и server/ocr-concurrency-config.ts.
  aiOcrPageConcurrency: integer("ai_ocr_page_concurrency"),
  documentImportWorkerConcurrency: integer("document_import_worker_concurrency"),
  visionOcrMaxConcurrency: integer("vision_ocr_max_concurrency"),
  updatedByAdminId: varchar("updated_by_admin_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
export type KnowledgeDocumentImportSettings = typeof knowledgeDocumentImportSettings.$inferSelect;
export type KnowledgeDocumentImportSettingsInsert = typeof knowledgeDocumentImportSettings.$inferInsert;

export const indexingArenaRuns = pgTable(
  "indexing_arena_runs",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()::text`),
    workspaceId: varchar("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    baseId: varchar("base_id")
      .notNull()
      .references(() => knowledgeBases.id, { onDelete: "cascade" }),
    sourceProfileId: varchar("source_profile_id").references(() => indexingProfiles.id, { onDelete: "set null" }),
    status: text("status").$type<IndexingArenaRunStatus>().notNull().default("pending"),
    cleanupStatus: text("cleanup_status").$type<IndexingArenaCleanupStatus>().notNull().default("pending"),
    cleanupError: text("cleanup_error"),
    configSnapshot: jsonb("config_snapshot").$type<IndexingArenaConfigDto>().notNull(),
    metrics: jsonb("metrics").$type<IndexingArenaMetricsDto>().notNull().default(sql`'{}'::jsonb`),
    stageTimings: jsonb("stage_timings").$type<IndexingArenaStageTimingsDto>().notNull().default(sql`'{}'::jsonb`),
    errors: jsonb("errors").$type<IndexingArenaRunErrorDto[]>().notNull().default(sql`'[]'::jsonb`),
    tempCollectionName: text("temp_collection_name"),
    createdByAdminId: varchar("created_by_admin_id").references(() => users.id, { onDelete: "set null" }),
    startedAt: timestamp("started_at"),
    finishedAt: timestamp("finished_at"),
    createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    baseStatusIdx: index("indexing_arena_runs_base_status_idx").on(table.baseId, table.status, table.createdAt),
    workspaceIdx: index("indexing_arena_runs_workspace_idx").on(table.workspaceId, table.createdAt),
    sourceProfileIdx: index("indexing_arena_runs_source_profile_idx").on(table.sourceProfileId, table.createdAt),
  }),
);
export type IndexingArenaRun = typeof indexingArenaRuns.$inferSelect;
export type IndexingArenaRunInsert = typeof indexingArenaRuns.$inferInsert;

export const ragArenaBenchmarks = pgTable(
  "rag_arena_benchmarks",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()::text`),
    workspaceId: varchar("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    baseId: varchar("base_id")
      .notNull()
      .references(() => knowledgeBases.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    description: text("description"),
    targetEdition: varchar("target_edition", { length: 255 }),
    indexRevision: text("index_revision"),
    createdByAdminId: varchar("created_by_admin_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    baseIdx: index("rag_arena_benchmarks_base_idx").on(table.baseId, table.createdAt),
    workspaceIdx: index("rag_arena_benchmarks_workspace_idx").on(table.workspaceId, table.createdAt),
  }),
);
export type RagArenaBenchmark = typeof ragArenaBenchmarks.$inferSelect;
export type RagArenaBenchmarkInsert = typeof ragArenaBenchmarks.$inferInsert;

export const ragArenaCases = pgTable(
  "rag_arena_cases",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()::text`),
    benchmarkId: varchar("benchmark_id")
      .notNull()
      .references(() => ragArenaBenchmarks.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
    bucket: varchar("bucket", { length: 120 }).notNull(),
    question: text("question").notNull(),
    targetEdition: varchar("target_edition", { length: 255 }),
    expectedAbstention: boolean("expected_abstention").notNull().default(false),
    goldRefs: jsonb("gold_refs").notNull().default(sql`'[]'::jsonb`),
    mustHaveFacts: jsonb("must_have_facts").notNull().default(sql`'[]'::jsonb`),
    acceptableParaphrases: jsonb("acceptable_paraphrases").notNull().default(sql`'[]'::jsonb`),
    criticalFailures: jsonb("critical_failures").notNull().default(sql`'[]'::jsonb`),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    benchmarkOrderIdx: index("rag_arena_cases_benchmark_order_idx").on(table.benchmarkId, table.sortOrder, table.createdAt),
  }),
);
export type RagArenaCase = typeof ragArenaCases.$inferSelect;
export type RagArenaCaseInsert = typeof ragArenaCases.$inferInsert;

export const ragArenaExperiments = pgTable(
  "rag_arena_experiments",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()::text`),
    workspaceId: varchar("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    baseId: varchar("base_id")
      .notNull()
      .references(() => knowledgeBases.id, { onDelete: "cascade" }),
    benchmarkId: varchar("benchmark_id")
      .notNull()
      .references(() => ragArenaBenchmarks.id, { onDelete: "cascade" }),
    sourceSearchProfileId: varchar("source_search_profile_id").references(() => searchProfiles.id, {
      onDelete: "set null",
    }),
    name: varchar("name", { length: 120 }).notNull(),
    status: text("status").$type<RagArenaExperimentStatus>().notNull().default("pending"),
    configSnapshot: jsonb("config_snapshot").$type<RagArenaExperimentSnapshotConfig>().notNull(),
    summaryMetrics: jsonb("summary_metrics")
      .$type<RagArenaExperimentSummaryMetrics>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    errors: jsonb("errors").notNull().default(sql`'[]'::jsonb`),
    createdByAdminId: varchar("created_by_admin_id").references(() => users.id, { onDelete: "set null" }),
    startedAt: timestamp("started_at"),
    finishedAt: timestamp("finished_at"),
    createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    benchmarkIdx: index("rag_arena_experiments_benchmark_idx").on(table.benchmarkId, table.createdAt),
    baseStatusIdx: index("rag_arena_experiments_base_status_idx").on(table.baseId, table.status, table.createdAt),
    workspaceIdx: index("rag_arena_experiments_workspace_idx").on(table.workspaceId, table.createdAt),
  }),
);
export type RagArenaExperiment = typeof ragArenaExperiments.$inferSelect;
export type RagArenaExperimentInsert = typeof ragArenaExperiments.$inferInsert;

export const knowledgeBaseIndexingPolicy = pgTable("knowledge_base_indexing_policy", {
  id: varchar("id").primaryKey().default("kb_indexing_policy_singleton"),
  embeddingsProvider: varchar("embeddings_provider", { length: 255 }).notNull(),
  embeddingsModel: varchar("embeddings_model", { length: 255 }).notNull(),
  chunkSize: integer("chunk_size").notNull(),
  chunkOverlap: integer("chunk_overlap").notNull(),
  workerConcurrency: integer("worker_concurrency").notNull().default(4),
  embeddingBatchMaxChunks: integer("embedding_batch_max_chunks").notNull().default(8),
  embeddingBatchMaxTokens: integer("embedding_batch_max_tokens").notNull().default(4000),
  qdrantUpsertMaxPoints: integer("qdrant_upsert_max_points").notNull().default(8),
  qdrantUpsertMaxBytes: integer("qdrant_upsert_max_bytes").notNull().default(5000000),
  defaultSchema: jsonb("default_schema").notNull().default(sql`'[]'::jsonb`),
  policyHash: text("policy_hash"),
  updatedByAdminId: varchar("updated_by_admin_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
export type KnowledgeBaseIndexingPolicy = typeof knowledgeBaseIndexingPolicy.$inferSelect;
export type KnowledgeBaseIndexingPolicyInsert = typeof knowledgeBaseIndexingPolicy.$inferInsert;

export const knowledgeBaseIndexingJobStatuses = ["pending", "processing", "completed", "failed", "paused", "canceled"] as const;
export type KnowledgeBaseIndexingJobStatus = (typeof knowledgeBaseIndexingJobStatuses)[number];

export const jsonImportJobStatuses = [
  "pending",
  "processing",
  "completed",
  "completed_with_errors",
  "canceled",
  "failed",
] as const;
export type JsonImportJobStatus = (typeof jsonImportJobStatuses)[number];

export const archiveImportJobStatuses = [
  "pending",
  "processing",
  "completed",
  "completed_with_errors",
  "canceled",
  "failed",
] as const;
export type ArchiveImportJobStatus = (typeof archiveImportJobStatuses)[number];

export const archiveImportItemStatuses = [
  "pending",
  "processing",
  "completed",
  "failed",
  "skipped",
] as const;
export type ArchiveImportItemStatus = (typeof archiveImportItemStatuses)[number];

export const archiveImportConflictPolicies = ["skip", "replace", "new_version"] as const;
export type ArchiveImportConflictPolicy = (typeof archiveImportConflictPolicies)[number];

export const knowledgeDocumentImportJobStatuses = [
  "pending",
  "processing",
  "completed",
  "completed_with_warnings",
  "canceled",
  "failed",
] as const;
export type KnowledgeDocumentImportJobStatus = (typeof knowledgeDocumentImportJobStatuses)[number];

export const knowledgeDocumentImportJobPhases = [
  "queued",
  "xlsx_parsing",
  "persisting_workbook",
  "ai_ocr_preparing",
  "ai_ocr_rendering",
  "ai_ocr_extracting",
  "ai_ocr_finalizing",
  "docling_submitted",
  "docling_waiting",
  "docling_fetching_result",
  "fallback_pdfjs",
  "storing_images",
  "finalizing",
  "completed",
  "failed",
  "canceled",
] as const;
export type KnowledgeDocumentImportJobPhase = (typeof knowledgeDocumentImportJobPhases)[number];

export const knowledgeDocumentImportSourceKinds = ["pdf", "docx", "xlsx", "image"] as const;
export type KnowledgeDocumentImportSourceKind = (typeof knowledgeDocumentImportSourceKinds)[number];

export const knowledgeDocumentImportPipelines = ["docling", "pdfjs", "excel_workbook", "vision_ocr"] as const;
export type KnowledgeDocumentImportPipeline = (typeof knowledgeDocumentImportPipelines)[number];

export const knowledgeDocumentImportModes = ["standard", "ai_ocr"] as const;
export type KnowledgeDocumentImportMode = (typeof knowledgeDocumentImportModes)[number];

export const knowledgeDocumentImportOcrDecisions = ["off", "on", "unsure"] as const;
export type KnowledgeDocumentImportOcrDecision = (typeof knowledgeDocumentImportOcrDecisions)[number];

export const knowledgeImportEntryKinds = [
  "document_file",
  "archive",
  "json_dataset",
  "url_single",
  "url_crawl",
] as const;
export type KnowledgeImportEntryKind = (typeof knowledgeImportEntryKinds)[number];

export const knowledgeImportEntryStatuses = [
  "needs_choice",
  "uploading",
  "needs_config",
  "ready",
  "queued",
  "processing",
  "paused",
  "completed",
  "completed_with_errors",
  "failed",
  "canceled",
] as const;
export type KnowledgeImportEntryStatus = (typeof knowledgeImportEntryStatuses)[number];

export type KnowledgeImportEntryProgress = {
  percent?: number | null;
  uploadedBytes?: number | null;
  totalBytes?: number | null;
  totalItems?: number | null;
  processedItems?: number | null;
  activeItems?: number | null;
  createdItems?: number | null;
  failedItems?: number | null;
  skippedItems?: number | null;
  discoveredItems?: number | null;
  fetchedItems?: number | null;
  savedItems?: number | null;
  errorItems?: number | null;
  currentPart?: number | null;
  totalParts?: number | null;
};

export const knowledgeUploadSourceKinds = [
  "regular_batch",
  "folder_batch",
  "archive_legacy",
  "json_legacy",
  "document_legacy",
] as const;
export type KnowledgeUploadSourceKind = (typeof knowledgeUploadSourceKinds)[number];

export const knowledgeUploadSessionStatuses = [
  "pending",
  "uploading",
  "processing",
  "completed",
  "completed_with_errors",
  "failed",
  "canceled",
] as const;
export type KnowledgeUploadSessionStatus = (typeof knowledgeUploadSessionStatuses)[number];

export const knowledgeUploadImportKinds = [
  "document_file",
  "archive",
  "json_dataset",
] as const;
export type KnowledgeUploadImportKind = (typeof knowledgeUploadImportKinds)[number];

export const knowledgeUploadStrategies = ["multipart"] as const;
export type KnowledgeUploadStrategy = (typeof knowledgeUploadStrategies)[number];

export const knowledgeUploadItemUploadStatuses = [
  "pending",
  "uploading",
  "uploaded",
  "failed",
  "canceled",
] as const;
export type KnowledgeUploadItemUploadStatus = (typeof knowledgeUploadItemUploadStatuses)[number];

export const knowledgeUploadItemProcessingStatuses = [
  "pending",
  "ready",
  "needs_config",
  "queued",
  "processing",
  "paused",
  "completed",
  "completed_with_errors",
  "failed",
  "canceled",
] as const;
export type KnowledgeUploadItemProcessingStatus = (typeof knowledgeUploadItemProcessingStatuses)[number];

export type KnowledgeUploadSessionUploadedPart = {
  partNumber: number;
  etag: string;
  size: number;
  checksumSha256?: string | null;
  uploadedAt: string;
};

export const knowledgeImportEntries = pgTable(
  "knowledge_import_entries",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: varchar("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    baseId: varchar("base_id")
      .notNull()
      .references(() => knowledgeBases.id, { onDelete: "cascade" }),
    parentId: varchar("parent_id"),
    slotPosition: integer("slot_position").notNull().default(0),
    kind: text("kind").$type<KnowledgeImportEntryKind>().notNull(),
    title: text("title").notNull(),
    status: text("status").$type<KnowledgeImportEntryStatus>().notNull().default("ready"),
    phase: text("phase"),
    progress: jsonb("progress").$type<KnowledgeImportEntryProgress>().notNull().default(sql`'{}'::jsonb`),
    sourcePayload: jsonb("source_payload").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    configDraft: jsonb("config_draft").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    executorKind: text("executor_kind"),
    executorJobId: text("executor_job_id"),
    resultNodeId: varchar("result_node_id"),
    resultSummary: jsonb("result_summary").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    errorMessage: text("error_message"),
    createdByUserId: varchar("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    baseParentIdx: index("knowledge_import_entries_base_parent_idx").on(table.baseId, table.parentId, table.updatedAt),
    baseParentSlotIdx: index("knowledge_import_entries_base_parent_slot_idx").on(
      table.baseId,
      table.parentId,
      table.slotPosition,
      table.createdAt,
    ),
    baseStatusIdx: index("knowledge_import_entries_base_status_idx").on(table.baseId, table.status, table.updatedAt),
    executorIdx: index("knowledge_import_entries_executor_idx").on(table.executorKind, table.executorJobId),
    workspaceBaseIdx: index("knowledge_import_entries_workspace_base_idx").on(table.workspaceId, table.baseId, table.updatedAt),
  }),
);
export type KnowledgeImportEntry = typeof knowledgeImportEntries.$inferSelect;
export type KnowledgeImportEntryInsert = typeof knowledgeImportEntries.$inferInsert;

export const knowledgeUploadSessions = pgTable(
  "knowledge_upload_sessions",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: varchar("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    baseId: varchar("base_id")
      .notNull()
      .references(() => knowledgeBases.id, { onDelete: "cascade" }),
    parentId: varchar("parent_id"),
    createdByUserId: varchar("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    clientSessionKey: text("client_session_key").notNull(),
    sourceKind: text("source_kind").$type<KnowledgeUploadSourceKind>().notNull(),
    status: text("status").$type<KnowledgeUploadSessionStatus>().notNull().default("pending"),
    totalItems: integer("total_items").notNull().default(0),
    uploadingItems: integer("uploading_items").notNull().default(0),
    uploadedItems: integer("uploaded_items").notNull().default(0),
    processingItems: integer("processing_items").notNull().default(0),
    completedItems: integer("completed_items").notNull().default(0),
    failedItems: integer("failed_items").notNull().default(0),
    canceledItems: integer("canceled_items").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => ({
    workspaceBaseIdx: index("knowledge_upload_sessions_workspace_base_idx").on(
      table.workspaceId,
      table.baseId,
      table.updatedAt,
    ),
    statusIdx: index("knowledge_upload_sessions_status_idx").on(table.status, table.updatedAt),
    clientSessionIdx: index("knowledge_upload_sessions_client_session_idx").on(
      table.workspaceId,
      table.clientSessionKey,
    ),
  }),
);
export type KnowledgeUploadSession = typeof knowledgeUploadSessions.$inferSelect;
export type KnowledgeUploadSessionInsert = typeof knowledgeUploadSessions.$inferInsert;

export const knowledgeUploadSessionItems = pgTable(
  "knowledge_upload_session_items",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => knowledgeUploadSessions.id, { onDelete: "cascade" }),
    clientFileKey: text("client_file_key").notNull(),
    relativePath: text("relative_path"),
    fileName: text("file_name").notNull(),
    fileSize: bigint("file_size", { mode: "number" }).notNull().default(0),
    mimeType: text("mime_type"),
    importKind: text("import_kind").$type<KnowledgeUploadImportKind>().notNull(),
    uploadStrategy: text("upload_strategy").$type<KnowledgeUploadStrategy>().notNull().default("multipart"),
    storageKey: text("storage_key"),
    multipartUploadId: text("multipart_upload_id"),
    chunkSize: integer("chunk_size"),
    totalParts: integer("total_parts"),
    uploadedParts: jsonb("uploaded_parts")
      .$type<KnowledgeUploadSessionUploadedPart[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    uploadedBytes: bigint("uploaded_bytes", { mode: "number" }).notNull().default(0),
    uploadStatus: text("upload_status")
      .$type<KnowledgeUploadItemUploadStatus>()
      .notNull()
      .default("pending"),
    processingStatus: text("processing_status")
      .$type<KnowledgeUploadItemProcessingStatus>()
      .notNull()
      .default("pending"),
    importOptions: jsonb("import_options").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    importEntryId: uuid("import_entry_id").references(() => knowledgeImportEntries.id, { onDelete: "set null" }),
    executorJobId: text("executor_job_id"),
    checksumSha256: text("checksum_sha256"),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
    uploadStartedAt: timestamp("upload_started_at", { withTimezone: true }),
    uploadCompletedAt: timestamp("upload_completed_at", { withTimezone: true }),
    processingStartedAt: timestamp("processing_started_at", { withTimezone: true }),
    processingCompletedAt: timestamp("processing_completed_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    sessionIdx: index("knowledge_upload_session_items_session_idx").on(table.sessionId, table.createdAt),
    clientFileIdx: index("knowledge_upload_session_items_client_file_idx").on(table.sessionId, table.clientFileKey),
    uploadStatusIdx: index("knowledge_upload_session_items_upload_status_idx").on(table.uploadStatus, table.updatedAt),
    processingStatusIdx: index("knowledge_upload_session_items_processing_status_idx").on(
      table.processingStatus,
      table.updatedAt,
    ),
    importEntryIdx: index("knowledge_upload_session_items_import_entry_idx").on(table.importEntryId),
    executorJobIdx: index("knowledge_upload_session_items_executor_job_idx").on(table.executorJobId),
  }),
);
export type KnowledgeUploadSessionItem = typeof knowledgeUploadSessionItems.$inferSelect;
export type KnowledgeUploadSessionItemInsert = typeof knowledgeUploadSessionItems.$inferInsert;

export type KnowledgeDocumentImportPreflightPageSummary = {
  pageNumber: number;
  textChars: number;
  alphaNumChars: number;
  alphaRatio: number;
  hasUsefulText: boolean;
};

export type KnowledgeDocumentImportPreflightSummary = {
  sampledPageNumbers: number[];
  sampledPageCount: number;
  usefulPageCount: number;
  usefulPageRatio: number;
  totalSampleTextChars: number;
  recommendation: KnowledgeDocumentImportOcrDecision;
  pages: KnowledgeDocumentImportPreflightPageSummary[];
};

export const knowledgeBaseIndexingJobs = pgTable(
  "knowledge_base_indexing_jobs",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    jobType: text("job_type").notNull().default("knowledge_base_indexing"),
    workspaceId: varchar("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    baseId: varchar("base_id")
      .notNull()
      .references(() => knowledgeBases.id, { onDelete: "cascade" }),
    documentId: varchar("document_id")
      .notNull()
      .references(() => knowledgeDocuments.id, { onDelete: "cascade" }),
    versionId: varchar("version_id")
      .notNull()
      .references(() => knowledgeDocumentVersions.id, { onDelete: "cascade" }),
    status: text("status").$type<KnowledgeBaseIndexingJobStatus>().notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),
    lastError: text("last_error"),
    chunkCount: integer("chunk_count"),
    totalChars: integer("total_chars"),
    totalTokens: integer("total_tokens"),
    createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    uniqueJobIdx: uniqueIndex("knowledge_base_indexing_jobs_unique_job_idx").on(
      table.jobType,
      table.documentId,
      table.versionId,
    ),
    workspaceIdx: index("knowledge_base_indexing_jobs_workspace_idx").on(
      table.workspaceId,
      table.status,
      table.nextRetryAt,
    ),
    baseIdx: index("knowledge_base_indexing_jobs_base_idx").on(table.baseId, table.status, table.nextRetryAt),
    // 0260: FK-индексы под каскад удаления документа/версии (document_id/version_id — оба лишь внутри
    // составного unique-индекса, не ведущие → seq-scan дочерней таблицы при DELETE documents/versions).
    versionIdx: index("knowledge_base_indexing_jobs_version_id_idx").on(table.versionId),
    documentIdx: index("knowledge_base_indexing_jobs_document_id_idx").on(table.documentId),
  }),
);
export type KnowledgeBaseIndexingJob = typeof knowledgeBaseIndexingJobs.$inferSelect;
export type KnowledgeBaseIndexingJobInsert = typeof knowledgeBaseIndexingJobs.$inferInsert;

export type KnowledgeDeleteJobStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "canceled";
export type KnowledgeDeleteJobType = "delete_base" | "delete_node";

export const knowledgeDeleteJobs = pgTable(
  "knowledge_delete_jobs",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    jobType: text("job_type").$type<KnowledgeDeleteJobType>().notNull(),
    workspaceId: varchar("workspace_id").notNull(),
    baseId: varchar("base_id").notNull(),
    nodeId: varchar("node_id"),
    status: text("status").$type<KnowledgeDeleteJobStatus>().notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    requestedByUserId: varchar("requested_by_user_id"),
    payload: jsonb("payload").notNull().default(sql`'{}'::jsonb`),
    error: text("error"),
    nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => ({
    workspaceStatusIdx: index("knowledge_delete_jobs_workspace_status_idx").on(
      table.workspaceId,
      table.status,
      table.nextRetryAt,
    ),
    baseStatusIdx: index("knowledge_delete_jobs_base_status_idx").on(
      table.baseId,
      table.status,
      table.nextRetryAt,
    ),
    scopeIdx: index("knowledge_delete_jobs_scope_idx").on(
      table.workspaceId,
      table.baseId,
      table.nodeId,
      table.status,
      table.createdAt,
    ),
    createdAtIdx: index("knowledge_delete_jobs_created_at_idx").on(table.createdAt),
    activeNodeUniqueIdx: uniqueIndex("knowledge_delete_jobs_active_node_idx")
      .on(table.workspaceId, table.baseId, table.nodeId)
      .where(sql`job_type = 'delete_node' AND status IN ('pending', 'processing')`),
    activeBaseDeleteUniqueIdx: uniqueIndex("knowledge_delete_jobs_active_base_delete_idx")
      .on(table.workspaceId, table.baseId)
      .where(sql`job_type = 'delete_base' AND status IN ('pending', 'processing')`),
  }),
);
export type KnowledgeDeleteJob = typeof knowledgeDeleteJobs.$inferSelect;
export type KnowledgeDeleteJobInsert = typeof knowledgeDeleteJobs.$inferInsert;

export const jsonImportJobs = pgTable(
  "json_import_jobs",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    importEntryId: uuid("import_entry_id").references(() => knowledgeImportEntries.id, { onDelete: "set null" }),
    workspaceId: varchar("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    baseId: varchar("base_id")
      .notNull()
      .references(() => knowledgeBases.id, { onDelete: "cascade" }),
    status: text("status")
      .$type<JsonImportJobStatus>()
      .notNull()
      .default("pending"),
    mappingConfig: jsonb("mapping_config").notNull().default(sql`'{}'::jsonb`),
    hierarchyConfig: jsonb("hierarchy_config").notNull().default(sql`'{}'::jsonb`),
    totalRecords: integer("total_records").notNull().default(0),
    processedRecords: integer("processed_records").notNull().default(0),
    createdDocuments: integer("created_documents").notNull().default(0),
    skippedRecords: integer("skipped_records").notNull().default(0),
    errorRecords: integer("error_records").notNull().default(0),
    sourceFileKey: text("source_file_key").notNull(),
    sourceFileName: text("source_file_name").notNull(),
    sourceFileSize: bigint("source_file_size", { mode: "number" }).notNull().default(0),
    sourceFileFormat: text("source_file_format")
      .$type<"json" | "jsonl">()
      .notNull(),
    attempts: integer("attempts").notNull().default(0),
    nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),
    lastError: text("last_error"),
    errorLog: jsonb("error_log").notNull().default(sql`'[]'::jsonb`),
    createdByUserId: varchar("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    workspaceBaseIdx: index("json_import_jobs_workspace_base_idx").on(
      table.workspaceId,
      table.baseId,
    ),
    statusIdx: index("json_import_jobs_status_idx").on(table.status, table.createdAt),
    nextRetryIdx: index("json_import_jobs_next_retry_idx").on(table.nextRetryAt),
    // 0260: FK-индекс под каскад удаления БЗ (base_id; в составном он 2-й после workspace_id).
    baseIdx: index("json_import_jobs_base_id_idx").on(table.baseId),
  }),
);
export type JsonImportJob = typeof jsonImportJobs.$inferSelect;
export type JsonImportJobInsert = typeof jsonImportJobs.$inferInsert;

export const archiveImportJobs = pgTable(
  "archive_import_jobs",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    importEntryId: uuid("import_entry_id").references(() => knowledgeImportEntries.id, { onDelete: "set null" }),
    workspaceId: varchar("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    baseId: varchar("base_id")
      .notNull()
      .references(() => knowledgeBases.id, { onDelete: "cascade" }),
    status: text("status")
      .$type<ArchiveImportJobStatus>()
      .notNull()
      .default("pending"),
    archiveFileKey: text("archive_file_key").notNull(),
    archiveFileName: text("archive_file_name").notNull(),
    archiveFileSize: bigint("archive_file_size", { mode: "number" }).notNull().default(0),
    archiveFormat: text("archive_format")
      .$type<"zip" | "rar" | "7z" | "unknown">()
      .notNull()
      .default("unknown"),
    parentId: varchar("parent_id"),
    conflictPolicy: text("conflict_policy")
      .$type<ArchiveImportConflictPolicy>()
      .notNull()
      .default("skip"),
    totalItems: integer("total_items").notNull().default(0),
    processedItems: integer("processed_items").notNull().default(0),
    createdItems: integer("created_items").notNull().default(0),
    failedItems: integer("failed_items").notNull().default(0),
    skippedItems: integer("skipped_items").notNull().default(0),
    attempts: integer("attempts").notNull().default(0),
    nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),
    lastError: text("last_error"),
    errorLog: jsonb("error_log").notNull().default(sql`'[]'::jsonb`),
    createdByUserId: varchar("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    workspaceBaseIdx: index("archive_import_jobs_workspace_base_idx").on(table.workspaceId, table.baseId),
    statusIdx: index("archive_import_jobs_status_idx").on(table.status, table.createdAt),
    nextRetryIdx: index("archive_import_jobs_next_retry_idx").on(table.nextRetryAt),
    // 0260: FK-индекс под каскад удаления БЗ (base_id; в составном он 2-й после workspace_id).
    baseIdx: index("archive_import_jobs_base_id_idx").on(table.baseId),
  }),
);
export type ArchiveImportJob = typeof archiveImportJobs.$inferSelect;
export type ArchiveImportJobInsert = typeof archiveImportJobs.$inferInsert;

export const knowledgeDocumentImportJobs = pgTable(
  "knowledge_document_import_jobs",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    importEntryId: uuid("import_entry_id").references(() => knowledgeImportEntries.id, { onDelete: "set null" }),
    workspaceId: varchar("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    baseId: varchar("base_id")
      .notNull()
      .references(() => knowledgeBases.id, { onDelete: "cascade" }),
    parentId: varchar("parent_id"),
    createdByUserId: varchar("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    status: text("status")
      .$type<KnowledgeDocumentImportJobStatus>()
      .notNull()
      .default("pending"),
    phase: text("phase")
      .$type<KnowledgeDocumentImportJobPhase>()
      .notNull()
      .default("queued"),
    percent: integer("percent").notNull().default(0),
    sourceFileKey: text("source_file_key").notNull(),
    sourceFileName: text("source_file_name").notNull(),
    documentTitle: text("document_title").notNull(),
    sourceFileSize: bigint("source_file_size", { mode: "number" }).notNull().default(0),
    sourceMimeType: text("source_mime_type"),
    sourceFileKind: text("source_file_kind")
      .$type<KnowledgeDocumentImportSourceKind>()
      .notNull(),
    importMode: text("import_mode")
      .$type<KnowledgeDocumentImportMode>()
      .notNull()
      .default("standard"),
    ocrProviderId: varchar("ocr_provider_id"),
    ocrModel: text("ocr_model"),
    attempts: integer("attempts").notNull().default(0),
    nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),
    doclingTaskId: text("docling_task_id"),
    ocrDecision: text("ocr_decision").$type<KnowledgeDocumentImportOcrDecision>(),
    ocrUsed: boolean("ocr_used"),
    doclingAttempt: integer("docling_attempt").notNull().default(0),
    preflightSummary: jsonb("preflight_summary").$type<KnowledgeDocumentImportPreflightSummary | null>(),
    pipelineUsed: text("pipeline_used").$type<KnowledgeDocumentImportPipeline>(),
    fallbackReasonCode: text("fallback_reason_code"),
    fallbackReasonMessage: text("fallback_reason_message"),
    warningCode: text("warning_code"),
    warningMessage: text("warning_message"),
    lastError: text("last_error"),
    errorLog: jsonb("error_log").notNull().default(sql`'[]'::jsonb`),
    createdDocumentNodeId: varchar("created_document_node_id"),
    createdDocumentId: varchar("created_document_id"),
    createdVersionId: varchar("created_version_id").references(() => knowledgeDocumentVersions.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    workspaceBaseIdx: index("knowledge_document_import_jobs_workspace_base_idx").on(table.workspaceId, table.baseId),
    statusIdx: index("knowledge_document_import_jobs_status_idx").on(table.status, table.createdAt),
    nextRetryIdx: index("knowledge_document_import_jobs_next_retry_idx").on(table.nextRetryAt),
    taskIdIdx: index("knowledge_document_import_jobs_docling_task_idx").on(table.doclingTaskId),
    // 0260: FK-индекс под каскад удаления БЗ (base_id; в составном он 2-й после workspace_id).
    baseIdx: index("knowledge_document_import_jobs_base_id_idx").on(table.baseId),
  }),
);
export type KnowledgeDocumentImportJob = typeof knowledgeDocumentImportJobs.$inferSelect;
export type KnowledgeDocumentImportJobInsert = typeof knowledgeDocumentImportJobs.$inferInsert;

export const archiveImportJobItems = pgTable(
  "archive_import_job_items",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    jobId: uuid("job_id")
      .notNull()
      .references(() => archiveImportJobs.id, { onDelete: "cascade" }),
    workspaceId: varchar("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    baseId: varchar("base_id")
      .notNull()
      .references(() => knowledgeBases.id, { onDelete: "cascade" }),
    relativePath: text("relative_path").notNull(),
    normalizedPath: text("normalized_path").notNull(),
    status: text("status")
      .$type<ArchiveImportItemStatus>()
      .notNull()
      .default("pending"),
    documentTitle: text("document_title"),
    fileSize: bigint("file_size", { mode: "number" }).notNull().default(0),
    contentType: text("content_type"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    retryCount: integer("retry_count").notNull().default(0),
    createdNodeId: varchar("created_node_id"),
    createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    jobStatusIdx: index("archive_import_job_items_job_status_idx").on(table.jobId, table.status),
    workspaceBaseStatusIdx: index("archive_import_job_items_workspace_base_status_idx").on(
      table.workspaceId,
      table.baseId,
      table.status,
    ),
    uniquePathPerJobIdx: uniqueIndex("archive_import_job_items_job_path_unique_idx").on(
      table.jobId,
      table.normalizedPath,
    ),
    // 0260: FK-индекс под каскад удаления БЗ (base_id; в составном он 2-й после workspace_id).
    baseIdx: index("archive_import_job_items_base_id_idx").on(table.baseId),
  }),
);
export type ArchiveImportJobItem = typeof archiveImportJobItems.$inferSelect;
export type ArchiveImportJobItemInsert = typeof archiveImportJobItems.$inferInsert;

export const knowledgeDocumentIndexRevisionStatuses = [
  "processing",
  "ready",
  "failed",
  "canceled",
] as const;
export type KnowledgeDocumentIndexRevisionStatus =
  (typeof knowledgeDocumentIndexRevisionStatuses)[number];

export const knowledgeDocumentIndexRevisions = pgTable(
  "knowledge_document_index_revisions",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: varchar("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    baseId: varchar("base_id")
      .notNull()
      .references(() => knowledgeBases.id, { onDelete: "cascade" }),
    documentId: varchar("document_id")
      .notNull()
      .references(() => knowledgeDocuments.id, { onDelete: "cascade" }),
    versionId: varchar("version_id").references(() => knowledgeDocumentVersions.id, {
      onDelete: "set null",
    }),
    chunkSetId: varchar("chunk_set_id").references(() => knowledgeDocumentChunkSets.id, {
      onDelete: "set null",
    }),
    policyHash: text("policy_hash"),
    embeddingProviderId: varchar("embedding_provider_id", { length: 255 }),
    embeddingModel: text("embedding_model"),
    status: text("status")
      .$type<KnowledgeDocumentIndexRevisionStatus>()
      .notNull()
      .default("processing"),
    error: text("error"),
    startedAt: timestamp("started_at"),
    finishedAt: timestamp("finished_at"),
    chunkCount: integer("chunk_count").notNull().default(0),
    totalTokens: integer("total_tokens").notNull().default(0),
    totalChars: integer("total_chars").notNull().default(0),
    createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    documentIdx: index("knowledge_document_index_revisions_document_idx").on(
      table.documentId,
      table.createdAt,
    ),
    workspaceBaseStatusIdx: index(
      "knowledge_document_index_revisions_workspace_base_status_idx",
    ).on(table.workspaceId, table.baseId, table.status),
    // FK-индексы под SET NULL при каскаде удаления версий/чанк-сетов.
    versionIdx: index("knowledge_document_index_revisions_version_id_idx").on(table.versionId),
    chunkSetIdx: index("knowledge_document_index_revisions_chunk_set_id_idx").on(table.chunkSetId),
    // 0260: FK-индекс под каскад удаления БЗ (base_id; в составном он лишь 2-й после workspace_id).
    baseIdx: index("knowledge_document_index_revisions_base_id_idx").on(table.baseId),
  }),
);

export const knowledgeDocumentIndexStatuses = [
  "not_indexed",
  "outdated",
  "indexing",
  "up_to_date",
  "skipped",
  "error",
] as const;
export type KnowledgeDocumentIndexStatus = (typeof knowledgeDocumentIndexStatuses)[number];

export const knowledgeBaseIndexStatuses = [
  "not_indexed",
  "outdated",
  "indexing",
  "up_to_date",
  "partial",
  "error",
] as const;
export type KnowledgeBaseIndexStatus = (typeof knowledgeBaseIndexStatuses)[number];

export const knowledgeDocumentIndexState = pgTable(
  "knowledge_document_index_state",
  {
    workspaceId: varchar("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    baseId: varchar("base_id")
      .notNull()
      .references(() => knowledgeBases.id, { onDelete: "cascade" }),
    documentId: varchar("document_id")
      .notNull()
      .references(() => knowledgeDocuments.id, { onDelete: "cascade" }),
    indexedVersionId: varchar("indexed_version_id").references(() => knowledgeDocumentVersions.id, {
      onDelete: "set null",
    }),
    chunkSetId: varchar("chunk_set_id").references(() => knowledgeDocumentChunkSets.id, {
      onDelete: "set null",
    }),
    policyHash: text("policy_hash"),
    embeddingProviderId: varchar("embedding_provider_id", { length: 255 }),
    embeddingModel: text("embedding_model"),
    status: text("status")
      .$type<KnowledgeDocumentIndexStatus>()
      .notNull()
      .default("not_indexed"),
    error: text("error"),
    indexedAt: timestamp("indexed_at"),
    createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.workspaceId, table.baseId, table.documentId] }),
    baseStatusIdx: index("knowledge_document_index_state_base_status_idx").on(
      table.baseId,
      table.status,
    ),
    workspaceBaseIdx: index("knowledge_document_index_state_workspace_base_idx").on(
      table.workspaceId,
      table.baseId,
    ),
    documentIdx: index("knowledge_document_index_state_document_idx").on(table.documentId),
    // FK-индексы под SET NULL при каскаде удаления версий/чанк-сетов.
    indexedVersionIdx: index("knowledge_document_index_state_indexed_version_id_idx").on(
      table.indexedVersionId,
    ),
    chunkSetIdx: index("knowledge_document_index_state_chunk_set_id_idx").on(table.chunkSetId),
  }),
);
export type KnowledgeDocumentIndexStateRecord = typeof knowledgeDocumentIndexState.$inferSelect;
export type KnowledgeDocumentIndexStateInsert = typeof knowledgeDocumentIndexState.$inferInsert;

export const knowledgeBaseIndexState = pgTable(
  "knowledge_base_index_state",
  {
    workspaceId: varchar("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    baseId: varchar("base_id")
      .notNull()
      .references(() => knowledgeBases.id, { onDelete: "cascade" }),
    status: text("status")
      .$type<KnowledgeBaseIndexStatus>()
      .notNull()
      .default("not_indexed"),
    totalDocuments: integer("total_documents").notNull().default(0),
    outdatedDocuments: integer("outdated_documents").notNull().default(0),
    indexingDocuments: integer("indexing_documents").notNull().default(0),
    errorDocuments: integer("error_documents").notNull().default(0),
    upToDateDocuments: integer("up_to_date_documents").notNull().default(0),
    policyHash: text("policy_hash"),
    embeddingProviderId: varchar("embedding_provider_id", { length: 255 }),
    embeddingModel: text("embedding_model"),
    createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.workspaceId, table.baseId] }),
    statusIdx: index("knowledge_base_index_state_status_idx").on(table.workspaceId, table.status),
    // 0260: FK-индекс под каскад удаления БЗ (base_id; в PK он 2-й после workspace_id).
    baseIdx: index("knowledge_base_index_state_base_id_idx").on(table.baseId),
  }),
);
export type KnowledgeBaseIndexStateRecord = typeof knowledgeBaseIndexState.$inferSelect;
export type KnowledgeBaseIndexStateInsert = typeof knowledgeBaseIndexState.$inferInsert;

export const indexingStages = [
  "initializing",
  "creating_collection",
  "chunking",
  "vectorizing",
  "uploading",
  "verifying",
  "completed",
  "error",
] as const;
export type IndexingStage = (typeof indexingStages)[number];

export const knowledgeBaseIndexingActionStatuses = ["processing", "paused", "canceled", "done", "error"] as const;
export type KnowledgeBaseIndexingActionStatus = (typeof knowledgeBaseIndexingActionStatuses)[number];

export type KnowledgeBaseIndexingAction = {
  workspaceId: string;
  baseId: string;
  actionId: string;
  status: KnowledgeBaseIndexingActionStatus;
  stage: IndexingStage;
  displayText?: string | null;
  payload?: Record<string, unknown> | null;
  userId?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export const knowledgeBaseIndexingActionSchema = z.object({
  workspaceId: z.string().min(1),
  baseId: z.string().min(1),
  actionId: z.string().min(1),
  status: z.enum(knowledgeBaseIndexingActionStatuses),
  stage: z.enum(indexingStages),
  displayText: z.string().nullable().optional(),
  payload: z.record(z.string(), z.any()).nullable().optional(),
  userId: z.string().nullable().optional(),
  createdAt: z.string().datetime().nullable().optional(),
  updatedAt: z.string().datetime().nullable().optional(),
});

export type IndexingHistoryItem = {
  actionId: string;
  status: KnowledgeBaseIndexingActionStatus;
  stage: IndexingStage;
  displayText: string | null;
  startedAt: string;
  finishedAt: string | null;
  userId: string | null;
  userName: string | null;
  userEmail: string | null;
  totalDocuments: number;
  processedDocuments: number;
  failedDocuments: number;
  totalChunks: number;
};

export type IndexingHistoryResponse = {
  items: IndexingHistoryItem[];
  total: number;
};

export type IndexingLogResponse = {
  config?: Record<string, unknown> | null;
  events?: Array<{
    timestamp: string;
    stage: string;
    message: string;
    error?: string;
    metadata?: Record<string, unknown>;
  }> | null;
  errors?: Array<{
    documentId: string;
    documentTitle: string;
    error: string;
    stage: string;
    timestamp: string;
  }> | null;
  actionId: string;
  summary: {
    status: KnowledgeBaseIndexingActionStatus;
    stage: IndexingStage;
    displayText: string | null;
    startedAt: string;
    finishedAt: string | null;
    userId: string | null;
    userName: string | null;
    userEmail: string | null;
    totalDocuments: number;
    processedDocuments: number;
    failedDocuments: number;
    totalChunks: number;
  };
  jobs: Array<{
    jobId: string;
    documentId: string;
    documentTitle: string;
    versionId: string;
    status: "pending" | "processing" | "completed" | "failed";
    chunkCount: number | null;
    totalChars: number | null;
    totalTokens: number | null;
    error: string | null;
    attempts: number;
    startedAt: string | null;
    finishedAt: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
};

export const knowledgeBaseIndexingActions = pgTable(
  "knowledge_base_indexing_actions",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: varchar("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    baseId: varchar("base_id")
      .notNull()
      .references(() => knowledgeBases.id, { onDelete: "cascade" }),
    actionId: text("action_id").notNull(),
    status: text("status").$type<KnowledgeBaseIndexingActionStatus>().notNull().default("processing"),
    stage: text("stage").$type<IndexingStage>().notNull(),
    displayText: text("display_text"),
    payload: jsonb("payload").$type<Record<string, unknown> | null>().default(sql`'{}'::jsonb`),
    userId: varchar("user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (table) => ({
    createdAtIdx: index("knowledge_base_indexing_actions_created_at_idx").on(table.createdAt),
    baseIdx: index("knowledge_base_indexing_actions_base_idx").on(table.workspaceId, table.baseId, table.updatedAt),
    statusIdx: index("knowledge_base_indexing_actions_status_idx").on(
      table.workspaceId,
      table.baseId,
      table.status,
    ),
    userIdx: index("knowledge_base_indexing_actions_user_idx").on(table.workspaceId, table.baseId, table.userId),
    uniqueAction: uniqueIndex("knowledge_base_indexing_actions_unique_idx").on(
      table.workspaceId,
      table.baseId,
      table.actionId,
    ),
    // 0260: FK-индекс под каскад удаления БЗ (base_id ведущим; в существующих индексах он 2-й).
    baseFkIdx: index("knowledge_base_indexing_actions_base_id_idx").on(table.baseId),
  }),
);
export type KnowledgeBaseIndexingActionRecord = typeof knowledgeBaseIndexingActions.$inferSelect;
export type KnowledgeBaseIndexingActionInsert = typeof knowledgeBaseIndexingActions.$inferInsert;

export const knowledgeBaseNodeTypes = ["folder", "document"] as const;
export type KnowledgeBaseNodeType = (typeof knowledgeBaseNodeTypes)[number];

export const knowledgeNodeSourceTypes = ["manual", "import", "crawl", "json_import"] as const;
export type KnowledgeNodeSourceType = (typeof knowledgeNodeSourceTypes)[number];

export const knowledgeBases = pgTable("knowledge_bases", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull().default("База знаний"),
  description: text("description").notNull().default(""),
  /** Whether this KB has any resource_access_rules — used for fast pre-filter */
  hasAccessRules: boolean("has_access_rules").notNull().default(false),
  /**
   * Whether this KB has at least one active cross-workspace grant (knowledge_base_grants).
   * Денорм-флаг (по образцу hasAccessRules) для быстрого pre-filter листинга, чтобы не JOIN-ить
   * грант-таблицу на каждый листинг собственных KB. Источник истины — knowledge_base_grants;
   * поддерживается приложением при выдаче/отзыве гранта. Только on-prem (см. server/acl/kb-share-grants.ts).
   */
  isShared: boolean("is_shared").notNull().default(false),
  /**
   * Расшарена ли KB ВСЕМ пространствам инстанса (on-prem). Один флаг вместо N грантов: доступ
   * получают все текущие И будущие пространства. Источник истины для instance-уровня шаринга
   * (per-workspace гранты — в knowledge_base_grants). Только on-prem (server/acl/kb-share-grants.ts).
   */
  instanceShared: boolean("instance_shared").notNull().default(false),
  indexingConfigOverride: jsonb("indexing_config_override").$type<KnowledgeBaseIndexingOverride | null>(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const knowledgeNodeTypeEnum = pgEnum("knowledge_node_type", ["folder", "document"]);
export const knowledgeNodes = pgTable(
  "knowledge_nodes",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    baseId: varchar("base_id")
      .notNull()
      .references(() => knowledgeBases.id, { onDelete: "cascade" }),
    workspaceId: varchar("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    parentId: varchar("parent_id"),
    title: text("title").notNull().default("Без названия"),
    type: knowledgeNodeTypeEnum("type").$type<KnowledgeBaseNodeType>().notNull().default("document"),
    content: text("content"),
    slug: text("slug").notNull().default(""),
    path: ltree("path").notNull(),
    sourceType: text("source_type")
      .$type<KnowledgeNodeSourceType>()
      .notNull()
      .default("manual"),
    sourceConfig: jsonb("source_config")
      .$type<Record<string, unknown> | null>(),
    importFileName: text("import_file_name"),
    position: doublePrecision("position").notNull().default(0),
    /** Whether this node has any resource_access_rules — used for fast pre-filter */
    hasAccessRules: boolean("has_access_rules").notNull().default(false),
    createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (table) => ({
    parentReference: foreignKey({
      columns: [table.parentId],
      foreignColumns: [table.id],
      name: "knowledge_nodes_parent_id_fkey",
    }).onDelete("cascade"),
    baseSlugUnique: uniqueIndex("knowledge_nodes_base_slug_idx").on(
      table.baseId,
      table.slug,
    ),
  }),
);

export const knowledgeDocumentStatuses = ["draft", "published", "archived"] as const;
export type KnowledgeDocumentStatus = (typeof knowledgeDocumentStatuses)[number];

export const knowledgeDocuments = pgTable(
  "knowledge_documents",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    baseId: varchar("base_id")
      .notNull()
      .references(() => knowledgeBases.id, { onDelete: "cascade" }),
    workspaceId: varchar("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    nodeId: varchar("node_id")
      .notNull()
      .references(() => knowledgeNodes.id, { onDelete: "cascade" }),
    status: text("status")
      .$type<KnowledgeDocumentStatus>()
      .notNull()
      .default("draft"),
    currentVersionId: varchar("current_version_id"),
    currentRevisionId: varchar("current_revision_id"),
    sourceUrl: text("source_url"),
    contentHash: text("content_hash"),
    language: text("language"),
    versionTag: text("version_tag"),
    crawledAt: timestamp("crawled_at", { withTimezone: true }),
    metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (table) => ({
    nodeUnique: uniqueIndex("knowledge_documents_node_id_key").on(table.nodeId),
    currentRevisionIdx: index("knowledge_documents_current_revision_idx").on(
      table.currentRevisionId,
    ),
    // 0260: FK-индекс под SET NULL при удалении версии + JOIN по текущей версии (current_version_id).
    currentVersionIdx: index("knowledge_documents_current_version_id_idx").on(
      table.currentVersionId,
    ),
  }),
);

export const knowledgeDocumentVersions = pgTable(
  "knowledge_document_versions",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    documentId: varchar("document_id")
      .notNull()
      .references(() => knowledgeDocuments.id, { onDelete: "cascade" }),
    workspaceId: varchar("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    versionNo: integer("version_no").notNull(),
    authorId: varchar("author_id").references(() => users.id, { onDelete: "set null" }),
    contentJson: jsonb("content_json")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    contentText: text("content_text").notNull().default(""),
    hash: text("hash"),
    wordCount: integer("word_count").notNull().default(0),
    createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (table) => ({
    documentVersionUnique: uniqueIndex(
      "knowledge_document_versions_document_version_idx",
    ).on(table.documentId, table.versionNo),
  }),
);

export const knowledgeDocumentRenderSegments = pgTable(
  "knowledge_document_render_segments",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: varchar("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    documentId: varchar("document_id")
      .notNull()
      .references(() => knowledgeDocuments.id, { onDelete: "cascade" }),
    versionId: varchar("version_id")
      .notNull()
      .references(() => knowledgeDocumentVersions.id, { onDelete: "cascade" }),
    blockIndex: integer("block_index").notNull(),
    blockId: text("block_id"),
    blockType: text("block_type").notNull(),
    html: text("html").notNull(),
    plainText: text("plain_text").notNull().default(""),
    charCount: integer("char_count").notNull().default(0),
    contentHash: text("content_hash").notNull(),
    createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (table) => ({
    versionIndexUnique: uniqueIndex(
      "knowledge_document_render_segments_version_index_idx",
    ).on(table.versionId, table.blockIndex),
    documentVersionIndex: index("knowledge_document_render_segments_document_version_idx").on(
      table.documentId,
      table.versionId,
    ),
    workspaceIndex: index("knowledge_document_render_segments_workspace_idx").on(table.workspaceId),
  }),
);

export interface KnowledgeExcelRangeBounds {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
}

export interface KnowledgeExcelImportWarning {
  code: string;
  message: string;
  meta?: Record<string, unknown>;
}

export interface KnowledgeExcelPreviewRow {
  rowIndex: number;
  values: string[];
}

export const knowledgeExcelWorkbooks = pgTable(
  "knowledge_excel_workbooks",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: varchar("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    baseId: varchar("base_id")
      .notNull()
      .references(() => knowledgeBases.id, { onDelete: "cascade" }),
    documentId: varchar("document_id")
      .notNull()
      .references(() => knowledgeDocuments.id, { onDelete: "cascade" }),
    nodeId: varchar("node_id")
      .notNull()
      .references(() => knowledgeNodes.id, { onDelete: "cascade" }),
    sourceFileName: text("source_file_name"),
    sourceFileHash: varchar("source_file_hash", { length: 64 }),
    format: varchar("format", { length: 16 }).notNull().default("xlsx"),
    sheetCount: integer("sheet_count").notNull().default(0),
    processedSheetCount: integer("processed_sheet_count").notNull().default(0),
    totalRowCount: integer("total_row_count").notNull().default(0),
    maxColumnCount: integer("max_column_count").notNull().default(0),
    totalCellCount: integer("total_cell_count").notNull().default(0),
    warnings: jsonb("warnings")
      .$type<KnowledgeExcelImportWarning[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (table) => ({
    documentUnique: uniqueIndex("knowledge_excel_workbooks_document_id_key").on(table.documentId),
    baseIdx: index("knowledge_excel_workbooks_base_idx").on(table.baseId, table.createdAt),
    workspaceIdx: index("knowledge_excel_workbooks_workspace_idx").on(table.workspaceId, table.createdAt),
  }),
);

export const knowledgeExcelSheets = pgTable(
  "knowledge_excel_sheets",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    workbookId: varchar("workbook_id")
      .notNull()
      .references(() => knowledgeExcelWorkbooks.id, { onDelete: "cascade" }),
    workspaceId: varchar("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    baseId: varchar("base_id")
      .notNull()
      .references(() => knowledgeBases.id, { onDelete: "cascade" }),
    documentId: varchar("document_id")
      .notNull()
      .references(() => knowledgeDocuments.id, { onDelete: "cascade" }),
    sheetIndex: integer("sheet_index").notNull(),
    title: text("title").notNull(),
    usedRange: jsonb("used_range").$type<KnowledgeExcelRangeBounds | null>(),
    rowCount: integer("row_count").notNull().default(0),
    columnCount: integer("column_count").notNull().default(0),
    cellCount: integer("cell_count").notNull().default(0),
    headerValues: jsonb("header_values")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    previewRows: jsonb("preview_rows")
      .$type<KnowledgeExcelPreviewRow[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    warnings: jsonb("warnings")
      .$type<KnowledgeExcelImportWarning[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (table) => ({
    workbookSheetUnique: uniqueIndex("knowledge_excel_sheets_workbook_sheet_idx").on(
      table.workbookId,
      table.sheetIndex,
    ),
    documentIdx: index("knowledge_excel_sheets_document_idx").on(table.documentId, table.sheetIndex),
    workbookIdx: index("knowledge_excel_sheets_workbook_idx").on(table.workbookId, table.sheetIndex),
  }),
);

export const knowledgeExcelSheetChunks = pgTable(
  "knowledge_excel_sheet_chunks",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    workbookId: varchar("workbook_id")
      .notNull()
      .references(() => knowledgeExcelWorkbooks.id, { onDelete: "cascade" }),
    sheetId: varchar("sheet_id")
      .notNull()
      .references(() => knowledgeExcelSheets.id, { onDelete: "cascade" }),
    workspaceId: varchar("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    baseId: varchar("base_id")
      .notNull()
      .references(() => knowledgeBases.id, { onDelete: "cascade" }),
    documentId: varchar("document_id")
      .notNull()
      .references(() => knowledgeDocuments.id, { onDelete: "cascade" }),
    chunkIndex: integer("chunk_index").notNull(),
    rowStart: integer("row_start").notNull(),
    rowEnd: integer("row_end").notNull(),
    rowCount: integer("row_count").notNull().default(0),
    columnCount: integer("column_count").notNull().default(0),
    headerValues: jsonb("header_values")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    rows: jsonb("rows")
      .$type<string[][]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    textContent: text("text_content").notNull().default(""),
    contentHash: varchar("content_hash", { length: 64 }),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (table) => ({
    sheetChunkUnique: uniqueIndex("knowledge_excel_sheet_chunks_sheet_chunk_idx").on(
      table.sheetId,
      table.chunkIndex,
    ),
    sheetRowIdx: index("knowledge_excel_sheet_chunks_sheet_row_idx").on(table.sheetId, table.rowStart),
    documentIdx: index("knowledge_excel_sheet_chunks_document_idx").on(table.documentId, table.sheetId),
  }),
);

export type KnowledgeExcelWorkbook = typeof knowledgeExcelWorkbooks.$inferSelect;
export type KnowledgeExcelWorkbookInsert = typeof knowledgeExcelWorkbooks.$inferInsert;
export type KnowledgeExcelSheet = typeof knowledgeExcelSheets.$inferSelect;
export type KnowledgeExcelSheetInsert = typeof knowledgeExcelSheets.$inferInsert;
export type KnowledgeExcelSheetChunk = typeof knowledgeExcelSheetChunks.$inferSelect;
export type KnowledgeExcelSheetChunkInsert = typeof knowledgeExcelSheetChunks.$inferInsert;

export const knowledgeDocumentChunkSets = pgTable(
  "knowledge_document_chunk_sets",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: varchar("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    documentId: varchar("document_id")
      .notNull()
      .references(() => knowledgeDocuments.id, { onDelete: "cascade" }),
    versionId: varchar("version_id")
      .notNull()
      .references(() => knowledgeDocumentVersions.id, { onDelete: "cascade" }),
    revisionId: varchar("revision_id"),
    documentHash: text("document_hash"),
    maxTokens: integer("max_tokens"),
    maxChars: integer("max_chars"),
    overlapTokens: integer("overlap_tokens"),
    overlapChars: integer("overlap_chars"),
    splitByPages: boolean("split_by_pages").notNull().default(false),
    respectHeadings: boolean("respect_headings").notNull().default(true),
    chunkCount: integer("chunk_count").notNull().default(0),
    totalTokens: integer("total_tokens").notNull().default(0),
    totalChars: integer("total_chars").notNull().default(0),
    isLatest: boolean("is_latest").notNull().default(true),
    createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (table) => ({
    documentLatestIndex: index("knowledge_document_chunk_sets_document_latest_idx").on(
      table.documentId,
      table.isLatest,
    ),
    documentCreatedIndex: index("knowledge_document_chunk_sets_document_idx").on(
      table.documentId,
      table.createdAt,
    ),
    documentRevisionIndex: index("knowledge_document_chunk_sets_document_revision_idx").on(
      table.documentId,
      table.revisionId,
    ),
    // FK-индекс под каскад удаления (DELETE versions → проверка chunk_sets.version_id).
    versionIndex: index("knowledge_document_chunk_sets_version_id_idx").on(table.versionId),
    // 0260: FK-индекс под каскад удаления пространства (workspace_id).
    workspaceIndex: index("knowledge_document_chunk_sets_workspace_id_idx").on(table.workspaceId),
  }),
);

export interface ImageRef {
  imageId: string;
  url: string;
  pageNumber?: number;
  width: number;
  height: number;
  caption?: string;
}

export const knowledgeDocumentChunkItems = pgTable(
  "knowledge_document_chunks",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: varchar("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    chunkSetId: varchar("chunk_set_id")
      .notNull()
      .references(() => knowledgeDocumentChunkSets.id, { onDelete: "cascade" }),
    documentId: varchar("document_id")
      .notNull()
      .references(() => knowledgeDocuments.id, { onDelete: "cascade" }),
    versionId: varchar("version_id")
      .notNull()
      .references(() => knowledgeDocumentVersions.id, { onDelete: "cascade" }),
    revisionId: varchar("revision_id").references(() => knowledgeDocumentIndexRevisions.id, {
      onDelete: "set null",
    }),
    chunkIndex: integer("chunk_index").notNull(),
    text: text("text").notNull(),
    charStart: integer("char_start").notNull(),
    charEnd: integer("char_end").notNull(),
    tokenCount: integer("token_count").notNull(),
    pageNumber: integer("page_number"),
    sectionPath: text("section_path").array(),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    contentHash: text("content_hash").notNull(),
    chunkOrdinal: integer("chunk_ordinal"),
    vectorId: text("vector_id"),
    vectorRecordId: text("vector_record_id"),
    imageRefs: jsonb("image_refs").$type<ImageRef[]>().default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (table) => ({
    chunkSetIndex: uniqueIndex("knowledge_document_chunks_set_index_idx").on(
      table.chunkSetId,
      table.chunkIndex,
    ),
    documentIndex: index("knowledge_document_chunks_document_idx").on(
      table.documentId,
      table.chunkIndex,
    ),
    textSearchIndex: index("knowledge_document_chunks_search_vector_idx").using("gin", sql`
      (
        public.knowledge_chunk_search_vector(
          (CASE WHEN "metadata"->>'heading' IS NULL THEN '' ELSE "metadata"->>'heading' END) ||
          E'\\x1F' ||
          (CASE WHEN "metadata"->>'firstSentence' IS NULL THEN '' ELSE "metadata"->>'firstSentence' END) ||
          E'\\x1F' ||
          (CASE WHEN "text" IS NULL THEN '' ELSE "text" END)
        )
      )
    `),
    vectorIdIndex: index("knowledge_document_chunks_vector_id_idx").on(table.vectorId),
    revisionHashOrdinalIndex: uniqueIndex("knowledge_document_chunks_revision_hash_ordinal_idx").on(
      table.documentId,
      table.revisionId,
      table.contentHash,
      table.chunkOrdinal,
    ),
    documentRevisionIndex: index("knowledge_document_chunks_document_revision_idx").on(
      table.documentId,
      table.revisionId,
    ),
    // FK-индексы под каскад удаления: version_id (CASCADE) и revision_id (SET NULL).
    versionIndex: index("knowledge_document_chunks_version_id_idx").on(table.versionId),
    revisionIndex: index("knowledge_document_chunks_revision_id_idx").on(table.revisionId),
    // 0260: FK-индекс под каскад удаления пространства (workspace_id).
    workspaceIndex: index("knowledge_document_chunks_workspace_id_idx").on(table.workspaceId),
  }),
);

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  role: true,
  createdAt: true,
  updatedAt: true,
  lastActiveAt: true,
  isEmailConfirmed: true,
  emailConfirmedAt: true,
  status: true,
  mustChangePassword: true,
  disablePersonalWorkspaceAutoCreate: true,
  personalApiTokenHash: true,
  personalApiTokenLastFour: true,
  personalApiTokenGeneratedAt: true,
  googleAvatar: true,
  googleEmailVerified: true,
  yandexAvatar: true,
  yandexEmailVerified: true,
  avatarKey: true,
  avatarUpdatedAt: true,
});

export const embeddingProviderTypes = ["gigachat", "custom", "aitunnel", "unica"] as const;
export type EmbeddingProviderType = (typeof embeddingProviderTypes)[number];

export const llmProviderTypes = ["gigachat", "custom", "aitunnel", "unica"] as const;
export type LlmProviderType = (typeof llmProviderTypes)[number];
export const DEFAULT_LLM_PROVIDER_TYPE: LlmProviderType = "custom";

export const providerAdapterKinds = ["openai_compatible", "generic_http", "legacy_unica"] as const;
export type ProviderAdapterKind = (typeof providerAdapterKinds)[number];

export const providerAuthModes = ["oauth_client_credentials", "bearer", "none"] as const;
export type ProviderAuthMode = (typeof providerAuthModes)[number];

export const llmStreamModes = ["openai_sse", "disabled", "legacy"] as const;
export type LlmStreamMode = (typeof llmStreamModes)[number];

const providerAdapterKindSet = new Set<string>(providerAdapterKinds);
const providerAuthModeSet = new Set<string>(providerAuthModes);
const llmStreamModeSet = new Set<string>(llmStreamModes);

type ProviderAdapterResolutionInput = {
  providerType?: string | null;
  adapterKind?: string | null;
  authMode?: string | null;
  streamMode?: string | null;
  tokenUrl?: string | null;
  authorizationKey?: string | null;
};

function hasNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function isLegacyUnicaProviderType(providerType?: string | null): boolean {
  return providerType === "unica";
}

export function isGigachatProviderType(providerType?: string | null): boolean {
  return providerType === "gigachat";
}

export function isAitunnelProviderType(providerType?: string | null): boolean {
  return providerType === "aitunnel";
}

function resolveLegacyAdapterKind(providerType?: string | null): ProviderAdapterKind {
  return isLegacyUnicaProviderType(providerType) ? "legacy_unica" : "openai_compatible";
}

export function normalizePersistedLlmProviderType(_providerType?: string | null): LlmProviderType {
  return DEFAULT_LLM_PROVIDER_TYPE;
}

export function resolveEmbeddingProviderAdapterKind(
  input: Pick<ProviderAdapterResolutionInput, "providerType" | "adapterKind">,
): ProviderAdapterKind {
  if (input.adapterKind && providerAdapterKindSet.has(input.adapterKind)) {
    return input.adapterKind as ProviderAdapterKind;
  }

  return resolveLegacyAdapterKind(input.providerType);
}

export function resolveLlmProviderAdapterKind(
  input: Pick<ProviderAdapterResolutionInput, "providerType" | "adapterKind">,
): ProviderAdapterKind {
  if (input.adapterKind && providerAdapterKindSet.has(input.adapterKind)) {
    return input.adapterKind as ProviderAdapterKind;
  }

  return "openai_compatible";
}

export function resolveProviderAuthMode(
  input: Pick<ProviderAdapterResolutionInput, "providerType" | "adapterKind" | "authMode" | "tokenUrl" | "authorizationKey">,
): ProviderAuthMode {
  const adapterKind = resolveLegacyAdapterKind(input.providerType);
  const resolvedAdapterKind =
    input.adapterKind && providerAdapterKindSet.has(input.adapterKind)
      ? (input.adapterKind as ProviderAdapterKind)
      : adapterKind;

  // Legacy Unica providers run inside the same contour and do not require
  // an Authorization header, even if stale data still stores auth_mode=bearer.
  if (isLegacyUnicaProviderType(input.providerType) || resolvedAdapterKind === "legacy_unica") {
    return "none";
  }

  if (input.authMode && providerAuthModeSet.has(input.authMode)) {
    return input.authMode as ProviderAuthMode;
  }

  if (isGigachatProviderType(input.providerType)) {
    return "oauth_client_credentials";
  }

  if (isAitunnelProviderType(input.providerType)) {
    return "bearer";
  }

  if (hasNonEmptyString(input.tokenUrl)) {
    return "oauth_client_credentials";
  }

  if (hasNonEmptyString(input.authorizationKey)) {
    return "bearer";
  }

  return "none";
}

export function resolveStoredProviderAuthMode(
  input: Pick<ProviderAdapterResolutionInput, "providerType" | "adapterKind" | "authMode" | "tokenUrl" | "authorizationKey">,
): ProviderAuthMode {
  const explicitAdapterKind =
    input.adapterKind && providerAdapterKindSet.has(input.adapterKind)
      ? (input.adapterKind as ProviderAdapterKind)
      : null;

  if (explicitAdapterKind === "legacy_unica") {
    return "none";
  }

  if (input.authMode && providerAuthModeSet.has(input.authMode)) {
    return input.authMode as ProviderAuthMode;
  }

  return resolveProviderAuthMode(input);
}

export function resolveLlmProviderAuthMode(
  input: Pick<ProviderAdapterResolutionInput, "providerType" | "adapterKind" | "authMode" | "tokenUrl" | "authorizationKey">,
): ProviderAuthMode {
  const adapterKind = resolveLlmProviderAdapterKind(input);

  if (adapterKind === "legacy_unica") {
    return "none";
  }

  if (input.authMode && providerAuthModeSet.has(input.authMode)) {
    return input.authMode as ProviderAuthMode;
  }

  if (hasNonEmptyString(input.tokenUrl)) {
    return "oauth_client_credentials";
  }

  if (hasNonEmptyString(input.authorizationKey)) {
    return "bearer";
  }

  return "none";
}

export function resolveStoredLlmProviderAuthMode(
  input: Pick<ProviderAdapterResolutionInput, "providerType" | "adapterKind" | "authMode" | "tokenUrl" | "authorizationKey">,
): ProviderAuthMode {
  const explicitAdapterKind =
    input.adapterKind && providerAdapterKindSet.has(input.adapterKind)
      ? (input.adapterKind as ProviderAdapterKind)
      : null;

  if (explicitAdapterKind === "legacy_unica") {
    return "none";
  }

  if (input.authMode && providerAuthModeSet.has(input.authMode)) {
    return input.authMode as ProviderAuthMode;
  }

  return resolveLlmProviderAuthMode(input);
}

export function resolveLlmProviderStreamMode(
  input: Pick<ProviderAdapterResolutionInput, "providerType" | "adapterKind" | "streamMode">,
): LlmStreamMode {
  if (input.streamMode && llmStreamModeSet.has(input.streamMode)) {
    return input.streamMode as LlmStreamMode;
  }

  const adapterKind = resolveLlmProviderAdapterKind(input);
  if (adapterKind === "legacy_unica") {
    return "legacy";
  }

  if (adapterKind === "generic_http") {
    return "disabled";
  }

  return "openai_sse";
}

export function resolveStoredLlmProviderStreamMode(
  input: Pick<ProviderAdapterResolutionInput, "providerType" | "adapterKind" | "streamMode">,
): LlmStreamMode {
  const explicitAdapterKind =
    input.adapterKind && providerAdapterKindSet.has(input.adapterKind)
      ? (input.adapterKind as ProviderAdapterKind)
      : null;

  if (explicitAdapterKind === "legacy_unica") {
    return "legacy";
  }

  if (input.streamMode && llmStreamModeSet.has(input.streamMode)) {
    return input.streamMode as LlmStreamMode;
  }

  return resolveLlmProviderStreamMode(input);
}

export function canEmbeddingProviderOmitModel(
  input: Pick<ProviderAdapterResolutionInput, "providerType" | "adapterKind">,
): boolean {
  return resolveEmbeddingProviderAdapterKind(input) === "legacy_unica" || isAitunnelProviderType(input.providerType);
}

export const authProviderTypes = ["google", "yandex"] as const;
export type AuthProviderType = (typeof authProviderTypes)[number];

export const embeddingRequestConfigSchema = z
  .object({
    inputField: z.string().trim().min(1, "Укажите ключ поля с текстом"),
    modelField: z.string().trim().min(1, "Укажите ключ модели").default("model"),
    batchField: z.string().trim().min(1).optional(),
    additionalBodyFields: z
      .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(z.any()), z.record(z.string(), z.any())]))
      .default({}),
  })
  .default({ inputField: "input", modelField: "model", additionalBodyFields: {} });

export const embeddingResponseConfigSchema = z
  .object({
    vectorPath: z
      .string()
      .trim()
      .min(1, "Укажите JSON-путь до вектора в ответе"),
    idPath: z.string().trim().min(1).optional(),
    usageTokensPath: z.string().trim().min(1).optional(),
    rawVectorType: z.enum(["float32", "float64"]).default("float32"),
  })
  .default({ vectorPath: "data[0].embedding", rawVectorType: "float32" });

export const qdrantIntegrationConfigSchema = z.object({
  collectionName: z
    .string()
    .trim()
    .min(1, "Укажите коллекцию Qdrant")
    .optional(),
  vectorFieldName: z.string().trim().min(1).optional(),
  payloadFields: z.record(z.string(), z.string()).default({}),
  vectorSize: z
    .union([z.number().int().positive(), z.string().trim().min(1)])
    .optional(),
  upsertMode: z
    .union([z.enum(["replace", "append"]), z.string().trim().min(1)])
    .default("replace"),
});

export type EmbeddingRequestConfig = z.infer<typeof embeddingRequestConfigSchema>;
export type EmbeddingResponseConfig = z.infer<typeof embeddingResponseConfigSchema>;
export type QdrantIntegrationConfig = z.infer<typeof qdrantIntegrationConfigSchema>;
export type LlmRequestConfig = z.infer<typeof llmRequestConfigSchema>;
export type LlmResponseConfig = z.infer<typeof llmResponseConfigSchema>;

export interface LlmModelOption {
  label: string;
  value: string;
}

export const reasoningModes = ["off", "none", "minimal", "low", "medium", "high", "xhigh"] as const;
export type ReasoningMode = (typeof reasoningModes)[number];

export const reasoningFieldMappingTypes = [
  "openai_reasoning_effort",
  "aitunnel_reasoning",
  "boolean_field",
  "disabled",
] as const;

export const reasoningFieldMappingSchema = z
  .object({
    type: z.enum(reasoningFieldMappingTypes).default("openai_reasoning_effort"),
    field: z.string().trim().min(1).optional(),
    exclude: z.boolean().optional(),
  })
  .default({ type: "openai_reasoning_effort" });

export const reasoningMappingSchema = z
  .object({
    request: z
      .object({
        mode: z
          .object({
            path: z.string().trim().min(1),
          })
          .optional(),
        defaults: z.record(z.string(), z.unknown()).optional(),
        off: z
          .object({
            fields: z.record(z.string(), z.unknown()).optional(),
          })
          .optional(),
      })
      .optional(),
    response: z
      .object({
        reasoningText: z
          .object({
            path: z.string().trim().min(1).optional(),
            streamPath: z.string().trim().min(1).optional(),
          })
          .optional(),
      })
      .optional(),
  })
  .default({});

export const llmRequestConfigSchema = z
  .object({
    modelField: z.string().trim().min(1, "Укажите ключ модели").default("model"),
    messagesField: z.string().trim().min(1, "Укажите ключ массива сообщений").default("messages"),
    systemPrompt: z
      .string()
      .trim()
      .max(4000, "Слишком длинный системный промпт")
      .optional()
      .nullable(),
    temperature: z.number().min(0).max(2).optional(),
    maxCompletionTokens: z.number().int().positive().optional(),
    maxCompletionTokensField: z.string().trim().min(1).optional(),
    topP: z.number().min(0).max(1).optional(),
    topK: z.number().int().min(1).max(200).optional(),
    repeatPenalty: z.number().min(0).max(2).optional(),
    seed: z.number().int().min(0).optional(),
    presencePenalty: z.number().min(-2).max(2).optional(),
    frequencyPenalty: z.number().min(-2).max(2).optional(),
    reasoningMapping: reasoningMappingSchema.optional(),
    reasoningFieldMapping: reasoningFieldMappingSchema.optional(),
    additionalBodyFields: z
      .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(z.any()), z.record(z.string(), z.any())]))
      .default({}),
  })
  .default({ messagesField: "messages", modelField: "model", additionalBodyFields: {} });

function addDeprecatedNumCtxIssues(value: unknown, ctx: z.RefinementCtx): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return;
  }

  const config = value as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(config, "numCtx")) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Параметр numCtx больше не поддерживается после перехода на vLLM",
      path: ["numCtx"],
    });
  }

  const additionalBodyFields = config.additionalBodyFields;
  if (
    additionalBodyFields &&
    typeof additionalBodyFields === "object" &&
    !Array.isArray(additionalBodyFields) &&
    Object.prototype.hasOwnProperty.call(additionalBodyFields, "num_ctx")
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Параметр additionalBodyFields.num_ctx больше не поддерживается после перехода на vLLM",
      path: ["additionalBodyFields", "num_ctx"],
    });
  }
}

export const llmResponseConfigSchema = z
  .object({
    messagePath: z
      .string()
      .trim()
      .min(1, "Укажите JSON-путь до текста ответа"),
    usageTokensPath: z.string().trim().min(1).optional(),
    promptTokensPath: z.string().trim().min(1).optional(),
    completionTokensPath: z.string().trim().min(1).optional(),
  })
  .default({ messagePath: "choices[0].message.content" });

export const DEFAULT_EMBEDDING_REQUEST_CONFIG: EmbeddingRequestConfig = {
  inputField: "input",
  modelField: "model",
  additionalBodyFields: {
    encoding_format: "float",
  },
};

export const DEFAULT_EMBEDDING_RESPONSE_CONFIG: EmbeddingResponseConfig = {
  vectorPath: "data[0].embedding",
  usageTokensPath: "usage.total_tokens",
  rawVectorType: "float32",
};

export const DEFAULT_QDRANT_CONFIG: QdrantIntegrationConfig = {
  payloadFields: {},
  upsertMode: "replace",
};

export const UNICA_EMBEDDING_REQUEST_CONFIG: EmbeddingRequestConfig = {
  inputField: "input",
  modelField: "model",
  additionalBodyFields: {
    workspace_id: "GENERAL",
    encoding_format: "float",
  },
};

export const UNICA_EMBEDDING_RESPONSE_CONFIG: EmbeddingResponseConfig = {
  vectorPath: "data[0].embedding",
  usageTokensPath: "usage.total_tokens",
  rawVectorType: "float32",
};

export const DEFAULT_LLM_MATH_FORMATTING_INSTRUCTION =
  "Если в ответе есть математические формулы, записывай их в LaTeX: короткие формулы внутри строки оборачивай в `$...$`, отдельные или длинные формулы — в `$$...$$`. Не помещай формулы в блоки кода, если это не пример кода.";

export const DEFAULT_LLM_REQUEST_CONFIG = {
  modelField: "model",
  messagesField: "messages",
  systemPrompt: [
    "Ты — помощник для базы знаний. Отвечай на вопросы пользователя на основе предоставленных фрагментов контента. Если в фрагментах нет ответа, честно сообщи об этом.",
    DEFAULT_LLM_MATH_FORMATTING_INSTRUCTION,
  ].join("\n\n"),
  additionalBodyFields: {
    stream: false,
  },
} as const satisfies z.infer<typeof llmRequestConfigSchema>;

export const DEFAULT_LLM_RESPONSE_CONFIG = {
  messagePath: "choices[0].message.content",
  usageTokensPath: "usage.total_tokens",
  promptTokensPath: "usage.prompt_tokens",
  completionTokensPath: "usage.completion_tokens",
} as const satisfies z.infer<typeof llmResponseConfigSchema>;

export const registerUserSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .max(255, "Слишком длинное имя")
      .optional()
      .default(""),
    email: z
      .string()
      .trim()
      .max(255, "Слишком длинный email")
      .email("Введите корректный email"),
    password: z
      .string()
      .min(8, "Минимум 8 символов")
      .max(100, "Слишком длинный пароль")
      .refine((value) => /[A-Za-z]/.test(value) && /[0-9]/.test(value), {
        message: "Должен содержать буквы и цифры",
      }),
  })
  .strict();

// Sites table for storing crawl configurations
export const sites = pgTable("sites", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().default("Новый проект"),
  url: text("url").notNull().unique(),
  startUrls: jsonb("start_urls").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  crawlDepth: integer("crawl_depth").notNull().default(3),
  maxChunkSize: integer("max_chunk_size").notNull().default(1200),
  chunkOverlap: boolean("chunk_overlap").notNull().default(false),
  chunkOverlapSize: integer("chunk_overlap_size").notNull().default(0),
  followExternalLinks: boolean("follow_external_links").notNull().default(false),
  crawlFrequency: text("crawl_frequency").notNull().default("manual"), // "manual" | "hourly" | "daily" | "weekly"
  excludePatterns: jsonb("exclude_patterns").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  status: text("status").notNull().default("idle"), // "idle" | "crawling" | "completed" | "failed"
  lastCrawled: timestamp("last_crawled"),
  nextCrawl: timestamp("next_crawl"),
  error: text("error"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  workspaceId: varchar("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  ownerId: varchar("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  publicId: varchar("public_id")
    .notNull()
    .unique()
    .default(sql`gen_random_uuid()`),
  publicApiKey: text("public_api_key")
    .notNull()
    .default(sql`encode(gen_random_bytes(32), 'hex')`),
  publicApiKeyGeneratedAt: timestamp("public_api_key_generated_at")
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

export const embeddingProviders = pgTable("embedding_providers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  providerType: text("provider_type").$type<EmbeddingProviderType>().notNull().default("gigachat"),
  adapterKind: text("adapter_kind").$type<ProviderAdapterKind>(),
  authMode: text("auth_mode").$type<ProviderAuthMode>(),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  isGlobal: boolean("is_global").notNull().default(false),
  tokenUrl: text("token_url").notNull(),
  embeddingsUrl: text("embeddings_url").notNull(),
  authorizationKey: text("authorization_key").notNull(),
  scope: text("scope").notNull(),
  // DEPRECATED: «Модель по умолчанию» провайдера больше НЕ источник истины для рантайма —
  // модель эмбеддинга берётся строго из глобальных RAG-настроек (rag_global_settings).
  // Колонка nullable и оставлена временно; физический DROP — отдельной миграцией позже.
  model: text("model"),
  availableModels: jsonb("available_models")
    .$type<LlmModelOption[] | null>()
    .default(sql`'[]'::jsonb`),
  maxTokensPerVectorization: integer("max_tokens_per_vectorization"),
  allowSelfSignedCertificate: boolean("allow_self_signed_certificate").notNull().default(false),
  requestHeaders: jsonb("request_headers").$type<Record<string, string>>().notNull().default(sql`'{}'::jsonb`),
  requestConfig: jsonb("request_config").$type<EmbeddingRequestConfig>().notNull().default(sql`'{}'::jsonb`),
  responseConfig: jsonb("response_config").$type<EmbeddingResponseConfig>().notNull().default(sql`'{}'::jsonb`),
  qdrantConfig: jsonb("qdrant_config").$type<QdrantIntegrationConfig>().notNull().default(sql`'{}'::jsonb`),
  unicaWorkspaceId: text("unica_workspace_id"),
  workspaceId: varchar("workspace_id")
    .references(() => workspaces.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const knowledgeBaseRagRequests = pgTable("knowledge_base_rag_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()::text`),
  workspaceId: varchar("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  knowledgeBaseId: varchar("knowledge_base_id")
    .notNull()
    .references(() => knowledgeBases.id, { onDelete: "cascade" }),
  topK: integer("top_k"),
  bm25Weight: doublePrecision("bm25_weight"),
  bm25Limit: integer("bm25_limit"),
  vectorWeight: doublePrecision("vector_weight"),
  vectorLimit: integer("vector_limit"),
  embeddingProviderId: varchar("embedding_provider_id").references(() => embeddingProviders.id, {
    onDelete: "set null",
  }),
  collection: text("collection"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  // 0260: FK-индекс под каскад удаления БЗ (knowledge_base_id).
  knowledgeBaseIdx: index("knowledge_base_rag_requests_knowledge_base_id_idx").on(table.knowledgeBaseId),
}));

export type KnowledgeBaseAskAiPipelineStepLog = {
  key: string;
  title?: string | null;
  status: "success" | "skipped" | "error";
  startedAt?: string | null;
  finishedAt?: string | null;
  durationMs?: number | null;
  input?: Record<string, unknown> | null;
  output?: Record<string, unknown> | null;
  error?: string | RagPipelineErrorDetails | null;
};

export type KnowledgeBaseChunkSearchSettings = {
  topK?: number | null;
  bm25Weight?: number | null;
  synonyms?: string[];
  includeDrafts?: boolean;
  highlightResults?: boolean;
  filters?: string | null;
};

export type KnowledgeBaseRagSearchSettings = {
  topK?: number | null;
  bm25Weight?: number | null;
  bm25Limit?: number | null;
  vectorWeight?: number | null;
  vectorLimit?: number | null;
  collection?: string | null;
  llmProviderId?: string | null;
  llmModel?: string | null;
  temperature?: number | null;
  maxCompletionTokens?: number | null;
  systemPrompt?: string | null;
  responseFormat?: "text" | "markdown" | "html" | null;
};

export const knowledgeBaseSearchSettings = pgTable(
  "knowledge_base_search_settings",
  {
    workspaceId: varchar("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    knowledgeBaseId: varchar("knowledge_base_id")
      .notNull()
      .references(() => knowledgeBases.id, { onDelete: "cascade" }),
    chunkSettings: jsonb("chunk_settings").$type<KnowledgeBaseChunkSearchSettings | null>(),
    ragSettings: jsonb("rag_settings").$type<KnowledgeBaseRagSearchSettings | null>(),
    updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.workspaceId, table.knowledgeBaseId] }),
  }),
);

export const speechProviderTypes = ["stt", "tts"] as const;
export type SpeechProviderType = (typeof speechProviderTypes)[number];

export const speechProviderDirections = ["audio_to_text", "text_to_speech"] as const;
export type SpeechProviderDirection = (typeof speechProviderDirections)[number];

export const speechProviderStatuses = ["Disabled", "Enabled", "Error"] as const;
export type SpeechProviderStatus = (typeof speechProviderStatuses)[number];

export const asrProviderTypes = ["unica", "unica_v2"] as const;
export type AsrProviderType = (typeof asrProviderTypes)[number];

export const speechProviders = pgTable("speech_providers", {
  id: text("id").primaryKey(),
  displayName: text("display_name").notNull(),
  providerType: text("provider_type").$type<SpeechProviderType>().notNull().default("stt"),
  asrProviderType: text("asr_provider_type").$type<AsrProviderType>(),
  direction: text("direction").$type<SpeechProviderDirection>().notNull().default("audio_to_text"),
  isEnabled: boolean("is_enabled").notNull().default(false),
  isDefaultAsr: boolean("is_default_asr").notNull().default(false),
  status: text("status").$type<SpeechProviderStatus>().notNull().default("Disabled"),
  lastStatusChangedAt: timestamp("last_status_changed_at"),
  lastValidationAt: timestamp("last_validation_at"),
  lastErrorCode: text("last_error_code"),
  lastErrorMessage: text("last_error_message"),
  configJson: jsonb("config_json").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  isBuiltIn: boolean("is_built_in").notNull().default(false),
  updatedByAdminId: varchar("updated_by_admin_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const speechProviderSecrets = pgTable(
  "speech_provider_secrets",
  {
    providerId: text("provider_id")
      .notNull()
      .references(() => speechProviders.id, { onDelete: "cascade" }),
    secretKey: text("secret_key").notNull(),
    secretValue: text("secret_value").notNull().default(""),
    createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.providerId, table.secretKey], name: "speech_provider_secrets_pk" }),
  }),
);

export const llmProviders = pgTable("llm_providers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()::text`),
  name: text("name").notNull(),
  providerType: text("provider_type").$type<LlmProviderType>().notNull().default(DEFAULT_LLM_PROVIDER_TYPE),
  adapterKind: text("adapter_kind").$type<ProviderAdapterKind>(),
  authMode: text("auth_mode").$type<ProviderAuthMode>(),
  streamMode: text("stream_mode").$type<LlmStreamMode>(),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  isGlobal: boolean("is_global").notNull().default(false),
  tokenUrl: text("token_url").notNull(),
  completionUrl: text("completion_url").notNull(),
  authorizationKey: text("authorization_key").notNull(),
  scope: text("scope").notNull(),
  model: text("model").notNull(),
  availableModels: jsonb("available_models")
    .$type<LlmModelOption[] | null>()
    .default(sql`'[]'::jsonb`),
  allowSelfSignedCertificate: boolean("allow_self_signed_certificate").notNull().default(false),
  requestHeaders: jsonb("request_headers").$type<Record<string, string>>().notNull().default(sql`'{}'::jsonb`),
  requestConfig: jsonb("request_config").$type<LlmRequestConfig>().notNull().default(sql`'{}'::jsonb`),
  responseConfig: jsonb("response_config").$type<LlmResponseConfig>().notNull().default(sql`'{}'::jsonb`),
  workspaceId: varchar("workspace_id")
    .references(() => workspaces.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

const ocrImageTransports = ["local_url", "base64"] as const;
type OcrImageTransport = (typeof ocrImageTransports)[number];

const ocrImageDetails = ["auto", "low", "high"] as const;
type OcrImageDetail = (typeof ocrImageDetails)[number];

export const ocrProviders = pgTable(
  "ocr_providers",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()::text`),
    name: text("name").notNull(),
    llmProviderConfigId: varchar("llm_provider_config_id")
      .notNull()
      .references(() => llmProviders.id, { onDelete: "restrict" }),
    model: text("model").notNull(),
    imageTransport: text("image_transport").$type<OcrImageTransport>().notNull().default("base64"),
    fileStorageProviderId: varchar("file_storage_provider_id").references(() => fileStorageProviders.id, {
      onDelete: "set null",
    }),
    imageDetail: text("image_detail").$type<OcrImageDetail>().notNull().default("auto"),
    // CV-препроцессинг изображений перед vision-OCR (детектор качества + upscale/sharpen на sharp).
    // Пер-провайдерный выключатель для сравнения «до/после»; env VISION_OCR_ENHANCEMENT_ENABLED=false
    // остаётся глобальным аварийным kill-switch поверх. Миграция 0299.
    imageEnhancementEnabled: boolean("image_enhancement_enabled").notNull().default(true),
    additionalBodyFields: jsonb("additional_body_fields")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    isDefault: boolean("is_default").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (table) => ({
    llmProviderIdx: index("ocr_providers_llm_provider_idx").on(table.llmProviderConfigId),
    fileStorageProviderIdx: index("ocr_providers_file_storage_provider_idx").on(table.fileStorageProviderId),
    activeDefaultIdx: index("ocr_providers_active_default_idx").on(table.isActive, table.isDefault),
    // Гарантия единственного дефолтного OCR-провайдера на уровне БД (как у tariff_plans). Снимает
    // недетерминизм резолвера getActiveDefaultOcrProvider при нескольких is_default=true. Миграция 0255.
    defaultUnique: uniqueIndex("ocr_providers_default_unique")
      .on(table.isDefault)
      .where(sql`is_default = true`),
  }),
);

export const unicaChatConfig = pgTable("unica_chat_config", {
  id: varchar("id").primaryKey().default("singleton"),
  llmProviderConfigId: varchar("llm_provider_config_id").references(() => llmProviders.id, {
    onDelete: "set null",
  }),
  modelId: text("model_id"),
  agentDefaultModelId: text("agent_model_id"),
  agentFastPathModelId: text("agent_fast_path_model_id"),
  // Режим reasoning для агентских запусков (значение из reasoningModes); null = по умолчанию модели
  // (inputCapabilities.reasoning.defaultMode). Применяется через провайдерский reasoningMapping —
  // тем же механизмом, что чат (buildReasoningRequestBodyPatch).
  agentReasoningMode: text("agent_reasoning_mode"),
  // Debug-трейс запусков агента: при включении журнал пишет полные payload (LLM-дельты по
  // раундам, скрипты code.execute, stdout). Тяжёлые данные, очистка по политике janitor (срок задаёт админ).
  agentDebugTraceEnabled: boolean("agent_debug_trace_enabled").notNull().default(false),
  agentMaxSteps: integer("agent_max_steps").notNull().default(32),
  agentMaxToolCalls: integer("agent_max_tool_calls").notNull().default(32),
  agentTimeoutSec: integer("agent_timeout_sec").notNull().default(600),
  // Лимит токенов ответа на один LLM-вызов агента. NULL = «Авто» (потолок модели
  // models.max_completion_tokens, иначе runtime-дефолт); число = явный override с клампом.
  agentMaxCompletionTokens: integer("agent_max_completion_tokens"),
  // --- Задача 5.1: контроль перегрузки (overload control). Все поля NULL = «Авто» (env-дефолт/
  // выключено); число — явный админ-override. Модель: per-РЕПЛИКА лимиты (прокидываются в рантайм,
  // защищают контейнер) vs ГЛОБАЛЬНЫЕ Redis-квоты на Node (справедливость между тенантами). ---
  // Per-реплика (Фаза 1): лимит ОДНОВРЕМЕННЫХ агент-прогонов/code-exec на один контейнер рантайма;
  // прокидывается per-request как runtimeCapacity, при перегрузке рантайм отвечает 503 + Retry-After.
  agentMaxConcurrentRuns: integer("agent_max_concurrent_runs"),
  agentMaxConcurrentCodeExec: integer("agent_max_concurrent_code_exec"),
  // Retry-After (сек), который рантайм отдаёт при перегрузке; база backoff для переочереди на Node.
  agentCapacityRetryAfterSec: integer("agent_capacity_retry_after_sec"),
  // Бюджет ПОВТОРОВ переочереди одного шага агента из-за back-pressure (503/квота) до честного отказа
  // «занято». Защита от бесконечной переочереди. NULL = дефолт.
  agentMaxCapacityRetries: integer("agent_max_capacity_retries"),
  // Глобальная (cross-instance, Redis) квота: потолок ОДНОВРЕМЕННЫХ агент-диспатчей на ВОРКСПЕЙС.
  // Тенант не «голодит» других. NULL/0 = выключено.
  agentMaxConcurrentRunsPerWorkspace: integer("agent_max_concurrent_runs_per_workspace"),
  // Глобальный (Redis) token-bucket бюджета ПОВТОРОВ на воркспейс: ёмкость и скорость пополнения
  // (токенов/мин). Ограничивает скорость ретраев, чтобы они не превращались в самоусиление перегрузки.
  // capacity NULL/0 = выключено.
  agentRetryBucketCapacity: integer("agent_retry_bucket_capacity"),
  agentRetryBucketRefillPerMin: integer("agent_retry_bucket_refill_per_min"),
  // --- Задача 5.2: возобновление после сбоя (resume recovery). Все поля NULL = «Авто» (env-дефолт);
  // число — явный админ-override. Управляют сторожем зависших агент-прогонов (agent-run-lifecycle-
  // watchdog): как часто опрашивать (интервал) и через сколько молчания heartbeat прогон считается
  // зависшим и переводится в честный терминальный статус. Cross-instance состояние (heartbeat-отметки,
  // idempotency-реестр) — durable в Postgres. ---
  agentRunWatchdogIntervalSec: integer("agent_run_watchdog_interval_sec"),
  agentRunStaleTimeoutSec: integer("agent_run_stale_timeout_sec"),
  // Reaper залипшего pending идемпотентности (gap-analysis 5.2, AGENT-IDEMPOTENCY-STUCK-PENDING):
  // возраст pending-строки (по started_at) старше этого порога → прогон заведомо мёртв, строка
  // реапится классифицированно (safe_retry→failed / unknown→abandoned). NULL = «Авто» (env-дефолт).
  agentPendingReapTtlSec: integer("agent_pending_reap_ttl_sec"),
  // Интерим-ретенция реестра идемпотентности (AGENT-IDEMPOTENCY-RETENTION): тот же reaper удаляет
  // completed/failed старше N дней (pending/abandoned не трогает). Интерим до janitor-сервиса.
  agentIdempotencyRetentionDays: integer("agent_idempotency_retention_days"),
  // --- Волна 1 D: устойчивость агента (runtime resilience). Все поля NULL = «Авто» (env-дефолт
  // Python-реплики); число — явный админ-override, 0 = kill-switch механизма. Прокидываются
  // per-request как runtimeResilience (паттерн runtimeCapacity 5.1), применяет Python
  // (app/agent/resilience.py). ---
  // Бюджет guard-повторов (повтор шага по вердикту guard'ов) на один прогон.
  agentGuardRetryMaxPerRun: integer("agent_guard_retry_max_per_run"),
  // Guard-повтор допускается, только если до дедлайна прогона осталось не меньше этого (сек).
  agentGuardRetryMinRemainingSec: integer("agent_guard_retry_min_remaining_sec"),
  // Запас Python-дедлайна к таймауту прогона (сек): рантайм завершает работу раньше отсечки Node.
  agentDeadlineSafetyMarginSec: integer("agent_deadline_safety_margin_sec"),
  // Новый LLM-раунд стартует, только если до дедлайна осталось не меньше этого (сек).
  agentRoundMinRemainingSec: integer("agent_round_min_remaining_sec"),
  // Лимит эха предыдущего ответа в промпте guard-повтора (символов). 0 = не эхировать.
  agentRetryEchoMaxChars: integer("agent_retry_echo_max_chars"),
  // --- Step-debug D6.4: устойчивость пошаговой отладки сценариев. NULL = «Авто» (env-дефолт
  // WORKFLOW_DEBUG_MAX_OPEN_SESSIONS_PER_WORKSPACE → fallback); 0 = kill-switch (arm отклоняется).
  // Кап живых дебаг-сессий (armed/capturing/active) на пространство — дебаг не голодит прод-ёмкость. ---
  workflowDebugMaxOpenSessionsPerWorkspace: integer("workflow_debug_max_open_sessions_per_workspace"),
  // Ожидание вызова армированной сессией (сек). NULL = «Авто» (env WORKFLOW_DEBUG_ARM_TTL_SECONDS →
  // fallback 300). После захвата входа не применяется.
  workflowDebugArmTtlSeconds: integer("workflow_debug_arm_ttl_seconds"),
  // Жизнь дебаг-сессии после захвата (сек), скользящая от последней активности автора. NULL = «Авто»
  // (env WORKFLOW_DEBUG_SESSION_TTL_SECONDS → fallback 3600).
  workflowDebugSessionTtlSeconds: integer("workflow_debug_session_ttl_seconds"),
  // Лимит промптов инстанса (Фаза 3 библиотеки промптов): суммарно scope instance + workspace +
  // personal, системный сид и starters ассистентов не учитываются. NULL = «Авто»
  // (env PROMPTS_INSTANCE_LIMIT → fallback 1000); 0 = запрет создания новых. Превышение → 409.
  promptsInstanceLimit: integer("prompts_instance_limit"),
  // --- Волна 2A: Prefetch базы знаний. Все поля NULL = «Авто» (env-дефолт/fallback); значение — явный
  // админ-override. Управляют автоподгрузкой документов привязанной БЗ в контекст агента до первого
  // вызова модели (Node-сторона, resolveKbPrefetchConfig; в Python не прокидывается). ---
  // Мастер-рубильник prefetch: NULL = env/дефолт (вкл), true/false — явный override.
  agentKbPrefetchEnabled: boolean("agent_kb_prefetch_enabled"),
  // Бюджет символов на инлайн содержимого документов. 0 = kill-switch: в контекст идёт только оглавление.
  agentKbPrefetchCharLimit: integer("agent_kb_prefetch_char_limit"),
  // Максимум документов, инлайнящихся в контекст.
  agentKbPrefetchMaxDocs: integer("agent_kb_prefetch_max_docs"),
  // --- Блок 8, задача 8.1: Tool-RAG (поиск по инструментам), Phase A. Все поля NULL = «Авто» (env-дефолт/
  // документированный fallback), значение — явный админ-override. Сужают ВНЕШНИЙ хвост (mcpTools/actions/
  // operations) ретривалом перед показом модели; ниже порога промоции ретривал — no-op (нулевой регресс). ---
  // Мастер-рубильник: NULL = env/дефолт (вкл), true/false — явный override.
  agentToolRagEnabled: boolean("agent_tool_rag_enabled"),
  // Порог промоции: применять ретривал только при числе резидентных внешних инструментов >= порога.
  agentToolRagPromotionThreshold: integer("agent_tool_rag_promotion_threshold"),
  // Жёсткий потолок кандидатного набора (адаптивная глубина не превышает).
  agentToolRagMaxCandidates: integer("agent_tool_rag_max_candidates"),
  // Адаптивная глубина: добор кандидатов, пока RRF-скор >= ratio * (скор лидера). Храним целые проценты.
  agentToolRagAdaptiveScoreRatioPct: integer("agent_tool_rag_adaptive_score_ratio_pct"),
  // RRF-константа слияния sparse+dense (как в search-профилях КБ).
  agentToolRagRrfK: integer("agent_tool_rag_rrf_k"),
  // Веса половин слияния (целые проценты; сервер нормализует к сумме 1).
  agentToolRagBm25WeightPct: integer("agent_tool_rag_bm25_weight_pct"),
  agentToolRagVectorWeightPct: integer("agent_tool_rag_vector_weight_pct"),
  // Recall-floor офлайн-гейта приёмки (наблюдаемость/документированный порог; рантайм не применяет).
  agentToolRagRecallFloorPct: integer("agent_tool_rag_recall_floor_pct"),
  // Возраст (сек), после которого запись индекса считается stale (сверщик/индикатор).
  agentToolRagStaleAgeSec: integer("agent_tool_rag_stale_age_sec"),
  // Интервал фонового хэш-сверщика (reconciler), сек.
  agentToolRagReconcilerIntervalSec: integer("agent_tool_rag_reconciler_interval_sec"),
  // TTL tenant-scoped кэша результата ретривала (getCache), сек. 0 = не кэшировать.
  agentToolRagCacheTtlSec: integer("agent_tool_rag_cache_ttl_sec"),
  // --- Блок 8, задача 8.2: реестр кластеров + двухстадийный (домен→инструмент) роутинг поверх 8.1. Все поля
  // NULL = «Авто» (env-дефолт/fallback), значение — явный админ-override. Реестр кластеров и членство —
  // data-driven из каталога (БЕЗ таблицы); здесь только тюнеры конвейера. ---
  // Мастер-рубильник иерархического роутинга: NULL = env/дефолт, true/false — явный override.
  agentToolClusterRoutingEnabled: boolean("agent_tool_cluster_routing_enabled"),
  // Число кластеров-кандидатов стадии 1 (жёсткий потолок адаптивной глубины доменного отбора).
  agentToolClusterMaxCandidateClusters: integer("agent_tool_cluster_max_candidate_clusters"),
  // Адаптивная глубина стадии 1: добор кластеров, пока RRF-скор >= ratio * (скор лидера). Целые проценты.
  agentToolClusterStage1ScoreRatioPct: integer("agent_tool_cluster_stage1_score_ratio_pct"),
  // Бюджет пере-запроса (operation agent.find_tools): потолок кандидатов при higher-recall повторе.
  agentToolClusterRequeryMaxCandidates: integer("agent_tool_cluster_requery_max_candidates"),
  agentSmalltalkPhrases: text("agent_smalltalk_phrases").notNull().default(""),
  systemPrompt: text("system_prompt").notNull().default(""),
  temperature: doublePrecision("temperature").default(0.7),
  topP: doublePrecision("top_p").default(1),
  chatTitleEnabled: boolean("chat_title_enabled").notNull().default(true),
  chatTitleLlmProviderConfigId: varchar("chat_title_llm_provider_config_id").references(() => llmProviders.id, {
    onDelete: "set null",
  }),
  chatTitleModelId: text("chat_title_model_id"),
  chatTitleSystemPrompt: text("chat_title_system_prompt"),
  chatTitleUserPromptTemplate: text("chat_title_user_prompt_template"),
  chatTitleTemperature: doublePrecision("chat_title_temperature"),
  chatTitleTopP: doublePrecision("chat_title_top_p"),
  chatTitleInputMaxWords: integer("chat_title_input_max_words"),
  chatTitleInputMaxChars: integer("chat_title_input_max_chars"),
  chatTitleOutputMaxWords: integer("chat_title_output_max_words"),
  chatTitleOutputMaxChars: integer("chat_title_output_max_chars"),
  chatTitleFallbackTitle: text("chat_title_fallback_title"),
  // --- AI-улучшайзер инструкций ассистента (POST /api/assistants/improve-prompt, миграция 0277). Один
  // нестримовый LLM-вызов «перепиши черновик инструкции», тарифицируется (как обычный LLM-вызов чата).
  // enabled по умолчанию вкл; остальные поля — опциональный override. Пусто = наследовать провайдера/
  // модель/семплинг главного системного чата Unica (resolveUnicaChatProvider). Singleton-конфиг инстанса. ---
  promptImprovementEnabled: boolean("prompt_improvement_enabled").notNull().default(true),
  promptImprovementLlmProviderConfigId: varchar("prompt_improvement_llm_provider_config_id").references(() => llmProviders.id, {
    onDelete: "set null",
  }),
  promptImprovementModelId: text("prompt_improvement_model_id"),
  promptImprovementSystemPrompt: text("prompt_improvement_system_prompt"),
  promptImprovementUserPromptTemplate: text("prompt_improvement_user_prompt_template"),
  promptImprovementTemperature: doublePrecision("prompt_improvement_temperature"),
  promptImprovementTopP: doublePrecision("prompt_improvement_top_p"),
  promptImprovementMaxOutputTokens: integer("prompt_improvement_max_output_tokens"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// --- Блок 8, задача 8.1: Tool-RAG (поиск по инструментам), Phase A ---
// Источник истины векторов инструментов агента. Хранилище — Postgres (СЫРЫЕ real[] + метаданные); сравнение
// (brute-force cosine) и sparse-FTS делает Node/PG над коротким срезом воркспейса (сотни элементов) — БЕЗ
// pgvector и БЕЗ Qdrant (Qdrant остаётся для RAG КБ). Кэш-лестница поверх — getCache (L1 ← Redis ← Postgres).
//
// Раскладка прав без копий по воркспейсам (дизайн §2.5): scope='workspace' — уникальный хвост воркспейса
// (одна строка на (воркспейс, инструмент)); scope='global' зарезервирован под общие/админские капабилити
// (Phase B). embedModelVer неймспейсит индекс по модели/версии эмбеддингов: смена RAG-модели даёт новый
// keyspace, старые вектора не матчатся как «свои». status поддерживает degrade-first: pending/failed элемент
// не исчезает из снимка (находится sparse-половиной), сверщик (reconciler) досчитает вектор позже.
export const agentToolEmbeddingScopes = ["global", "workspace"] as const;
export type AgentToolEmbeddingScope = (typeof agentToolEmbeddingScopes)[number];

export const agentToolEmbeddingKinds = ["mcp_tool", "action", "operation", "skill"] as const;
export type AgentToolEmbeddingKind = (typeof agentToolEmbeddingKinds)[number];

export const agentToolEmbeddingStatuses = ["indexed", "pending", "stale", "failed"] as const;
export type AgentToolEmbeddingStatus = (typeof agentToolEmbeddingStatuses)[number];

export const agentToolEmbeddings = pgTable(
  "agent_tool_embeddings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    // 'workspace' — хвост воркспейса; 'global' — общие/админские (Phase B).
    scope: text("scope").notNull(),
    // NULL для scope='global'; для 'workspace' — id воркспейса (каскадная чистка при удалении пространства).
    workspaceId: varchar("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
    // 'mcp_tool' | 'action' | 'operation' | 'skill'.
    toolKind: text("tool_kind").notNull(),
    // Стабильный идентификатор инструмента в снимке (members[].id) — по нему пересекаем с allowed-set.
    toolRef: text("tool_ref").notNull(),
    // Неймспейс индекса по модели/версии эмбеддингов (hash(providerId|model)) — index обязан совпадать с query.
    embedModelVer: text("embed_model_ver").notNull(),
    // Хэш текста документа ретривала — триггер инкрементальной переиндексации (изменился doc → переэмбеддить).
    docHash: text("doc_hash").notNull(),
    // Текст «документа ретривала» (name+description+examples+...): нужен sparse-FTS и пересборке вектора.
    docText: text("doc_text").notNull(),
    // СЫРОЙ dense-вектор (real[]). NULL, пока вектора нет (pending/failed) — degrade-first.
    embedding: real("embedding").array(),
    // Размерность вектора (sanity-проверка dim-mismatch при смене модели).
    embedDim: integer("embed_dim"),
    // 'indexed' | 'pending' | 'stale' | 'failed'.
    status: text("status").notNull().default("pending"),
    // Причина последней неудачи эмбеддинга (провайдер недоступен/dim-mismatch) — для индикатора статуса.
    lastError: text("last_error"),
    // Время успешной индексации вектора (для индикатора «обновлено N мин назад» и сверки stale).
    indexedAt: timestamp("indexed_at"),
    createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (table) => ({
    // Один эмбеддинг на (scope, воркспейс, вид, ref, модель). В SQL-миграции — null-safe COALESCE по workspace_id.
    toolUnique: uniqueIndex("agent_tool_embeddings_tool_unique").on(
      table.scope,
      table.workspaceId,
      table.toolKind,
      table.toolRef,
      table.embedModelVer,
    ),
    // Срез воркспейса под модель (горячий путь ретривала + агрегат индикатора).
    workspaceScopeIndex: index("agent_tool_embeddings_workspace_scope_idx").on(
      table.workspaceId,
      table.embedModelVer,
    ),
    // Скан сверщика (reconciler) по статусу/свежести.
    statusIndex: index("agent_tool_embeddings_status_idx").on(table.status, table.updatedAt),
  }),
);

export type AgentToolEmbeddingRow = typeof agentToolEmbeddings.$inferSelect;
export type AgentToolEmbeddingInsert = typeof agentToolEmbeddings.$inferInsert;

export const assistantLlmModelSelections = ["explicit", "default"] as const;
export type AssistantLlmModelSelection = (typeof assistantLlmModelSelections)[number];

export const assistantLlmPolicy = pgTable("assistant_llm_policy", {
  id: varchar("id").primaryKey().default("singleton"),
  defaultModelId: varchar("default_model_id").references(() => models.id, {
    onDelete: "set null",
  }),
  disabledModelIds: jsonb("disabled_model_ids")
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const llmRuntimePolicy = pgTable("llm_runtime_policy", {
  id: varchar("id").primaryKey().default("singleton"),
  llmCompletionRequestTimeoutMs: integer("llm_completion_request_timeout_ms").notNull(),
  assistantActionWorkerConcurrency: integer("assistant_action_worker_concurrency").notNull(),
  assistantActionLeaseTtlMs: integer("assistant_action_lease_ttl_ms").notNull(),
  assistantActionHeartbeatIntervalMs: integer("assistant_action_heartbeat_interval_ms").notNull(),
  assistantActionMaxConcurrentPerWorkspace: integer("assistant_action_max_concurrent_per_workspace").notNull(),
  assistantActionMaxConcurrentPerAssistant: integer("assistant_action_max_concurrent_per_assistant").notNull(),
  assistantActionMaxConcurrentPerUser: integer("assistant_action_max_concurrent_per_user").notNull(),
  assistantActionSchedulerMode: text("assistant_action_scheduler_mode").notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const assistants = pgTable(
  "assistants",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()::text`),
    workspaceId: varchar("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name"),
    description: text("description"),
    systemPrompt: text("system_prompt"),
    modelId: varchar("model_id"),
    llmProviderConfigId: varchar("llm_provider_config_id")
      .references(() => llmProviders.id, { onDelete: "set null" }),
    llmModelSelection: text("llm_model_selection")
      .$type<AssistantLlmModelSelection>()
      .notNull()
      .default("explicit"),
    collectionName: text("collection_name")
      .references(() => workspaceVectorCollections.collectionName, { onDelete: "set null" }),
    isSystem: boolean("is_system").notNull().default(false),
      systemKey: text("system_key"),
      executionMode: text("execution_mode").$type<AssistantExecutionMode>().notNull().default("standard"),
      workflowDefinitionId: uuid("workflow_definition_id"),
      workflowSystemTemplateKey: varchar("workflow_system_template_key", { length: 255 }),
      transcriptionWorkflowDefinitionId: uuid("transcription_workflow_definition_id"),
      mode: text("mode").$type<AssistantMode>().notNull().default("rag"),
    ragMode: text("rag_mode").notNull().default("all_collections"),
    ragCollectionIds: jsonb("rag_collection_ids").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    ragSearchMode: text("rag_search_mode").$type<AssistantSearchMode>().notNull().default("profile"),
    ragSearchStrategy: text("rag_search_strategy").$type<SearchProfileStrategy>(),
    ragTopK: integer("rag_top_k"),
    ragMinScore: doublePrecision("rag_min_score"),
    ragMaxContextTokens: integer("rag_max_context_tokens"),
    ragShowSources: boolean("rag_show_sources").notNull().default(true),
  ragHistoryMessagesLimit: integer("rag_history_messages_limit").default(6),
  ragHistoryCharsLimit: integer("rag_history_chars_limit").default(4000),
  ragEnableQueryRewriting: boolean("rag_enable_query_rewriting").default(true),
  ragQueryRewriteModel: text("rag_query_rewrite_model"), // null = использовать основную модель
  ragEnableContextCaching: boolean("rag_enable_context_caching").default(false),
  ragContextCacheTtlSeconds: integer("rag_context_cache_ttl_seconds").default(300), // 5 минут по умолчанию
  ragBm25Weight: doublePrecision("rag_bm25_weight"),
    ragBm25Limit: integer("rag_bm25_limit"),
    ragVectorWeight: doublePrecision("rag_vector_weight"),
    ragVectorLimit: integer("rag_vector_limit"),
    ragBm25Threshold: doublePrecision("rag_bm25_threshold"),
    ragVectorThreshold: doublePrecision("rag_vector_threshold"),
    ragRrfK: integer("rag_rrf_k"),
    ragRerankEnabled: boolean("rag_rerank_enabled").default(false),
    ragRerankProviderId: varchar("rag_rerank_provider_id").references(() => llmProviders.id, { onDelete: "set null" }),
    ragRerankModel: text("rag_rerank_model"),
    ragRerankPrompt: text("rag_rerank_prompt"),
    ragRerankCandidateCount: integer("rag_rerank_candidate_count"),
    ragEmbeddingMode: text("rag_embedding_mode").$type<AssistantEmbeddingMode>().notNull().default("global"),
    ragEmbeddingProviderId: varchar("rag_embedding_provider_id").references(() => embeddingProviders.id, {
      onDelete: "set null",
    }),
    ragEmbeddingModel: text("rag_embedding_model"),
    ragLlmTemperature: doublePrecision("rag_llm_temperature"),
    ragLlmMaxTokens: integer("rag_llm_max_completion_tokens"),
    ragLlmResponseFormat: text("rag_llm_response_format"),
    llmTopP: doublePrecision("llm_top_p"),
    llmTopK: integer("llm_top_k"),
    llmRepeatPenalty: doublePrecision("llm_repeat_penalty"),
    llmSeed: integer("llm_seed"),
    contextInputLimit: integer("context_input_limit"),
    unicaAsrAdvancedOptions: jsonb("unica_asr_advanced_options")
      .$type<UnicaAsrAdvancedOptions>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    mediaInputMode: text("media_input_mode")
      .$type<AssistantMediaInputMode>()
      .notNull()
      .default("default"),
    transcriptionFlowMode: text("transcription_flow_mode")
      .$type<AssistantTranscriptionFlowMode>()
      .notNull()
      .default("standard"),
    asrProviderId: text("asr_provider_id").references(() => speechProviders.id, { onDelete: "set null" }),
    onTranscriptionMode: text("on_transcription_mode")
      .$type<AssistantTranscriptionMode>()
      .notNull()
      .default("raw_only"),
    onTranscriptionAutoActionId: varchar("on_transcription_auto_action_id"),
    status: text("status").$type<AssistantStatus>().notNull().default("active"),
    sharedChatFiles: boolean("shared_chat_files").notNull().default(false),
    // Стартовые подсказки ассистента (prompts, scope=assistant): клик по подсказке
    // сразу отправляет сообщение вместо вставки в композер.
    starterPromptsAutoSend: boolean("starter_prompts_auto_send").notNull().default(false),
    icon: text("icon"),
    iconColor: text("icon_color").notNull().default("gray"),
    // Build (Сборка): провенанс материализованного из Build ассистента + read-only флаг.
    originBuildId: varchar("origin_build_id", { length: 255 }),
    originBuildVersionId: uuid("origin_build_version_id"),
    locked: boolean("locked").notNull().default(false),
    createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (table) => ({
    workspaceIdx: index("assistants_workspace_idx").on(table.workspaceId),
    llmProviderConfigIdx: index("assistants_llm_provider_config_idx").on(table.llmProviderConfigId),
    collectionIdx: index("assistants_collection_name_idx").on(table.collectionName),
    workflowDefinitionIdx: index("assistants_workflow_definition_idx").on(table.workflowDefinitionId),
    workspaceSystemKeyUnique: uniqueIndex("assistants_workspace_system_key_unique_idx").on(
      table.workspaceId,
      table.systemKey,
    ),
  }),
);

export const assistantUserTranscriptionPreferences = pgTable(
  "assistant_user_transcription_preferences",
  {
    workspaceId: varchar("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    assistantId: varchar("assistant_id")
      .notNull()
      .references(() => assistants.id, { onDelete: "cascade" }),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    diarizationEnabled: boolean("diarization_enabled"),
    postTranscriptionActionIds: jsonb("post_transcription_action_ids").$type<string[] | null>(),
    createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.workspaceId, table.assistantId, table.userId] }),
    workspaceUserIdx: index("assistant_user_transcription_preferences_workspace_user_idx").on(
      table.workspaceId,
      table.userId,
    ),
  }),
);

export type AssistantUserTranscriptionPreference =
  typeof assistantUserTranscriptionPreferences.$inferSelect;
export type AssistantUserTranscriptionPreferenceInsert =
  typeof assistantUserTranscriptionPreferences.$inferInsert;

// Action scopes, targets, placements and modes
// ---------------------------------------------------------------------------
// Prompts — библиотека промптов и стартовые подсказки чата (Фазы 1–2).
// Скоупы: system — вендорский сид (редактируется только видимость),
// instance — промпты организации (админ-консоль), workspace — промпты пространства,
// assistant — starters конкретного ассистента (правит владелец, показываются
// ВМЕСТО общей агрегации в пустом чате ассистента, порядок без ротации),
// personal — личные промпты пользователя (живут внутри workspace, видны только
// владельцу; owner_user_id заполнен ⇔ scope=personal, уходят вместе с пользователем).
// Скоупы независимы и агрегируются (не наследуются); стартовая страница
// берёт 4 слота с приоритетом workspace → instance → system и ротацией внутри уровня
// (personal в выдачу стартовой страницы не входит — решение Фазы 2B, волна 2).
// ---------------------------------------------------------------------------

export const promptScopes = ["system", "instance", "workspace", "assistant", "personal"] as const;
export type PromptScope = (typeof promptScopes)[number];

export const promptPlacements = ["start_screen", "composer_menu"] as const;
export type PromptPlacement = (typeof promptPlacements)[number];

export const prompts = pgTable(
  "prompts",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()::text`),
    scope: text("scope").$type<PromptScope>().notNull().default("workspace"),
    workspaceId: varchar("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
    assistantId: varchar("assistant_id").references(() => assistants.id, { onDelete: "cascade" }),
    // Владелец личного промпта (заполнен ⇔ scope=personal): CASCADE — личные промпты
    // уходят вместе с пользователем, в отличие от created_by (авторство, SET NULL).
    ownerUserId: varchar("owner_user_id").references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    body: text("body").notNull(),
    description: text("description"),
    category: text("category"),
    placement: text("placement").array().notNull().default(sql`'{start_screen}'::text[]`),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    // Счётчик использований (Фаза 3): инкремент при вставке промпта в композер (чип
    // стартовой, библиотека, слэш-меню, starter). Кэш кандидатов инкрементом не сбрасывается.
    usageCount: integer("usage_count").notNull().default(0),
    lastUsedAt: timestamp("last_used_at"),
    createdBy: varchar("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (table) => ({
    workspaceIdx: index("prompts_workspace_idx").on(table.workspaceId),
    scopeActiveIdx: index("prompts_scope_active_idx").on(table.scope, table.isActive),
    assistantIdx: index("prompts_assistant_idx").on(table.assistantId),
    ownerIdx: index("prompts_owner_idx").on(table.ownerUserId),
  }),
);

export type Prompt = typeof prompts.$inferSelect;
export type PromptInsert = typeof prompts.$inferInsert;

export const actionScopes = ["system", "workspace"] as const;
export type ActionScope = (typeof actionScopes)[number];

export const actionTargets = ["transcript", "knowledge_document", "message", "selection", "conversation"] as const;
export type ActionTarget = (typeof actionTargets)[number];

export const actionSources = actionTargets;
export type ActionSource = (typeof actionSources)[number];

export const actionPlacements = ["canvas", "chat_message", "chat_toolbar"] as const;
export type ActionPlacement = (typeof actionPlacements)[number];

export const actionInputTypes = ["full_transcript", "full_text", "selection", "message_text"] as const;
export type ActionInputType = (typeof actionInputTypes)[number];

export const actionOutputModes = ["replace_text", "new_version", "new_message", "document"] as const;
export type ActionOutputMode = (typeof actionOutputModes)[number];

export const actionKinds = ["prompt", "tool", "hybrid"] as const;
export type ActionKind = (typeof actionKinds)[number];

export const actionLlmPolicyModes = ["action_managed", "inherit_binding", "inherit_legacy_assistant"] as const;
export type ActionLlmPolicyMode = (typeof actionLlmPolicyModes)[number];

export const actionStatuses = ["active", "archived"] as const;
export type ActionStatus = (typeof actionStatuses)[number];

export const actionBindingEntityTypes = [
  "assistant",
  "knowledge_document",
  "knowledge_base",
  "chat",
  "workspace_default",
] as const;
export type ActionBindingEntityType = (typeof actionBindingEntityTypes)[number];

export const actionExecutionResourceTypes = [
  "transcript",
  "knowledge_document",
  "chat_message",
  "selection",
] as const;
export type ActionExecutionResourceType = (typeof actionExecutionResourceTypes)[number];

export const actionExecutionTriggers = ["manual", "auto", "api"] as const;
export type ActionExecutionTrigger = (typeof actionExecutionTriggers)[number];

export const actionExecutionStatuses = ["running", "success", "failed"] as const;
export type ActionExecutionStatus = (typeof actionExecutionStatuses)[number];

export const assistantActionRunStatuses = ["pending", "running", "success", "error", "cancelled"] as const;
export type AssistantActionRunStatus = (typeof assistantActionRunStatuses)[number];

export const actions = pgTable(
  "actions",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()::text`),
    scope: text("scope").$type<ActionScope>().notNull().default("workspace"),
    workspaceId: varchar("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    description: text("description"),
    target: text("target").$type<ActionTarget>().notNull(),
    sources: text("sources").array().notNull().default(sql`'{}'::text[]`),
    placements: text("placements").array().notNull().default(sql`'{}'::text[]`),
    promptTemplate: text("prompt_template").notNull(),
    inputType: text("input_type").$type<ActionInputType>().notNull().default("full_text"),
    outputMode: text("output_mode").$type<ActionOutputMode>().notNull().default("replace_text"),
    actionKind: text("action_kind").$type<ActionKind>().notNull().default("prompt"),
    toolName: text("tool_name"),
    toolConfig: jsonb("tool_config").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    llmPolicyMode: text("llm_policy_mode")
      .$type<ActionLlmPolicyMode>()
      .notNull()
      .default("inherit_legacy_assistant"),
    inheritAssistantSystemPrompt: boolean("inherit_assistant_system_prompt").notNull().default(false),
    llmProviderConfigId: varchar("llm_provider_config_id").references(() => llmProviders.id, { onDelete: "set null" }),
    llmModelId: text("llm_model_id"),
    llmTemperature: doublePrecision("llm_temperature"),
    llmMaxCompletionTokens: integer("llm_max_completion_tokens"),
    llmTopP: doublePrecision("llm_top_p"),
    llmTopK: integer("llm_top_k"),
    llmRepeatPenalty: doublePrecision("llm_repeat_penalty"),
    llmSeed: integer("llm_seed"),
    inputContract: jsonb("input_contract").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    outputContract: jsonb("output_contract").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    status: text("status").$type<ActionStatus>().notNull().default("active"),
    // Legacy compatibility: сохраняем старую колонку для переходного периода.
    llmConfigId: varchar("llm_config_id").references(() => llmProviders.id, { onDelete: "set null" }),
    // Build (Сборка): идентичность действия для дедупа/резолва при импорте Build.
    originRef: varchar("origin_ref", { length: 255 }),
    originContentHash: varchar("origin_content_hash", { length: 128 }),
    sourceBuildId: varchar("source_build_id", { length: 255 }),
    sourceBuildVersion: varchar("source_build_version", { length: 100 }),
    managedByBuild: boolean("managed_by_build").notNull().default(false),
    locallyModified: boolean("locally_modified").notNull().default(false),
    deletedAt: timestamp("deleted_at"),
    createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (table) => ({
    workspaceIdx: index("actions_workspace_idx").on(table.workspaceId),
    scopeIdx: index("actions_scope_idx").on(table.scope),
    originRefIdx: index("actions_origin_ref_idx").on(table.workspaceId, table.originRef),
  }),
);

export const actionBindings = pgTable(
  "action_bindings",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()::text`),
    workspaceId: varchar("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    actionId: varchar("action_id")
      .notNull()
      .references(() => actions.id, { onDelete: "cascade" }),
    entityType: text("entity_type").$type<ActionBindingEntityType>().notNull(),
    entityId: varchar("entity_id").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    placementConfig: jsonb("placement_config").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    constraints: jsonb("constraints").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    labelOverride: text("label_override"),
    createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (table) => ({
    workspaceIdx: index("action_bindings_workspace_idx").on(table.workspaceId),
    actionIdx: index("action_bindings_action_idx").on(table.actionId),
    entityIdx: index("action_bindings_entity_idx").on(table.entityType, table.entityId),
    bindingUnique: uniqueIndex("action_bindings_unique_idx").on(
      table.workspaceId,
      table.actionId,
      table.entityType,
      table.entityId,
    ),
  }),
);

export const actionExecutions = pgTable(
  "action_executions",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()::text`),
    workspaceId: varchar("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    actionId: varchar("action_id")
      .notNull()
      .references(() => actions.id, { onDelete: "cascade" }),
    bindingId: varchar("binding_id").references(() => actionBindings.id, { onDelete: "set null" }),
    resourceType: text("resource_type").$type<ActionExecutionResourceType>().notNull(),
    resourceId: varchar("resource_id").notNull(),
    trigger: text("trigger").$type<ActionExecutionTrigger>().notNull().default("api"),
    status: text("status").$type<ActionExecutionStatus>().notNull().default("running"),
    providerId: text("provider_id"),
    modelId: text("model_id"),
    usageTokens: integer("usage_tokens"),
    creditsCharged: integer("credits_charged").notNull().default(0),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
    finishedAt: timestamp("finished_at"),
    meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    userId: varchar("user_id").references(() => users.id, { onDelete: "set null" }),
  },
  (table) => ({
    startedAtIdx: index("action_executions_started_at_idx").on(table.startedAt),
    userStartedIdx: index("action_executions_user_started_idx").on(table.userId, table.startedAt),
    workspaceStartedIdx: index("action_executions_workspace_started_idx").on(table.workspaceId, table.startedAt),
    actionStartedIdx: index("action_executions_action_started_idx").on(table.actionId, table.startedAt),
    resourceIdx: index("action_executions_resource_idx").on(table.resourceType, table.resourceId, table.startedAt),
    statusStartedIdx: index("action_executions_status_started_idx").on(table.status, table.startedAt),
  }),
);

export const assistantActionRuns = pgTable(
  "assistant_action_runs",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: varchar("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    assistantId: varchar("assistant_id")
      .notNull()
      .references(() => assistants.id, { onDelete: "cascade" }),
    actionId: varchar("action_id")
      .notNull()
      .references(() => actions.id, { onDelete: "cascade" }),
    userId: varchar("user_id").references(() => users.id, { onDelete: "set null" }),
    chatId: varchar("chat_id").references(() => chatSessions.id, { onDelete: "cascade" }),
    transcriptId: varchar("transcript_id").references(() => transcripts.id, { onDelete: "cascade" }),
    actionLabel: text("action_label"),
    placement: text("placement").notNull(),
    target: text("target").notNull(),
    transcriptText: text("transcript_text").notNull(),
    context: jsonb("context").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    status: text("status").$type<AssistantActionRunStatus>().notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    workerId: text("worker_id"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true }),
    executionId: varchar("execution_id"),
    documentId: uuid("document_id"),
    truncated: boolean("truncated").notNull().default(false),
    originalLength: integer("original_length"),
    storedLength: integer("stored_length"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at"),
    finishedAt: timestamp("finished_at"),
    createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (table) => ({
    workspaceStatusIdx: index("assistant_action_runs_workspace_status_idx").on(
      table.workspaceId,
      table.status,
      table.createdAt,
    ),
    assistantStatusIdx: index("assistant_action_runs_assistant_status_idx").on(table.assistantId, table.status, table.createdAt),
    transcriptStatusIdx: index("assistant_action_runs_transcript_status_idx").on(
      table.transcriptId,
      table.status,
      table.createdAt,
    ),
    statusCreatedIdx: index("assistant_action_runs_status_created_idx").on(table.status, table.createdAt),
    statusLeaseIdx: index("assistant_action_runs_status_lease_idx").on(table.status, table.leaseExpiresAt),
    workerStatusIdx: index("assistant_action_runs_worker_status_idx").on(table.workerId, table.status),
    userStatusLeaseIdx: index("assistant_action_runs_user_status_lease_idx").on(
      table.userId,
      table.status,
      table.leaseExpiresAt,
    ),
  }),
);

export const assistantActions = pgTable(
  "assistant_actions",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()::text`),
    assistantId: varchar("assistant_id")
      .notNull()
      .references(() => assistants.id, { onDelete: "cascade" }),
    actionId: varchar("action_id")
      .notNull()
      .references(() => actions.id, { onDelete: "cascade" }),
    workspaceId: varchar("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    enabled: boolean("enabled").notNull().default(false),
    enabledPlacements: text("enabled_placements").array().notNull().default(sql`'{}'::text[]`),
    labelOverride: text("label_override"),
    createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (table) => ({
    workspaceIdx: index("assistant_actions_workspace_idx").on(table.workspaceId),
    assistantIdx: index("assistant_actions_assistant_idx").on(table.assistantId),
    actionIdx: index("assistant_actions_action_idx").on(table.actionId),
    assistantActionUnique: uniqueIndex("assistant_actions_assistant_action_unique_idx").on(table.assistantId, table.actionId),
  }),
);

export const chatMessageRoles = ["user", "assistant", "system"] as const;
export type ChatMessageRole = (typeof chatMessageRoles)[number];
export const chatMessageTypes = ["text", "file", "card"] as const;
export type ChatMessageType = (typeof chatMessageTypes)[number];

export const chatStatuses = ["active", "archived", "deleted"] as const;
export type ChatStatus = (typeof chatStatuses)[number];

export const assistantActionTypes = ["ANALYZING", "TRANSCRIBING", "TYPING"] as const;
export type AssistantActionType = (typeof assistantActionTypes)[number];

export const botActionTypes = ["transcribe_audio", "summarize", "generate_image", "process_file"] as const;
export type BotActionType = (typeof botActionTypes)[number];

export const botActionStatuses = ["processing", "done", "error"] as const;
export type BotActionStatus = (typeof botActionStatuses)[number];

// Telegram-style событие активности бота. actionType допускает string, чтобы не падать на новых типах.
export type BotAction = {
  workspaceId: string;
  chatId: string;
  actionId: string;
  actionType: BotActionType | string;
  status: BotActionStatus;
  displayText?: string | null;
  payload?: Record<string, unknown> | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export const botActionSchema = z.object({
  workspaceId: z.string().min(1),
  chatId: z.string().min(1),
  actionId: z.string().min(1),
  actionType: z.string().min(1), // допускаем произвольный тип, фронт обрабатывает через displayText/fallback
  status: z.enum(botActionStatuses),
  displayText: z.string().nullable().optional(),
  payload: z.record(z.string(), z.any()).nullable().optional(),
  createdAt: z.string().datetime().nullable().optional(),
  updatedAt: z.string().datetime().nullable().optional(),
});

export const botActions = pgTable(
  "bot_actions",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: varchar("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    chatId: varchar("chat_id")
      .notNull()
      .references(() => chatSessions.id, { onDelete: "cascade" }),
    actionId: text("action_id").notNull(),
    actionType: text("action_type").notNull(),
    status: text("status").$type<BotActionStatus>().notNull().default("processing"),
    displayText: text("display_text"),
    payload: jsonb("payload").$type<Record<string, unknown> | null>().default(sql`'{}'::jsonb`),
    startedAt: timestamp("started_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (table) => ({
    chatIdx: index("bot_actions_chat_idx").on(table.workspaceId, table.chatId, table.updatedAt),
    statusIdx: index("bot_actions_status_idx").on(table.workspaceId, table.chatId, table.status),
    uniqueAction: uniqueIndex("bot_actions_action_unique_idx").on(
      table.workspaceId,
      table.chatId,
      table.actionId,
    ),
  }),
);
export type BotActionRecord = typeof botActions.$inferSelect;

export const packageBuilderStageValues = ["discovery", "clarification", "drafting", "review"] as const;
export type PackageBuilderStage = (typeof packageBuilderStageValues)[number];

export type ChatSessionMetadata = {
  builderKind?: PackageKind;
  activeDraftId?: string;
  stage?: PackageBuilderStage;
  [key: string]: unknown;
};

export const chatSessions = pgTable(
  "chat_sessions",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()::text`),
    workspaceId: varchar("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    assistantId: varchar("assistant_id")
      .notNull()
      .references(() => assistants.id, { onDelete: "cascade" }),
    title: text("title").notNull().default(""),
    status: text("status").$type<ChatStatus>().notNull().default("active"),
    currentAssistantActionType: text("current_assistant_action_type").$type<AssistantActionType | null>(),
    currentAssistantActionText: text("current_assistant_action_text"),
    currentAssistantActionTriggerMessageId: text("current_assistant_action_trigger_message_id"),
    currentAssistantActionUpdatedAt: timestamp("current_assistant_action_updated_at"),
    metadata: jsonb("metadata").$type<ChatSessionMetadata>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
    deletedAt: timestamp("deleted_at"),
  },
  (table) => ({
    deletedAtIdx: index("chat_sessions_deleted_at_idx").on(table.deletedAt).where(sql`"deleted_at" IS NOT NULL`),
    workspaceUserIdx: index("chat_sessions_workspace_user_idx").on(
      table.workspaceId,
      table.userId,
      table.createdAt,
    ),
    // 0260: FK-индекс под каскад удаления ассистента (assistant_id).
    assistantIdx: index("chat_sessions_assistant_id_idx").on(table.assistantId),
  }),
);

export const chatCardTypes = ["transcript", "document", "form", "context_request"] as const;
export type ChatCardType = (typeof chatCardTypes)[number];

export const chatCards = pgTable(
  "chat_cards",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()::text`),
    workspaceId: varchar("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    chatId: varchar("chat_id")
      .notNull()
      .references(() => chatSessions.id, { onDelete: "cascade" }),
    type: text("type").$type<ChatCardType>().notNull(),
    title: text("title"),
    previewText: text("preview_text"),
    transcriptId: varchar("transcript_id"),
    documentId: varchar("document_id"),
    formRequestId: uuid("form_request_id"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdByUserId: varchar("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (table) => ({
    workspaceIdx: index("chat_cards_workspace_idx").on(table.workspaceId, table.createdAt),
    chatIdx: index("chat_cards_chat_idx").on(table.chatId, table.createdAt),
  }),
);
export type ChatCard = typeof chatCards.$inferSelect;
export type ChatCardInsert = typeof chatCards.$inferInsert;

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()::text`),
    chatId: varchar("chat_id")
      .notNull()
      .references(() => chatSessions.id, { onDelete: "cascade" }),
    cardId: varchar("card_id").references(() => chatCards.id, { onDelete: "set null" }),
    messageType: text("message_type").$type<ChatMessageType>().notNull().default("text"),
    role: text("role").$type<ChatMessageRole>().notNull(),
    content: text("content").notNull(),
    metadata: jsonb("metadata").$type<ChatMessageMetadata>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (table) => ({
    chatIdx: index("chat_messages_chat_idx").on(table.chatId, table.createdAt),
    // 0260: FK-индекс под SET NULL при удалении карточки (card_id).
    cardIdx: index("chat_messages_card_id_idx").on(table.cardId),
  }),
);

export const transcriptStatuses = ["processing", "postprocessing", "ready", "failed", "auto_action_failed"] as const;
export type TranscriptStatus = (typeof transcriptStatuses)[number];

export type ChatMessageAttachmentMetadata = {
  id?: string;
  attachmentId?: string;
  filename?: string;
  mimeType?: string | null;
  sizeBytes?: number | null;
  kind?: "image" | "document" | "audio" | "video" | string;
  downloadUrl?: string;
  expiresAt?: string | null;
  uploadedByUserId?: string | null;
  extractedText?: string;
  extractionError?: string | null;
  extractedTextLength?: number;
  isTruncated?: boolean;
  [key: string]: unknown;
};

export const transcriptAudioWaveformStatuses = ["pending", "processing", "ready", "failed"] as const;
export type TranscriptAudioWaveformStatus = (typeof transcriptAudioWaveformStatuses)[number];
export const transcriptAudioWaveformStatusEnum = pgEnum(
  "transcript_audio_waveform_status",
  transcriptAudioWaveformStatuses,
);

export type TranscriptAudioSourceDto = {
  transcriptId: string;
  fileId: string | null;
  attachmentId: string | null;
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  durationMs: number | null;
  waveformStatus: TranscriptAudioWaveformStatus;
  waveformPeaks: number[] | null;
};

export type ChatMessageMetadata = {
  transcriptId?: string;
  transcriptStatus?: TranscriptStatus;
  audioSourceAvailable?: boolean;
  audioAttachmentId?: string | null;
  audioDurationMs?: number | null;
  waveformStatus?: TranscriptAudioWaveformStatus | string | null;
  generationStatus?: "stopped" | string;
  stopReason?: string | null;
  stoppedAt?: string | null;
  reasoning?: {
    text?: string;
    mode?: ReasoningMode | string;
    label?: string;
  };
  workflowRunId?: string;
  workflowStatus?: string;
  workflowDefinitionId?: string;
  resolvedWorkflowVersionId?: string;
  resolvedWorkflowVersionNo?: number;
  contextRefs?: ContextRef[];
  composerParts?: ComposerPart[];
  resolvedContextRefs?: ResolvedContextRef[];
  workflowContextRequest?: WorkflowContextRequestChatMetadata;
  attachments?: ChatMessageAttachmentMetadata[];
  file?: {
    attachmentId?: string;
    filename?: string;
    mimeType?: string | null;
    sizeBytes?: number | null;
    kind?: "image" | "document" | "audio" | "video" | string;
    downloadUrl?: string;
    expiresAt?: string | null;
    storageKey?: string;
    uploadedByUserId?: string | null;
  };
  [key: string]: unknown;
};

export const transcripts = pgTable(
  "transcripts",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()::text`),
    workspaceId: varchar("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    chatId: varchar("chat_id")
      .notNull()
      .references(() => chatSessions.id, { onDelete: "cascade" }),
    sourceFileId: varchar("source_file_id"),
    status: text("status").$type<TranscriptStatus>().notNull().default("processing"),
    title: text("title"),
    previewText: text("preview_text"),
    fullText: text("full_text"),
    contentJson: jsonb("content_json"),
    segmentsJson: jsonb("segments_json"),
    revision: integer("revision").notNull().default(1),
    lastEditedByUserId: varchar("last_edited_by_user_id"),
    defaultViewId: varchar("default_view_id"),
    defaultViewActionId: varchar("default_view_action_id"),
    createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (table) => ({
    workspaceIdx: index("transcripts_workspace_idx").on(table.workspaceId),
    chatIdx: index("transcripts_chat_idx").on(table.chatId),
    statusIdx: index("transcripts_status_idx").on(table.status),
    defaultViewIdx: index("transcripts_default_view_idx").on(table.defaultViewId),
    defaultViewActionIdx: index("transcripts_default_view_action_idx").on(table.defaultViewActionId),
  }),
);

export const transcriptViews = pgTable(
  "transcript_views",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()::text`),
    transcriptId: varchar("transcript_id")
      .notNull()
      .references(() => transcripts.id, { onDelete: "cascade" }),
    actionId: varchar("action_id"),
    label: text("label").notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (table) => ({
    transcriptIdx: index("transcript_views_transcript_idx").on(table.transcriptId),
  }),
);

export const transcriptAudioSources = pgTable(
  "transcript_audio_sources",
  {
    transcriptId: varchar("transcript_id")
      .notNull()
      .references(() => transcripts.id, { onDelete: "cascade" }),
    fileId: uuid("file_id").references(() => files.id, { onDelete: "set null" }),
    attachmentId: varchar("attachment_id").references(() => chatAttachments.id, { onDelete: "set null" }),
    messageId: varchar("message_id").references(() => chatMessages.id, { onDelete: "set null" }),
    durationMs: integer("duration_ms"),
    waveformStatus: transcriptAudioWaveformStatusEnum("waveform_status").notNull().default("pending"),
    waveformPeaksJson: jsonb("waveform_peaks_json").$type<number[] | null>(),
    createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (table) => ({
    transcriptPk: primaryKey({ columns: [table.transcriptId] }),
    fileIdx: index("transcript_audio_sources_file_idx").on(table.fileId),
    attachmentIdx: index("transcript_audio_sources_attachment_idx").on(table.attachmentId),
    messageIdx: index("transcript_audio_sources_message_idx").on(table.messageId),
    waveformIdx: index("transcript_audio_sources_waveform_idx").on(table.waveformStatus, table.updatedAt),
  }),
);

export const chatAttachmentDocumentStatuses = ["pending", "processing", "ready", "failed"] as const;
export type ChatAttachmentDocumentStatus = (typeof chatAttachmentDocumentStatuses)[number];

export const chatAttachments = pgTable(
  "chat_attachments",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()::text`),
    workspaceId: varchar("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
  chatId: varchar("chat_id")
    .notNull()
    .references(() => chatSessions.id, { onDelete: "cascade" }),
  messageId: varchar("message_id").references(() => chatMessages.id, { onDelete: "set null" }),
  fileId: uuid("file_id").references(() => files.id, { onDelete: "set null" }),
  uploaderUserId: varchar("uploader_user_id").references(() => users.id, { onDelete: "set null" }),
  filename: text("filename").notNull(),
  mimeType: text("mime_type"),
  sizeBytes: bigint("size_bytes", { mode: "number" }),
  storageKey: text("storage_key").notNull(),
  documentVersion: integer("document_version").notNull().default(1),
  contentHash: text("content_hash"),
  previewText: text("preview_text"),
  previewObjectKey: text("preview_object_key"),
  derivedManifestObjectKey: text("derived_manifest_object_key"),
  extractionStatus: text("extraction_status").$type<ChatAttachmentDocumentStatus>().notNull().default("pending"),
  indexingStatus: text("indexing_status").$type<ChatAttachmentDocumentStatus>().notNull().default("pending"),
  extractionEngine: text("extraction_engine"),
  charCount: integer("char_count"),
  pageCount: integer("page_count"),
  blockCount: integer("block_count"),
  extractionCompletedAt: timestamp("extraction_completed_at", { withTimezone: true }),
  indexedAt: timestamp("indexed_at", { withTimezone: true }),
  extractedText: text("extracted_text"),
  extractedTextLength: integer("extracted_text_length"),
  extractionError: text("extraction_error"),
  isTruncated: boolean("is_truncated"),
    createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    workspaceIdx: index("chat_attachments_workspace_idx").on(table.workspaceId, table.createdAt),
    chatIdx: index("chat_attachments_chat_idx").on(table.chatId, table.createdAt),
    messageIdx: index("chat_attachments_message_idx").on(table.messageId),
    fileIdx: index("chat_attachments_file_idx").on(table.fileId),
  }),
);

export type ChatAttachment = typeof chatAttachments.$inferSelect;
export type ChatAttachmentInsert = typeof chatAttachments.$inferInsert;

export const chatFileIngestionJobStatuses = ["pending", "processing", "done", "error"] as const;
export type ChatFileIngestionJobStatus = (typeof chatFileIngestionJobStatuses)[number];

export const chatFileIngestionJobs = pgTable(
  "chat_file_ingestion_jobs",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    jobType: text("job_type").notNull().default("chat_file_ingestion"),
    workspaceId: varchar("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    assistantId: varchar("assistant_id").notNull(),
    chatId: varchar("chat_id")
      .notNull()
      .references(() => chatSessions.id, { onDelete: "cascade" }),
    attachmentId: varchar("attachment_id").notNull(),
    fileVersion: integer("file_version").notNull().default(1),
    status: text("status").$type<ChatFileIngestionJobStatus>().notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextRetryAt: timestamp("next_retry_at"),
    lastError: text("last_error"),
    chunkCount: integer("chunk_count"),
    totalChars: integer("total_chars"),
    totalTokens: integer("total_tokens"),
    createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    statusIdx: index("chat_file_ingestion_jobs_status_idx").on(table.status, table.nextRetryAt),
    attachmentIdx: index("chat_file_ingestion_jobs_attachment_idx").on(table.attachmentId),
    uniqueJob: uniqueIndex("chat_file_ingestion_jobs_unique_idx").on(
      table.jobType,
      table.attachmentId,
      table.fileVersion,
    ),
    // 0260: FK-индексы под каскад удаления чат-сессии / пространства (chat_id / workspace_id).
    chatIdx: index("chat_file_ingestion_jobs_chat_id_idx").on(table.chatId),
    workspaceIdx: index("chat_file_ingestion_jobs_workspace_id_idx").on(table.workspaceId),
  }),
);

export type ChatFileIngestionJob = typeof chatFileIngestionJobs.$inferSelect;
export type ChatFileIngestionJobInsert = typeof chatFileIngestionJobs.$inferInsert;

export const assistantFileStatuses = ["uploaded", "processing", "ready", "error"] as const;
export type AssistantFileStatus = (typeof assistantFileStatuses)[number];

/**
 * Универсальная роль файла ассистента (домен/формат-агностично):
 * - `rag_source` — индексируется в вектор-хранилище, в чат идут релевантные сниппеты (дефолт, старое поведение);
 * - `material` — файл доступен чатам ассистента ЦЕЛИКОМ как рабочий артефакт (шаблон / образец-эталон / few-shot).
 *   Материалы НЕ индексируются (не попадают в RAG-ретривал), а резолвятся лениво через `system.documents.*`.
 */
export const assistantFileRoles = ["rag_source", "material"] as const;
export type AssistantFileRole = (typeof assistantFileRoles)[number];
export const ASSISTANT_FILE_ROLE_DEFAULT: AssistantFileRole = "rag_source";

export const assistantFiles = pgTable(
  "assistant_files",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: varchar("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    assistantId: varchar("assistant_id")
      .notNull()
      .references(() => assistants.id, { onDelete: "cascade" }),
    fileId: uuid("file_id").references(() => files.id, { onDelete: "set null" }),
    storageKey: text("storage_key").notNull(),
    originalName: text("original_name").notNull(),
    mimeType: text("mime_type"),
    sizeBytes: bigint("size_bytes", { mode: "number" }),
    version: integer("version").notNull().default(1),
    role: text("role").$type<AssistantFileRole>().notNull().default(ASSISTANT_FILE_ROLE_DEFAULT),
    status: text("status").$type<AssistantFileStatus>().notNull().default("uploaded"),
    processingStatus: text("processing_status").$type<AssistantFileStatus>().notNull().default("processing"),
    processingErrorMessage: text("processing_error_message"),
    createdByUserId: varchar("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (table) => ({
    workspaceIdx: index("assistant_files_workspace_idx").on(table.workspaceId, table.createdAt),
    assistantIdx: index("assistant_files_assistant_idx").on(table.assistantId, table.createdAt),
  }),
);

export type AssistantFile = typeof assistantFiles.$inferSelect;
export type AssistantFileInsert = typeof assistantFiles.$inferInsert;

export const assistantFileIngestionJobStatuses = ["pending", "running", "done", "error"] as const;
export type AssistantFileIngestionJobStatus = (typeof assistantFileIngestionJobStatuses)[number];

export const assistantFileIngestionJobs = pgTable(
  "assistant_file_ingestion_jobs",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    jobType: text("job_type").notNull().default("assistant_file_ingestion"),
    workspaceId: varchar("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    assistantId: varchar("assistant_id")
      .notNull()
      .references(() => assistants.id, { onDelete: "cascade" }),
    fileId: uuid("file_id")
      .notNull()
      .references(() => assistantFiles.id, { onDelete: "cascade" }),
    fileVersion: integer("file_version").notNull(),
    status: text("status").$type<AssistantFileIngestionJobStatus>().notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextRetryAt: timestamp("next_retry_at"),
    lastError: text("last_error"),
    chunkCount: integer("chunk_count"),
    totalChars: integer("total_chars"),
    totalTokens: integer("total_tokens"),
    createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (table) => ({
    uniqueJob: uniqueIndex("assistant_file_ingestion_jobs_unique_job_idx").on(
      table.jobType,
      table.fileId,
      table.fileVersion,
    ),
    workspaceIdx: index("assistant_file_ingestion_jobs_workspace_idx").on(
      table.workspaceId,
      table.status,
      table.nextRetryAt,
    ),
    assistantIdx: index("assistant_file_ingestion_jobs_assistant_idx").on(table.assistantId, table.status, table.nextRetryAt),
  }),
);

export type AssistantFileIngestionJob = typeof assistantFileIngestionJobs.$inferSelect;
export type AssistantFileIngestionJobInsert = typeof assistantFileIngestionJobs.$inferInsert;

export const canvasDocumentTypes = ["source", "derived", "summary", "cleaned", "custom"] as const;
export type CanvasDocumentType = (typeof canvasDocumentTypes)[number];

export const canvasDocuments = pgTable(
  "canvas_documents",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: varchar("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    chatId: varchar("chat_id")
      .notNull()
      .references(() => chatSessions.id, { onDelete: "cascade" }),
    transcriptId: varchar("transcript_id").references(() => transcripts.id, { onDelete: "cascade" }),
    sourceMessageId: varchar("source_message_id").references(() => chatMessages.id, { onDelete: "set null" }),
    assistantId: varchar("assistant_id").references(() => assistants.id, { onDelete: "set null" }),
    actionId: varchar("action_id").references(() => actions.id, { onDelete: "set null" }),
    assistantActionRunId: uuid("assistant_action_run_id").references(() => assistantActionRuns.id, {
      onDelete: "set null",
    }),
    type: text("type").$type<CanvasDocumentType>().notNull().default("derived"),
    title: text("title").notNull(),
    content: text("content").notNull(),
    contentJson: jsonb("content_json"),
    revision: integer("revision").notNull().default(1),
    isDefault: boolean("is_default").notNull().default(false),
    createdByUserId: varchar("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
    deletedAt: timestamp("deleted_at"),
  },
  (table) => ({
    workspaceIdx: index("canvas_documents_workspace_idx").on(table.workspaceId),
    chatIdx: index("canvas_documents_chat_idx").on(table.chatId),
    chatSourceMessageIdx: index("canvas_documents_chat_source_message_idx").on(table.chatId, table.sourceMessageId),
    transcriptIdx: index("canvas_documents_transcript_idx").on(table.transcriptId),
    assistantIdx: index("canvas_documents_assistant_idx").on(table.assistantId),
    actionIdx: index("canvas_documents_action_idx").on(table.actionId),
    assistantActionRunIdx: index("canvas_documents_assistant_action_run_idx").on(table.assistantActionRunId),
  }),
);

export const documentTargetTypes = ["transcript", "canvas_document"] as const;
export type DocumentTargetType = (typeof documentTargetTypes)[number];

export const documentTabTypes = ["original", "canvas_document"] as const;
export type DocumentTabType = (typeof documentTabTypes)[number];

export const documentBindingModes = ["bound", "unbound"] as const;
export type DocumentBindingMode = (typeof documentBindingModes)[number];

export const documentRevisionSources = [
  "manual_save",
  "autosave",
  "ai_apply",
  "revert",
  "migration",
] as const;
export type DocumentRevisionSource = (typeof documentRevisionSources)[number];

export const documentProposalStatuses = [
  "pending",
  "applied",
  "rejected",
  "stale",
  "failed",
] as const;
export type DocumentProposalStatus = (typeof documentProposalStatuses)[number];

export const documentRevisions = pgTable(
  "document_revisions",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: varchar("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    chatId: varchar("chat_id")
      .notNull()
      .references(() => chatSessions.id, { onDelete: "cascade" }),
    transcriptId: varchar("transcript_id").references(() => transcripts.id, {
      onDelete: "cascade",
    }),
    targetType: text("target_type").$type<DocumentTargetType>().notNull(),
    targetId: text("target_id").notNull(),
    revision: integer("revision").notNull(),
    contentJson: jsonb("content_json"),
    contentText: text("content_text").notNull().default(""),
    source: text("source").$type<DocumentRevisionSource>().notNull(),
    proposalId: uuid("proposal_id"),
    authorUserId: varchar("author_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (table) => ({
    workspaceIdx: index("document_revisions_workspace_idx").on(table.workspaceId),
    chatIdx: index("document_revisions_chat_idx").on(table.chatId),
    transcriptIdx: index("document_revisions_transcript_idx").on(table.transcriptId),
    targetIdx: index("document_revisions_target_idx").on(table.targetType, table.targetId),
    sourceIdx: index("document_revisions_source_idx").on(table.source, table.createdAt),
    targetRevisionUniqueIdx: uniqueIndex("document_revisions_target_revision_uq").on(
      table.targetType,
      table.targetId,
      table.revision,
    ),
  }),
);

export const documentEditProposals = pgTable(
  "document_edit_proposals",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: varchar("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    chatId: varchar("chat_id")
      .notNull()
      .references(() => chatSessions.id, { onDelete: "cascade" }),
    transcriptId: varchar("transcript_id").references(() => transcripts.id, {
      onDelete: "cascade",
    }),
    tabType: text("tab_type").$type<DocumentTabType>().notNull(),
    tabId: text("tab_id").notNull(),
    targetType: text("target_type").$type<DocumentTargetType>().notNull(),
    targetId: text("target_id").notNull(),
    bindingMode: text("binding_mode").$type<DocumentBindingMode>().notNull(),
    baseRevision: integer("base_revision").notNull(),
    baseHash: text("base_hash").notNull(),
    proposedContentJson: jsonb("proposed_content_json"),
    proposedContentText: text("proposed_content_text").notNull().default(""),
    diffPayload: jsonb("diff_payload"),
    status: text("status")
      .$type<DocumentProposalStatus>()
      .notNull()
      .default("pending"),
    assistantMessageId: varchar("assistant_message_id").references(() => chatMessages.id, {
      onDelete: "set null",
    }),
    userMessageId: varchar("user_message_id").references(() => chatMessages.id, {
      onDelete: "set null",
    }),
    createdByUserId: varchar("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    resolvedByUserId: varchar("resolved_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    rejectReason: text("reject_reason"),
    createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
    resolvedAt: timestamp("resolved_at"),
  },
  (table) => ({
    workspaceIdx: index("document_edit_proposals_workspace_idx").on(table.workspaceId),
    chatIdx: index("document_edit_proposals_chat_idx").on(table.chatId),
    transcriptIdx: index("document_edit_proposals_transcript_idx").on(table.transcriptId),
    statusIdx: index("document_edit_proposals_status_idx").on(table.status, table.createdAt),
    targetIdx: index("document_edit_proposals_target_idx").on(table.targetType, table.targetId),
    tabIdx: index("document_edit_proposals_tab_idx").on(table.tabType, table.tabId),
  }),
);

export const documentWorkingSets = pgTable(
  "document_working_sets",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: varchar("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    chatId: varchar("chat_id")
      .notNull()
      .references(() => chatSessions.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    goal: text("goal"),
    status: text("status").$type<DocumentWorkingSetStatus>().notNull().default("draft"),
    sourceCount: integer("source_count").notNull().default(0),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdByUserId: varchar("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    frozenAt: timestamp("frozen_at"),
    createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (table) => ({
    workspaceIdx: index("document_working_sets_workspace_idx").on(table.workspaceId, table.createdAt),
    chatIdx: index("document_working_sets_chat_idx").on(table.chatId, table.createdAt),
    statusIdx: index("document_working_sets_status_idx").on(table.chatId, table.status, table.createdAt),
  }),
);

export const documentWorkingSetItems = pgTable(
  "document_working_set_items",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workingSetId: uuid("working_set_id")
      .notNull()
      .references(() => documentWorkingSets.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
    role: text("role").$type<DocumentSourceRole>().notNull().default("primary"),
    sourceType: text("source_type").$type<DocumentSourceType>().notNull(),
    sourceId: text("source_id").notNull(),
    sourceVersion: text("source_version"),
    title: text("title").notNull(),
    contentText: text("content_text").notNull().default(""),
    sourceRef: jsonb("source_ref").$type<DocumentSourceRef>().notNull(),
    sourceMap: jsonb("source_map").$type<DocumentSourceMap>().notNull().default({
      pageBoundaries: [],
      blocks: [],
    } satisfies DocumentSourceMap),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (table) => ({
    workingSetOrderIdx: index("document_working_set_items_working_set_order_idx").on(
      table.workingSetId,
      table.sortOrder,
      table.createdAt,
    ),
    sourceLookupIdx: index("document_working_set_items_source_lookup_idx").on(table.sourceType, table.sourceId),
    uniqueSourceIdx: uniqueIndex("document_working_set_items_working_set_source_uq").on(
      table.workingSetId,
      table.sourceType,
      table.sourceId,
    ),
  }),
);

export const documentResultPackages = pgTable(
  "document_result_packages",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: varchar("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    chatId: varchar("chat_id")
      .notNull()
      .references(() => chatSessions.id, { onDelete: "cascade" }),
    workingSetId: uuid("working_set_id")
      .notNull()
      .references(() => documentWorkingSets.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    status: text("status").$type<DocumentResultPackageStatus>().notNull().default("draft"),
    finalDocumentId: uuid("final_document_id").references(() => canvasDocuments.id, { onDelete: "set null" }),
    finalContent: text("final_content").notNull().default(""),
    sections: jsonb("sections").$type<DocumentDraftSection[]>().notNull().default([]),
    claimLedger: jsonb("claim_ledger").$type<DocumentClaimLedgerEntry[]>().notNull().default([]),
    validations: jsonb("validations").$type<DocumentValidationResult[]>().notNull().default([]),
    reviewCheckpoint: jsonb("review_checkpoint").$type<DocumentReviewCheckpoint | null>(),
    warnings: jsonb("warnings").$type<string[]>().notNull().default([]),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdByUserId: varchar("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (table) => ({
    workingSetIdx: index("document_result_packages_working_set_idx").on(table.workingSetId, table.createdAt),
    chatIdx: index("document_result_packages_chat_idx").on(table.chatId, table.createdAt),
    statusIdx: index("document_result_packages_status_idx").on(table.chatId, table.status, table.createdAt),
    finalDocumentIdx: index("document_result_packages_final_document_idx").on(table.finalDocumentId),
  }),
);

export type UnicaAsrAdvancedOptionValue = string | number | boolean;
export type UnicaAsrAdvancedOptionRecord = Record<string, UnicaAsrAdvancedOptionValue>;
export const unicaAsrDiarizationPolicies = ["enabled", "disabled"] as const;
export type UnicaAsrDiarizationPolicy = (typeof unicaAsrDiarizationPolicies)[number];

export interface UnicaAsrAdvancedOptions {
  diarize?: boolean;
  diarizationPolicy?: UnicaAsrDiarizationPolicy;
  processingOptions?: UnicaAsrAdvancedOptionRecord;
  vadOptions?: UnicaAsrAdvancedOptionRecord;
  generalOptions?: UnicaAsrAdvancedOptionRecord;
}

export const assistantRagModes = ["all_collections", "selected_collections"] as const;
export type AssistantRagMode = (typeof assistantRagModes)[number];
export const assistantSearchModes = ["profile", "custom"] as const;
export type AssistantSearchMode = (typeof assistantSearchModes)[number];
export const assistantEmbeddingModes = ["global", "custom"] as const;
export type AssistantEmbeddingMode = (typeof assistantEmbeddingModes)[number];
export const assistantTranscriptionModes = ["raw_only", "auto_action"] as const;
export type AssistantTranscriptionMode = (typeof assistantTranscriptionModes)[number];
export const assistantTranscriptionFlowModes = ["standard", "workflow", "assistant_workflow"] as const;
export type AssistantTranscriptionFlowMode = (typeof assistantTranscriptionFlowModes)[number];
export const assistantMediaInputModes = ["default", "agent_intent_driven"] as const;
export type AssistantMediaInputMode = (typeof assistantMediaInputModes)[number];
export const assistantExecutionModes = ["standard", "workflow"] as const;
export type AssistantExecutionMode = (typeof assistantExecutionModes)[number];
export const assistantModes = ["rag", "llm"] as const;
export type AssistantMode = (typeof assistantModes)[number];

export const assistantStatuses = ["active", "archived"] as const;
export type AssistantStatus = (typeof assistantStatuses)[number];

export const assistantWorkflowRunStatuses = [
  "queued",
  "pending",
  "running",
  "waiting_approval",
  "waiting_delay",
  "waiting_external",
  // Пауза пошаговой отладки после узла (step-debug D2); отлична от waiting_approval.
  "waiting_debug_step",
  "success",
  "error",
  "cancelled",
] as const;
export type AssistantWorkflowRunStatus = (typeof assistantWorkflowRunStatuses)[number];
export const assistantWorkflowRunDispatchSources = [
  "assistant_execution",
  "assistant_transcription",
  "external_message",
  "webhook_trigger",
  // Дебаг-прогон step-debug: захваченный author-driven вызов, исполняется по draft-бандлу сессии.
  "debug",
] as const;
export type AssistantWorkflowRunDispatchSource = (typeof assistantWorkflowRunDispatchSources)[number];

export const assistantWorkflowRunStepStatuses = [
  "running",
  "success",
  "error",
  "waiting",
  "skipped",
  // Выход узла подставлен из пина дебаг-сессии (step-debug D3), узел не исполнялся.
  "pinned",
] as const;
export type AssistantWorkflowRunStepStatus = (typeof assistantWorkflowRunStepStatuses)[number];

export const assistantWorkflowRunEventPhases = ["started", "completed", "failed", "info"] as const;
export type AssistantWorkflowRunEventPhase = (typeof assistantWorkflowRunEventPhases)[number];

export const assistantWorkflowRunEventActorKinds = ["workflow", "model", "tool", "approval", "system"] as const;
export type AssistantWorkflowRunEventActorKind = (typeof assistantWorkflowRunEventActorKinds)[number];

export const assistantWorkflowRunEventVisibilities = ["user", "debug"] as const;
export type AssistantWorkflowRunEventVisibility = (typeof assistantWorkflowRunEventVisibilities)[number];

export const assistantAgentArtifactMutationKinds = ["created", "updated", "renamed", "moved", "sent", "deleted"] as const;
export type AssistantAgentArtifactMutationKind = (typeof assistantAgentArtifactMutationKinds)[number];

export const assistantAgentArtifactCleanupStrategies = ["delete", "restore", "none"] as const;
export type AssistantAgentArtifactCleanupStrategy = (typeof assistantAgentArtifactCleanupStrategies)[number];

export const assistantAgentArtifactStatuses = ["active", "cleaned", "cleanup_failed", "not_found", "unsupported"] as const;
export type AssistantAgentArtifactStatus = (typeof assistantAgentArtifactStatuses)[number];

export const assistantWorkflowApprovalRequestStatuses = [
  "pending",
  "approved",
  "rejected",
  "expired",
  "cancelled",
] as const;
export type AssistantWorkflowApprovalRequestStatus = (typeof assistantWorkflowApprovalRequestStatuses)[number];

export const assistantKnowledgeBases = pgTable(
  "assistant_knowledge_bases",
  {
    assistantId: varchar("assistant_id")
      .notNull()
      .references(() => assistants.id, { onDelete: "cascade" }),
    knowledgeBaseId: varchar("knowledge_base_id")
      .notNull()
      .references(() => knowledgeBases.id, { onDelete: "cascade" }),
    workspaceId: varchar("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.assistantId, table.knowledgeBaseId] }),
    workspaceIdx: index("assistant_knowledge_bases_workspace_idx").on(table.workspaceId),
    knowledgeBaseIdx: index("assistant_knowledge_bases_knowledge_base_idx").on(table.knowledgeBaseId),
  }),
);

export const knowledgeBaseAskAiRuns = pgTable("knowledge_base_ask_ai_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()::text`),
  workspaceId: varchar("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  userId: varchar("user_id").references(() => users.id, { onDelete: "set null" }),
  knowledgeBaseId: varchar("knowledge_base_id")
    .notNull()
    .references(() => knowledgeBases.id, { onDelete: "cascade" }),
  prompt: text("prompt").notNull(),
  normalizedQuery: text("normalized_query"),
  status: text("status").notNull().default("success"),
  errorMessage: text("error_message"),
  errorDetails: jsonb("error_details").$type<RagPipelineErrorDetails | null>(),
  source: text("source").$type<RagPipelineExecutionSource>().notNull().default("assistant_chat"),
  assistantExecutionId: uuid("assistant_execution_id").references(() => assistantExecutions.id, {
    onDelete: "set null",
  }),
  searchProfileId: varchar("search_profile_id").references(() => searchProfiles.id, { onDelete: "set null" }),
  searchProfileVersion: integer("search_profile_version"),
  searchStrategy: text("search_strategy").$type<SearchProfileStrategy>(),
  queryRewriteEnabled: boolean("query_rewrite_enabled"),
  rewrittenQuery: text("rewritten_query"),
  rerankEnabled: boolean("rerank_enabled"),
  rerankModel: text("rerank_model"),
  indexingProfileId: varchar("indexing_profile_id").references(() => indexingProfiles.id, { onDelete: "set null" }),
  indexingProfileVersion: integer("indexing_profile_version"),
  topK: integer("top_k"),
  bm25Weight: doublePrecision("bm25_weight"),
  bm25Limit: integer("bm25_limit"),
  vectorWeight: doublePrecision("vector_weight"),
  vectorLimit: integer("vector_limit"),
  vectorCollection: text("vector_collection"),
  embeddingProviderId: varchar("embedding_provider_id").references(() => embeddingProviders.id, {
    onDelete: "set null",
  }),
  llmProviderId: varchar("llm_provider_id").references(() => llmProviders.id, {
    onDelete: "set null",
  }),
  llmModel: text("llm_model"),
  bm25ResultCount: integer("bm25_result_count"),
  vectorResultCount: integer("vector_result_count"),
  vectorDocumentCount: integer("vector_document_count"),
  combinedResultCount: integer("combined_result_count"),
  embeddingTokens: integer("embedding_tokens"),
  llmTokens: integer("llm_tokens"),
  totalTokens: integer("total_tokens"),
  retrievalDurationMs: doublePrecision("retrieval_duration_ms"),
  bm25DurationMs: doublePrecision("bm25_duration_ms"),
  vectorDurationMs: doublePrecision("vector_duration_ms"),
  llmDurationMs: doublePrecision("llm_duration_ms"),
  totalDurationMs: doublePrecision("total_duration_ms"),
  isMultiQuery: boolean("is_multi_query"),
  chunksCount: integer("chunks_count"),
  successfulChunksCount: integer("successful_chunks_count"),
  failedChunksCount: integer("failed_chunks_count"),
  rrfApplied: boolean("rrf_applied"),
  rrfInputDocuments: integer("rrf_input_documents"),
  rrfOutputDocuments: integer("rrf_output_documents"),
  startedAt: timestamp("started_at"),
  finishedAt: timestamp("finished_at"),
  responseText: text("response_text"),
  responseFormat: text("response_format"),
  citations: jsonb("citations"),
  combinedResults: jsonb("combined_results"),
  combinedResultsBeforeRerank: jsonb("combined_results_before_rerank"),
  combinedResultsAfterRerank: jsonb("combined_results_after_rerank"),
  searchConfigSnapshot: jsonb("search_config_snapshot"),
  pipelineLog: jsonb("pipeline_log").$type<KnowledgeBaseAskAiPipelineStepLog[] | null>(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const ragArenaExperimentResults = pgTable(
  "rag_arena_experiment_results",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()::text`),
    experimentId: varchar("experiment_id")
      .notNull()
      .references(() => ragArenaExperiments.id, { onDelete: "cascade" }),
    caseId: varchar("case_id")
      .notNull()
      .references(() => ragArenaCases.id, { onDelete: "cascade" }),
    askAiRunId: varchar("ask_ai_run_id").references(() => knowledgeBaseAskAiRuns.id, { onDelete: "set null" }),
    status: text("status").$type<RagArenaResultStatus>().notNull().default("pending"),
    metrics: jsonb("metrics").$type<RagArenaResultMetrics>().notNull().default(sql`'{}'::jsonb`),
    review: jsonb("review").$type<RagArenaReview>().notNull().default(sql`'{}'::jsonb`),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at"),
    finishedAt: timestamp("finished_at"),
    createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    experimentCaseUnique: uniqueIndex("rag_arena_results_experiment_case_uidx").on(table.experimentId, table.caseId),
    experimentIdx: index("rag_arena_results_experiment_idx").on(table.experimentId, table.createdAt),
    statusIdx: index("rag_arena_results_status_idx").on(table.experimentId, table.status, table.createdAt),
    askAiIdx: index("rag_arena_results_ask_ai_idx").on(table.askAiRunId),
  }),
);
export type RagArenaExperimentResult = typeof ragArenaExperimentResults.$inferSelect;
export type RagArenaExperimentResultInsert = typeof ragArenaExperimentResults.$inferInsert;

// Relations
// Zod schemas for validation
export const insertSiteSchema = createInsertSchema(sites)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
    workspaceId: true,
    ownerId: true,
    status: true,
    lastCrawled: true,
    nextCrawl: true,
    error: true,
  })
  .extend({
    name: z.string().trim().min(1, "Название проекта обязательно").max(200, "Слишком длинное название"),
    url: z.string().trim().url("Некорректный URL"),
    startUrls: z
      .array(z.string().trim().url("Некорректный URL"))
      .min(1, "Укажите хотя бы один URL"),
    crawlDepth: z.number().int().min(1, "Минимальная глубина 1").max(10, "Слишком большая глубина"),
    maxChunkSize: z
      .number()
      .int("Размер чанка должен быть целым числом")
      .min(200, "Минимальный размер чанка 200 символов")
      .max(8000, "Максимальный размер чанка 8000 символов"),
    chunkOverlap: z.boolean().default(false),
    chunkOverlapSize: z
      .number()
      .int("Перехлест должен быть целым числом")
      .min(0, "Перехлест не может быть отрицательным")
      .max(4000, "Максимальный перехлест 4000 символов")
      .default(0),
    crawlFrequency: z
      .string()
      .trim()
      .optional()
      .transform((value) => value ?? "manual"),
    followExternalLinks: z.boolean().optional(),
    excludePatterns: z.array(z.string()).optional(),
  });

export const insertEmbeddingProviderSchema = createInsertSchema(embeddingProviders)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
    workspaceId: true,
  })
  .extend({
    name: z.string().trim().min(1, "Укажите название сервиса").max(200, "Слишком длинное название"),
    providerType: z.enum(embeddingProviderTypes).default("gigachat"),
    adapterKind: z.enum(providerAdapterKinds).optional(),
    authMode: z.enum(providerAuthModes).optional(),
    isActive: z.boolean().default(true),
    description: z
      .string()
      .trim()
      .max(1000, "Описание слишком длинное")
      .optional()
      .transform((value) => (value && value.length > 0 ? value : undefined)),
    tokenUrl: z
      .string()
      .trim()
      .url("Некорректный URL для получения Access Token")
      .or(z.literal("")),
    embeddingsUrl: z
      .string()
      .trim()
      .url("Некорректный URL сервиса эмбеддингов"),
    authorizationKey: z.string().trim().optional().or(z.literal("")),
    scope: z.string().trim().optional().or(z.literal("")),
    model: z.string().trim().optional().or(z.literal("")),
    availableModels: z.array(z.object({
      label: z.string().trim(),
      value: z.string().trim(),
    })).optional().default([]),
    allowSelfSignedCertificate: z.boolean().default(false),
    maxTokensPerVectorization: z
      .number({ error: "Введите максимальное количество токенов" })
      .int("Значение должно быть целым")
      .positive("Значение должно быть больше нуля")
      .max(100000, "Значение слишком большое")
      .optional(),
    requestHeaders: z.record(z.string(), z.string()).default({}),
    requestConfig: z
      .any()
      .optional()
      .superRefine((value, ctx) => {
        addDeprecatedNumCtxIssues(value, ctx);
      })
      .transform((value) => {
        const config =
          value && typeof value === "object" && !Array.isArray(value)
            ? (value as Partial<EmbeddingRequestConfig>)
            : {};

        return embeddingRequestConfigSchema.parse({
          ...DEFAULT_EMBEDDING_REQUEST_CONFIG,
          ...config,
        });
      }),
    responseConfig: z
      .any()
      .optional()
      .transform((value) => {
        const config =
          value && typeof value === "object" && !Array.isArray(value)
            ? (value as Partial<EmbeddingResponseConfig>)
            : {};

        return embeddingResponseConfigSchema.parse({
          ...DEFAULT_EMBEDDING_RESPONSE_CONFIG,
          ...config,
        });
      }),
    qdrantConfig: z
      .any()
      .optional()
      .transform(() => ({ ...DEFAULT_QDRANT_CONFIG } as QdrantIntegrationConfig)),
    unicaWorkspaceId: z
      .string()
      .trim()
      .min(1, "Укажите workSpaceId для Unica AI")
      .max(200, "Слишком длинное значение workSpaceId")
      .optional(),
  })
  .superRefine((data, ctx) => {
    const adapterKind = resolveEmbeddingProviderAdapterKind(data);
    const authMode = resolveProviderAuthMode(data);

    if (authMode === "oauth_client_credentials" && (!data.tokenUrl || data.tokenUrl.trim().length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Укажите URL для получения токена",
        path: ["tokenUrl"],
      });
    }

    if (authMode === "oauth_client_credentials" && (!data.scope || data.scope.trim().length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Укажите OAuth scope",
        path: ["scope"],
      });
    }

    if (
      (authMode === "oauth_client_credentials" || authMode === "bearer") &&
      (!data.authorizationKey || data.authorizationKey.trim().length === 0)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Укажите Authorization key",
        path: ["authorizationKey"],
      });
    }

    if (adapterKind === "legacy_unica" && (!data.unicaWorkspaceId || data.unicaWorkspaceId.trim().length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Для провайдера Unica AI обязательно укажите workSpaceId",
        path: ["unicaWorkspaceId"],
      });
    }
  });

export const updateEmbeddingProviderSchema = z
  .object({
    name: z.string().trim().min(1, "Укажите название сервиса").max(200, "Слишком длинное название").optional(),
    providerType: z.enum(embeddingProviderTypes).optional(),
    adapterKind: z.enum(providerAdapterKinds).optional(),
    authMode: z.enum(providerAuthModes).optional(),
    description: z
      .union([
        z.string().trim().max(1000, "Описание слишком длинное"),
        z.null(),
      ])
      .optional()
      .transform((value) => (typeof value === "string" && value.length === 0 ? null : value)),
    isActive: z.boolean().optional(),
    isGlobal: z.boolean().optional(),
    tokenUrl: z
      .string()
      .trim()
      .url("Некорректный URL для получения Access Token")
      .optional()
      .or(z.literal("")),
    embeddingsUrl: z
      .string()
      .trim()
      .url("Некорректный URL сервиса эмбеддингов")
      .optional(),
    authorizationKey: z.string().trim().optional().or(z.literal("")),
    scope: z.string().trim().optional().or(z.literal("")),
    model: z.string().trim().optional().or(z.literal("")),
    availableModels: z.array(z.object({
      label: z.string().trim(),
      value: z.string().trim(),
    })).optional(),
    allowSelfSignedCertificate: z.boolean().optional(),
    maxTokensPerVectorization: z
      .number({ error: "Введите максимальное количество токенов" })
      .int("Значение должно быть целым")
      .positive("Значение должно быть больше нуля")
      .max(100000, "Значение слишком большое")
      .nullable()
      .optional(),
    requestHeaders: z.record(z.string(), z.string()).optional(),
    requestConfig: embeddingRequestConfigSchema
      .removeDefault()
      .partial()
      .optional()
      .superRefine((value, ctx) => {
        addDeprecatedNumCtxIssues(value, ctx);
      }),
    responseConfig: embeddingResponseConfigSchema.removeDefault().partial().optional(),
    qdrantConfig: qdrantIntegrationConfigSchema.partial().optional(),
    unicaWorkspaceId: z
      .union([
        z.string().trim().min(1, "Укажите workSpaceId для Unica AI").max(200, "Слишком длинное значение workSpaceId"),
        z.null(),
      ])
      .optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Нет данных для обновления",
  });

export const insertLlmProviderSchema = createInsertSchema(llmProviders)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
    workspaceId: true,
  })
  .extend({
    name: z.string().trim().min(1, "Укажите название сервиса").max(200, "Слишком длинное название"),
    providerType: z.enum(llmProviderTypes).default(DEFAULT_LLM_PROVIDER_TYPE),
    adapterKind: z.enum(providerAdapterKinds).optional(),
    authMode: z.enum(providerAuthModes).optional(),
    streamMode: z.enum(llmStreamModes).optional(),
    isActive: z.boolean().default(true),
    description: z
      .string()
      .trim()
      .max(1000, "Описание слишком длинное")
      .optional()
      .transform((value) => (value && value.length > 0 ? value : undefined)),
    tokenUrl: z.string().trim().optional().or(z.literal("")),
    completionUrl: z
      .string()
      .trim()
      .url("Некорректный URL сервиса LLM"),
    authorizationKey: z.string().trim().optional().or(z.literal("")),
    scope: z.string().trim().optional().or(z.literal("")),
    model: z.string().trim().optional().or(z.literal("")),
    availableModels: z
      .array(
        z.object({
          label: z.string().trim().min(1, "Введите название модели"),
          value: z.string().trim().min(1, "Введите идентификатор модели"),
        }),
      )
      .max(50, "Слишком много моделей")
      .optional()
      .transform((models) =>
        models
          ? models
              .map((model) => ({
                label: model.label.trim(),
                value: model.value.trim(),
              }))
              .filter((model) => model.label.length > 0 && model.value.length > 0)
          : undefined,
      ),
    allowSelfSignedCertificate: z.boolean().default(false),
    requestHeaders: z.record(z.string(), z.string()).default({}),
    requestConfig: z
      .any()
      .optional()
      .transform((value, ctx) => {
        addDeprecatedNumCtxIssues(value, ctx);
        if (ctx.issues.length > 0) {
          return z.NEVER;
        }
        const config =
          value && typeof value === "object" && !Array.isArray(value)
            ? (value as Partial<LlmRequestConfig>)
            : {};

        return llmRequestConfigSchema.parse({
          ...DEFAULT_LLM_REQUEST_CONFIG,
          ...config,
        });
      }),
    responseConfig: z
      .any()
      .optional()
      .transform((value) => {
        const config =
          value && typeof value === "object" && !Array.isArray(value)
            ? (value as Partial<LlmResponseConfig>)
            : {};

        return llmResponseConfigSchema.parse({
          ...DEFAULT_LLM_RESPONSE_CONFIG,
          ...config,
        });
      }),
  })
  .superRefine((data, ctx) => {
    const authMode = resolveProviderAuthMode(data);

    if (authMode === "oauth_client_credentials" && (!data.tokenUrl || data.tokenUrl.trim().length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Укажите URL для получения токена",
        path: ["tokenUrl"],
      });
    }

    if (
      (authMode === "oauth_client_credentials" || authMode === "bearer") &&
      (!data.authorizationKey || data.authorizationKey.trim().length === 0)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Укажите Authorization key",
        path: ["authorizationKey"],
      });
    }

    if (authMode === "oauth_client_credentials" && (!data.scope || data.scope.trim().length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Укажите OAuth scope",
        path: ["scope"],
      });
    }

  });

export const updateLlmProviderSchema = z
  .object({
    name: z.string().trim().min(1, "Укажите название сервиса").max(200, "Слишком длинное название").optional(),
    providerType: z.enum(llmProviderTypes).optional(),
    adapterKind: z.enum(providerAdapterKinds).optional(),
    authMode: z.enum(providerAuthModes).optional(),
    streamMode: z.enum(llmStreamModes).optional(),
    description: z
      .union([
        z.string().trim().max(1000, "Описание слишком длинное"),
        z.null(),
      ])
      .optional()
      .transform((value) => (typeof value === "string" && value.length === 0 ? null : value)),
    isActive: z.boolean().optional(),
    isGlobal: z.boolean().optional(),
    tokenUrl: z.string().trim().optional().or(z.literal("")),
    completionUrl: z
      .string()
      .trim()
      .url("Некорректный URL сервиса LLM")
      .optional(),
    authorizationKey: z.string().trim().optional().or(z.literal("")),
    scope: z.string().trim().optional().or(z.literal("")),
    model: z.string().trim().optional().or(z.literal("")),
    availableModels: z
      .array(
        z.object({
          label: z.string().trim().min(1, "Введите название модели"),
          value: z.string().trim().min(1, "Введите идентификатор модели"),
        }),
      )
      .max(50, "Слишком много моделей")
      .optional()
      .transform((models) =>
        models
          ? models
              .map((model) => ({
                label: model.label.trim(),
                value: model.value.trim(),
              }))
              .filter((model) => model.label.length > 0 && model.value.length > 0)
          : undefined,
      ),
    allowSelfSignedCertificate: z.boolean().optional(),
    requestHeaders: z.record(z.string(), z.string()).optional(),
    requestConfig: z
      .record(z.string(), z.any())
      .optional()
      .transform((value, ctx) => {
        addDeprecatedNumCtxIssues(value, ctx);
        if (ctx.issues.length > 0) {
          return z.NEVER;
        }
        return value === undefined
          ? undefined
          : llmRequestConfigSchema.parse({
              ...DEFAULT_LLM_REQUEST_CONFIG,
              ...value,
            });
      }),
    responseConfig: z
      .record(z.string(), z.any())
      .optional()
      .transform((value) =>
        value === undefined
          ? undefined
          : llmResponseConfigSchema.parse({
              ...DEFAULT_LLM_RESPONSE_CONFIG,
              ...value,
            }),
      ),
    expectedUpdatedAt: z.string().datetime({ offset: true }),
  })
  .refine((value) => Object.keys(value).some((key) => key !== "expectedUpdatedAt"), {
    message: "Нет данных для обновления",
  })
  .refine(
    (data) => {
      const authMode = resolveLlmProviderAuthMode(data);
      if (authMode !== "oauth_client_credentials") {
        return true;
      }
      if (data.tokenUrl === undefined) {
        return true;
      }
      if (data.tokenUrl.trim().length === 0) {
        return true;
      }
      try {
        new URL(data.tokenUrl);
        return true;
      } catch {
        return false;
      }
    },
    {
      message: "Некорректный URL для получения Access Token",
      path: ["tokenUrl"],
    },
  )
  .refine(
    (data) => {
      if (resolveLlmProviderAdapterKind(data) === "legacy_unica") {
        return true;
      }
      if (data.model === undefined) {
        return true;
      }
      if (data.model.trim().length === 0) {
        return true;
      }
      return true;
    },
    {
      message: "Укажите модель",
      path: ["model"],
    },
  )
  .refine(
    (data) => {
      const authMode = resolveLlmProviderAuthMode(data);
      if (authMode === "none") {
        return true;
      }
      if (data.authorizationKey === undefined) {
        return true;
      }
      if (data.authorizationKey.trim().length === 0) {
        return false;
      }
      return true;
    },
    {
      message: "Укажите Authorization key",
      path: ["authorizationKey"],
    },
  );

// Поля, которые OCR-контракт задаёт сам (модель, сообщения с картинкой, отключённый стрим,
// детерминированная температура). Запрещаем их в additionalBodyFields, иначе через Object.assign
// в buildVisionOcrRequestBody они тихо переопределяли бы модель/детерминизм (см. дизайн-док §6.7).
const OCR_RESERVED_BODY_FIELD_KEYS = ["model", "messages", "stream", "temperature"] as const;

const ocrProviderAdditionalBodyFieldsSchema = z
  .record(z.string(), z.unknown())
  .default({})
  .transform((value) => value ?? {})
  .refine(
    (value) => !OCR_RESERVED_BODY_FIELD_KEYS.some((key) => Object.prototype.hasOwnProperty.call(value, key)),
    {
      message: `Поля ${OCR_RESERVED_BODY_FIELD_KEYS.join(", ")} задаются системой и недопустимы в additionalBodyFields`,
    },
  );

const ocrProviderBaseSchema = createInsertSchema(ocrProviders)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    name: z.string().trim().min(1, "Укажите название OCR-провайдера").max(200, "Слишком длинное название"),
    llmProviderConfigId: z.string().trim().min(1, "Выберите LLM-провайдера"),
    model: z.string().trim().min(1, "Укажите модель"),
    imageTransport: z.enum(ocrImageTransports).default("base64"),
    fileStorageProviderId: z
      .string()
      .trim()
      .optional()
      .nullable()
      .transform((value) => (value && value.length > 0 ? value : null)),
    imageDetail: z.enum(ocrImageDetails).default("auto"),
    imageEnhancementEnabled: z.boolean().default(true),
    additionalBodyFields: ocrProviderAdditionalBodyFieldsSchema,
    isDefault: z.boolean().default(false),
    isActive: z.boolean().default(true),
  });

function validateOcrProviderTransport(
  data: { imageTransport?: OcrImageTransport; fileStorageProviderId?: string | null },
  ctx: z.RefinementCtx,
) {
  if (data.imageTransport === "local_url" && !data.fileStorageProviderId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Для local_url выберите внешний файловый провайдер Unica",
      path: ["fileStorageProviderId"],
    });
  }
}

export const insertOcrProviderSchema = ocrProviderBaseSchema.superRefine(validateOcrProviderTransport);

export const updateOcrProviderSchema = ocrProviderBaseSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Нет данных для обновления",
  })
  .superRefine(validateOcrProviderTransport);

const callbackUrlSchema = z
  .string()
  .trim()
  .min(1, "Укажите Callback URL")
  .max(500, "Слишком длинный Callback URL")
  .refine(
    (value) => {
      if (value.startsWith("/")) {
        return true;
      }

      try {
        void new URL(value);
        return true;
      } catch {
        return false;
      }
    },
    { message: "Укажите абсолютный URL или путь, начинающийся с /" },
  );

export const upsertAuthProviderSchema = z
  .object({
    provider: z.enum(authProviderTypes),
    clientId: z
      .string()
      .trim()
      .min(1, "Укажите Client ID")
      .max(200, "Слишком длинный Client ID"),
    clientSecret: z
      .string()
      .trim()
      .max(200, "Слишком длинный Client Secret")
      .optional(),
    callbackUrl: callbackUrlSchema,
    isEnabled: z.boolean(),
  })
  .strict();

// Assistant execution log tables
export const assistantExecutions = pgTable(
  "assistant_executions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: varchar("workspace_id").notNull(),
    userId: varchar("user_id"),
    assistantId: varchar("assistant_id").notNull(),
    chatId: varchar("chat_id"),
    userMessageId: varchar("user_message_id"),
    assistantMessageId: varchar("assistant_message_id").references(() => chatMessages.id, { onDelete: "set null" }),
    modelId: varchar("model_id").references(() => models.id, { onDelete: "set null" }),
    modelKey: text("model_key"),
    modelName: text("model_name"),
    source: text("source").notNull(),
    status: text("status").notNull(),
    hasStepErrors: boolean("has_step_errors").notNull().default(false),
    startedAt: timestamp("started_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
    finishedAt: timestamp("finished_at"),
    metadata: jsonb("metadata"),
  },
  (table) => ({
    startedAtIdx: index("assistant_executions_started_at_idx").on(table.startedAt),
    workspaceIdx: index("assistant_executions_workspace_idx").on(table.workspaceId, table.startedAt),
    assistantIdx: index("assistant_executions_assistant_idx").on(table.assistantId, table.startedAt),
    chatIdx: index("assistant_executions_chat_idx").on(table.chatId),
    userIdx: index("assistant_executions_user_idx").on(table.userId),
    assistantMessageIdx: index("assistant_executions_assistant_message_idx").on(table.assistantMessageId),
  }),
);

export const assistantExecutionSteps = pgTable(
  "assistant_execution_steps",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    executionId: uuid("execution_id")
      .notNull()
      .references(() => assistantExecutions.id, { onDelete: "cascade" }),
    order: integer("order").notNull(),
    type: text("type").notNull(),
    status: text("status").notNull(),
    startedAt: timestamp("started_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
    finishedAt: timestamp("finished_at"),
    inputPayload: jsonb("input_payload"),
    outputPayload: jsonb("output_payload"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    diagnosticInfo: text("diagnostic_info"),
  },
  (table) => ({
    executionIdx: index("assistant_execution_steps_execution_idx").on(table.executionId, table.order),
  }),
);

export const chatMessageFeedback = pgTable(
  "chat_message_feedback",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: varchar("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    kind: text("kind").$type<ChatFeedbackKind>().notNull().default("chat_answer"),
    chatId: varchar("chat_id").references(() => chatSessions.id, { onDelete: "cascade" }),
    assistantMessageId: varchar("assistant_message_id").references(() => chatMessages.id, { onDelete: "cascade" }),
    userMessageId: varchar("user_message_id").references(() => chatMessages.id, { onDelete: "set null" }),
    assistantExecutionId: uuid("assistant_execution_id").references(() => assistantExecutions.id, {
      onDelete: "set null",
    }),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    vote: text("vote").$type<ChatFeedbackVote>(),
    reasonCode: text("reason_code").$type<ChatFeedbackReasonCode>(),
    reasonText: text("reason_text"),
    category: text("category").$type<GeneralFeedbackCategory>(),
    comment: text("comment"),
    createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (table) => ({
    assistantMessageCreatedIdx: index("chat_message_feedback_assistant_message_created_idx").on(
      table.assistantMessageId,
      table.createdAt,
    ),
    workspaceCreatedIdx: index("chat_message_feedback_workspace_created_idx").on(table.workspaceId, table.createdAt),
    executionIdx: index("chat_message_feedback_execution_idx").on(table.assistantExecutionId),
    chatCreatedIdx: index("chat_message_feedback_chat_created_idx").on(table.chatId, table.createdAt),
    voteReasonCreatedIdx: index("chat_message_feedback_vote_reason_created_idx").on(
      table.vote,
      table.reasonCode,
      table.createdAt,
    ),
    userCreatedIdx: index("chat_message_feedback_user_created_idx").on(table.userId, table.createdAt),
    kindCreatedIdx: index("chat_message_feedback_kind_created_idx").on(table.kind, table.createdAt),
    // Один отзыв-оценка на (ответ ассистента, пользователь). general (без assistant_message_id) — без ограничения.
    answerUserUniq: uniqueIndex("chat_message_feedback_answer_user_uniq")
      .on(table.assistantMessageId, table.userId)
      .where(sql`kind = 'chat_answer'`),
    chatAnswerRequiresFields: check(
      "chat_message_feedback_chat_answer_requires_fields",
      sql`kind <> 'chat_answer' OR (chat_id IS NOT NULL AND assistant_message_id IS NOT NULL AND vote IS NOT NULL)`,
    ),
  }),
);

export const chatFeedbackAttachments = pgTable(
  "chat_feedback_attachments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: varchar("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    feedbackId: uuid("feedback_id").references(() => chatMessageFeedback.id, { onDelete: "set null" }),
    uploaderUserId: varchar("uploader_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    storageKey: text("storage_key").notNull(),
    createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (table) => ({
    feedbackIdx: index("chat_feedback_attachments_feedback_idx").on(table.feedbackId),
    workspaceCreatedIdx: index("chat_feedback_attachments_workspace_created_idx").on(
      table.workspaceId,
      table.createdAt,
    ),
    uploaderCreatedIdx: index("chat_feedback_attachments_uploader_created_idx").on(
      table.uploaderUserId,
      table.createdAt,
    ),
  }),
);

// Журнал запусков агента («Центр активности» → Запуски агента). Одна строка на вызов
// executeAgentRuntime; события прилетают инкрементально через live-канал рантайма и
// переживают смерть рана (Node-таймаут/зомби — has_late_events). runId БЕЗ FK на
// assistant_workflow_runs: журнал живёт дольше воркфлоу-рана (janitor чистит их раздельно).
export const agentExecutions = pgTable(
  "agent_executions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    runId: varchar("run_id").notNull(),
    stepId: varchar("step_id"),
    nodeId: varchar("node_id"),
    workspaceId: varchar("workspace_id").notNull(),
    userId: varchar("user_id"),
    assistantId: varchar("assistant_id"),
    chatId: varchar("chat_id"),
    dispatchSource: text("dispatch_source"),
    providerId: text("provider_id").notNull(),
    providerRunId: varchar("provider_run_id"),
    modelId: varchar("model_id"),
    modelKey: text("model_key"),
    modelName: text("model_name"),
    reasoningMode: text("reasoning_mode"),
    writePolicy: text("write_policy"),
    traceLevel: text("trace_level").notNull().default("basic"),
    debugEnabled: boolean("debug_enabled").notNull().default(false),
    limits: jsonb("limits"),
    status: text("status").notNull(),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    providerAttempts: integer("provider_attempts").notNull().default(0),
    llmRounds: integer("llm_rounds").notNull().default(0),
    toolCalls: integer("tool_calls").notNull().default(0),
    payloadBytes: bigint("payload_bytes", { mode: "number" }).notNull().default(0),
    hasLateEvents: boolean("has_late_events").notNull().default(false),
    goalPreview: text("goal_preview"),
    finalTextPreview: text("final_text_preview"),
    metadata: jsonb("metadata"),
    startedAt: timestamp("started_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
    finishedAt: timestamp("finished_at"),
    lastEventAt: timestamp("last_event_at"),
    // Задача 5.2: durable отметка последнего heartbeat-раунда рантайма (agent.model_round с
    // heartbeatNo). Сторож зависших прогонов (agent-run-lifecycle-watchdog) считает «возраст без
    // признаков жизни» по max(lastHeartbeatAt, lastEventAt, startedAt) и переводит молчащие прогоны
    // в честный терминальный статус.
    lastHeartbeatAt: timestamp("last_heartbeat_at"),
  },
  (table) => ({
    startedAtIdx: index("agent_executions_started_at_idx").on(table.startedAt),
    workspaceIdx: index("agent_executions_workspace_idx").on(table.workspaceId, table.startedAt),
    assistantIdx: index("agent_executions_assistant_idx").on(table.assistantId, table.startedAt),
    statusIdx: index("agent_executions_status_idx").on(table.status, table.startedAt),
    runIdx: index("agent_executions_run_idx").on(table.runId),
    chatIdx: index("agent_executions_chat_idx").on(table.chatId),
  }),
);

export const agentExecutionEvents = pgTable(
  "agent_execution_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    executionId: uuid("execution_id")
      .notNull()
      .references(() => agentExecutions.id, { onDelete: "cascade" }),
    // runtime — события Python-рантайма (seq = journalSeq), node — события монолита.
    source: text("source").notNull(),
    seq: integer("seq").notNull(),
    eventType: text("event_type").notNull(),
    phase: text("phase").notNull(),
    actorKind: text("actor_kind"),
    roundNo: integer("round_no"),
    toolName: text("tool_name"),
    capabilityKey: text("capability_key"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at"),
    finishedAt: timestamp("finished_at"),
    durationMs: integer("duration_ms"),
    // summary — лёгкое превью, пишется всегда; payload — полные данные (только debug-режим,
    // janitor strip 7д); truncation — маркеры усечения (поле, исходная длина, причина).
    summary: jsonb("summary"),
    payload: jsonb("payload"),
    payloadBytes: integer("payload_bytes"),
    truncation: jsonb("truncation"),
    createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (table) => ({
    executionSeqUnique: uniqueIndex("agent_execution_events_execution_seq_unique").on(
      table.executionId,
      table.source,
      table.seq,
    ),
    executionIdx: index("agent_execution_events_execution_idx").on(table.executionId, table.createdAt),
    createdAtIdx: index("agent_execution_events_created_at_idx").on(table.createdAt),
  }),
);

export type AgentExecutionRecord = typeof agentExecutions.$inferSelect;
export type AgentExecutionInsert = typeof agentExecutions.$inferInsert;
export type AgentExecutionEventRecord = typeof agentExecutionEvents.$inferSelect;
export type AgentExecutionEventInsert = typeof agentExecutionEvents.$inferInsert;

// Задача 5.2: durable реестр идемпотентности вызовов агента с побочными эффектами. Ключ =
// (run_id, node_id, tool_kind, tool_ref, input_hash) — переживает re-queue (5.1) и ре-диспатч
// прерванного прогона. Назначение: при возобновлении/повторе НЕ выполнять повторно завершённый
// write-вызов, а переиспользовать записанный результат (нет двойной БЗ/документа/действия). READ-
// вызовы идемпотентны по природе и в реестр не попадают. Статусы: pending (исполнение начато, исход
// неизвестен — bias «не двоить»), completed (результат записан → реплей), failed (исполнение упало
// до side-effect → разрешён повтор с новым согласованием), abandoned (reaper реапнул заведомо мёртвый
// pending, исход неизвестен и авто-повтор небезопасен → терминал без replay/retry, честная 409).
export const agentToolIdempotency = pgTable(
  "agent_tool_idempotency",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: varchar("workspace_id").notNull(),
    runId: varchar("run_id").notNull(),
    nodeId: varchar("node_id").notNull(),
    toolKind: text("tool_kind").notNull(),
    toolRef: text("tool_ref").notNull(),
    inputHash: text("input_hash").notNull(),
    // pending | completed | failed | abandoned
    status: text("status").notNull(),
    result: jsonb("result"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (table) => ({
    keyUnique: uniqueIndex("agent_tool_idempotency_key_unique").on(
      table.runId,
      table.nodeId,
      table.toolKind,
      table.toolRef,
      table.inputHash,
    ),
    runIdx: index("agent_tool_idempotency_run_idx").on(table.runId, table.nodeId),
    workspaceIdx: index("agent_tool_idempotency_workspace_idx").on(table.workspaceId, table.createdAt),
    // Скан reaper (5.2, AGENT-IDEMPOTENCY-STUCK-PENDING/RETENTION): stale-pending по статусу+возрасту,
    // ретенция completed/failed по статусу+created_at.
    statusCreatedIdx: index("agent_tool_idempotency_status_created_idx").on(table.status, table.createdAt),
  }),
);

export type AgentToolIdempotencyRecord = typeof agentToolIdempotency.$inferSelect;
export type AgentToolIdempotencyInsert = typeof agentToolIdempotency.$inferInsert;

// Types
export type Site = typeof sites.$inferSelect;
export type InsertSite = z.infer<typeof insertSiteSchema>;
export type SiteInsert = typeof sites.$inferInsert;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type WorkspaceEmbedKey = typeof workspaceEmbedKeys.$inferSelect;
export type WorkspaceEmbedKeyInsert = typeof workspaceEmbedKeys.$inferInsert;
export type WorkspaceEmbedKeyDomain = typeof workspaceEmbedKeyDomains.$inferSelect;
export type WorkspaceEmbedKeyDomainInsert = typeof workspaceEmbedKeyDomains.$inferInsert;
export type User = typeof users.$inferSelect;
export type DocsArticleProgressRecord = typeof docsArticleProgress.$inferSelect;
export type DocsArticleProgressInsert = typeof docsArticleProgress.$inferInsert;
export type EmailConfirmationToken = typeof emailConfirmationTokens.$inferSelect;
export type EmailConfirmationTokenInsert = typeof emailConfirmationTokens.$inferInsert;
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type PasswordResetTokenInsert = typeof passwordResetTokens.$inferInsert;
export type PublicUser = Omit<
  User,
  "passwordHash" | "personalApiTokenHash" | "personalApiTokenLastFour" | "avatarKey" | "avatarUpdatedAt"
> & {
  avatarUrl: string | null;
  avatarSource: UserAvatarSource;
  hasPersonalApiToken: boolean;
  personalApiTokenLastFour: string | null;
};
export type PersonalApiToken = typeof personalApiTokens.$inferSelect;
export type InsertPersonalApiToken = typeof personalApiTokens.$inferInsert;
export type PublicPersonalApiToken = Omit<PersonalApiToken, "tokenHash" | "userId">;
export type Model = typeof models.$inferSelect;
export type ModelInsert = typeof models.$inferInsert;
export type Workspace = typeof workspaces.$inferSelect;
export type WorkspaceInsert = typeof workspaces.$inferInsert;
export type WorkspaceMember = typeof workspaceMembers.$inferSelect;
export type WorkspaceMemberInsert = typeof workspaceMembers.$inferInsert;
export type WorkspaceInvitation = typeof workspaceInvitations.$inferSelect;
export type WorkspaceInvitationInsert = typeof workspaceInvitations.$inferInsert;
export type FileStorageProvider = typeof fileStorageProviders.$inferSelect;
export type FileStorageProviderInsert = typeof fileStorageProviders.$inferInsert;
export type File = typeof files.$inferSelect;
export type FileInsert = typeof files.$inferInsert;
export type WorkspaceUsageMonth = typeof workspaceUsageMonth.$inferSelect;
export type WorkspaceUsageMonthInsert = typeof workspaceUsageMonth.$inferInsert;
export type AdminAnalyticsRollupState = typeof adminAnalyticsRollupState.$inferSelect;
export type AdminAnalyticsRollupStateInsert = typeof adminAnalyticsRollupState.$inferInsert;
export type AdminAnalyticsUserActivityDay = typeof adminAnalyticsUserActivityDay.$inferSelect;
export type AdminAnalyticsUserActivityDayInsert = typeof adminAnalyticsUserActivityDay.$inferInsert;
export type AdminAnalyticsWorkspaceActivityDay = typeof adminAnalyticsWorkspaceActivityDay.$inferSelect;
export type AdminAnalyticsWorkspaceActivityDayInsert = typeof adminAnalyticsWorkspaceActivityDay.$inferInsert;
export type AdminAnalyticsFeatureUsageDay = typeof adminAnalyticsFeatureUsageDay.$inferSelect;
export type AdminAnalyticsFeatureUsageDayInsert = typeof adminAnalyticsFeatureUsageDay.$inferInsert;
export type AdminAnalyticsEntityLifecycleDay = typeof adminAnalyticsEntityLifecycleDay.$inferSelect;
export type AdminAnalyticsEntityLifecycleDayInsert = typeof adminAnalyticsEntityLifecycleDay.$inferInsert;
export type WorkspaceLlmUsageLedger = typeof workspaceLlmUsageLedger.$inferSelect;
export type WorkspaceLlmUsageLedgerInsert = typeof workspaceLlmUsageLedger.$inferInsert;
export type WorkspaceEmbeddingUsageLedger = typeof workspaceEmbeddingUsageLedger.$inferSelect;
export type WorkspaceEmbeddingUsageLedgerInsert = typeof workspaceEmbeddingUsageLedger.$inferInsert;
export type WorkspaceVectorCollection = typeof workspaceVectorCollections.$inferSelect;
export type AuthProvider = typeof authProviders.$inferSelect;
export type AuthProviderInsert = typeof authProviders.$inferInsert;
export type SystemNotificationLog = typeof systemNotificationLogs.$inferSelect;
export type SystemNotificationLogInsert = typeof systemNotificationLogs.$inferInsert;
export type EmbeddingProvider = typeof embeddingProviders.$inferSelect;
export type EmbeddingProviderInsert = typeof embeddingProviders.$inferInsert;
export type InsertEmbeddingProvider = z.infer<typeof insertEmbeddingProviderSchema>;
export type UpdateEmbeddingProvider = z.infer<typeof updateEmbeddingProviderSchema>;
export type UpsertAuthProvider = z.infer<typeof upsertAuthProviderSchema>;
export type PublicEmbeddingProvider = Omit<EmbeddingProvider, "authorizationKey" | "availableModels"> & {
  hasAuthorizationKey: boolean;
  hasSensitiveRequestHeaders: boolean;
  availableModels: LlmModelOption[];
};
export type SpeechProvider = typeof speechProviders.$inferSelect;
export type SpeechProviderInsert = typeof speechProviders.$inferInsert;
export type SpeechProviderSecret = typeof speechProviderSecrets.$inferSelect;

// Unica ASR configuration interface
export interface UnicaAsrConfig {
  baseUrl: string;
  workspaceId: string;
  skipSslVerify?: boolean;
  pollingIntervalMs?: number;
  timeoutMs?: number;
  /**
   * Optional file storage provider to use for Unica ASR.
   * Used as fallback when assistant/workspace default file provider is not configured.
   */
  fileStorageProviderId?: string;
}

export type LlmProvider = typeof llmProviders.$inferSelect;
export type LlmProviderInsert = typeof llmProviders.$inferInsert;
export type UnicaChatConfig = typeof unicaChatConfig.$inferSelect;
export type UnicaChatConfigInsert = typeof unicaChatConfig.$inferInsert;
export type AssistantLlmPolicy = typeof assistantLlmPolicy.$inferSelect;
export type AssistantLlmPolicyInsert = typeof assistantLlmPolicy.$inferInsert;
export type LlmRuntimePolicy = typeof llmRuntimePolicy.$inferSelect;
export type LlmRuntimePolicyInsert = typeof llmRuntimePolicy.$inferInsert;
export type OcrProvider = typeof ocrProviders.$inferSelect;
export type InsertOcrProvider = z.infer<typeof insertOcrProviderSchema>;
export type UpdateOcrProvider = z.infer<typeof updateOcrProviderSchema>;
export type InsertLlmProvider = z.infer<typeof insertLlmProviderSchema>;
export type UpdateLlmProvider = z.infer<typeof updateLlmProviderSchema>;
export type PublicLlmProvider = Omit<LlmProvider, "authorizationKey" | "availableModels"> & {
  hasAuthorizationKey: boolean;
  availableModels: LlmModelOption[];
  recommendedModels?: LlmModelOption[];
};
export type ChatSession = typeof chatSessions.$inferSelect;
export type ChatSessionInsert = typeof chatSessions.$inferInsert;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type ChatMessageInsert = typeof chatMessages.$inferInsert;
export type ChatMessageFeedback = typeof chatMessageFeedback.$inferSelect;
export type ChatMessageFeedbackInsert = typeof chatMessageFeedback.$inferInsert;
export type ChatFeedbackAttachment = typeof chatFeedbackAttachments.$inferSelect;
export type ChatFeedbackAttachmentInsert = typeof chatFeedbackAttachments.$inferInsert;
export type Transcript = typeof transcripts.$inferSelect;
export type TranscriptInsert = typeof transcripts.$inferInsert;
export type TranscriptView = typeof transcriptViews.$inferSelect;
export type TranscriptViewInsert = typeof transcriptViews.$inferInsert;
export type TranscriptAudioSource = typeof transcriptAudioSources.$inferSelect;
export type TranscriptAudioSourceInsert = typeof transcriptAudioSources.$inferInsert;
export type CanvasDocument = typeof canvasDocuments.$inferSelect;
export type CanvasDocumentInsert = typeof canvasDocuments.$inferInsert;
export type DocumentRevision = typeof documentRevisions.$inferSelect;
export type DocumentRevisionInsert = typeof documentRevisions.$inferInsert;
export type DocumentEditProposal = typeof documentEditProposals.$inferSelect;
export type DocumentEditProposalInsert = typeof documentEditProposals.$inferInsert;
export type DocumentWorkingSet = typeof documentWorkingSets.$inferSelect;
export type DocumentWorkingSetInsert = typeof documentWorkingSets.$inferInsert;
export type DocumentWorkingSetItem = typeof documentWorkingSetItems.$inferSelect;
export type DocumentWorkingSetItemInsert = typeof documentWorkingSetItems.$inferInsert;
export type DocumentResultPackage = typeof documentResultPackages.$inferSelect;
export type DocumentResultPackageInsert = typeof documentResultPackages.$inferInsert;
export const sessions = pgTable(
  "session",
  {
    sid: varchar("sid").primaryKey(),
    sess: json("sess").notNull(),
    expire: timestamp("expire", { precision: 6, withTimezone: false }).notNull(),
  },
  (table) => ({
    expireIdx: index("session_expire_idx").on(table.expire),
  }),
);
export type SessionRow = typeof sessions.$inferSelect;
export const asrExecutions = pgTable(
  "asr_executions",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    createdAt: timestamp("created_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
    // Use text instead of uuid because workspaces.id and assistants.id are varchar, not uuid
    workspaceId: text("workspace_id"),
    assistantId: text("assistant_id"),
    userId: varchar("user_id").references(() => users.id, { onDelete: "set null" }),
    chatId: uuid("chat_id"),
    userMessageId: uuid("user_message_id"),
    transcriptMessageId: uuid("transcript_message_id"),
    transcriptId: uuid("transcript_id"),
    provider: text("provider"),
    mode: text("mode"),
    fileId: uuid("file_id").references(() => files.id, { onDelete: "set null" }),
    status: text("status").notNull().default("pending"),
    lifecycleStatus: text("lifecycle_status").notNull().default("accepted"),
    currentStage: text("current_stage"),
    statusReasonCode: text("status_reason_code"),
    statusReasonDomain: text("status_reason_domain"),
    failureStage: text("failure_stage"),
    failureHttpStatus: integer("failure_http_status"),
    retryable: boolean("retryable"),
    attachmentId: uuid("attachment_id"),
    providerFileId: text("provider_file_id"),
    providerOperationId: text("provider_operation_id"),
    providerTaskId: text("provider_task_id"),
    correlationId: text("correlation_id"),
    correlationQuality: text("correlation_quality"),
    lastTransitionAt: timestamp("last_transition_at", { withTimezone: true }),
    postprocessingStatus: text("postprocessing_status"),
    postprocessingErrorMessage: text("postprocessing_error_message"),
    language: text("language"),
    fileName: text("file_name"),
    fileSizeBytes: bigint("file_size_bytes", { mode: "bigint" }),
    durationMs: bigint("duration_ms", { mode: "bigint" }),
    audioDurationMs: bigint("audio_duration_ms", { mode: "bigint" }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    pipelineEvents: jsonb("pipeline_events").$type<unknown[]>(),
  },
  (table) => ({
    createdAtIdx: index("asr_executions_created_at_idx").on(table.createdAt),
    workspaceIdx: index("asr_executions_workspace_idx").on(table.workspaceId, table.createdAt),
    userIdx: index("asr_executions_user_idx").on(table.userId, table.createdAt),
    statusIdx: index("asr_executions_status_idx").on(table.status, table.createdAt),
    lifecycleStatusIdx: index("asr_executions_lifecycle_status_idx").on(table.lifecycleStatus, table.createdAt),
    failureStageIdx: index("asr_executions_failure_stage_idx").on(table.failureStage, table.createdAt),
    providerOperationIdx: index("asr_executions_provider_operation_idx").on(table.providerOperationId),
    providerTaskIdx: index("asr_executions_provider_task_idx").on(table.providerTaskId),
    attachmentIdx: index("asr_executions_attachment_idx").on(table.attachmentId),
  }),
);

export type AsrExecution = typeof asrExecutions.$inferSelect;
export type AsrExecutionInsert = typeof asrExecutions.$inferInsert;

export const asrExecutionEvents = pgTable(
  "asr_execution_events",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    executionId: uuid("execution_id")
      .notNull()
      .references(() => asrExecutions.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    stage: text("stage").notNull(),
    fromLifecycleStatus: text("from_lifecycle_status"),
    toLifecycleStatus: text("to_lifecycle_status"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
    elapsedMs: bigint("elapsed_ms", { mode: "bigint" }),
    failureStage: text("failure_stage"),
    failureCode: text("failure_code"),
    failureMessage: text("failure_message"),
    failureHttpStatus: integer("failure_http_status"),
    retryable: boolean("retryable"),
    details: jsonb("details").$type<Record<string, unknown>>(),
  },
  (table) => ({
    occurredAtIdx: index("asr_execution_events_occurred_at_idx").on(table.occurredAt),
    executionOccurredAtIdx: index("asr_execution_events_execution_occurred_at_idx").on(
      table.executionId,
      table.occurredAt,
    ),
    stageOccurredAtIdx: index("asr_execution_events_stage_occurred_at_idx").on(table.stage, table.occurredAt),
    failureStageOccurredAtIdx: index("asr_execution_events_failure_stage_occurred_at_idx").on(
      table.failureStage,
      table.occurredAt,
    ),
  }),
);

export type AsrExecutionEventRow = typeof asrExecutionEvents.$inferSelect;
export type AsrExecutionEventInsert = typeof asrExecutionEvents.$inferInsert;

export const asrCompletionJobStatuses = ["pending", "transcribing", "completing", "postprocessing", "success", "error", "cancelled"] as const;
export type AsrCompletionJobStatus = (typeof asrCompletionJobStatuses)[number];
export const asrCompletionJobActionStatuses = ["pending", "queued", "running", "success", "error", "cancelled", "skipped"] as const;
export type AsrCompletionJobActionStatus = (typeof asrCompletionJobActionStatuses)[number];

export const asrCompletionJobs = pgTable(
  "asr_completion_jobs",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: varchar("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    chatId: varchar("chat_id")
      .notNull()
      .references(() => chatSessions.id, { onDelete: "cascade" }),
    assistantId: varchar("assistant_id")
      .notNull()
      .references(() => assistants.id, { onDelete: "cascade" }),
    userId: varchar("user_id").references(() => users.id, { onDelete: "set null" }),
    operationId: text("operation_id").notNull(),
    taskId: text("task_id"),
    asrExecutionId: uuid("asr_execution_id").references(() => asrExecutions.id, { onDelete: "set null" }),
    fileId: uuid("file_id").references(() => files.id, { onDelete: "set null" }),
    providerFileId: text("provider_file_id"),
    fileName: text("file_name"),
    actionPlanExplicit: boolean("action_plan_explicit").notNull().default(false),
    postTranscriptionActionIds: jsonb("post_transcription_action_ids").$type<string[] | null>(),
    status: text("status").$type<AsrCompletionJobStatus>().notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    workerId: text("worker_id"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true }),
    nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),
    transcriptId: varchar("transcript_id").references(() => transcripts.id, { onDelete: "set null" }),
    transcriptMessageId: varchar("transcript_message_id").references(() => chatMessages.id, { onDelete: "set null" }),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (table) => ({
    operationUniqueIdx: uniqueIndex("asr_completion_jobs_operation_unique_idx").on(table.operationId),
    statusNextRetryIdx: index("asr_completion_jobs_status_next_retry_idx").on(table.status, table.nextRetryAt, table.createdAt),
    leaseIdx: index("asr_completion_jobs_lease_idx").on(table.status, table.leaseExpiresAt),
    chatIdx: index("asr_completion_jobs_chat_idx").on(table.chatId, table.createdAt),
    asrExecutionIdx: index("asr_completion_jobs_asr_execution_idx").on(table.asrExecutionId),
    // 0260: FK-индекс под каскад удаления пространства (workspace_id).
    workspaceIdx: index("asr_completion_jobs_workspace_id_idx").on(table.workspaceId),
  }),
);

export type AsrCompletionJob = typeof asrCompletionJobs.$inferSelect;
export type AsrCompletionJobInsert = typeof asrCompletionJobs.$inferInsert;

export const asrCompletionJobActions = pgTable(
  "asr_completion_job_actions",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    asrCompletionJobId: uuid("asr_completion_job_id")
      .notNull()
      .references(() => asrCompletionJobs.id, { onDelete: "cascade" }),
    workspaceId: varchar("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    chatId: varchar("chat_id")
      .notNull()
      .references(() => chatSessions.id, { onDelete: "cascade" }),
    assistantId: varchar("assistant_id")
      .notNull()
      .references(() => assistants.id, { onDelete: "cascade" }),
    userId: varchar("user_id").references(() => users.id, { onDelete: "set null" }),
    transcriptId: varchar("transcript_id").references(() => transcripts.id, { onDelete: "set null" }),
    transcriptMessageId: varchar("transcript_message_id").references(() => chatMessages.id, { onDelete: "set null" }),
    sequenceIndex: integer("sequence_index").notNull(),
    actionId: varchar("action_id").notNull(),
    actionLabel: text("action_label").notNull(),
    placement: text("placement").notNull().default("canvas"),
    status: text("status").$type<AsrCompletionJobActionStatus>().notNull().default("pending"),
    assistantActionRunId: uuid("assistant_action_run_id").references(() => assistantActionRuns.id, { onDelete: "set null" }),
    statusMessageId: varchar("status_message_id").references(() => chatMessages.id, { onDelete: "set null" }),
    documentId: uuid("document_id"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (table) => ({
    jobSequenceUniqueIdx: uniqueIndex("asr_completion_job_actions_job_sequence_unique_idx").on(
      table.asrCompletionJobId,
      table.sequenceIndex,
    ),
    jobStatusIdx: index("asr_completion_job_actions_job_status_idx").on(table.asrCompletionJobId, table.status),
    runIdx: index("asr_completion_job_actions_run_idx").on(table.assistantActionRunId),
    transcriptIdx: index("asr_completion_job_actions_transcript_idx").on(table.transcriptId),
    // 0260: FK-индекс под каскад удаления пространства (workspace_id).
    workspaceIdx: index("asr_completion_job_actions_workspace_id_idx").on(table.workspaceId),
  }),
);

export type AsrCompletionJobAction = typeof asrCompletionJobActions.$inferSelect;
export type AsrCompletionJobActionInsert = typeof asrCompletionJobActions.$inferInsert;
export type KnowledgeBaseRagRequest = typeof knowledgeBaseRagRequests.$inferSelect;
export type KnowledgeBaseRagRequestInsert = typeof knowledgeBaseRagRequests.$inferInsert;
export type KnowledgeBaseSearchSettingsRow = typeof knowledgeBaseSearchSettings.$inferSelect;
export type KnowledgeBaseSearchSettingsInsert = typeof knowledgeBaseSearchSettings.$inferInsert;
export type KnowledgeBaseAskAiRun = typeof knowledgeBaseAskAiRuns.$inferSelect;
export type KnowledgeBaseAskAiRunInsert = typeof knowledgeBaseAskAiRuns.$inferInsert;
export type RagArenaBenchmarkRecord = typeof ragArenaBenchmarks.$inferSelect;
export type RagArenaBenchmarkInsertRecord = typeof ragArenaBenchmarks.$inferInsert;
export type RagArenaCaseRecord = typeof ragArenaCases.$inferSelect;
export type RagArenaCaseInsertRecord = typeof ragArenaCases.$inferInsert;
export type RagArenaExperimentRecord = typeof ragArenaExperiments.$inferSelect;
export type RagArenaExperimentInsertRecord = typeof ragArenaExperiments.$inferInsert;
export type RagArenaExperimentResultRecord = typeof ragArenaExperimentResults.$inferSelect;
export type RagArenaExperimentResultInsertRecord = typeof ragArenaExperimentResults.$inferInsert;
export type KnowledgeDocumentIndexRevisionRecord =
  typeof knowledgeDocumentIndexRevisions.$inferSelect;
export type KnowledgeDocumentIndexRevisionInsert =
  typeof knowledgeDocumentIndexRevisions.$inferInsert;
export type KnowledgeDocumentChunkSet = typeof knowledgeDocumentChunkSets.$inferSelect;
export type KnowledgeDocumentChunkSetInsert = typeof knowledgeDocumentChunkSets.$inferInsert;
export type KnowledgeDocumentChunkItem = typeof knowledgeDocumentChunkItems.$inferSelect;
export type KnowledgeDocumentChunkItemInsert = typeof knowledgeDocumentChunkItems.$inferInsert;
export type Action = typeof actions.$inferSelect;
export type ActionInsert = typeof actions.$inferInsert;
export type ActionExecution = typeof actionExecutions.$inferSelect;
export type ActionExecutionInsert = typeof actionExecutions.$inferInsert;
export type AssistantActionRun = typeof assistantActionRuns.$inferSelect;
export type AssistantActionRunInsert = typeof assistantActionRuns.$inferInsert;
export type AsrCompletionJobActionRecord = typeof asrCompletionJobActions.$inferSelect;
export type AsrCompletionJobActionInsertRecord = typeof asrCompletionJobActions.$inferInsert;
export type AssistantAction = typeof assistantActions.$inferSelect;
export type AssistantActionInsert = typeof assistantActions.$inferInsert;

export const guardBlockEvents = pgTable(
  "guard_block_events",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: varchar("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    operationType: text("operation_type").notNull(),
    resourceType: text("resource_type").notNull(),
    reasonCode: text("reason_code").notNull(),
    message: text("message").notNull(),
    upgradeAvailable: boolean("upgrade_available").notNull().default(false),
    limitKey: text("limit_key"),
    limitCurrent: doublePrecision("limit_current"),
    limitValue: doublePrecision("limit_value"),
    limitUnit: text("limit_unit"),
    expectedCost: jsonb("expected_cost"),
    usageSnapshot: jsonb("usage_snapshot"),
    meta: jsonb("meta"),
    requestId: text("request_id"),
    actorType: text("actor_type"),
  actorId: text("actor_id"),
  isSoft: boolean("is_soft").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    workspaceIdx: index("guard_block_events_workspace_idx").on(table.workspaceId, table.createdAt),
    createdIdx: index("guard_block_events_created_idx").on(table.createdAt),
  }),
);

export type GuardBlockEvent = typeof guardBlockEvents.$inferSelect;
export type GuardBlockEventInsert = typeof guardBlockEvents.$inferInsert;

export const tariffPlans = pgTable(
  "tariff_plans",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    code: text("code").notNull().unique(),
    name: text("name").notNull(),
    description: text("description"),
    shortDescription: text("short_description"),
    sortOrder: integer("sort_order").notNull().default(0),
    includedCreditsAmount: integer("included_credits_amount").notNull().default(0),
    includedCreditsPeriod: text("included_credits_period").notNull().default("monthly"),
    isDefault: boolean("is_default").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    defaultPlanUnique: uniqueIndex("tariff_plans_default_unique")
      .on(table.isDefault)
      .where(sql`is_default = true`),
  }),
);

export const tariffLimits = pgTable(
  "tariff_limits",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    planId: varchar("plan_id")
      .notNull()
      .references(() => tariffPlans.id, { onDelete: "cascade" }),
    limitKey: text("limit_key").notNull(),
    unit: text("unit").notNull(),
    limitValue: doublePrecision("limit_value"),
    isEnabled: boolean("is_enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    planIdx: index("tariff_limits_plan_idx").on(table.planId),
    planKeyIdx: index("tariff_limits_plan_key_idx").on(table.planId, table.limitKey),
    planKeyUnique: uniqueIndex("tariff_limits_plan_key_unique").on(table.planId, table.limitKey),
  }),
);

export type TariffPlan = typeof tariffPlans.$inferSelect;
export type TariffPlanInsert = typeof tariffPlans.$inferInsert;
export type TariffLimit = typeof tariffLimits.$inferSelect;
export type TariffLimitInsert = typeof tariffLimits.$inferInsert;

export const workspaceCreditAccounts = pgTable("workspace_credit_accounts", {
  workspaceId: varchar("workspace_id")
    .primaryKey()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  currentBalance: bigint("current_balance", { mode: "number" }).notNull().default(0),
  nextTopUpAt: timestamp("next_top_up_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const workspaceCreditLedger = pgTable(
  "workspace_credit_ledger",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: varchar("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    amountDelta: bigint("amount_delta", { mode: "number" }).notNull(),
    entryType: text("entry_type").notNull(),
    creditType: text("credit_type").notNull().default("subscription"),
    reason: text("reason"),
    sourceRef: text("source_ref").notNull(),
    planId: varchar("plan_id"),
    planCode: text("plan_code"),
    subscriptionId: text("subscription_id"),
    period: text("period"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    actorUserId: varchar("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    sourceUnique: uniqueIndex("workspace_credit_ledger_source_uq").on(table.workspaceId, table.entryType, table.sourceRef),
    workspaceIdx: index("workspace_credit_ledger_workspace_idx").on(table.workspaceId, table.occurredAt),
  }),
);

export type WorkspaceCreditAccount = typeof workspaceCreditAccounts.$inferSelect;
export type WorkspaceCreditAccountInsert = typeof workspaceCreditAccounts.$inferInsert;
export type WorkspaceCreditLedgerEntry = typeof workspaceCreditLedger.$inferSelect;
export type WorkspaceCreditLedgerInsert = typeof workspaceCreditLedger.$inferInsert;

// --- Knowledge Document Images ---

export const knowledgeDocumentImages = pgTable(
  "knowledge_document_images",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: varchar("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    baseId: varchar("base_id")
      .notNull()
      .references(() => knowledgeBases.id, { onDelete: "cascade" }),
    documentId: varchar("document_id")
      .notNull()
      .references(() => knowledgeDocuments.id, { onDelete: "cascade" }),
    versionId: varchar("version_id")
      .notNull()
      .references(() => knowledgeDocumentVersions.id, { onDelete: "cascade" }),

    contentHash: varchar("content_hash", { length: 64 }).notNull(),
    originalIndex: integer("original_index").notNull(),

    pageNumber: integer("page_number"),
    positionOffset: integer("position_offset"),

    width: integer("width").notNull(),
    height: integer("height").notNull(),
    mimeType: varchar("mime_type", { length: 50 }).notNull(),
    sizeBytes: integer("size_bytes").notNull(),

    storageBucket: varchar("storage_bucket", { length: 255 }).notNull(),
    storageKey: varchar("storage_key", { length: 500 }).notNull(),

    caption: text("caption"),
    captionModel: varchar("caption_model", { length: 100 }),
    captionGeneratedAt: timestamp("caption_generated_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    versionHashUnique: uniqueIndex("kdi_version_content_hash_uq").on(
      table.versionId,
      table.contentHash,
    ),
    documentIdx: index("kdi_document_id_idx").on(table.documentId),
    baseIdx: index("kdi_base_id_idx").on(table.baseId),
  }),
);

export type KnowledgeDocumentImage = typeof knowledgeDocumentImages.$inferSelect;
export type KnowledgeDocumentImageInsert = typeof knowledgeDocumentImages.$inferInsert;

// ─────────────────────────────────────────────────────────────────────────────
// Workflow Domain Foundation (Release 1.70 / Epic 1)
// ─────────────────────────────────────────────────────────────────────────────

export const workflowDefinitions = pgTable(
  "workflow_definitions",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    kind: varchar("kind", { length: 32 }).$type<(typeof workflowDefinitionKinds)[number]>().notNull(),
    scopeKind: varchar("scope_kind", { length: 32 }).$type<(typeof workflowDefinitionScopeKinds)[number]>().notNull(),
    workspaceId: varchar("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 32 }).$type<(typeof workflowDefinitionStatuses)[number]>().notNull().default("draft"),
    title: text("title").notNull(),
    description: text("description"),
    schemaVersion: integer("schema_version").notNull().default(1),
    draftEditorDocument: jsonb("draft_editor_document").$type<Record<string, unknown>>().notNull().default({}),
    draftWorkflowDocument: jsonb("draft_workflow_document").$type<Record<string, unknown>>().notNull().default({}),
    draftRevision: integer("draft_revision").notNull().default(1),
    currentPublishedVersionId: uuid("current_published_version_id"),
    currentPublishedVersionNo: integer("current_published_version_no"),
    createdByUserId: varchar("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    updatedByUserId: varchar("updated_by_user_id").references(() => users.id, { onDelete: "set null" }),
    templateSource: varchar("template_source", { length: 32 }).$type<(typeof workflowTemplateSources)[number] | null>(),
    systemTemplateKey: varchar("system_template_key", { length: 255 }),
    managedReleaseTag: varchar("managed_release_tag", { length: 255 }),
    managedByBundleVersion: varchar("managed_by_bundle_version", { length: 255 }),
    archivedAt: timestamp("archived_at"),
    createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    scopeStatusUpdatedIdx: index("workflow_definitions_scope_status_updated_idx").on(
      table.scopeKind,
      table.status,
      table.updatedAt,
    ),
    workspaceKindStatusUpdatedIdx: index("workflow_definitions_workspace_kind_status_updated_idx").on(
      table.workspaceId,
      table.kind,
      table.status,
      table.updatedAt,
    ),
    publishedVersionIdx: index("workflow_definitions_published_version_idx").on(table.currentPublishedVersionId),
    systemTemplateKeyUniqueIdx: uniqueIndex("workflow_definitions_system_template_key_uq").on(table.systemTemplateKey),
  }),
);

export type WorkflowDefinition = typeof workflowDefinitions.$inferSelect;
export type WorkflowDefinitionInsert = typeof workflowDefinitions.$inferInsert;

export const workflowDefinitionVersions = pgTable(
  "workflow_definition_versions",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    definitionId: uuid("definition_id")
      .notNull()
      .references(() => workflowDefinitions.id, { onDelete: "cascade" }),
    versionNo: integer("version_no").notNull(),
    schemaVersion: integer("schema_version").notNull(),
    editorDocument: jsonb("editor_document").$type<Record<string, unknown>>().notNull(),
    workflowDocument: jsonb("workflow_document").$type<Record<string, unknown>>().notNull(),
    releaseNote: text("release_note"),
    changeSummary: jsonb("change_summary").$type<Record<string, unknown>>().notNull().default({}),
    langgraphCompatibility: jsonb("langgraph_compatibility").$type<Record<string, unknown>>().notNull().default({}),
    bundleManifest: jsonb("bundle_manifest").$type<Record<string, unknown>>().notNull().default({}),
    publishedByUserId: varchar("published_by_user_id").references(() => users.id, { onDelete: "set null" }),
    publishedAt: timestamp("published_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    definitionVersionUniqueIdx: uniqueIndex("workflow_definition_versions_definition_version_uq").on(
      table.definitionId,
      table.versionNo,
    ),
    definitionPublishedIdx: index("workflow_definition_versions_definition_published_idx").on(
      table.definitionId,
      table.publishedAt,
    ),
  }),
);

export type WorkflowDefinitionVersion = typeof workflowDefinitionVersions.$inferSelect;
export type WorkflowDefinitionVersionInsert = typeof workflowDefinitionVersions.$inferInsert;

export const customNodeLibraries = pgTable(
  "custom_node_libraries",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    name: text("name").notNull(),
    slug: varchar("slug", { length: 255 }).notNull(),
    description: text("description"),
    status: varchar("status", { length: 32 }).$type<CustomNodeLibraryStatus>().notNull().default("active"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    slugUniqueIdx: uniqueIndex("custom_node_libraries_slug_uq").on(table.slug),
    statusSortIdx: index("custom_node_libraries_status_sort_idx").on(table.status, table.sortOrder),
  }),
);

export type CustomNodeLibrary = typeof customNodeLibraries.$inferSelect;
export type CustomNodeLibraryInsert = typeof customNodeLibraries.$inferInsert;

export const customNodeDefinitions = pgTable(
  "custom_node_definitions",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    libraryId: uuid("library_id")
      .notNull()
      .references(() => customNodeLibraries.id, { onDelete: "cascade" }),
    key: varchar("key", { length: 255 }).notNull(),
    name: text("name").notNull(),
    description: text("description"),
    status: varchar("status", { length: 32 }).$type<CustomNodeDefinitionStatus>().notNull().default("draft"),
    currentPublishedVersionId: uuid("current_published_version_id"),
    draftSourceCode: text("draft_source_code").notNull().default("return input;"),
    draftInputSchema: jsonb("draft_input_schema").$type<JsonObject>().notNull().default(sql`'{"type":"object","additionalProperties":true}'::jsonb`),
    draftOutputSchema: jsonb("draft_output_schema").$type<JsonObject>().notNull().default(sql`'{"type":"object","additionalProperties":true}'::jsonb`),
    draftRuntimeConfig: jsonb("draft_runtime_config").$type<CustomNodeRuntimeConfig>().notNull().default(sql`'{"language":"javascript","timeoutMs":1000,"sourceSizeLimitBytes":50000,"inputSizeLimitBytes":262144,"outputSizeLimitBytes":262144}'::jsonb`),
    draftRevision: integer("draft_revision").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    libraryKeyUniqueIdx: uniqueIndex("custom_node_definitions_library_key_uq").on(table.libraryId, table.key),
    libraryStatusIdx: index("custom_node_definitions_library_status_idx").on(table.libraryId, table.status),
    publishedVersionIdx: index("custom_node_definitions_published_version_idx").on(table.currentPublishedVersionId),
  }),
);

export type CustomNodeDefinition = typeof customNodeDefinitions.$inferSelect;
export type CustomNodeDefinitionInsert = typeof customNodeDefinitions.$inferInsert;

export const customNodeVersions = pgTable(
  "custom_node_versions",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    nodeDefinitionId: uuid("node_definition_id")
      .notNull()
      .references(() => customNodeDefinitions.id, { onDelete: "cascade" }),
    versionNo: integer("version_no").notNull(),
    sourceCode: text("source_code").notNull(),
    inputSchema: jsonb("input_schema").$type<JsonObject>().notNull(),
    outputSchema: jsonb("output_schema").$type<JsonObject>().notNull(),
    runtimeConfig: jsonb("runtime_config").$type<CustomNodeRuntimeConfig>().notNull(),
    sourceHash: varchar("source_hash", { length: 64 }).notNull(),
    publishedByUserId: varchar("published_by_user_id").references(() => users.id, { onDelete: "set null" }),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    definitionVersionUniqueIdx: uniqueIndex("custom_node_versions_definition_version_uq").on(
      table.nodeDefinitionId,
      table.versionNo,
    ),
    definitionPublishedIdx: index("custom_node_versions_definition_published_idx").on(
      table.nodeDefinitionId,
      table.publishedAt,
    ),
    sourceHashIdx: index("custom_node_versions_source_hash_idx").on(table.sourceHash),
  }),
);

export type CustomNodeVersion = typeof customNodeVersions.$inferSelect;
export type CustomNodeVersionInsert = typeof customNodeVersions.$inferInsert;

export const workflowStatusTemplates = pgTable(
  "workflow_status_templates",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    name: text("name").notNull(),
    template: text("template").notNull(),
    allowedNodeKinds: text("allowed_node_kinds")
      .array()
      .$type<WorkflowStatusTemplateAllowedNodeKind[]>()
      .notNull()
      .default(sql`'{}'::text[]`),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    activeUpdatedIdx: index("workflow_status_templates_active_updated_idx").on(table.isActive, table.updatedAt),
    allowedNodeKindsIdx: index("workflow_status_templates_allowed_node_kinds_idx").using(
      "gin",
      table.allowedNodeKinds,
    ),
    nameUniqueIdx: uniqueIndex("workflow_status_templates_name_uq").on(sql`lower(${table.name})`),
  }),
);

export type WorkflowStatusTemplate = typeof workflowStatusTemplates.$inferSelect;
export type WorkflowStatusTemplateInsert = typeof workflowStatusTemplates.$inferInsert;

export const workflowAuditLog = pgTable(
  "workflow_audit_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    definitionId: uuid("definition_id")
      .notNull()
      .references(() => workflowDefinitions.id, { onDelete: "cascade" }),
    workspaceId: varchar("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
    actorId: varchar("actor_id").references(() => users.id, { onDelete: "set null" }),
    action: varchar("action", { length: 50 }).$type<(typeof workflowAuditActions)[number]>().notNull(),
    versionId: uuid("version_id"),
    details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    createdAtIdx: index("workflow_audit_log_created_at_idx").on(table.createdAt),
    workspaceCreatedAtIdx: index("workflow_audit_log_workspace_created_at_idx").on(
      table.workspaceId,
      table.createdAt,
    ),
    definitionCreatedAtIdx: index("workflow_audit_log_definition_created_at_idx").on(
      table.definitionId,
      table.createdAt,
    ),
  }),
);

export type WorkflowAuditLog = typeof workflowAuditLog.$inferSelect;
export type WorkflowAuditLogInsert = typeof workflowAuditLog.$inferInsert;

export const assistantWorkflowRuns = pgTable(
  "assistant_workflow_runs",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: varchar("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    assistantId: varchar("assistant_id")
      .notNull()
      .references(() => assistants.id, { onDelete: "cascade" }),
    chatId: varchar("chat_id")
      .notNull()
      .references(() => chatSessions.id, { onDelete: "cascade" }),
    userId: varchar("user_id").references(() => users.id, { onDelete: "set null" }),
    userMessageId: varchar("user_message_id").references(() => chatMessages.id, { onDelete: "set null" }),
    workflowDefinitionId: uuid("workflow_definition_id")
      .notNull()
      .references(() => workflowDefinitions.id, { onDelete: "restrict" }),
      resolvedWorkflowVersionId: uuid("resolved_workflow_version_id")
        .notNull()
        .references(() => workflowDefinitionVersions.id, { onDelete: "restrict" }),
      resolvedWorkflowVersionNo: integer("resolved_workflow_version_no").notNull(),
      workflowContentHash: varchar("workflow_content_hash", { length: 64 }).notNull(),
      dispatchSource: varchar("dispatch_source", { length: 64 })
        .$type<AssistantWorkflowRunDispatchSource>()
        .notNull()
        .default("assistant_execution"),
      status: varchar("status", { length: 32 }).$type<AssistantWorkflowRunStatus>().notNull().default("queued"),
    queuePosition: integer("queue_position").notNull().default(1),
    queueKey: varchar("queue_key", { length: 255 }),
    inputEnvelope: jsonb("input_envelope").$type<Record<string, unknown>>().notNull().default({}),
    runtimeState: jsonb("runtime_state").$type<Record<string, unknown>>().notNull().default({}),
    currentStepId: varchar("current_step_id", { length: 255 }),
    waitingNodeId: varchar("waiting_node_id", { length: 255 }),
    wakeAt: timestamp("wake_at", { withTimezone: true }),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lockedBy: varchar("locked_by", { length: 255 }),
    lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true }),
    errorCode: varchar("error_code", { length: 255 }),
    errorMessage: text("error_message"),
    // Тело ответа для sync-вебхука: { source: "final_text", result } или захват узла respond_webhook
    // ({ source: "respond_node", statusCode, headers, body }). Читается публичным sync-обработчиком.
    responsePayload: jsonb("response_payload").$type<Record<string, unknown>>(),
    // Дебаг-сессия step-debug (0287). БЕЗ FK на workflow_debug_sessions: таблицей прогонов владеет
    // workflow-рантайм, сессиями — кластер дефиниций монолита (готовность к schema-per-service,
    // прецедент bundle_snapshots/0285). Осиротевшая ссылка безвредна — уборка на janitor.
    debugSessionId: uuid("debug_session_id"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    chatStatusQueueIdx: index("assistant_workflow_runs_chat_status_queue_idx").on(
      table.chatId,
      table.status,
      table.queuePosition,
      table.createdAt,
    ),
    statusWakeIdx: index("assistant_workflow_runs_status_wake_idx").on(
      table.status,
      table.wakeAt,
      table.createdAt,
    ),
    statusLeaseIdx: index("assistant_workflow_runs_status_lease_idx").on(
      table.status,
      table.lastHeartbeatAt,
      table.lockedAt,
      table.queuePosition,
      table.createdAt,
    ),
    assistantCreatedIdx: index("assistant_workflow_runs_assistant_created_idx").on(table.assistantId, table.createdAt),
    resolvedVersionIdx: index("assistant_workflow_runs_resolved_version_idx").on(table.resolvedWorkflowVersionId),
    queueKeyStatusIdx: index("assistant_workflow_runs_queue_key_status_idx").on(table.queueKey, table.status),
    // 0261: композит под листинг истории ранов определения (workspace_id + workflow_definition_id +
    // created_at DESC, listWorkflowRunsForDefinition). Ведущий workspace_id покрывает и FK-каскад
    // удаления пространства → заменяет одиночный workspace_id-индекс из 0260 (тот дропнут в 0261).
    workspaceWorkflowCreatedIdx: index("assistant_workflow_runs_workspace_workflow_created_idx").on(
      table.workspaceId,
      table.workflowDefinitionId,
      table.createdAt,
    ),
    // 0287: выборка прогонов дебаг-сессии (step-debug), частичная по непустому debug_session_id.
    debugSessionCreatedIdx: index("assistant_workflow_runs_debug_session_created_idx")
      .on(table.debugSessionId, table.createdAt)
      .where(sql`"debug_session_id" IS NOT NULL`),
  }),
);

export type AssistantWorkflowRun = typeof assistantWorkflowRuns.$inferSelect;
export type AssistantWorkflowRunInsert = typeof assistantWorkflowRuns.$inferInsert;

// Снапшот скомпилированного бандла прогона (миграция 0285). Ключ (resolvedWorkflowVersionId, contentHash):
// персистится на enqueue, воркер читает IR/workflowJson ЛОКАЛЬНО — без definition-port (декаплинг
// workflow-микросервиса, контракт §«Форма доставки IR»). БЕЗ FK на версии: рантайм не зависит от кластера
// дефиниций (готовность к schema-per-service). Опубликованные версии иммутабельны → ключ стабилен.
export const assistantWorkflowBundleSnapshots = pgTable(
  "assistant_workflow_bundle_snapshots",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    resolvedWorkflowVersionId: uuid("resolved_workflow_version_id").notNull(),
    contentHash: varchar("content_hash", { length: 64 }).notNull(),
    // Документы бандла — как прочие jsonb-блобы домена (inputEnvelope/runtimeState): в схеме
    // Record<string, unknown>, типизация WorkflowJsonV1/WorkflowIrV1 — на границе сервиса.
    workflowJson: jsonb("workflow_json").$type<Record<string, unknown>>().notNull(),
    ir: jsonb("ir").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    versionHashUniq: uniqueIndex("assistant_workflow_bundle_snapshots_version_hash_uniq").on(
      table.resolvedWorkflowVersionId,
      table.contentHash,
    ),
  }),
);

export type AssistantWorkflowBundleSnapshot = typeof assistantWorkflowBundleSnapshots.$inferSelect;

// ─────────────────────────────────────────────────────────────────────────────
// Step-debug: дебаг-сессии и пины (0287, roadmap D1)
// ─────────────────────────────────────────────────────────────────────────────

export const workflowDebugSessionStatuses = [
  // armed — сессия ждёт author-driven вызов; capturing — CAS-переход на время enqueue захвата;
  // active — вызов захвачен (capturedRunId); published/discarded/expired — терминальные.
  "armed",
  "capturing",
  "active",
  "published",
  "discarded",
  "expired",
] as const;
export type WorkflowDebugSessionStatus = (typeof workflowDebugSessionStatuses)[number];

// Эфемерная дебаг-сессия step-debug: снимок черновика (editorDocument + скомпилированный бандл)
// + арминг захвата реального входа. Владелец — кластер дефиниций монолита (arm компилирует через
// compileWorkflowDraft); рантайм-сервис ссылается на неё только по id прогона (runs.debug_session_id).
// expires_at несёт ДВА разных таймаута по фазе жизни (0292): до захвата — ожидание вызова
// (armTtlSeconds), после — скользящая жизнь сессии (sessionTtlSeconds, продлевается активностью).
// Протухшие закрывает sweeper (D6.3), до него — ленивый expired-статус читателей.
export const workflowDebugSessions = pgTable(
  "workflow_debug_sessions",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: varchar("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    workflowDefinitionId: uuid("workflow_definition_id")
      .notNull()
      .references(() => workflowDefinitions.id, { onDelete: "cascade" }),
    // Author-driven захват: ловим ТОЛЬКО вызовы этого пользователя (обычные юзеры не задеты).
    authorUserId: varchar("author_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 32 })
      .$type<WorkflowDebugSessionStatus>()
      .notNull()
      .default("armed"),
    armedAt: timestamp("armed_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    // Сужение захвата: { channel?: 'chat'|'webhook', assistantId?: string }. Пустой объект = любой
    // author-driven вызов этой дефиниции.
    captureFilter: jsonb("capture_filter").$type<Record<string, unknown>>().notNull().default({}),
    // Пауза перед входным узлом захваченного прогона (обработка движком — D2; в D1 поле контрактное).
    pauseBeforeEntry: boolean("pause_before_entry").notNull().default(true),
    // БЕЗ FK на assistant_workflow_runs: прогонами владеет workflow-рантайм (schema-per-service).
    capturedRunId: uuid("captured_run_id"),
    // Захваченный прогон освобождён (отменён в рантайме) при закрытии сессии — 0292. Пока NULL, а
    // сессия терминальна, прогон считается неосвобождённым: reaper sweeper'а повторит отмену
    // (идемпотентно, без чтения чужой таблицы прогонов).
    capturedRunReleasedAt: timestamp("captured_run_released_at", { withTimezone: true }),
    // Снимок черновика на момент arm: нормализованный editorDocument + скомпилированный бандл.
    // Дебаг-прогон исполняется по нему; ключ снапшота бандла = (реальная versionId, draftContentHash) —
    // hash черновика отличает его от опубликованного бандла, затенения нет (0285-дедуп безопасен).
    draftEditorDocument: jsonb("draft_editor_document").$type<Record<string, unknown>>().notNull(),
    draftWorkflowJson: jsonb("draft_workflow_json").$type<Record<string, unknown>>().notNull(),
    draftIrJson: jsonb("draft_ir_json").$type<Record<string, unknown>>().notNull(),
    draftContentHash: varchar("draft_content_hash", { length: 64 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    workspaceDefinitionStatusIdx: index("workflow_debug_sessions_workspace_definition_status_idx").on(
      table.workspaceId,
      table.workflowDefinitionId,
      table.status,
    ),
    // Для sweeper'а протухших armed-сессий (D6.3).
    statusExpiresIdx: index("workflow_debug_sessions_status_expires_idx").on(table.status, table.expiresAt),
  }),
);

export type WorkflowDebugSession = typeof workflowDebugSessions.$inferSelect;
export type WorkflowDebugSessionInsert = typeof workflowDebugSessions.$inferInsert;

// Per-session оверлей замороженных выходов узлов (= n8n pinData, roadmap D3). Live-прогоны эту
// таблицу НЕ читают никогда: оверлей грузится только при run.debug_session_id (структурная изоляция).
export const workflowDebugPins = pgTable(
  "workflow_debug_pins",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    debugSessionId: uuid("debug_session_id")
      .notNull()
      .references(() => workflowDebugSessions.id, { onDelete: "cascade" }),
    nodeId: varchar("node_id", { length: 255 }).notNull(),
    // Форма context.steps[nodeId] — подставляется движком вместо исполнения узла.
    pinnedOutput: jsonb("pinned_output").$type<Record<string, unknown>>().notNull().default({}),
    pinnedByUserId: varchar("pinned_by_user_id").references(() => users.id, { onDelete: "set null" }),
    // true = выход правился вручную (Edit output), а не заморожен из реального прогона.
    editable: boolean("editable").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    sessionNodeUniq: uniqueIndex("workflow_debug_pins_session_node_uq").on(table.debugSessionId, table.nodeId),
  }),
);

export type WorkflowDebugPin = typeof workflowDebugPins.$inferSelect;
export type WorkflowDebugPinInsert = typeof workflowDebugPins.$inferInsert;

export const assistantWorkflowFormRequestStatuses = ["pending", "submitted", "expired", "cancelled"] as const;
export type AssistantWorkflowFormRequestStatus = (typeof assistantWorkflowFormRequestStatuses)[number];

export const assistantWorkflowFormRequests = pgTable(
  "assistant_workflow_form_requests",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    runId: uuid("run_id")
      .notNull()
      .references(() => assistantWorkflowRuns.id, { onDelete: "cascade" }),
    workspaceId: varchar("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    assistantId: varchar("assistant_id")
      .notNull()
      .references(() => assistants.id, { onDelete: "cascade" }),
    chatId: varchar("chat_id")
      .notNull()
      .references(() => chatSessions.id, { onDelete: "cascade" }),
    userMessageId: varchar("user_message_id").references(() => chatMessages.id, { onDelete: "set null" }),
    nodeId: varchar("node_id", { length: 255 }).notNull(),
    stepId: varchar("step_id", { length: 255 }).notNull(),
    title: text("title"),
    description: text("description"),
    formSchema: jsonb("form_schema").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    initialPayload: jsonb("initial_payload").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    submittedPayload: jsonb("submitted_payload").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    status: varchar("status", { length: 32 })
      .$type<AssistantWorkflowFormRequestStatus>()
      .notNull()
      .default("pending"),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    submittedByUserId: varchar("submitted_by_user_id").references(() => users.id, { onDelete: "set null" }),
  },
  (table) => ({
    workspaceStatusRequestedIdx: index("assistant_workflow_forms_workspace_status_requested_idx").on(
      table.workspaceId,
      table.status,
      table.requestedAt,
    ),
    runStatusIdx: index("assistant_workflow_forms_run_status_idx").on(table.runId, table.status),
    chatStatusIdx: index("assistant_workflow_forms_chat_status_idx").on(table.chatId, table.status),
  }),
);

export type AssistantWorkflowFormRequest = typeof assistantWorkflowFormRequests.$inferSelect;
export type AssistantWorkflowFormRequestInsert = typeof assistantWorkflowFormRequests.$inferInsert;

export const assistantWorkflowContextRequestStatuses = ["pending", "submitted", "expired", "cancelled"] as const;
export type AssistantWorkflowContextRequestStatus = (typeof assistantWorkflowContextRequestStatuses)[number];

export const assistantWorkflowContextRequests = pgTable(
  "assistant_workflow_context_requests",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    runId: uuid("run_id")
      .notNull()
      .references(() => assistantWorkflowRuns.id, { onDelete: "cascade" }),
    workspaceId: varchar("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    assistantId: varchar("assistant_id")
      .notNull()
      .references(() => assistants.id, { onDelete: "cascade" }),
    chatId: varchar("chat_id")
      .notNull()
      .references(() => chatSessions.id, { onDelete: "cascade" }),
    userMessageId: varchar("user_message_id").references(() => chatMessages.id, { onDelete: "set null" }),
    nodeId: varchar("node_id", { length: 255 }).notNull(),
    stepId: varchar("step_id", { length: 255 }).notNull(),
    acceptedTypes: jsonb("accepted_types")
      .$type<ContextRef["type"][]>()
      .notNull()
      .default(sql`'["knowledge_base","canvas_document"]'::jsonb`),
    question: text("question").notNull(),
    queryHint: text("query_hint"),
    submittedContextRefs: jsonb("submitted_context_refs").$type<ContextRef[]>().notNull().default(sql`'[]'::jsonb`),
    resolvedContextRefs: jsonb("resolved_context_refs")
      .$type<ResolvedContextRef[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    status: varchar("status", { length: 32 })
      .$type<AssistantWorkflowContextRequestStatus>()
      .notNull()
      .default("pending"),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    submittedByUserId: varchar("submitted_by_user_id").references(() => users.id, { onDelete: "set null" }),
  },
  (table) => ({
    workspaceStatusRequestedIdx: index("assistant_workflow_context_workspace_status_requested_idx").on(
      table.workspaceId,
      table.status,
      table.requestedAt,
    ),
    runStatusIdx: index("assistant_workflow_context_run_status_idx").on(table.runId, table.status),
    chatStatusIdx: index("assistant_workflow_context_chat_status_idx").on(table.chatId, table.status),
  }),
);

export type AssistantWorkflowContextRequest = typeof assistantWorkflowContextRequests.$inferSelect;
export type AssistantWorkflowContextRequestInsert = typeof assistantWorkflowContextRequests.$inferInsert;

export const assistantWorkflowRunSteps = pgTable(
  "assistant_workflow_run_steps",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    runId: uuid("run_id")
      .notNull()
      .references(() => assistantWorkflowRuns.id, { onDelete: "cascade" }),
    sequenceNo: integer("sequence_no").notNull(),
    nodeId: varchar("node_id", { length: 255 }).notNull(),
    stepId: varchar("step_id", { length: 255 }).notNull(),
    nodeKind: varchar("node_kind", { length: 32 }).$type<(typeof workflowNodeKinds)[number]>().notNull(),
    status: varchar("status", { length: 32 }).$type<AssistantWorkflowRunStepStatus>().notNull(),
    branchPortId: varchar("branch_port_id", { length: 255 }),
    // 0287: номер попытки узла в дебаг-прогоне (step-debug rerun); NULL = обычный (первичный) проход.
    attemptNo: integer("attempt_no"),
    inputPayload: jsonb("input_payload").$type<Record<string, unknown>>().notNull().default({}),
    outputPayload: jsonb("output_payload").$type<Record<string, unknown>>().notNull().default({}),
    errorCode: varchar("error_code", { length: 255 }),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    runSequenceUniqueIdx: uniqueIndex("assistant_workflow_run_steps_run_sequence_uq").on(
      table.runId,
      table.sequenceNo,
    ),
    runNodeIdx: index("assistant_workflow_run_steps_run_node_idx").on(table.runId, table.nodeId, table.createdAt),
  }),
);

export type AssistantWorkflowRunStep = typeof assistantWorkflowRunSteps.$inferSelect;
export type AssistantWorkflowRunStepInsert = typeof assistantWorkflowRunSteps.$inferInsert;

export const assistantWorkflowRunEvents = pgTable(
  "assistant_workflow_run_events",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    runId: uuid("run_id")
      .notNull()
      .references(() => assistantWorkflowRuns.id, { onDelete: "cascade" }),
    sequenceNo: integer("sequence_no").notNull(),
    nodeId: varchar("node_id", { length: 255 }),
    stepId: varchar("step_id", { length: 255 }),
    eventType: varchar("event_type", { length: 255 }).notNull(),
    phase: varchar("phase", { length: 32 }).$type<AssistantWorkflowRunEventPhase>().notNull(),
    actorKind: varchar("actor_kind", { length: 32 }).$type<AssistantWorkflowRunEventActorKind>().notNull(),
    visibility: varchar("visibility", { length: 32 })
      .$type<AssistantWorkflowRunEventVisibility>()
      .notNull()
      .default("debug"),
    capabilityKey: varchar("capability_key", { length: 255 }),
    toolName: varchar("tool_name", { length: 255 }),
    retryReason: varchar("retry_reason", { length: 255 }),
    iconKey: varchar("icon_key", { length: 64 }),
    tone: varchar("tone", { length: 32 }),
    title: text("title").notNull().default(""),
    summary: text("summary"),
    metaPreview: jsonb("meta_preview").$type<Record<string, unknown>>().notNull().default({}),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    durationMs: integer("duration_ms"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    createdAtIdx: index("assistant_workflow_run_events_created_at_idx").on(table.createdAt),
    runSequenceUniqueIdx: uniqueIndex("assistant_workflow_run_events_run_sequence_uq").on(
      table.runId,
      table.sequenceNo,
    ),
    runCreatedIdx: index("assistant_workflow_run_events_run_created_idx").on(table.runId, table.createdAt),
    runVisibilityIdx: index("assistant_workflow_run_events_run_visibility_idx").on(
      table.runId,
      table.visibility,
      table.createdAt,
    ),
  }),
);

export type AssistantWorkflowRunEvent = typeof assistantWorkflowRunEvents.$inferSelect;
export type AssistantWorkflowRunEventInsert = typeof assistantWorkflowRunEvents.$inferInsert;

export const assistantAgentArtifacts = pgTable(
  "assistant_agent_artifacts",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: varchar("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    chatId: varchar("chat_id").references(() => chatSessions.id, { onDelete: "cascade" }),
    runId: uuid("run_id").references(() => assistantWorkflowRuns.id, { onDelete: "set null" }),
    stepId: varchar("step_id", { length: 255 }),
    nodeId: varchar("node_id", { length: 255 }),
    operationKey: varchar("operation_key", { length: 255 }).notNull(),
    inputHash: varchar("input_hash", { length: 128 }),
    mutationKind: varchar("mutation_kind", { length: 32 })
      .$type<AssistantAgentArtifactMutationKind>()
      .notNull(),
    resourceType: varchar("resource_type", { length: 128 }).notNull(),
    resourceId: varchar("resource_id", { length: 255 }).notNull(),
    parentResourceType: varchar("parent_resource_type", { length: 128 }),
    parentResourceId: varchar("parent_resource_id", { length: 255 }),
    title: text("title").notNull().default(""),
    appPath: text("app_path"),
    appUrl: text("app_url"),
    beforeSnapshot: jsonb("before_snapshot").$type<Record<string, unknown> | null>(),
    afterSnapshot: jsonb("after_snapshot").$type<Record<string, unknown> | null>(),
    resultEntity: jsonb("result_entity").$type<Record<string, unknown> | null>(),
    cleanupStrategy: varchar("cleanup_strategy", { length: 32 })
      .$type<AssistantAgentArtifactCleanupStrategy>()
      .notNull()
      .default("none"),
    cleanupInput: jsonb("cleanup_input").$type<Record<string, unknown>>().notNull().default({}),
    status: varchar("status", { length: 32 }).$type<AssistantAgentArtifactStatus>().notNull().default("active"),
    cleanupError: text("cleanup_error"),
    cleanedAt: timestamp("cleaned_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    workspaceChatStatusCreatedIdx: index("assistant_agent_artifacts_ws_chat_status_created_idx").on(
      table.workspaceId,
      table.chatId,
      table.status,
      table.createdAt,
    ),
    runCreatedIdx: index("assistant_agent_artifacts_run_created_idx").on(table.runId, table.createdAt),
    resourceIdx: index("assistant_agent_artifacts_resource_idx").on(
      table.workspaceId,
      table.resourceType,
      table.resourceId,
    ),
    operationIdx: index("assistant_agent_artifacts_operation_idx").on(table.operationKey, table.createdAt),
    // 0260: FK-индекс под каскад удаления чат-сессии (chat_id; в составном он 2-й после workspace_id).
    chatIdx: index("assistant_agent_artifacts_chat_id_idx").on(table.chatId),
  }),
);

export type AssistantAgentArtifact = typeof assistantAgentArtifacts.$inferSelect;
export type AssistantAgentArtifactInsert = typeof assistantAgentArtifacts.$inferInsert;

export const assistantWorkflowApprovalRequests = pgTable(
  "assistant_workflow_approval_requests",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    runId: uuid("run_id")
      .notNull()
      .references(() => assistantWorkflowRuns.id, { onDelete: "cascade" }),
    workspaceId: varchar("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    assistantId: varchar("assistant_id")
      .notNull()
      .references(() => assistants.id, { onDelete: "cascade" }),
    chatId: varchar("chat_id")
      .notNull()
      .references(() => chatSessions.id, { onDelete: "cascade" }),
    userMessageId: varchar("user_message_id").references(() => chatMessages.id, { onDelete: "set null" }),
    nodeId: varchar("node_id", { length: 255 }).notNull(),
    stepId: varchar("step_id", { length: 255 }).notNull(),
    approvalRoleCode: varchar("approval_role_code", { length: 255 }).notNull(),
    status: varchar("status", { length: 32 })
      .$type<AssistantWorkflowApprovalRequestStatus>()
      .notNull()
      .default("pending"),
    decisionComment: text("decision_comment"),
    requestPayload: jsonb("request_payload").$type<Record<string, unknown>>().notNull().default({}),
    decisionPayload: jsonb("decision_payload").$type<Record<string, unknown>>().notNull().default({}),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
    dueAt: timestamp("due_at", { withTimezone: true }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decidedByUserId: varchar("decided_by_user_id").references(() => users.id, { onDelete: "set null" }),
  },
  (table) => ({
    workspaceStatusRequestedIdx: index("assistant_workflow_approvals_workspace_status_requested_idx").on(
      table.workspaceId,
      table.status,
      table.requestedAt,
    ),
    runStatusIdx: index("assistant_workflow_approvals_run_status_idx").on(table.runId, table.status),
    chatStatusIdx: index("assistant_workflow_approvals_chat_status_idx").on(table.chatId, table.status),
  }),
);

export type AssistantWorkflowApprovalRequest = typeof assistantWorkflowApprovalRequests.$inferSelect;
export type AssistantWorkflowApprovalRequestInsert = typeof assistantWorkflowApprovalRequests.$inferInsert;

// ─────────────────────────────────────────────────────────────────────────────
// Plugins / Skills / Connections v1
// ─────────────────────────────────────────────────────────────────────────────

export const pluginRegistry = pgTable(
  "plugin_registry",
  {
    id: varchar("id", { length: 255 }).primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    icon: text("icon"),
    category: varchar("category", { length: 100 }),
    author: jsonb("author").$type<JsonObject>().notNull().default(sql`'{}'::jsonb`),
    permissions: jsonb("permissions").$type<JsonObject[]>().notNull().default(sql`'[]'::jsonb`),
    visibility: varchar("visibility", { length: 32 }).$type<PackageVisibility>().notNull().default("private"),
    status: varchar("status", { length: 32 }).$type<PackageStatus>().notNull().default("active"),
    source: varchar("source", { length: 32 }).$type<PackageSource>().notNull().default("local"),
    trustLevel: varchar("trust_level", { length: 32 }).$type<PluginTrustLevel>().notNull().default("trusted"),
    compatibility: jsonb("compatibility").$type<JsonObject>().notNull().default(sql`'{}'::jsonb`),
    latestVersion: varchar("latest_version", { length: 100 }),
    sourcePath: text("source_path"),
    metadata: jsonb("metadata").$type<JsonObject>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    statusIdx: index("plugin_registry_status_idx").on(table.status, table.updatedAt),
    sourceIdx: index("plugin_registry_source_idx").on(table.source, table.updatedAt),
  }),
);

export type PluginRegistryEntry = typeof pluginRegistry.$inferSelect;
export type PluginRegistryEntryInsert = typeof pluginRegistry.$inferInsert;

export const pluginVersions = pgTable(
  "plugin_versions",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    pluginId: varchar("plugin_id", { length: 255 })
      .notNull()
      .references(() => pluginRegistry.id, { onDelete: "cascade" }),
    version: varchar("version", { length: 100 }).notNull(),
    manifest: jsonb("manifest").$type<JsonObject>().notNull().default(sql`'{}'::jsonb`),
    sourcePath: text("source_path"),
    manifestHash: varchar("manifest_hash", { length: 128 }),
    isActive: boolean("is_active").notNull().default(true),
    publishedByUserId: varchar("published_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    pluginVersionUniqueIdx: uniqueIndex("plugin_versions_plugin_version_uq").on(table.pluginId, table.version),
    pluginActiveIdx: index("plugin_versions_plugin_active_idx").on(table.pluginId, table.isActive, table.createdAt),
  }),
);

export type PluginVersion = typeof pluginVersions.$inferSelect;
export type PluginVersionInsert = typeof pluginVersions.$inferInsert;

export const skillRegistry = pgTable(
  "skill_registry",
  {
    id: varchar("id", { length: 255 }).primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    icon: text("icon"),
    category: varchar("category", { length: 100 }),
    author: jsonb("author").$type<JsonObject>().notNull().default(sql`'{}'::jsonb`),
    permissions: jsonb("permissions").$type<JsonObject[]>().notNull().default(sql`'[]'::jsonb`),
    visibility: varchar("visibility", { length: 32 }).$type<PackageVisibility>().notNull().default("private"),
    status: varchar("status", { length: 32 }).$type<PackageStatus>().notNull().default("active"),
    source: varchar("source", { length: 32 }).$type<PackageSource>().notNull().default("local"),
    compatibility: jsonb("compatibility").$type<JsonObject>().notNull().default(sql`'{}'::jsonb`),
    latestVersion: varchar("latest_version", { length: 100 }),
    sourcePath: text("source_path"),
    // Провенанс пользовательских скиллов (`source:'user'`). БЕЗ FK — loose coupling под будущий вынос в
    // Catalog-сервис (зеркало builds.sourceWorkspaceId/originUserId). NULL = системный/глобальный скилл.
    sourceWorkspaceId: varchar("source_workspace_id"),
    originUserId: varchar("origin_user_id"),
    metadata: jsonb("metadata").$type<JsonObject>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
      statusIdx: index("skill_registry_status_idx").on(table.status, table.updatedAt),
      sourceIdx: index("skill_registry_source_idx").on(table.source, table.updatedAt),
      sourceWorkspaceIdx: index("skill_registry_source_workspace_idx").on(table.sourceWorkspaceId),
  }),
);

export type SkillRegistryEntry = typeof skillRegistry.$inferSelect;
export type SkillRegistryEntryInsert = typeof skillRegistry.$inferInsert;

export const skillVersions = pgTable(
  "skill_versions",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    skillId: varchar("skill_id", { length: 255 })
      .notNull()
      .references(() => skillRegistry.id, { onDelete: "cascade" }),
    version: varchar("version", { length: 100 }).notNull(),
    manifest: jsonb("manifest").$type<JsonObject>().notNull().default(sql`'{}'::jsonb`),
    sourcePath: text("source_path"),
    manifestHash: varchar("manifest_hash", { length: 128 }),
    sourcePluginId: varchar("source_plugin_id", { length: 255 }).references(() => pluginRegistry.id, {
      onDelete: "set null",
    }),
    sourcePluginVersionId: uuid("source_plugin_version_id").references(() => pluginVersions.id, {
      onDelete: "set null",
    }),
    isActive: boolean("is_active").notNull().default(true),
    publishedByUserId: varchar("published_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    skillVersionUniqueIdx: uniqueIndex("skill_versions_skill_version_uq").on(table.skillId, table.version),
    skillActiveIdx: index("skill_versions_skill_active_idx").on(table.skillId, table.isActive, table.createdAt),
  }),
);

export type SkillVersion = typeof skillVersions.$inferSelect;
export type SkillVersionInsert = typeof skillVersions.$inferInsert;

export const connectionTypeRegistry = pgTable(
  "connection_type_registry",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    pluginId: varchar("plugin_id", { length: 255 })
      .notNull()
      .references(() => pluginRegistry.id, { onDelete: "cascade" }),
    pluginVersionId: uuid("plugin_version_id")
      .notNull()
      .references(() => pluginVersions.id, { onDelete: "cascade" }),
    key: varchar("key", { length: 255 }).notNull(),
    fullKey: varchar("full_key", { length: 511 }).notNull(),
    name: text("name").notNull(),
    description: text("description"),
    authSchema: jsonb("auth_schema").$type<JsonObject>().notNull().default(sql`'{}'::jsonb`),
    configSchema: jsonb("config_schema").$type<JsonObject>().notNull().default(sql`'{}'::jsonb`),
    secretSchema: jsonb("secret_schema").$type<JsonObject>().notNull().default(sql`'{}'::jsonb`),
    healthCheck: jsonb("health_check").$type<JsonObject>().notNull().default(sql`'{}'::jsonb`),
    scopeRules: jsonb("scope_rules").$type<JsonObject>().notNull().default(sql`'{}'::jsonb`),
    metadata: jsonb("metadata").$type<JsonObject>().notNull().default(sql`'{}'::jsonb`),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    fullKeyUniqueIdx: uniqueIndex("connection_type_registry_full_key_uq").on(table.fullKey),
    pluginIdx: index("connection_type_registry_plugin_idx").on(table.pluginId, table.isActive),
  }),
);

export type ConnectionTypeRegistryEntry = typeof connectionTypeRegistry.$inferSelect;
export type ConnectionTypeRegistryEntryInsert = typeof connectionTypeRegistry.$inferInsert;

export const capabilityRegistry = pgTable(
  "capability_registry",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    pluginId: varchar("plugin_id", { length: 255 })
      .notNull()
      .references(() => pluginRegistry.id, { onDelete: "cascade" }),
    pluginVersionId: uuid("plugin_version_id")
      .notNull()
      .references(() => pluginVersions.id, { onDelete: "cascade" }),
    key: varchar("key", { length: 255 }).notNull(),
    fullKey: varchar("full_key", { length: 511 }).notNull(),
    name: text("name").notNull(),
    description: text("description"),
    category: varchar("category", { length: 100 }),
    operationKeys: jsonb("operation_keys").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    metadata: jsonb("metadata").$type<JsonObject>().notNull().default(sql`'{}'::jsonb`),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    fullKeyUniqueIdx: uniqueIndex("capability_registry_full_key_uq").on(table.fullKey),
    pluginIdx: index("capability_registry_plugin_idx").on(table.pluginId, table.isActive),
  }),
);

export type CapabilityRegistryEntry = typeof capabilityRegistry.$inferSelect;
export type CapabilityRegistryEntryInsert = typeof capabilityRegistry.$inferInsert;

export const operationRegistry = pgTable(
  "operation_registry",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    pluginId: varchar("plugin_id", { length: 255 })
      .notNull()
      .references(() => pluginRegistry.id, { onDelete: "cascade" }),
    pluginVersionId: uuid("plugin_version_id")
      .notNull()
      .references(() => pluginVersions.id, { onDelete: "cascade" }),
    capabilityId: uuid("capability_id").references(() => capabilityRegistry.id, { onDelete: "set null" }),
    key: varchar("key", { length: 255 }).notNull(),
    fullKey: varchar("full_key", { length: 511 }).notNull(),
    name: text("name").notNull(),
    description: text("description"),
    operationType: varchar("operation_type", { length: 50 }).$type<OperationType>().notNull(),
    requiredConnectionTypeId: uuid("required_connection_type_id").references(() => connectionTypeRegistry.id, {
      onDelete: "set null",
    }),
    permissionLevel: varchar("permission_level", { length: 32 })
      .$type<OperationPermissionLevel>()
      .notNull()
      .default("read"),
    confirmationPolicy: varchar("confirmation_policy", { length: 32 })
      .$type<ConfirmationPolicy>()
      .notNull()
      .default("ask"),
    inputSchema: jsonb("input_schema").$type<JsonObject>().notNull().default(sql`'{}'::jsonb`),
    outputSchema: jsonb("output_schema").$type<JsonObject>().notNull().default(sql`'{}'::jsonb`),
    executorBinding: jsonb("executor_binding").$type<JsonObject>().notNull().default(sql`'{}'::jsonb`),
    tags: jsonb("tags").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    metadata: jsonb("metadata").$type<JsonObject>().notNull().default(sql`'{}'::jsonb`),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    fullKeyUniqueIdx: uniqueIndex("operation_registry_full_key_uq").on(table.fullKey),
    pluginIdx: index("operation_registry_plugin_idx").on(table.pluginId, table.isActive),
    connectionIdx: index("operation_registry_connection_idx").on(table.requiredConnectionTypeId, table.operationType),
  }),
);

export type OperationRegistryEntry = typeof operationRegistry.$inferSelect;
export type OperationRegistryEntryInsert = typeof operationRegistry.$inferInsert;

export const pluginEventRegistry = pgTable(
  "plugin_event_registry",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    pluginId: varchar("plugin_id", { length: 255 })
      .notNull()
      .references(() => pluginRegistry.id, { onDelete: "cascade" }),
    pluginVersionId: uuid("plugin_version_id")
      .notNull()
      .references(() => pluginVersions.id, { onDelete: "cascade" }),
    key: varchar("key", { length: 255 }).notNull(),
    fullKey: varchar("full_key", { length: 511 }).notNull(),
    name: text("name").notNull(),
    description: text("description"),
    source: varchar("source", { length: 32 }).$type<EventSource>().notNull(),
    eventName: varchar("event_name", { length: 255 }).notNull(),
    payloadSchema: jsonb("payload_schema").$type<JsonObject>().notNull().default(sql`'{}'::jsonb`),
    metadata: jsonb("metadata").$type<JsonObject>().notNull().default(sql`'{}'::jsonb`),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    fullKeyUniqueIdx: uniqueIndex("plugin_event_registry_full_key_uq").on(table.fullKey),
    pluginIdx: index("plugin_event_registry_plugin_idx").on(table.pluginId, table.isActive),
  }),
);

export type PluginEventRegistryEntry = typeof pluginEventRegistry.$inferSelect;
export type PluginEventRegistryEntryInsert = typeof pluginEventRegistry.$inferInsert;

export const installedPlugins = pgTable(
  "installed_plugins",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: varchar("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    pluginId: varchar("plugin_id", { length: 255 })
      .notNull()
      .references(() => pluginRegistry.id, { onDelete: "cascade" }),
    pluginVersionId: uuid("plugin_version_id").references(() => pluginVersions.id, { onDelete: "set null" }),
    status: varchar("status", { length: 32 }).$type<InstallStatus>().notNull().default("installed"),
    installedByUserId: varchar("installed_by_user_id").references(() => users.id, { onDelete: "set null" }),
    installedAt: timestamp("installed_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    workspacePluginUniqueIdx: uniqueIndex("installed_plugins_workspace_plugin_uq").on(table.workspaceId, table.pluginId),
    workspaceIdx: index("installed_plugins_workspace_idx").on(table.workspaceId, table.status, table.updatedAt),
  }),
);

export type InstalledPlugin = typeof installedPlugins.$inferSelect;
export type InstalledPluginInsert = typeof installedPlugins.$inferInsert;

export const installedSkills = pgTable(
  "installed_skills",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: varchar("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    skillId: varchar("skill_id", { length: 255 })
      .notNull()
      .references(() => skillRegistry.id, { onDelete: "cascade" }),
    skillVersionId: uuid("skill_version_id").references(() => skillVersions.id, { onDelete: "set null" }),
    sourcePluginId: varchar("source_plugin_id", { length: 255 }).references(() => pluginRegistry.id, {
      onDelete: "set null",
    }),
    status: varchar("status", { length: 32 }).$type<InstallStatus>().notNull().default("installed"),
    // Целостность пакета (gap-analysis 4.6, защита от rug-pull / tool-poisoning). `pinnedManifestHash` —
    // ЗАКРЕПЛЁННЫЙ при установке/одобрении хеш определения скилла (копия skill_versions.manifest_hash на
    // момент доверия). На каждой загрузке текущий хеш версии сверяется с пином: несовпадение = подмена
    // определения ПОСЛЕ доверия → `integrityStatus='quarantined'` (в снимок агента не попадает). `provenance`
    // — происхождение пакета (источник/URL/маркетплейс/издатель/состояние подписи) для аудита; кто/когда уже
    // в installedByUserId/installedAt, версия — в skillVersionId. См. docs/agent-package-integrity-security.md.
    pinnedManifestHash: varchar("pinned_manifest_hash", { length: 128 }),
    pinnedAt: timestamp("pinned_at", { withTimezone: true }),
    integrityStatus: varchar("integrity_status", { length: 32 })
      .$type<PackageIntegrityStatus>()
      .notNull()
      .default("active"),
    provenanceSource: varchar("provenance_source", { length: 64 }),
    provenance: jsonb("provenance").$type<JsonObject>().notNull().default(sql`'{}'::jsonb`),
    installedByUserId: varchar("installed_by_user_id").references(() => users.id, { onDelete: "set null" }),
    installedAt: timestamp("installed_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    workspaceSkillUniqueIdx: uniqueIndex("installed_skills_workspace_skill_uq").on(table.workspaceId, table.skillId),
    workspaceIdx: index("installed_skills_workspace_idx").on(table.workspaceId, table.status, table.updatedAt),
  }),
);

export type InstalledSkill = typeof installedSkills.$inferSelect;
export type InstalledSkillInsert = typeof installedSkills.$inferInsert;

/**
 * Build (Сборка) — публикуемая поставка ассистента. Плоскость каталога:
 * БЕЗ workspaceId (глобальный реестр на инстансе), отделена от tenant-плоскости.
 * Зеркало паттерна skillRegistry / skillVersions / installedSkills.
 */
export const builds = pgTable(
  "builds",
  {
    id: varchar("id", { length: 255 }).primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    icon: text("icon"),
    category: varchar("category", { length: 100 }),
    author: jsonb("author").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    // Провенанс источника. БЕЗ FK — loose coupling под будущий вынос в Catalog-сервис.
    sourceWorkspaceId: varchar("source_workspace_id"),
    originUserId: varchar("origin_user_id"),
    visibility: varchar("visibility", { length: 32 }).$type<BuildVisibility>().notNull().default("private"),
    status: varchar("status", { length: 32 }).$type<BuildStatus>().notNull().default("active"),
    latestVersion: varchar("latest_version", { length: 100 }),
    installCount: integer("install_count").notNull().default(0),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    statusIdx: index("builds_status_idx").on(table.status, table.updatedAt),
    visibilityIdx: index("builds_visibility_idx").on(table.visibility, table.updatedAt),
  }),
);

export type Build = typeof builds.$inferSelect;
export type BuildInsert = typeof builds.$inferInsert;

export const buildVersions = pgTable(
  "build_versions",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    buildId: varchar("build_id", { length: 255 })
      .notNull()
      .references(() => builds.id, { onDelete: "cascade" }),
    version: varchar("version", { length: 100 }).notNull(),
    manifest: jsonb("manifest").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    manifestHash: varchar("manifest_hash", { length: 128 }),
    changelog: text("changelog"),
    isActive: boolean("is_active").notNull().default(true),
    publishedByUserId: varchar("published_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    buildVersionUniqueIdx: uniqueIndex("build_versions_build_version_uq").on(table.buildId, table.version),
    buildActiveIdx: index("build_versions_build_active_idx").on(table.buildId, table.isActive, table.createdAt),
  }),
);

export type BuildVersion = typeof buildVersions.$inferSelect;
export type BuildVersionInsert = typeof buildVersions.$inferInsert;

/** Установка Build в workspace (tenant-плоскость). Зеркало installedSkills. */
export const installedBuilds = pgTable(
  "installed_builds",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: varchar("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    buildId: varchar("build_id", { length: 255 })
      .notNull()
      .references(() => builds.id, { onDelete: "cascade" }),
    buildVersionId: uuid("build_version_id").references(() => buildVersions.id, { onDelete: "set null" }),
    materializedAssistantId: varchar("materialized_assistant_id").references(() => assistants.id, {
      onDelete: "set null",
    }),
    mode: varchar("mode", { length: 32 }).$type<InstallMode>().notNull().default("reference"),
    pinnedVersion: boolean("pinned_version").notNull().default(false),
    status: varchar("status", { length: 32 }).$type<BuildInstallStatus>().notNull().default("installed"),
    // Доступная для обновления версия (denорм для бейджа); null — обновлений нет.
    availableVersionId: uuid("available_version_id").references(() => buildVersions.id, { onDelete: "set null" }),
    // Политика применения обновлений: manual (дефолт) | auto_patch | auto_minor | pinned.
    updatePolicy: varchar("update_policy", { length: 32 }).$type<BuildUpdatePolicy>().notNull().default("manual"),
    lastUpdateCheckAt: timestamp("last_update_check_at", { withTimezone: true }),
    resolutionReport: jsonb("resolution_report").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    installedByUserId: varchar("installed_by_user_id").references(() => users.id, { onDelete: "set null" }),
    installedAt: timestamp("installed_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    workspaceBuildUniqueIdx: uniqueIndex("installed_builds_workspace_build_uq").on(table.workspaceId, table.buildId),
    workspaceIdx: index("installed_builds_workspace_idx").on(table.workspaceId, table.status, table.updatedAt),
  }),
);

export type InstalledBuild = typeof installedBuilds.$inferSelect;
export type InstalledBuildInsert = typeof installedBuilds.$inferInsert;

// История обновлений установленной сборки: аудит и основа для отката.
export const installedBuildUpdateEvents = pgTable(
  "installed_build_update_events",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    installedBuildId: uuid("installed_build_id")
      .notNull()
      .references(() => installedBuilds.id, { onDelete: "cascade" }),
    workspaceId: varchar("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    buildId: varchar("build_id", { length: 255 }).notNull(),
    fromVersionId: uuid("from_version_id"),
    toVersionId: uuid("to_version_id"),
    event: varchar("event", { length: 32 }).$type<BuildUpdateEvent>().notNull(),
    resolutionReport: jsonb("resolution_report").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    actorUserId: varchar("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    installedBuildIdx: index("installed_build_update_events_install_idx").on(
      table.installedBuildId,
      table.createdAt,
    ),
    workspaceIdx: index("installed_build_update_events_workspace_idx").on(table.workspaceId, table.createdAt),
  }),
);

export type InstalledBuildUpdateEvent = typeof installedBuildUpdateEvents.$inferSelect;
export type InstalledBuildUpdateEventInsert = typeof installedBuildUpdateEvents.$inferInsert;

export const workspaceConnections = pgTable(
  "workspace_connections",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: varchar("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    connectionTypeId: uuid("connection_type_id")
      .notNull()
      .references(() => connectionTypeRegistry.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: varchar("slug", { length: 255 }).notNull(),
    config: jsonb("config").$type<JsonObject>().notNull().default(sql`'{}'::jsonb`),
    allowedScopes: jsonb("allowed_scopes").$type<JsonObject>().notNull().default(sql`'{}'::jsonb`),
    status: varchar("status", { length: 32 }).$type<ConnectionStatus>().notNull().default("draft"),
    health: jsonb("health").$type<JsonObject>().notNull().default(sql`'{}'::jsonb`),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    createdByUserId: varchar("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    updatedByUserId: varchar("updated_by_user_id").references(() => users.id, { onDelete: "set null" }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    workspaceSlugUniqueIdx: uniqueIndex("workspace_connections_workspace_slug_uq").on(table.workspaceId, table.slug),
    workspaceIdx: index("workspace_connections_workspace_idx").on(table.workspaceId, table.isActive, table.updatedAt),
    typeIdx: index("workspace_connections_type_idx").on(table.connectionTypeId, table.status),
  }),
);

export type WorkspaceConnection = typeof workspaceConnections.$inferSelect;
export type WorkspaceConnectionInsert = typeof workspaceConnections.$inferInsert;

export const workspaceConnectionSecrets = pgTable(
  "workspace_connection_secrets",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => workspaceConnections.id, { onDelete: "cascade" }),
    encryptedSecrets: jsonb("encrypted_secrets").$type<JsonObject>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    connectionUniqueIdx: uniqueIndex("workspace_connection_secrets_connection_uq").on(table.connectionId),
  }),
);

export type WorkspaceConnectionSecret = typeof workspaceConnectionSecrets.$inferSelect;
export type WorkspaceConnectionSecretInsert = typeof workspaceConnectionSecrets.$inferInsert;

export const externalTriggerBindings = pgTable(
  "external_trigger_bindings",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: varchar("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => workspaceConnections.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 64 }).$type<ExternalTriggerProvider>().notNull(),
    eventKey: varchar("event_key", { length: 64 }).$type<ExternalTriggerEventKey>().notNull().default("message"),
    assistantId: varchar("assistant_id")
      .notNull()
      .references(() => assistants.id, { onDelete: "cascade" }),
    workflowDefinitionId: uuid("workflow_definition_id")
      .notNull()
      .references(() => workflowDefinitions.id, { onDelete: "cascade" }),
    actorUserId: varchar("actor_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    filters: jsonb("filters").$type<ExternalTriggerFilter>().notNull().default(sql`'{}'::jsonb`),
    authPolicy: jsonb("auth_policy").$type<ExternalTriggerAuthPolicy>().notNull().default(sql`'{"mode":"provider_managed"}'::jsonb`),
    deliveryPolicy: jsonb("delivery_policy").$type<ExternalTriggerDeliveryPolicy>().notNull().default(sql`'{}'::jsonb`),
    isActive: boolean("is_active").notNull().default(true),
    createdByUserId: varchar("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    updatedByUserId: varchar("updated_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    workspaceConnectionIdx: index("external_trigger_bindings_workspace_connection_idx").on(
      table.workspaceId,
      table.connectionId,
      table.isActive,
      table.updatedAt,
    ),
    assistantConnectionTitleUniqueIdx: uniqueIndex("external_trigger_bindings_assistant_connection_title_uq").on(
      table.connectionId,
      table.assistantId,
      table.title,
    ),
  }),
);

export type ExternalTriggerBindingRecord = typeof externalTriggerBindings.$inferSelect;
export type ExternalTriggerBindingRecordInsert = typeof externalTriggerBindings.$inferInsert;

export const externalTriggerSessions = pgTable(
  "external_trigger_sessions",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    bindingId: uuid("binding_id")
      .notNull()
      .references(() => externalTriggerBindings.id, { onDelete: "cascade" }),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => workspaceConnections.id, { onDelete: "cascade" }),
    workspaceId: varchar("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    externalConversationKey: varchar("external_conversation_key", { length: 255 }).notNull(),
    externalUserKey: varchar("external_user_key", { length: 255 }),
    internalChatId: varchar("internal_chat_id")
      .notNull()
      .references(() => chatSessions.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    bindingConversationUniqueIdx: uniqueIndex("external_trigger_sessions_binding_conversation_uq").on(
      table.bindingId,
      table.externalConversationKey,
    ),
    connectionConversationIdx: index("external_trigger_sessions_connection_conversation_idx").on(
      table.connectionId,
      table.externalConversationKey,
      table.updatedAt,
    ),
  }),
);

export type ExternalTriggerSessionRecord = typeof externalTriggerSessions.$inferSelect;
export type ExternalTriggerSessionRecordInsert = typeof externalTriggerSessions.$inferInsert;

export const externalTriggerReceipts = pgTable(
  "external_trigger_receipts",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: varchar("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => workspaceConnections.id, { onDelete: "cascade" }),
    bindingId: uuid("binding_id").references(() => externalTriggerBindings.id, { onDelete: "set null" }),
    provider: varchar("provider", { length: 64 }).$type<ExternalTriggerProvider>().notNull(),
    providerEventId: varchar("provider_event_id", { length: 255 }).notNull(),
    externalConversationKey: varchar("external_conversation_key", { length: 255 }),
    status: varchar("status", { length: 64 }).$type<ExternalTriggerReceiptStatus>().notNull().default("received"),
    workflowRunId: uuid("workflow_run_id").references(() => assistantWorkflowRuns.id, { onDelete: "set null" }),
    userMessageId: varchar("user_message_id").references(() => chatMessages.id, { onDelete: "set null" }),
    errorCode: varchar("error_code", { length: 128 }),
    errorMessage: text("error_message"),
    rawEventMeta: jsonb("raw_event_meta").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    createdAtIdx: index("external_trigger_receipts_created_at_idx").on(table.createdAt),
    unmatchedEventUniqueIdx: uniqueIndex("external_trigger_receipts_connection_provider_event_null_binding_uq")
      .on(table.connectionId, table.providerEventId)
      .where(sql`binding_id IS NULL`),
    matchedEventBindingUniqueIdx: uniqueIndex("external_trigger_receipts_connection_provider_event_binding_uq")
      .on(table.connectionId, table.providerEventId, table.bindingId)
      .where(sql`binding_id IS NOT NULL`),
    bindingStatusIdx: index("external_trigger_receipts_binding_status_idx").on(
      table.bindingId,
      table.status,
      table.updatedAt,
    ),
    connectionStatusIdx: index("external_trigger_receipts_connection_status_idx").on(
      table.connectionId,
      table.status,
      table.updatedAt,
    ),
    // 0260: FK-индекс под каскад удаления пространства (workspace_id).
    workspaceIdx: index("external_trigger_receipts_workspace_id_idx").on(table.workspaceId),
  }),
);

export type ExternalTriggerReceiptRecord = typeof externalTriggerReceipts.$inferSelect;
export type ExternalTriggerReceiptRecordInsert = typeof externalTriggerReceipts.$inferInsert;

export const externalTriggerDeliveries = pgTable(
  "external_trigger_deliveries",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: varchar("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    bindingId: uuid("binding_id")
      .notNull()
      .references(() => externalTriggerBindings.id, { onDelete: "cascade" }),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => workspaceConnections.id, { onDelete: "cascade" }),
    workflowRunId: uuid("workflow_run_id")
      .notNull()
      .references(() => assistantWorkflowRuns.id, { onDelete: "cascade" }),
    internalMessageId: varchar("internal_message_id")
      .notNull()
      .references(() => chatMessages.id, { onDelete: "cascade" }),
    providerMessageId: varchar("provider_message_id", { length: 255 }),
    status: varchar("status", { length: 64 }).$type<ExternalTriggerDeliveryStatus>().notNull().default("pending"),
    deliveryIndex: integer("delivery_index").notNull().default(1),
    errorCode: varchar("error_code", { length: 128 }),
    errorMessage: text("error_message"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    createdAtIdx: index("external_trigger_deliveries_created_at_idx").on(table.createdAt),
    bindingRunIdx: index("external_trigger_deliveries_binding_run_idx").on(
      table.bindingId,
      table.workflowRunId,
      table.createdAt,
    ),
    internalMessageUniqueIdx: uniqueIndex("external_trigger_deliveries_internal_message_uq").on(
      table.internalMessageId,
      table.deliveryIndex,
    ),
    connectionStatusIdx: index("external_trigger_deliveries_connection_status_idx").on(
      table.connectionId,
      table.status,
      table.updatedAt,
    ),
    // 0260: FK-индексы под каскад удаления пространства / workflow-рана (workspace_id / workflow_run_id).
    workspaceIdx: index("external_trigger_deliveries_workspace_id_idx").on(table.workspaceId),
    workflowRunIdx: index("external_trigger_deliveries_workflow_run_id_idx").on(table.workflowRunId),
  }),
);

export type ExternalTriggerDeliveryRecord = typeof externalTriggerDeliveries.$inferSelect;
export type ExternalTriggerDeliveryRecordInsert = typeof externalTriggerDeliveries.$inferInsert;

// ── Webhook-триггеры workflow (n8n-подобные): узел webhook_trigger владеет уникальным
//    URL (slug). Запуск идёт через workflow-ассистента (RAG из его KB) и авто-чат,
//    поэтому assistant_id/chat_id в run-таблице остаются NOT NULL (headless не вводим).
export const workflowWebhookTriggerAuthModes = ["none", "bearer_personal_token"] as const;
export type WorkflowWebhookTriggerAuthMode = (typeof workflowWebhookTriggerAuthModes)[number];

// Режим ответа вебхука: async — сразу 202 (результат уходит узлом http_request);
// sync — соединение держится до завершения рана и результат возвращается в том же запросе.
export const workflowWebhookResponseModes = ["async", "sync"] as const;
export type WorkflowWebhookResponseMode = (typeof workflowWebhookResponseModes)[number];

export const workflowTriggerEventStatuses = ["received", "queued", "ignored", "failed"] as const;
export type WorkflowTriggerEventStatus = (typeof workflowTriggerEventStatuses)[number];

export const workflowWebhookTriggers = pgTable(
  "workflow_webhook_triggers",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: varchar("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    definitionId: uuid("definition_id")
      .notNull()
      .references(() => workflowDefinitions.id, { onDelete: "cascade" }),
    nodeId: varchar("node_id", { length: 255 }).notNull(),
    // Nullable: триггер регистрируется при публикации сценария (ассистент может быть ещё не
    // привязан), а исполняющий ассистент резолвится в рантайме по 1:1-привязке definitionId.
    assistantId: varchar("assistant_id").references(() => assistants.id, { onDelete: "cascade" }),
    actorUserId: varchar("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    slug: varchar("slug", { length: 64 }).notNull(),
    authMode: varchar("auth_mode", { length: 32 })
      .$type<WorkflowWebhookTriggerAuthMode>()
      .notNull()
      .default("bearer_personal_token"),
    responseMode: varchar("response_mode", { length: 16 })
      .$type<WorkflowWebhookResponseMode>()
      .notNull()
      .default("async"),
    isActive: boolean("is_active").notNull().default(true),
    createdByUserId: varchar("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    updatedByUserId: varchar("updated_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    slugUniqueIdx: uniqueIndex("workflow_webhook_triggers_slug_uq").on(table.slug),
    definitionNodeUniqueIdx: uniqueIndex("workflow_webhook_triggers_definition_node_uq").on(
      table.definitionId,
      table.nodeId,
    ),
    workspaceIdx: index("workflow_webhook_triggers_workspace_idx").on(table.workspaceId),
  }),
);

export type WorkflowWebhookTriggerRecord = typeof workflowWebhookTriggers.$inferSelect;
export type WorkflowWebhookTriggerRecordInsert = typeof workflowWebhookTriggers.$inferInsert;

export const workflowTriggerEvents = pgTable(
  "workflow_trigger_events",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: varchar("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    triggerId: uuid("trigger_id")
      .notNull()
      .references(() => workflowWebhookTriggers.id, { onDelete: "cascade" }),
    eventId: varchar("event_id", { length: 255 }).notNull(),
    status: varchar("status", { length: 32 }).$type<WorkflowTriggerEventStatus>().notNull(),
    workflowRunId: uuid("workflow_run_id").references(() => assistantWorkflowRuns.id, { onDelete: "set null" }),
    chatId: varchar("chat_id").references(() => chatSessions.id, { onDelete: "set null" }),
    errorCode: varchar("error_code", { length: 128 }),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    triggerEventUniqueIdx: uniqueIndex("workflow_trigger_events_trigger_event_uq").on(
      table.triggerId,
      table.eventId,
    ),
    triggerCreatedIdx: index("workflow_trigger_events_trigger_created_idx").on(table.triggerId, table.createdAt),
  }),
);

export type WorkflowTriggerEventRecord = typeof workflowTriggerEvents.$inferSelect;
export type WorkflowTriggerEventRecordInsert = typeof workflowTriggerEvents.$inferInsert;

export const enabledCapabilities = pgTable(
  "enabled_capabilities",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: varchar("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    installedPluginId: uuid("installed_plugin_id")
      .notNull()
      .references(() => installedPlugins.id, { onDelete: "cascade" }),
    capabilityId: uuid("capability_id")
      .notNull()
      .references(() => capabilityRegistry.id, { onDelete: "cascade" }),
    isEnabled: boolean("is_enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    workspaceCapabilityUniqueIdx: uniqueIndex("enabled_capabilities_workspace_capability_uq").on(
      table.workspaceId,
      table.capabilityId,
    ),
    workspaceIdx: index("enabled_capabilities_workspace_idx").on(table.workspaceId, table.isEnabled, table.updatedAt),
  }),
);

export type EnabledCapability = typeof enabledCapabilities.$inferSelect;
export type EnabledCapabilityInsert = typeof enabledCapabilities.$inferInsert;

export const featureAccessGroups = pgTable(
  "feature_access_groups",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    createdByUserId: varchar("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    updatedByUserId: varchar("updated_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    nameUniqueIdx: uniqueIndex("feature_access_groups_name_uq").on(table.name),
    updatedAtIdx: index("feature_access_groups_updated_at_idx").on(table.updatedAt),
  }),
);

export const featureAccessGroupMembers = pgTable(
  "feature_access_group_members",
  {
    groupId: uuid("group_id")
      .notNull()
      .references(() => featureAccessGroups.id, { onDelete: "cascade" }),
    workspaceId: varchar("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    addedByUserId: varchar("added_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.groupId, table.workspaceId] }),
    workspaceIdx: index("feature_access_group_members_workspace_idx").on(table.workspaceId),
  }),
);

export const featureAccessRules = pgTable(
  "feature_access_rules",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    featureKey: varchar("feature_key", { length: 128 }).$type<PlatformFeatureKey>().notNull(),
    targetKind: varchar("target_kind", { length: 32 }).$type<FeatureAccessTargetKind>().notNull(),
    targetId: varchar("target_id", { length: 255 }).notNull(),
    value: jsonb("value").$type<PlatformFeatureAccessRuleValue>().notNull().default(sql`'false'::jsonb`),
    note: text("note").notNull().default(""),
    isActive: boolean("is_active").notNull().default(true),
    createdByUserId: varchar("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    updatedByUserId: varchar("updated_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    featureTargetUniqueIdx: uniqueIndex("feature_access_rules_feature_target_uq").on(
      table.featureKey,
      table.targetKind,
      table.targetId,
    ),
    featureActiveIdx: index("feature_access_rules_feature_active_idx").on(
      table.featureKey,
      table.isActive,
      table.updatedAt,
    ),
    targetIdx: index("feature_access_rules_target_idx").on(table.targetKind, table.targetId),
  }),
);

export const featureAccessAuditLog = pgTable(
  "feature_access_audit_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    actorUserId: varchar("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    action: varchar("action", { length: 64 }).notNull(),
    targetType: varchar("target_type", { length: 64 }).notNull(),
    targetId: varchar("target_id", { length: 255 }),
    featureKey: varchar("feature_key", { length: 128 }).$type<PlatformFeatureKey>(),
    groupId: uuid("group_id").references(() => featureAccessGroups.id, { onDelete: "set null" }),
    workspaceId: varchar("workspace_id").references(() => workspaces.id, { onDelete: "set null" }),
    details: jsonb("details").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    createdAtIdx: index("feature_access_audit_log_created_at_idx").on(table.createdAt),
    featureCreatedAtIdx: index("feature_access_audit_feature_created_at_idx").on(table.featureKey, table.createdAt),
    groupCreatedAtIdx: index("feature_access_audit_group_created_at_idx").on(table.groupId, table.createdAt),
    workspaceCreatedAtIdx: index("feature_access_audit_workspace_created_at_idx").on(
      table.workspaceId,
      table.createdAt,
    ),
  }),
);

export type FeatureAccessGroup = typeof featureAccessGroups.$inferSelect;
export type FeatureAccessGroupInsert = typeof featureAccessGroups.$inferInsert;
export type FeatureAccessGroupMember = typeof featureAccessGroupMembers.$inferSelect;
export type FeatureAccessGroupMemberInsert = typeof featureAccessGroupMembers.$inferInsert;
export type FeatureAccessRule = typeof featureAccessRules.$inferSelect;
export type FeatureAccessRuleInsert = typeof featureAccessRules.$inferInsert;
export type FeatureAccessAuditLog = typeof featureAccessAuditLog.$inferSelect;
export type FeatureAccessAuditLogInsert = typeof featureAccessAuditLog.$inferInsert;

export const packageInstallLogs = pgTable(
  "package_install_logs",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: varchar("workspace_id").references(() => workspaces.id, { onDelete: "set null" }),
    packageKind: varchar("package_kind", { length: 32 }).notNull(),
    packageId: varchar("package_id", { length: 255 }).notNull(),
    packageVersion: varchar("package_version", { length: 100 }),
    action: varchar("action", { length: 32 }).$type<InstallLogAction>().notNull(),
    status: varchar("status", { length: 32 }).$type<InstallLogStatus>().notNull(),
    message: text("message"),
    details: jsonb("details").$type<JsonObject>().notNull().default(sql`'{}'::jsonb`),
    actorId: varchar("actor_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    workspaceIdx: index("package_install_logs_workspace_idx").on(table.workspaceId, table.createdAt),
    packageIdx: index("package_install_logs_package_idx").on(table.packageKind, table.packageId, table.createdAt),
  }),
);

export type PackageInstallLog = typeof packageInstallLogs.$inferSelect;
export type PackageInstallLogInsert = typeof packageInstallLogs.$inferInsert;

export const mcpServerRegistryEntries = pgTable(
  "mcp_server_registry_entries",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    key: varchar("key", { length: 255 }).notNull(),
    name: text("name").notNull(),
    description: text("description"),
    trustTier: varchar("trust_tier", { length: 32 }).$type<McpServerTrustTier>().notNull().default("vendor_verified"),
    status: varchar("status", { length: 32 }).$type<McpServerRegistryStatus>().notNull().default("active"),
    transport: varchar("transport", { length: 32 }).$type<McpTransport>().notNull().default("streamable_http"),
    protocolVersion: varchar("protocol_version", { length: 64 }).notNull().default("2025-11-25"),
    latestVersion: varchar("latest_version", { length: 100 }),
    defaultBaseUrl: text("default_base_url"),
    sourcePluginId: varchar("source_plugin_id", { length: 255 }).references(() => pluginRegistry.id, {
      onDelete: "set null",
    }),
    sourcePath: text("source_path"),
    configSchema: jsonb("config_schema").$type<JsonObject>().notNull().default(sql`'{}'::jsonb`),
    secretSchema: jsonb("secret_schema").$type<JsonObject>().notNull().default(sql`'{}'::jsonb`),
    headerTemplates: jsonb("header_templates").$type<Record<string, string>>().notNull().default(sql`'{}'::jsonb`),
    toolDefaults: jsonb("tool_defaults").$type<JsonObject>().notNull().default(sql`'{}'::jsonb`),
    metadata: jsonb("metadata").$type<JsonObject>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    keyUniqueIdx: uniqueIndex("mcp_server_registry_entries_key_uq").on(table.key),
    statusIdx: index("mcp_server_registry_entries_status_idx").on(table.status, table.updatedAt),
  }),
);

export type McpServerRegistryEntry = typeof mcpServerRegistryEntries.$inferSelect;
export type McpServerRegistryEntryInsert = typeof mcpServerRegistryEntries.$inferInsert;

export const mcpServerVersions = pgTable(
  "mcp_server_versions",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    serverId: uuid("server_id")
      .notNull()
      .references(() => mcpServerRegistryEntries.id, { onDelete: "cascade" }),
    version: varchar("version", { length: 100 }).notNull(),
    protocolVersion: varchar("protocol_version", { length: 64 }).notNull().default("2025-11-25"),
    manifest: jsonb("manifest").$type<JsonObject>().notNull().default(sql`'{}'::jsonb`),
    manifestHash: varchar("manifest_hash", { length: 128 }),
    sourcePath: text("source_path"),
    publishedByUserId: varchar("published_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    serverVersionUniqueIdx: uniqueIndex("mcp_server_versions_server_version_uq").on(table.serverId, table.version),
    serverIdx: index("mcp_server_versions_server_idx").on(table.serverId, table.createdAt),
  }),
);

export type McpServerVersion = typeof mcpServerVersions.$inferSelect;
export type McpServerVersionInsert = typeof mcpServerVersions.$inferInsert;

export const workspaceMcpInstallations = pgTable(
  "workspace_mcp_installations",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: varchar("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    serverId: uuid("server_id")
      .notNull()
      .references(() => mcpServerRegistryEntries.id, { onDelete: "cascade" }),
    versionId: uuid("version_id")
      .notNull()
      .references(() => mcpServerVersions.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 32 }).$type<McpInstallationStatus>().notNull().default("draft"),
    transport: varchar("transport", { length: 32 }).$type<McpTransport>().notNull().default("streamable_http"),
    baseUrl: text("base_url").notNull(),
    config: jsonb("config").$type<JsonObject>().notNull().default(sql`'{}'::jsonb`),
    policyOverrides: jsonb("policy_overrides").$type<JsonObject>().notNull().default(sql`'{}'::jsonb`),
    health: jsonb("health").$type<JsonObject>().notNull().default(sql`'{}'::jsonb`),
    discoveryFingerprint: varchar("discovery_fingerprint", { length: 128 }),
    // Провенанс MCP-подключения (gap-analysis 4.6): снимок происхождения на момент создания
    // (serverKey/baseUrl/source/trustTier/installedBy) для аудита. Кто/когда — в createdByUserId/createdAt,
    // версия — в versionId. См. docs/agent-package-integrity-security.md.
    provenance: jsonb("provenance").$type<JsonObject>().notNull().default(sql`'{}'::jsonb`),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    lastDiscoveredAt: timestamp("last_discovered_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdByUserId: varchar("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    updatedByUserId: varchar("updated_by_user_id").references(() => users.id, { onDelete: "set null" }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    workspaceServerUniqueIdx: uniqueIndex("workspace_mcp_installations_workspace_server_uq").on(
      table.workspaceId,
      table.serverId,
    ),
    workspaceStatusIdx: index("workspace_mcp_installations_workspace_status_idx").on(
      table.workspaceId,
      table.status,
      table.updatedAt,
    ),
  }),
);

export type WorkspaceMcpInstallation = typeof workspaceMcpInstallations.$inferSelect;
export type WorkspaceMcpInstallationInsert = typeof workspaceMcpInstallations.$inferInsert;

export const workspaceMcpInstallationSecrets = pgTable(
  "workspace_mcp_installation_secrets",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    installationId: uuid("installation_id")
      .notNull()
      .references(() => workspaceMcpInstallations.id, { onDelete: "cascade" }),
    encryptedSecrets: jsonb("encrypted_secrets").$type<JsonObject>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    installationUniqueIdx: uniqueIndex("workspace_mcp_installation_secrets_installation_uq").on(table.installationId),
  }),
);

export type WorkspaceMcpInstallationSecret = typeof workspaceMcpInstallationSecrets.$inferSelect;
export type WorkspaceMcpInstallationSecretInsert = typeof workspaceMcpInstallationSecrets.$inferInsert;

export const workspaceMcpDiscoveredTools = pgTable(
  "workspace_mcp_discovered_tools",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: varchar("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    installationId: uuid("installation_id")
      .notNull()
      .references(() => workspaceMcpInstallations.id, { onDelete: "cascade" }),
    serverId: uuid("server_id")
      .notNull()
      .references(() => mcpServerRegistryEntries.id, { onDelete: "cascade" }),
    versionId: uuid("version_id")
      .notNull()
      .references(() => mcpServerVersions.id, { onDelete: "cascade" }),
    toolName: varchar("tool_name", { length: 255 }).notNull(),
    displayName: text("display_name").notNull(),
    description: text("description"),
    inputSchema: jsonb("input_schema").$type<JsonObject>().notNull().default(sql`'{}'::jsonb`),
    rawTool: jsonb("raw_tool").$type<JsonObject>().notNull().default(sql`'{}'::jsonb`),
    permissionLevel: varchar("permission_level", { length: 32 })
      .$type<McpToolPermissionLevel>()
      .notNull()
      .default("read"),
    confirmationPolicy: varchar("confirmation_policy", { length: 32 })
      .$type<ConfirmationPolicy>()
      .notNull()
      .default("ask"),
    enabled: boolean("enabled").notNull().default(true),
    exposedToAgent: boolean("exposed_to_agent").notNull().default(true),
    healthStatus: varchar("health_status", { length: 32 }).$type<McpToolHealthStatus>().notNull().default("healthy"),
    tags: jsonb("tags").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    discoveryFingerprint: varchar("discovery_fingerprint", { length: 128 }),
    // Целостность определения MCP-tool'а (gap-analysis 4.6, защита от rug-pull / tool-poisoning).
    // `pinnedDefinitionHash` ЗАКРЕПЛЯЕТСЯ при первом обнаружении (trust-on-first-use) и покрывает ВСЁ, что
    // видит модель: toolName + description + inputSchema (заметь: discoveryFingerprint description НЕ
    // покрывает, а именно описание — главный вектор tool-poisoning). При повторном обнаружении определение
    // перезаписывается, а пин — НЕТ; на загрузке текущий хеш сверяется с пином: несовпадение = rug-pull →
    // `integrityStatus='quarantined'` (агенту не отдаётся). Повторное одобрение (updateWorkspaceMcpToolPolicy)
    // перезакрепляет пин. См. docs/agent-package-integrity-security.md.
    pinnedDefinitionHash: varchar("pinned_definition_hash", { length: 128 }),
    pinnedAt: timestamp("pinned_at", { withTimezone: true }),
    integrityStatus: varchar("integrity_status", { length: 32 })
      .$type<PackageIntegrityStatus>()
      .notNull()
      .default("active"),
    discoveredAt: timestamp("discovered_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    installationToolUniqueIdx: uniqueIndex("workspace_mcp_discovered_tools_installation_tool_uq").on(
      table.installationId,
      table.toolName,
    ),
    workspaceAgentIdx: index("workspace_mcp_discovered_tools_workspace_agent_idx").on(
      table.workspaceId,
      table.enabled,
      table.exposedToAgent,
      table.healthStatus,
      table.updatedAt,
    ),
  }),
);

export type WorkspaceMcpDiscoveredTool = typeof workspaceMcpDiscoveredTools.$inferSelect;
export type WorkspaceMcpDiscoveredToolInsert = typeof workspaceMcpDiscoveredTools.$inferInsert;

export const mcpExecutionLogs = pgTable(
  "mcp_execution_logs",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: varchar("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    installationId: uuid("installation_id").references(() => workspaceMcpInstallations.id, {
      onDelete: "set null",
    }),
    toolId: uuid("tool_id").references(() => workspaceMcpDiscoveredTools.id, { onDelete: "set null" }),
    runId: uuid("run_id"),
    chatId: varchar("chat_id", { length: 255 }),
    stepId: varchar("step_id", { length: 255 }),
    nodeId: varchar("node_id", { length: 255 }),
    requestPayloadHash: varchar("request_payload_hash", { length: 128 }),
    approvalState: varchar("approval_state", { length: 64 }).notNull().default("not_required"),
    status: varchar("status", { length: 64 }).notNull().default("success"),
    latencyMs: integer("latency_ms"),
    errorCode: varchar("error_code", { length: 255 }),
    requestPreview: jsonb("request_preview").$type<JsonObject>().notNull().default(sql`'{}'::jsonb`),
    resultPreview: jsonb("result_preview").$type<JsonObject>().notNull().default(sql`'{}'::jsonb`),
    metadata: jsonb("metadata").$type<JsonObject>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    createdAtIdx: index("mcp_execution_logs_created_at_idx").on(table.createdAt),
    workspaceCreatedIdx: index("mcp_execution_logs_workspace_created_idx").on(table.workspaceId, table.createdAt),
    toolCreatedIdx: index("mcp_execution_logs_tool_created_idx").on(table.toolId, table.createdAt),
    runCreatedIdx: index("mcp_execution_logs_run_created_idx").on(table.runId, table.createdAt),
  }),
);

export type McpExecutionLog = typeof mcpExecutionLogs.$inferSelect;
export type McpExecutionLogInsert = typeof mcpExecutionLogs.$inferInsert;

export const packageDrafts = pgTable(
  "package_drafts",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    kind: varchar("kind", { length: 32 }).$type<"plugin" | "skill">().notNull(),
    status: varchar("status", { length: 32 }).$type<PackageDraftStatus>().notNull().default("draft"),
    title: text("title").notNull(),
    prompt: text("prompt").notNull().default(""),
    selectedModelKey: text("selected_model_key").notNull(),
    selectedProviderId: varchar("selected_provider_id").references(() => llmProviders.id, { onDelete: "set null" }),
    latestVersionNumber: integer("latest_version_number").notNull().default(1),
    manifestDraft: jsonb("manifest_draft").$type<JsonObject>().notNull().default(sql`'{}'::jsonb`),
    publishedPackageId: varchar("published_package_id", { length: 255 }),
    publishedPackageVersion: varchar("published_package_version", { length: 100 }),
    approvedByUserId: varchar("approved_by_user_id").references(() => users.id, { onDelete: "set null" }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdByUserId: varchar("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    updatedByUserId: varchar("updated_by_user_id").references(() => users.id, { onDelete: "set null" }),
    metadata: jsonb("metadata").$type<JsonObject>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    kindIdx: index("package_drafts_kind_idx").on(table.kind, table.status, table.updatedAt),
    statusIdx: index("package_drafts_status_idx").on(table.status, table.updatedAt),
  }),
);

export type PackageDraft = typeof packageDrafts.$inferSelect;
export type PackageDraftInsert = typeof packageDrafts.$inferInsert;

export const packageDraftVersions = pgTable(
  "package_draft_versions",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    draftId: uuid("draft_id")
      .notNull()
      .references(() => packageDrafts.id, { onDelete: "cascade" }),
    versionNumber: integer("version_number").notNull(),
    manifestDraft: jsonb("manifest_draft").$type<JsonObject>().notNull().default(sql`'{}'::jsonb`),
    normalizedSourceMap: jsonb("normalized_source_map").$type<JsonObject>().notNull().default(sql`'{}'::jsonb`),
    notes: text("notes"),
    createdByUserId: varchar("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    uniqueVersionIdx: uniqueIndex("package_draft_versions_draft_version_uq").on(table.draftId, table.versionNumber),
    draftIdx: index("package_draft_versions_draft_idx").on(table.draftId, table.createdAt),
  }),
);

export type PackageDraftVersion = typeof packageDraftVersions.$inferSelect;
export type PackageDraftVersionInsert = typeof packageDraftVersions.$inferInsert;

export const packageDraftSources = pgTable(
  "package_draft_sources",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    draftId: uuid("draft_id")
      .notNull()
      .references(() => packageDrafts.id, { onDelete: "cascade" }),
    draftVersionId: uuid("draft_version_id")
      .notNull()
      .references(() => packageDraftVersions.id, { onDelete: "cascade" }),
    sourceKind: varchar("source_kind", { length: 32 }).$type<PackageDraftSourceKind>().notNull(),
    name: text("name").notNull(),
    mimeType: varchar("mime_type", { length: 255 }),
    content: text("content").notNull(),
    parsedSummary: jsonb("parsed_summary").$type<JsonObject>().notNull().default(sql`'{}'::jsonb`),
    metadata: jsonb("metadata").$type<JsonObject>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    draftIdx: index("package_draft_sources_draft_idx").on(table.draftId, table.createdAt),
    versionIdx: index("package_draft_sources_version_idx").on(table.draftVersionId, table.createdAt),
  }),
);

export type PackageDraftSource = typeof packageDraftSources.$inferSelect;
export type PackageDraftSourceInsert = typeof packageDraftSources.$inferInsert;

export const packageBuildRuns = pgTable(
  "package_build_runs",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    draftId: uuid("draft_id")
      .notNull()
      .references(() => packageDrafts.id, { onDelete: "cascade" }),
    draftVersionId: uuid("draft_version_id")
      .references(() => packageDraftVersions.id, { onDelete: "set null" }),
    status: varchar("status", { length: 32 }).$type<PackageBuildRunStatus>().notNull().default("running"),
    modelKey: text("model_key").notNull(),
    requestedByUserId: varchar("requested_by_user_id").references(() => users.id, { onDelete: "set null" }),
    promptSnapshot: text("prompt_snapshot").notNull().default(""),
    inputSummary: jsonb("input_summary").$type<JsonObject>().notNull().default(sql`'{}'::jsonb`),
    resultSummary: jsonb("result_summary").$type<JsonObject>().notNull().default(sql`'{}'::jsonb`),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    draftIdx: index("package_build_runs_draft_idx").on(table.draftId, table.createdAt),
    statusIdx: index("package_build_runs_status_idx").on(table.status, table.createdAt),
  }),
);

export type PackageBuildRun = typeof packageBuildRuns.$inferSelect;
export type PackageBuildRunInsert = typeof packageBuildRuns.$inferInsert;

export const packageBuildRunSteps = pgTable(
  "package_build_run_steps",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    buildRunId: uuid("build_run_id")
      .notNull()
      .references(() => packageBuildRuns.id, { onDelete: "cascade" }),
    stepKey: varchar("step_key", { length: 100 }).notNull(),
    stepTitle: text("step_title").notNull(),
    stepOrder: integer("step_order").notNull().default(0),
    status: varchar("status", { length: 32 }).$type<PackageBuildRunStatus>().notNull().default("running"),
    input: jsonb("input").$type<JsonObject>().notNull().default(sql`'{}'::jsonb`),
    output: jsonb("output").$type<JsonObject>().notNull().default(sql`'{}'::jsonb`),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    buildIdx: index("package_build_run_steps_build_idx").on(table.buildRunId, table.stepOrder),
  }),
);

export type PackageBuildRunStep = typeof packageBuildRunSteps.$inferSelect;
export type PackageBuildRunStepInsert = typeof packageBuildRunSteps.$inferInsert;

export const packageValidationRuns = pgTable(
  "package_validation_runs",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    draftId: uuid("draft_id")
      .notNull()
      .references(() => packageDrafts.id, { onDelete: "cascade" }),
    draftVersionId: uuid("draft_version_id")
      .references(() => packageDraftVersions.id, { onDelete: "set null" }),
    status: varchar("status", { length: 32 }).$type<PackageValidationStatus>().notNull(),
    issues: jsonb("issues").$type<JsonObject[]>().notNull().default(sql`'[]'::jsonb`),
    testSummary: jsonb("test_summary").$type<JsonObject>().notNull().default(sql`'{}'::jsonb`),
    createdByUserId: varchar("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    draftIdx: index("package_validation_runs_draft_idx").on(table.draftId, table.createdAt),
    statusIdx: index("package_validation_runs_status_idx").on(table.status, table.createdAt),
  }),
);

export type PackageValidationRun = typeof packageValidationRuns.$inferSelect;
export type PackageValidationRunInsert = typeof packageValidationRuns.$inferInsert;

// ─────────────────────────────────────────────────────────────────────────────
// RBAC — Enterprise Role-Based Access Control (Epic 1.62)
// ─────────────────────────────────────────────────────────────────────────────

/** Catalog of all available permissions in the system (workspace-scoped). */
export const permissionDefinitions = pgTable(
  "permission_definitions",
  {
    id: varchar("id", { length: 100 }).primaryKey(),
    module: varchar("module", { length: 50 }).notNull(),
    action: varchar("action", { length: 100 }).notNull(),
    description: text("description").notNull().default(""),
    isSensitive: boolean("is_sensitive").notNull().default(false),
    createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    moduleActionIdx: uniqueIndex("permission_definitions_module_action_idx").on(
      table.module,
      table.action,
    ),
  }),
);

export type PermissionDefinition = typeof permissionDefinitions.$inferSelect;
export type PermissionDefinitionInsert = typeof permissionDefinitions.$inferInsert;

/** Custom and system roles within a workspace. */
export const workspaceRoles = pgTable(
  "workspace_roles",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: varchar("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 100 }).notNull(),
    description: text("description").notNull().default(""),
    isSystem: boolean("is_system").notNull().default(false),
    systemCode: varchar("system_code", { length: 50 }),
    priority: integer("priority").notNull().default(0),
    color: varchar("color", { length: 20 }),
    createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    workspaceIdx: index("workspace_roles_workspace_idx").on(table.workspaceId),
    // Partial unique index: only non-null system_code must be unique per workspace.
    // Custom roles have system_code = NULL so multiple custom roles per workspace are allowed.
    workspaceSystemCodeUniq: uniqueIndex("workspace_roles_ws_system_code_uq")
      .on(table.workspaceId, table.systemCode)
      .where(sql`system_code IS NOT NULL`),
  }),
);

export type WorkspaceRole = typeof workspaceRoles.$inferSelect;
export type WorkspaceRoleInsert = typeof workspaceRoles.$inferInsert;

/** Junction: permissions assigned to a workspace role. */
export const workspaceRolePermissions = pgTable(
  "workspace_role_permissions",
  {
    roleId: varchar("role_id")
      .notNull()
      .references(() => workspaceRoles.id, { onDelete: "cascade" }),
    permissionId: varchar("permission_id", { length: 100 })
      .notNull()
      .references(() => permissionDefinitions.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.roleId, table.permissionId] }),
    roleIdx: index("workspace_role_permissions_role_idx").on(table.roleId),
    // 0260: FK-индекс под каскад удаления права (permission_id; в PK он 2-й после role_id).
    permissionIdx: index("workspace_role_permissions_permission_id_idx").on(table.permissionId),
  }),
);

export type WorkspaceRolePermission = typeof workspaceRolePermissions.$inferSelect;
export type WorkspaceRolePermissionInsert = typeof workspaceRolePermissions.$inferInsert;

/** Junction: roles assigned to workspace members (supports multiple roles per user). */
export const workspaceMemberRoleAssignments = pgTable(
  "workspace_member_role_assignments",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: varchar("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleId: varchar("role_id")
      .notNull()
      .references(() => workspaceRoles.id, { onDelete: "cascade" }),
    assignedBy: varchar("assigned_by").references(() => users.id, { onDelete: "set null" }),
    assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
    // withTimezone is consistent with other temporal fields in the schema.
    // Expiry enforcement is future scope — a background job or query-time filter is needed.
    expiresAt: timestamp("expires_at", { withTimezone: true }),
  },
  (table) => ({
    workspaceMemberRoleUniq: uniqueIndex("wmra_workspace_user_role_uq").on(
      table.workspaceId,
      table.userId,
      table.roleId,
    ),
    workspaceUserIdx: index("wmra_workspace_user_idx").on(table.workspaceId, table.userId),
    workspaceRoleIdx: index("wmra_workspace_role_idx").on(table.workspaceId, table.roleId),
    // Supports efficient filtering of active (non-expired) assignments
    expiresAtIdx: index("wmra_expires_at_idx").on(table.expiresAt),
  }),
);

export type WorkspaceMemberRoleAssignment = typeof workspaceMemberRoleAssignments.$inferSelect;
export type WorkspaceMemberRoleAssignmentInsert = typeof workspaceMemberRoleAssignments.$inferInsert;

// ─── Resource-Level Access Control (Epic 6) ─────────────────────────────────

/** ACL rules for KB resources (knowledge_base, knowledge_node). */
export const resourceAccessRules = pgTable(
  "resource_access_rules",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: varchar("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    /** e.g. 'knowledge_base' | 'knowledge_node' */
    resourceType: varchar("resource_type", { length: 50 }).notNull(),
    resourceId: varchar("resource_id").notNull(),
    principalType: varchar("principal_type", { length: 10 })
      .$type<"role" | "user">()
      .notNull(),
    /** Role ID or User ID */
    principalId: varchar("principal_id").notNull(),
    accessLevel: varchar("access_level", { length: 20 })
      .$type<"view" | "edit" | "manage">()
      .notNull(),
    createdBy: varchar("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    workspaceIdx: index("rar_workspace_idx").on(table.workspaceId),
    resourceIdx: index("rar_resource_idx").on(table.workspaceId, table.resourceType, table.resourceId),
    principalUniq: uniqueIndex("rar_principal_uq").on(
      table.workspaceId,
      table.resourceType,
      table.resourceId,
      table.principalType,
      table.principalId,
    ),
  }),
);

export type ResourceAccessRule = typeof resourceAccessRules.$inferSelect;
export type ResourceAccessRuleInsert = typeof resourceAccessRules.$inferInsert;

export const resourceTypeValues = ["knowledge_base", "knowledge_node"] as const;
export type ResourceType = (typeof resourceTypeValues)[number];
export type ResourceAccessLevel = "view" | "edit" | "manage";
export type ResourcePrincipalType = "role" | "user";

export interface SetResourceRuleInput {
  principalType: ResourcePrincipalType;
  principalId: string;
  accessLevel: ResourceAccessLevel;
}

// ─── Cross-Workspace Knowledge Base Sharing (on-prem) ─────────────────────────
//
// Грант = кросс-воркспейс entitlement «пространство-владелец расшарило свою KB
// пространству-получателю на чтение». Это ОТДЕЛЬНАЯ таблица (а не resource_access_rules),
// потому что нужны ДВА разных workspace FK (owner/grantee); старый ACL это структурно
// не выражает (один workspace_id NOT NULL + principal role|user).
// Фича строго on-prem — авторизация и мутации обёрнуты resolveDeploymentMode()==='onprem'
// (см. server/acl/kb-share-grants.ts). Дизайн: docs/knowledge-base-sharing-design.md.

export const knowledgeBaseGrantAccessLevels = ["read"] as const;
export type KnowledgeBaseGrantAccessLevel = (typeof knowledgeBaseGrantAccessLevels)[number];

/** Активные/отозванные гранты на кросс-воркспейс read-доступ к KB. */
export const knowledgeBaseGrants = pgTable(
  "knowledge_base_grants",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    baseId: varchar("base_id")
      .notNull()
      .references(() => knowledgeBases.id, { onDelete: "cascade" }),
    ownerWorkspaceId: varchar("owner_workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    granteeWorkspaceId: varchar("grantee_workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    /** В MVP только 'read' (CHECK в миграции 0243). */
    accessLevel: varchar("access_level", { length: 10 })
      .$type<KnowledgeBaseGrantAccessLevel>()
      .notNull()
      .default("read"),
    /** 'manual' | 'build:<buildId>' — провенанс гранта (Фаза 3 — доставка через Сборки). */
    source: varchar("source", { length: 64 }).notNull().default("manual"),
    grantedByUserId: varchar("granted_by_user_id").references(() => users.id, { onDelete: "set null" }),
    grantedAt: timestamp("granted_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    /** soft-revoke — отозванный грант не удаляется (audit trail). NULL = активен. */
    revokedAt: timestamp("revoked_at"),
    revokedByUserId: varchar("revoked_by_user_id").references(() => users.id, { onDelete: "set null" }),
  },
  (table) => ({
    // Активный грант уникален на пару (base, grantee); повторный grant после revoke не блокируется.
    activeUniq: uniqueIndex("kbg_active_uq")
      .on(table.baseId, table.granteeWorkspaceId)
      .where(sql`revoked_at IS NULL`),
    // Горячий путь: «какие base_id видит этот workspace».
    granteeIdx: index("kbg_grantee_idx")
      .on(table.granteeWorkspaceId)
      .where(sql`revoked_at IS NULL`),
    // UX владельца: «кому я раздал и на какие KB».
    ownerBaseIdx: index("kbg_owner_base_idx").on(table.ownerWorkspaceId, table.baseId),
  }),
);

export type KnowledgeBaseGrant = typeof knowledgeBaseGrants.$inferSelect;
export type KnowledgeBaseGrantInsert = typeof knowledgeBaseGrants.$inferInsert;

export const knowledgeBaseGrantEventTypes = [
  "granted",
  "revoked",
  "build_install_grant",
  "build_uninstall_revoke",
  "instance_shared",
  "instance_unshared",
] as const;
export type KnowledgeBaseGrantEventType = (typeof knowledgeBaseGrantEventTypes)[number];

/** Append-only журнал выдачи/отзыва грантов (forensics, INV-7). */
export const knowledgeBaseGrantEvents = pgTable(
  "knowledge_base_grant_events",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    grantId: varchar("grant_id").references(() => knowledgeBaseGrants.id, { onDelete: "set null" }),
    baseId: varchar("base_id").notNull(),
    ownerWorkspaceId: varchar("owner_workspace_id").notNull(),
    granteeWorkspaceId: varchar("grantee_workspace_id").notNull(),
    event: varchar("event", { length: 24 }).$type<KnowledgeBaseGrantEventType>().notNull(),
    actorUserId: varchar("actor_user_id"),
    /** Режим деплоя на момент события (на cloud событий быть не должно — страховка аудита). */
    deploymentMode: varchar("deployment_mode", { length: 10 }).notNull(),
    createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    baseIdx: index("kbge_base_idx").on(table.baseId, table.createdAt),
  }),
);

export type KnowledgeBaseGrantEvent = typeof knowledgeBaseGrantEvents.$inferSelect;
export type KnowledgeBaseGrantEventInsert = typeof knowledgeBaseGrantEvents.$inferInsert;

// ─── Agent Context: Instructions (instance / workspace / assistant) ───────────
// Дизайн: docs/assistant-context-and-skills-design.md (§4.4).
// Развязка WHAT/HOW: инструкции на уровнях инстанс → пространство → ассистент собираются единым слоем
// (server/agent-context/assistant-context-service.ts) для обоих путей промпта (чат и агент).

/** Глобальная инструкция агента на весь инстанс. Админ-домен (requireAdmin), без workspace_id. */
export const instanceInstructions = pgTable("instance_instructions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  body: text("body").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  version: integer("version").notNull().default(1),
  updatedBy: varchar("updated_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export type InstanceInstruction = typeof instanceInstructions.$inferSelect;
export type InstanceInstructionInsert = typeof instanceInstructions.$inferInsert;

export const instructionDocumentScopes = ["workspace", "assistant", "user"] as const;
export type InstructionDocumentScope = (typeof instructionDocumentScopes)[number];

/** Инструкции уровня пространство/ассистент/[личный] (workspace-домен), версионируемый текст-слой. */
export const instructionDocuments = pgTable(
  "instruction_documents",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: varchar("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    scope: varchar("scope", { length: 16 }).$type<InstructionDocumentScope>().notNull(),
    /** assistantId | userId; NULL для scope='workspace'. Полиморфная ссылка — без FK. */
    scopeRefId: varchar("scope_ref_id"),
    body: text("body").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    version: integer("version").notNull().default(1),
    updatedBy: varchar("updated_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    // Один документ на (пространство, уровень, объект); COALESCE — чтобы scope='workspace' (ref NULL)
    // оставался уникальным (NULL в обычном UNIQUE различны).
    scopeUniq: uniqueIndex("instruction_documents_scope_uq").on(
      table.workspaceId,
      table.scope,
      sql`COALESCE(${table.scopeRefId}, '')`,
    ),
  }),
);

export type InstructionDocument = typeof instructionDocuments.$inferSelect;
export type InstructionDocumentInsert = typeof instructionDocuments.$inferInsert;

/**
 * Навыки, объявленные на ассистенте (источник истины) — §4.4.
 * Шаг universal-agent воркфлоу наполняет skillIds из этой привязки (∪ навыки, заданные явно на шаге).
 * Управление в рамках `assistants:edit` (отдельного RBAC-права не требует).
 */
export const assistantSkills = pgTable(
  "assistant_skills",
  {
    assistantId: varchar("assistant_id")
      .notNull()
      .references(() => assistants.id, { onDelete: "cascade" }),
    skillId: varchar("skill_id")
      .notNull()
      .references(() => skillRegistry.id, { onDelete: "cascade" }),
    workspaceId: varchar("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.assistantId, table.skillId] }),
    workspaceIdx: index("assistant_skills_workspace_idx").on(table.workspaceId),
    skillIdx: index("assistant_skills_skill_idx").on(table.skillId),
  }),
);

export type AssistantSkill = typeof assistantSkills.$inferSelect;
export type AssistantSkillInsert = typeof assistantSkills.$inferInsert;

// ─── Permission Audit Log (Epic 7) ───────────────────────────────────────────

export const auditActions = [
  'role.created',
  'role.updated',
  'role.deleted',
  'role.permissions_changed',
  'member.roles_changed',
  'member.role_assigned',
  'member.role_revoked',
  'resource.access_set',
  'resource.access_cleared',
  'resource.access_rule_added',
  'resource.access_rule_removed',
] as const;
export type AuditAction = (typeof auditActions)[number];

export const auditTargetTypes = ['role', 'member', 'resource'] as const;
export type AuditTargetType = (typeof auditTargetTypes)[number];

export const permissionAuditLog = pgTable(
  "permission_audit_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    workspaceId: varchar("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    actorId: varchar("actor_id").references(() => users.id, { onDelete: "set null" }),
    action: varchar("action", { length: 50 }).$type<AuditAction>().notNull(),
    targetType: varchar("target_type", { length: 50 }).$type<AuditTargetType>().notNull(),
    targetId: varchar("target_id").notNull(),
    targetName: varchar("target_name", { length: 255 }),
    details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
    ipAddress: varchar("ip_address", { length: 45 }),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    // Mirror indexes from migration 0145_permission_audit_log.sql
    createdAtIdx: index("permission_audit_log_created_at_idx").on(table.createdAt),
    workspaceCreatedAtIdx: index("idx_pal_workspace").on(table.workspaceId, table.createdAt),
    actorIdx: index("idx_pal_actor").on(table.actorId),
    targetIdx: index("idx_pal_target").on(table.targetType, table.targetId),
  }),
);

export type PermissionAuditLog = typeof permissionAuditLog.$inferSelect;
export type PermissionAuditLogInsert = typeof permissionAuditLog.$inferInsert;

// Janitor (сервис-уборщик): переопределения политик уборки. Набор ресурсов и
// дефолты задаются реестром в коде (server/janitor); здесь хранятся только override.
export const cleanupPolicies = pgTable("cleanup_policies", {
  resourceKey: varchar("resource_key", { length: 128 }).primaryKey(),
  enabled: boolean("enabled").notNull().default(false),
  retentionDays: integer("retention_days"),
  batchSize: integer("batch_size"),
  updatedByAdminId: varchar("updated_by_admin_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
});
export type CleanupPolicyRow = typeof cleanupPolicies.$inferSelect;
export type CleanupPolicyRowInsert = typeof cleanupPolicies.$inferInsert;

// Журнал прогонов уборщика (наблюдаемость + last-run в админке).
export const cleanupRunLog = pgTable(
  "cleanup_run_log",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    resourceKey: varchar("resource_key", { length: 128 }).notNull(),
    mode: varchar("mode", { length: 16 }).notNull(),
    status: varchar("status", { length: 24 }).notNull(),
    matchedCount: integer("matched_count").notNull().default(0),
    deletedCount: integer("deleted_count").notNull().default(0),
    freedBytes: bigint("freed_bytes", { mode: "number" }).notNull().default(0),
    durationMs: integer("duration_ms").notNull().default(0),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().default(sql`now()`),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    // Инициатор прогона: 'auto' (по расписанию) или 'manual' (ручной запуск из админки).
    triggeredBy: varchar("triggered_by", { length: 16 }).notNull().default("auto"),
    triggeredByAdminId: varchar("triggered_by_admin_id").references(() => users.id, { onDelete: "set null" }),
  },
  (table) => ({
    startedAtIdx: index("cleanup_run_log_started_at_idx").on(table.startedAt),
    resourceStartedAtIdx: index("cleanup_run_log_resource_started_at_idx").on(
      table.resourceKey,
      table.startedAt,
    ),
  }),
);
export type CleanupRunLogRow = typeof cleanupRunLog.$inferSelect;
export type CleanupRunLogInsert = typeof cleanupRunLog.$inferInsert;

// Аудит изменений политик уборки.
export const cleanupPolicyAuditLog = pgTable(
  "cleanup_policy_audit_log",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    resourceKey: varchar("resource_key", { length: 128 }).notNull(),
    actorId: varchar("actor_id").references(() => users.id, { onDelete: "set null" }),
    eventType: varchar("event_type", { length: 32 }).notNull(),
    before: jsonb("before").$type<Record<string, unknown> | null>(),
    after: jsonb("after").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (table) => ({
    resourceCreatedAtIdx: index("cleanup_policy_audit_log_resource_created_at_idx").on(
      table.resourceKey,
      table.createdAt,
    ),
  }),
);
export type CleanupPolicyAuditLogRow = typeof cleanupPolicyAuditLog.$inferSelect;
export type CleanupPolicyAuditLogInsert = typeof cleanupPolicyAuditLog.$inferInsert;

// ============================================================================
// Реестр глобальных переменных документов (L2.1, typed-document-assembly)
// ============================================================================

/**
 * Дефиниции переменных. Двухуровневая модель: `workspace_id IS NULL` — общая схема инстанса
 * (ориентир для типовых сценариев, правит только админ инстанса); иначе — переменная конкретного
 * пространства (право `global_variables:define`). Значения всегда per-workspace
 * (globalVariableValues). `key` immutable после создания; кросс-скоуп коллизии и prefix-конфликты
 * ключей контролируются сервисом (partial unique index ловит только дубли внутри скоупа).
 */
export const globalVariableDefinitions = pgTable(
  "global_variable_definitions",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: varchar("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
    key: varchar("key", { length: 200 }).notNull(),
    label: text("label").notNull(),
    description: text("description").notNull().default(""),
    valueType: text("value_type").$type<GlobalVariableValueType>().notNull().default("string"),
    required: boolean("required").notNull().default(false),
    enumOptions: jsonb("enum_options").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    // Только UI-подсказка (prefill формы значений); рантайм-fallback запрещён.
    defaultValue: jsonb("default_value").$type<unknown>(),
    groupKey: varchar("group_key", { length: 120 }),
    isSecret: boolean("is_secret").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (table) => ({
    // Уникальность ключа — по скоупу: инстанс-схема и каждое пространство отдельно.
    instanceKeyUnique: uniqueIndex("global_variable_definitions_instance_key_unique")
      .on(table.key)
      .where(sql`${table.workspaceId} IS NULL`),
    workspaceKeyUnique: uniqueIndex("global_variable_definitions_workspace_key_unique")
      .on(table.workspaceId, table.key)
      .where(sql`${table.workspaceId} IS NOT NULL`),
    workspaceIdx: index("global_variable_definitions_workspace_idx").on(table.workspaceId),
  }),
);
export type GlobalVariableDefinitionRow = typeof globalVariableDefinitions.$inferSelect;
export type GlobalVariableDefinitionInsert = typeof globalVariableDefinitions.$inferInsert;

/**
 * Значения переменных пространства: `(workspace_id, definition_id)` уникальна. Для
 * workspace-scoped дефиниции значение может писать только её собственное пространство
 * (инвариант сервиса). jsonb сохраняет number/boolean без строкового парсинга.
 */
export const globalVariableValues = pgTable(
  "global_variable_values",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: varchar("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    definitionId: uuid("definition_id")
      .notNull()
      .references(() => globalVariableDefinitions.id, { onDelete: "cascade" }),
    value: jsonb("value").$type<unknown>().notNull(),
    setByUserId: varchar("set_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (table) => ({
    wsDefUnique: uniqueIndex("global_variable_values_ws_def_unique").on(
      table.workspaceId,
      table.definitionId,
    ),
    definitionIdx: index("global_variable_values_definition_idx").on(table.definitionId),
  }),
);
export type GlobalVariableValueRow = typeof globalVariableValues.$inferSelect;
export type GlobalVariableValueInsert = typeof globalVariableValues.$inferInsert;

// ============================================================================
// Справочники (reference sets) — инстанс-глобальные версионируемые данные
// с maker-checker-апрувом. Дизайн: docs/reference-sets-design.md (D1–D7).
// Владелец домена в целевой карте — unica-workflow (editor/control);
// до распила — модуль core. Читаются runner'ом gateway-операциями reference.*.
// ============================================================================

/**
 * Реестр справочников. Скоуп: `workspace_id IS NULL` — инстанс (федеральные
 * нормы, читаются всеми пространствами); workspace-override заложен колонкой
 * (UI — Фаза 3). `key` immutable после создания. Указатель активной версии —
 * active_version_id; FK добавлен ALTER'ом в миграции 0291 (циклическая
 * зависимость таблиц — приём knowledge_documents.current_version_id).
 */
export const referenceSets = pgTable(
  "reference_sets",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: varchar("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
    key: varchar("key", { length: 200 }).notNull(),
    title: varchar("title", { length: 300 }).notNull(),
    description: text("description").notNull().default(""),
    // NULL = источники вне БЗ (внешний импорт) — hash-гейт набор пропускает.
    sourceKnowledgeBaseId: varchar("source_knowledge_base_id").references(() => knowledgeBases.id, {
      onDelete: "set null",
    }),
    // FK на reference_set_versions — в SQL-миграции (см. комментарий выше).
    activeVersionId: uuid("active_version_id"),
    // Последнее подтверждение актуальности источников (touch hash-гейта).
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
    // NULL = env-дефолт UNICA_REFERENCE_SET_STALE_AFTER_DAYS (паттерн «NULL = Авто»).
    staleAfterDays: integer("stale_after_days"),
    // Фаза 2: авто-создание черновика при изменении источника (в Фазе 1 только хранится).
    autoDraftOnChange: boolean("auto_draft_on_change").notNull().default(false),
    lastCheckOutcome: varchar("last_check_outcome", { length: 32 }).$type<ReferenceSetCheckOutcome>(),
    lastCheckAt: timestamp("last_check_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => ({
    // Уникальность ключа — по скоупу (как у globalVariableDefinitions).
    instanceKeyUnique: uniqueIndex("reference_sets_instance_key_unique")
      .on(table.key)
      .where(sql`${table.workspaceId} IS NULL`),
    workspaceKeyUnique: uniqueIndex("reference_sets_workspace_key_unique")
      .on(table.workspaceId, table.key)
      .where(sql`${table.workspaceId} IS NOT NULL`),
  }),
);
export type ReferenceSetRow = typeof referenceSets.$inferSelect;
export type ReferenceSetInsert = typeof referenceSets.$inferInsert;

/**
 * Иммутабельные версии справочника (образец — workflowDefinitionVersions):
 * после создания payload не меняется, допустимы только переходы status.
 * Инвариант «не более одной active на набор» — partial unique index.
 * Поля approved_* хранят решение и для rejected (кто/когда/комментарий).
 */
export const referenceSetVersions = pgTable(
  "reference_set_versions",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    setId: uuid("set_id")
      .notNull()
      .references(() => referenceSets.id, { onDelete: "cascade" }),
    versionNo: integer("version_no").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    payloadHash: varchar("payload_hash", { length: 64 }).notNull(),
    // Снимок источников на момент извлечения — вход hash-гейта.
    sourceDocs: jsonb("source_docs")
      .$type<ReferenceSetSourceDoc[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    provenance: jsonb("provenance")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    diffSummary: jsonb("diff_summary").$type<ReferenceSetDiffSummary>(),
    status: varchar("status", { length: 16 })
      .$type<ReferenceSetVersionStatus>()
      .notNull()
      .default("draft"),
    createdByType: varchar("created_by_type", { length: 16 })
      .$type<ReferenceSetCreatedByType>()
      .notNull()
      .default("user"),
    createdByUserId: varchar("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    approvedByUserId: varchar("approved_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approveComment: text("approve_comment"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => ({
    setVersionUnique: uniqueIndex("reference_set_versions_set_version_unique").on(
      table.setId,
      table.versionNo,
    ),
    oneActivePerSet: uniqueIndex("reference_set_versions_one_active_unique")
      .on(table.setId)
      .where(sql`${table.status} = 'active'`),
    setStatusIdx: index("reference_set_versions_set_status_idx").on(table.setId, table.status),
  }),
);
export type ReferenceSetVersionRow = typeof referenceSetVersions.$inferSelect;
export type ReferenceSetVersionInsert = typeof referenceSetVersions.$inferInsert;

/** Аудит домена справочников: создание/черновики/решения/итоги hash-гейта. */
export const referenceSetAuditLog = pgTable(
  "reference_set_audit_log",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    setId: uuid("set_id")
      .notNull()
      .references(() => referenceSets.id, { onDelete: "cascade" }),
    versionId: uuid("version_id").references(() => referenceSetVersions.id, {
      onDelete: "set null",
    }),
    actorType: varchar("actor_type", { length: 16 }).$type<ReferenceSetActorType>().notNull(),
    actorUserId: varchar("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    action: varchar("action", { length: 40 }).$type<ReferenceSetAuditAction>().notNull(),
    details: jsonb("details")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => ({
    setCreatedIdx: index("reference_set_audit_log_set_created_idx").on(
      table.setId,
      table.createdAt,
    ),
  }),
);
export type ReferenceSetAuditLogRow = typeof referenceSetAuditLog.$inferSelect;
export type ReferenceSetAuditLogInsert = typeof referenceSetAuditLog.$inferInsert;
