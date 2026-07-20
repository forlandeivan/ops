import { z } from "zod";
import {
  WORKFLOW_JSON_SCHEMA_VERSION,
  workflowCompilePreviewRequestSchema,
  workflowCompilePreviewResponseSchema,
  workflowMigrationInfoSchema,
  workflowValidationResultSchema,
  workflowJsonV1Schema,
  workflowIrV1Schema,
  workflowIrReadSchema,
} from "./workflow-compiler";
import {
  workflowLangGraphCompatibilitySchema,
} from "./workflow-langgraph";

export const WORKFLOW_SCHEMA_VERSION = WORKFLOW_JSON_SCHEMA_VERSION;

export const workflowDefinitionKinds = ["scenario", "template"] as const;
export const workflowDefinitionScopeKinds = ["workspace", "global"] as const;
export const workflowDefinitionStatuses = ["draft", "published", "archived"] as const;
export const workflowTemplateSources = ["system", "custom"] as const;
export const workflowListSortFields = ["title", "status", "updatedAt"] as const;
export const workflowListSortDirections = ["asc", "desc"] as const;
export const workflowCompatibilityStatuses = ["compatible", "migratable", "incompatible"] as const;
export const workflowChangeSummaryItemKinds = [
  "initial_version",
  "metadata_changed",
  "node_added",
  "node_removed",
  "node_changed",
  "control_edge_added",
  "control_edge_removed",
  "data_binding_added",
  "data_binding_removed",
  "schema_changed",
  "schema_migration",
] as const;
export const workflowAuditActions = [
  "created",
  "draft_saved",
  "draft_reset_to_published",
  "published",
  "rolled_back",
  "archived",
  "restored",
  "duplicated",
  // Изменение config узла script_transform (добавление/правка/удаление кода). Пишется только
  // платформенным админом: остальным изменение запрещено гейтом (см. server/workflow-script-node-guard.ts).
  "script_code_changed",
] as const;

export type WorkflowDefinitionKind = (typeof workflowDefinitionKinds)[number];
export type WorkflowDefinitionScopeKind = (typeof workflowDefinitionScopeKinds)[number];
export type WorkflowDefinitionStatus = (typeof workflowDefinitionStatuses)[number];
export type WorkflowTemplateSource = (typeof workflowTemplateSources)[number];
export type WorkflowListSortField = (typeof workflowListSortFields)[number];
export type WorkflowListSortDirection = (typeof workflowListSortDirections)[number];
export type WorkflowCompatibilityStatus = (typeof workflowCompatibilityStatuses)[number];
export type WorkflowChangeSummaryItemKind = (typeof workflowChangeSummaryItemKinds)[number];
export type WorkflowAuditAction = (typeof workflowAuditActions)[number];

export const workflowOpaqueDocumentSchema = z.object({}).catchall(z.unknown());
export const workflowTemplateSourceSchema = z.enum(workflowTemplateSources);
export const workflowCompatibilityStatusSchema = z.enum(workflowCompatibilityStatuses);
export const workflowChangeSummaryItemKindSchema = z.enum(workflowChangeSummaryItemKinds);

export const WORKFLOW_BUNDLE_SCHEMA_VERSION = 1 as const;

export const workflowChangeSummaryItemSchema = z.object({
  kind: workflowChangeSummaryItemKindSchema,
  label: z.string().min(1),
  nodeId: z.string().optional(),
  edgeId: z.string().optional(),
  bindingId: z.string().optional(),
  details: z.record(z.string(), z.unknown()).optional(),
});

export const workflowChangeSummarySchema = z.object({
  totalChanges: z.number().int().nonnegative(),
  counts: z.object({
    metadataChanges: z.number().int().nonnegative(),
    nodesAdded: z.number().int().nonnegative(),
    nodesRemoved: z.number().int().nonnegative(),
    nodesChanged: z.number().int().nonnegative(),
    controlEdgesAdded: z.number().int().nonnegative(),
    controlEdgesRemoved: z.number().int().nonnegative(),
    dataBindingsAdded: z.number().int().nonnegative(),
    dataBindingsRemoved: z.number().int().nonnegative(),
    schemaChanges: z.number().int().nonnegative(),
    migrationChanges: z.number().int().nonnegative(),
  }),
  highlights: z.array(z.string()),
  items: z.array(workflowChangeSummaryItemSchema),
});

export const workflowCompatibilitySchema = z.object({
  status: workflowCompatibilityStatusSchema,
  checkedAt: z.string().datetime(),
  workflowSchemaVersion: z.number().int().min(1).nullable(),
  irSchemaVersion: z.number().int().min(1).nullable(),
  expectedWorkflowSchemaVersion: z.number().int().min(1),
  expectedIrSchemaVersion: z.number().int().min(1),
  blockingIssueCount: z.number().int().nonnegative(),
  warningIssueCount: z.number().int().nonnegative(),
  reasons: z.array(z.string()),
  migrationInfo: workflowMigrationInfoSchema.optional(),
});

export const workflowBundleManifestSchema = z.object({
  format: z.literal("workflow_bundle_v1"),
  bundleVersion: z.literal(WORKFLOW_BUNDLE_SCHEMA_VERSION),
  generatedAt: z.string().datetime(),
  contentSha256: z.string().length(64),
});

export const workflowDefinitionListItemSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(workflowDefinitionKinds),
  scopeKind: z.enum(workflowDefinitionScopeKinds),
  workspaceId: z.string().nullable(),
  status: z.enum(workflowDefinitionStatuses),
  title: z.string().trim().min(1).max(255),
  description: z.string().max(5000).nullable(),
  schemaVersion: z.number().int().min(1),
  draftRevision: z.number().int().min(1),
  currentPublishedVersionId: z.string().uuid().nullable(),
  currentPublishedVersionNo: z.number().int().min(1).nullable(),
  hasUnpublishedChanges: z.boolean().optional(),
  createdByUserId: z.string().nullable(),
  updatedByUserId: z.string().nullable(),
  templateSource: workflowTemplateSourceSchema.nullable(),
  systemTemplateKey: z.string().trim().min(1).max(255).nullable(),
  managedReleaseTag: z.string().trim().min(1).max(255).nullable(),
  managedByBundleVersion: z.string().trim().min(1).max(255).nullable(),
  archivedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const workflowDefinitionDetailSchema = workflowDefinitionListItemSchema.extend({
  draftEditorDocument: workflowOpaqueDocumentSchema,
  draftWorkflowDocument: workflowOpaqueDocumentSchema,
});

export const workflowVersionSchema = z.object({
  id: z.string().uuid(),
  definitionId: z.string().uuid(),
  versionNo: z.number().int().min(1),
  schemaVersion: z.number().int().min(1),
  editorDocument: workflowOpaqueDocumentSchema,
  workflowDocument: workflowOpaqueDocumentSchema,
  releaseNote: z.string().max(5000).nullable(),
  changeSummary: workflowChangeSummarySchema,
  compatibility: workflowCompatibilitySchema,
  langgraphCompatibility: workflowLangGraphCompatibilitySchema,
  bundleManifest: workflowBundleManifestSchema,
  publishedByUserId: z.string().nullable(),
  publishedAt: z.string().datetime(),
});

export const workflowPublishedVersionSummarySchema = z.object({
  id: z.string().uuid(),
  versionNo: z.number().int().min(1),
  publishedAt: z.string().datetime(),
  releaseNote: z.string().max(5000).nullable(),
});

export const workflowAuditEventSchema = z.object({
  id: z.number().int().nonnegative(),
  definitionId: z.string().uuid(),
  workspaceId: z.string().nullable(),
  actorId: z.string().nullable(),
  action: z.enum(workflowAuditActions),
  versionId: z.string().uuid().nullable(),
  details: z.record(z.string(), z.unknown()),
  createdAt: z.string().datetime(),
});

export const workflowRunStepSchema = z.object({
  id: z.string().uuid(),
  sequenceNo: z.number().int().min(1),
  nodeId: z.string().min(1),
  nodeTitle: z.string().nullable(),
  stepId: z.string().min(1),
  nodeKind: z.string().min(1),
  status: z.string().min(1),
  branchPortId: z.string().nullable(),
  inputPayload: workflowOpaqueDocumentSchema,
  outputPayload: workflowOpaqueDocumentSchema,
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime().nullable(),
  durationMs: z.number().int().nonnegative().nullable(),
  createdAt: z.string().datetime(),
});

export const workflowRunApprovalSchema = z.object({
  id: z.string().uuid(),
  nodeId: z.string().min(1),
  nodeTitle: z.string().nullable(),
  stepId: z.string().min(1),
  approvalRoleCode: z.string().min(1),
  status: z.string().min(1),
  decisionComment: z.string().nullable(),
  requestPayload: workflowOpaqueDocumentSchema,
  decisionPayload: workflowOpaqueDocumentSchema,
  requestedAt: z.string().datetime(),
  dueAt: z.string().datetime().nullable(),
  decidedAt: z.string().datetime().nullable(),
  decidedByUserId: z.string().nullable(),
});

export const workflowRunEventPhases = ["started", "completed", "failed", "info"] as const;
export const workflowRunEventActorKinds = ["workflow", "model", "tool", "approval", "system"] as const;
export const workflowRunEventVisibilities = ["user", "debug"] as const;

export const workflowRunEventSchema = z.object({
  id: z.string().uuid(),
  runId: z.string().uuid(),
  stepId: z.string().nullable(),
  nodeId: z.string().nullable(),
  sequenceNo: z.number().int().min(1),
  eventType: z.string().min(1),
  phase: z.enum(workflowRunEventPhases),
  actorKind: z.enum(workflowRunEventActorKinds),
  visibility: z.enum(workflowRunEventVisibilities),
  capabilityKey: z.string().nullable(),
  toolName: z.string().nullable(),
  retryReason: z.string().nullable(),
  iconKey: z.string().nullable(),
  tone: z.string().nullable(),
  title: z.string(),
  summary: z.string().nullable(),
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime().nullable(),
  durationMs: z.number().int().nonnegative().nullable(),
  metaPreview: workflowOpaqueDocumentSchema,
  createdAt: z.string().datetime(),
});

export const workflowRunSummarySchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().min(1),
  assistantId: z.string().min(1),
  assistantName: z.string().nullable(),
  chatId: z.string().min(1),
  userId: z.string().nullable(),
  userMessageId: z.string().nullable(),
  workflowDefinitionId: z.string().uuid(),
  resolvedWorkflowVersionId: z.string().uuid(),
  resolvedWorkflowVersionNo: z.number().int().min(1),
  status: z.string().min(1),
  queuePosition: z.number().int().min(1),
  currentStepId: z.string().nullable(),
  currentStepTitle: z.string().nullable(),
  waitingNodeId: z.string().nullable(),
  waitingNodeTitle: z.string().nullable(),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
  startedAt: z.string().datetime().nullable(),
  finishedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const workflowRunDetailSchema = workflowRunSummarySchema.extend({
  steps: z.array(workflowRunStepSchema),
  approvals: z.array(workflowRunApprovalSchema),
});

export const workflowRunEventsResponseSchema = z.object({
  events: z.array(workflowRunEventSchema),
});

// ── Step-debug D4.1: run-data узла для NDV-инспектора ────────────────────────────────────────────
// Ответ read-API `GET .../debug/runs/:runId/nodes/:nodeId/run-data` (рантайм: op #26 направления 1).
// Джойн `runtimeState.context` + `run_steps` на пути value-catalog делает СЕРВЕР; клиент рисует.

/** Значение листа панели переменных: только скаляр (контейнеры описываются `kind` + `itemCount`). */
export const workflowDebugRunDataValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

export const workflowDebugRunDataVariableSchema = z.object({
  /** Путь value-catalog: `inputs.*`, `workflow.*`, `steps.<nodeId>.<field>…`. */
  path: z.string().min(1),
  kind: z.enum(["scalar", "object", "array"]),
  /** Значение скаляра; у контейнеров null (число полей/элементов — в `itemCount`). */
  value: workflowDebugRunDataValueSchema,
  itemCount: z.number().int().nonnegative().nullable(),
  /** Узел-источник для путей `steps.*`; null для `inputs.*`/`workflow.*`. */
  nodeId: z.string().nullable(),
  /** Значение усечено (длинная строка / хвост массива не развёрнут). */
  truncated: z.boolean(),
});

/** Есть ли пин у узла в оверлее дебаг-сессии (D3.1); `editable` читается из статуса сессии. */
export const workflowDebugNodePinStateSchema = z.object({
  pinned: z.boolean(),
  pinnedOutput: workflowOpaqueDocumentSchema.nullable(),
});

export const workflowDebugNodeRunDataSchema = z.object({
  runId: z.string().uuid(),
  debugSessionId: z.string().uuid(),
  nodeId: z.string().min(1),
  /** stepId узла в IR дебаг-бандла прогона. */
  stepId: z.string().min(1),
  nodeKind: z.string().min(1),
  nodeTitle: z.string().nullable(),
  /** Узел исполнялся (или подставлен пином) в этом прогоне — иначе `output` пуст. */
  executed: z.boolean(),
  /** Номер попытки последнего выхода (NULL = первичный проход). */
  attemptNo: z.number().int().min(1).nullable(),
  /** Конфиг узла из снимка черновика сессии (панель параметров NDV). */
  params: workflowOpaqueDocumentSchema,
  /** Последний attempt из `run_steps`; null для неисполненного узла (схему выхода клиент берёт из registry). */
  output: workflowRunStepSchema.nullable(),
  pinState: workflowDebugNodePinStateSchema,
  /** Живые значения ТОЛЬКО для путей IR-предков узла (+ `inputs.*`/`workflow.*`). */
  availableVariables: z.array(workflowDebugRunDataVariableSchema),
  availableVariablesTruncated: z.boolean(),
  ancestorNodeIds: z.array(z.string().min(1)),
  /** true → секретные значения глобалок в выходах замаскированы (нет права `global_variables:read_secret`). */
  maskedSecretValues: z.boolean(),
});

export const workflowActiveRunResponseSchema = z.object({
  run: workflowRunSummarySchema.nullable(),
});

// ── Линия прогресса прогона в чате ────────────────────────────────────────────
// Контракт chat-scoped endpoints `GET /workflow-runs/:runId/progress` (лёгкий,
// поллится ~1 раз/с: шаги БЕЗ payload + линейная проекция оставшихся узлов графа)
// и `GET /workflow-runs/:runId/steps/:stepId/payload` (on-demand по клику по шагу;
// секреты глобалок всегда замаскированы fail-closed, payload усечён display-time).
// Guard обоих — CHATS_VIEW + членство + ACL чата (как events-роут).

export const workflowRunProgressStepSchema = z.object({
  /** id ряда `assistant_workflow_run_steps` — ключ для payload-endpoint'а. */
  id: z.string().uuid(),
  sequenceNo: z.number().int().min(1),
  nodeId: z.string().min(1),
  nodeTitle: z.string().nullable(),
  stepId: z.string().min(1),
  nodeKind: z.string().min(1),
  status: z.string().min(1),
  branchPortId: z.string().nullable(),
  /** Номер попытки дебаг-rerun; NULL = первичный проход. */
  attemptNo: z.number().int().min(1).nullable(),
  errorCode: z.string().nullable(),
  /** Обрезается сервером до 500 символов (полный текст — в payload-endpoint'е). */
  errorMessage: z.string().nullable(),
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime().nullable(),
  durationMs: z.number().int().nonnegative().nullable(),
});

/** Узел опубликованного графа, до которого исполнение ещё не дошло (проекция «впереди»). */
export const workflowRunPlannedNodeSchema = z.object({
  nodeId: z.string().min(1),
  nodeTitle: z.string().nullable(),
  nodeKind: z.string().min(1),
});

export const workflowRunProgressSchema = z.object({
  runId: z.string().uuid(),
  chatId: z.string().min(1),
  status: z.string().min(1),
  workflowDefinitionId: z.string().uuid(),
  workflowTitle: z.string().nullable(),
  resolvedWorkflowVersionNo: z.number().int().min(1),
  queuePosition: z.number().int().min(1),
  currentStepId: z.string().nullable(),
  waitingNodeId: z.string().nullable(),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
  startedAt: z.string().datetime().nullable(),
  finishedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  steps: z.array(workflowRunProgressStepSchema),
  /** Пусто для терминальных статусов — неисполненные ветки после финала не показываются. */
  plannedNodes: z.array(workflowRunPlannedNodeSchema),
});

export const workflowRunProgressResponseSchema = z.object({
  progress: workflowRunProgressSchema,
});

export const workflowRunStepPayloadSchema = z.object({
  runId: z.string().uuid(),
  /** id ряда `assistant_workflow_run_steps` (НЕ IR stepId). */
  stepId: z.string().uuid(),
  nodeId: z.string().min(1),
  nodeTitle: z.string().nullable(),
  nodeKind: z.string().min(1),
  status: z.string().min(1),
  branchPortId: z.string().nullable(),
  inputPayload: workflowOpaqueDocumentSchema,
  outputPayload: workflowOpaqueDocumentSchema,
  /** Payload усечён display-time лимитами чата (см. server/lib/display-payload-truncation). */
  inputTruncated: z.boolean(),
  outputTruncated: z.boolean(),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime().nullable(),
  durationMs: z.number().int().nonnegative().nullable(),
  /** Чат-выдача всегда fail-closed: секреты глобалок замаскированы для всех. */
  maskedSecretValues: z.literal(true),
});

export const workflowRunStepPayloadResponseSchema = z.object({
  step: workflowRunStepPayloadSchema,
});

export const workflowRunListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const workflowBooleanQuerySchema = z.preprocess((value) => {
  if (value === undefined) return undefined;
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return value;
}, z.boolean());

export const workflowListQuerySchema = z.object({
  search: z.string().trim().max(255).optional(),
  status: z.enum(workflowDefinitionStatuses).optional(),
  templateSource: workflowTemplateSourceSchema.optional(),
  includeSystemTemplates: workflowBooleanQuerySchema.optional(),
  includeCustomTemplates: workflowBooleanQuerySchema.optional(),
  excludeArchived: workflowBooleanQuerySchema.optional(),
  hasUnpublishedChanges: workflowBooleanQuerySchema.optional(),
  sortField: z.enum(workflowListSortFields).default("updatedAt"),
  sortDirection: z.enum(workflowListSortDirections).default("desc"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const workflowHistoryPageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const workflowListPageInfoSchema = z.object({
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
  hasMore: z.boolean(),
});

export const workflowVersionsPageSchema = z.object({
  versions: z.array(workflowVersionSchema),
  pageInfo: workflowListPageInfoSchema,
});

export const workflowAuditPageSchema = z.object({
  audit: z.array(workflowAuditEventSchema),
  pageInfo: workflowListPageInfoSchema,
});

export const workflowListResponseSchema = z.object({
  definitions: z.array(workflowDefinitionListItemSchema),
  pageInfo: workflowListPageInfoSchema,
});

export const workflowRevisionConflictSchema = z.object({
  message: z.string(),
  code: z.literal("REVISION_CONFLICT"),
  actualDraftRevision: z.number().int().min(1),
  updatedAt: z.string().datetime(),
});

export const createWorkflowSchema = z.object({
  title: z.string().trim().min(1).max(255),
  description: z.string().trim().max(5000).nullable().optional(),
  draftEditorDocument: workflowOpaqueDocumentSchema.optional().default({}),
  /**
   * Создание сценария из опубликованного глобального шаблона. Когда поле задано, сервер сам
   * читает документ шаблона из БД и игнорирует `draftEditorDocument` запроса: это доверенный
   * источник, поэтому админский гейт на узлы script_transform к нему не применяется.
   */
  fromTemplateId: z.string().uuid().optional(),
});

export const updateWorkflowDraftSchema = z
  .object({
    title: z.string().trim().min(1).max(255).optional(),
    description: z.string().trim().max(5000).nullable().optional(),
    draftEditorDocument: workflowOpaqueDocumentSchema.optional(),
    expectedDraftRevision: z.number().int().min(1),
  })
  .refine(
    (value) =>
      value.title !== undefined ||
      value.description !== undefined ||
      value.draftEditorDocument !== undefined,
    {
      message: "At least one mutable draft field must be provided",
      path: ["expectedDraftRevision"],
    },
  );

export const publishWorkflowSchema = z.object({
  releaseNote: z.string().trim().max(5000).optional().default(""),
});

export const rollbackWorkflowVersionSchema = z.object({
  reason: z.string().trim().min(1).max(5000),
});

export const workflowCompilePreviewErrorSchema = z.object({
  message: z.string(),
  code: z.literal("WORKFLOW_VALIDATION_FAILED"),
  details: z.object({
    validation: workflowValidationResultSchema,
    workflowJson: workflowJsonV1Schema,
    ir: workflowIrV1Schema,
    migrationInfo: workflowMigrationInfoSchema.optional(),
  }),
});

export const workflowReleasePreviewRequestSchema = workflowCompilePreviewRequestSchema;

export const workflowReleaseImpactAssistantSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string(),
  name: z.string().nullable(),
});

export const workflowReleasePreviewSchema = z.object({
  preview: workflowCompilePreviewResponseSchema,
  currentPublishedVersion: workflowPublishedVersionSummarySchema.nullable(),
  previousWorkflowJson: workflowJsonV1Schema.nullable(),
  // Читает IR ранее опубликованной версии — может быть legacy V2 (толерантно).
  previousIr: workflowIrReadSchema.nullable(),
  changeSummary: workflowChangeSummarySchema,
  compatibility: workflowCompatibilitySchema,
  langgraphCompatibility: workflowLangGraphCompatibilitySchema,
  bundleManifest: workflowBundleManifestSchema,
  affectedAssistantCount: z.number().int().nonnegative(),
  affectedAssistants: z.array(workflowReleaseImpactAssistantSchema),
  canPublish: z.boolean(),
});

export const workflowVersionCompareQuerySchema = z.object({
  baseVersionId: z.string().uuid(),
});

export const workflowVersionCompareSchema = z.object({
  baseVersion: workflowVersionSchema,
  targetVersion: workflowVersionSchema,
  baseWorkflowJson: workflowJsonV1Schema,
  targetWorkflowJson: workflowJsonV1Schema,
  // Сравнение двух опубликованных версий — их IR может быть legacy V2 (толерантно).
  baseIr: workflowIrReadSchema,
  targetIr: workflowIrReadSchema,
  changeSummary: workflowChangeSummarySchema,
  compatibility: workflowCompatibilitySchema,
  langgraphCompatibility: workflowLangGraphCompatibilitySchema,
});

export const workflowBundleSchema = z.object({
  schemaVersion: z.literal(WORKFLOW_BUNDLE_SCHEMA_VERSION),
  generatedAt: z.string().datetime(),
  definition: z.object({
    id: z.string().uuid(),
    kind: z.enum(workflowDefinitionKinds),
    scopeKind: z.enum(workflowDefinitionScopeKinds),
    workspaceId: z.string().nullable(),
    title: z.string().trim().min(1).max(255),
    description: z.string().max(5000).nullable(),
    templateSource: workflowTemplateSourceSchema.nullable(),
    systemTemplateKey: z.string().trim().min(1).max(255).nullable(),
    managedReleaseTag: z.string().trim().min(1).max(255).nullable(),
    managedByBundleVersion: z.string().trim().min(1).max(255).nullable(),
  }),
  version: workflowPublishedVersionSummarySchema.extend({
    definitionId: z.string().uuid(),
    schemaVersion: z.number().int().min(1),
    changeSummary: workflowChangeSummarySchema,
    compatibility: workflowCompatibilitySchema,
    langgraphCompatibility: workflowLangGraphCompatibilitySchema.optional(),
    bundleManifest: workflowBundleManifestSchema,
  }),
  documents: z.object({
    editorDocument: workflowOpaqueDocumentSchema,
    workflowJson: workflowJsonV1Schema,
    // Starter-бандлы, опубликованные до IR V3, несут legacy V2 — читаем толерантно (без регена).
    ir: workflowIrReadSchema,
  }),
  validation: workflowValidationResultSchema,
});

export {
  workflowCompilePreviewRequestSchema,
  workflowCompilePreviewResponseSchema,
};

export type WorkflowListQueryDto = z.infer<typeof workflowListQuerySchema>;
export type WorkflowHistoryPageQueryDto = z.infer<typeof workflowHistoryPageQuerySchema>;
export type WorkflowVersionsPageDto = z.infer<typeof workflowVersionsPageSchema>;
export type WorkflowAuditPageDto = z.infer<typeof workflowAuditPageSchema>;
export type WorkflowListPageInfoDto = z.infer<typeof workflowListPageInfoSchema>;
export type WorkflowListResponseDto = z.infer<typeof workflowListResponseSchema>;
export type WorkflowDefinitionListItemDto = z.infer<typeof workflowDefinitionListItemSchema>;
export type WorkflowDefinitionDetailDto = z.infer<typeof workflowDefinitionDetailSchema>;
export type WorkflowVersionDto = z.infer<typeof workflowVersionSchema>;
export type WorkflowAuditEventDto = z.infer<typeof workflowAuditEventSchema>;
export type WorkflowRunStepDto = z.infer<typeof workflowRunStepSchema>;
export type WorkflowRunApprovalDto = z.infer<typeof workflowRunApprovalSchema>;
export type WorkflowRunEventPhase = (typeof workflowRunEventPhases)[number];
export type WorkflowRunEventActorKind = (typeof workflowRunEventActorKinds)[number];
export type WorkflowRunEventVisibility = (typeof workflowRunEventVisibilities)[number];
export type WorkflowRunEventDto = z.infer<typeof workflowRunEventSchema>;
export type WorkflowRunSummaryDto = z.infer<typeof workflowRunSummarySchema>;
export type WorkflowRunDetailDto = z.infer<typeof workflowRunDetailSchema>;
export type WorkflowRunEventsResponseDto = z.infer<typeof workflowRunEventsResponseSchema>;
export type WorkflowDebugRunDataValue = z.infer<typeof workflowDebugRunDataValueSchema>;
export type WorkflowDebugRunDataVariableDto = z.infer<typeof workflowDebugRunDataVariableSchema>;
export type WorkflowDebugNodePinStateDto = z.infer<typeof workflowDebugNodePinStateSchema>;
export type WorkflowDebugNodeRunDataDto = z.infer<typeof workflowDebugNodeRunDataSchema>;
export type WorkflowActiveRunResponseDto = z.infer<typeof workflowActiveRunResponseSchema>;
export type WorkflowRunProgressStepDto = z.infer<typeof workflowRunProgressStepSchema>;
export type WorkflowRunPlannedNodeDto = z.infer<typeof workflowRunPlannedNodeSchema>;
export type WorkflowRunProgressDto = z.infer<typeof workflowRunProgressSchema>;
export type WorkflowRunProgressResponseDto = z.infer<typeof workflowRunProgressResponseSchema>;
export type WorkflowRunStepPayloadDto = z.infer<typeof workflowRunStepPayloadSchema>;
export type WorkflowRunStepPayloadResponseDto = z.infer<typeof workflowRunStepPayloadResponseSchema>;
export type WorkflowRunListQueryDto = z.infer<typeof workflowRunListQuerySchema>;
export type WorkflowRevisionConflictDto = z.infer<typeof workflowRevisionConflictSchema>;
export type CreateWorkflowDto = z.infer<typeof createWorkflowSchema>;
export type UpdateWorkflowDraftDto = z.infer<typeof updateWorkflowDraftSchema>;
export type PublishWorkflowDto = z.infer<typeof publishWorkflowSchema>;
export type RollbackWorkflowVersionDto = z.infer<typeof rollbackWorkflowVersionSchema>;
export type WorkflowChangeSummaryDto = z.infer<typeof workflowChangeSummarySchema>;
export type WorkflowChangeSummaryItemDto = z.infer<typeof workflowChangeSummaryItemSchema>;
export type WorkflowCompatibilityDto = z.infer<typeof workflowCompatibilitySchema>;
export type WorkflowBundleManifestDto = z.infer<typeof workflowBundleManifestSchema>;
export type WorkflowPublishedVersionSummaryDto = z.infer<typeof workflowPublishedVersionSummarySchema>;
export type WorkflowCompilePreviewRequestDto = z.infer<typeof workflowCompilePreviewRequestSchema>;
export type WorkflowCompilePreviewResponseDto = z.infer<typeof workflowCompilePreviewResponseSchema>;
export type WorkflowCompilePreviewErrorDto = z.infer<typeof workflowCompilePreviewErrorSchema>;
export type WorkflowReleasePreviewRequestDto = z.infer<typeof workflowReleasePreviewRequestSchema>;
export type WorkflowReleaseImpactAssistantDto = z.infer<typeof workflowReleaseImpactAssistantSchema>;
export type WorkflowReleasePreviewDto = z.infer<typeof workflowReleasePreviewSchema>;
export type WorkflowVersionCompareQueryDto = z.infer<typeof workflowVersionCompareQuerySchema>;
export type WorkflowVersionCompareDto = z.infer<typeof workflowVersionCompareSchema>;
export type WorkflowBundleV1Dto = z.infer<typeof workflowBundleSchema>;
