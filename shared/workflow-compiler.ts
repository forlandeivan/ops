import { z } from "zod";

import { documentSlotSpecSchema } from "./document-slots";
import { workflowValueType2Schema } from "./workflow-value-type2";

export const WORKFLOW_EDITOR_DOCUMENT_SCHEMA_VERSION = 2 as const;
export const WORKFLOW_JSON_SCHEMA_VERSION = 2 as const;
// L1.2b: IR V3 вводит структурные value-типы (WorkflowValueType2) в дескрипторы output-полей и
// каталога. Обратная совместимость: V3 — superset V2, старые IR читаются через read-union (см.
// workflowIrReadSchema/normalizeWorkflowIr ниже). JSON/editor версии не меняются — их форма
// (slot-конфиг) парсится тем же superset'ом аддитивно.
export const WORKFLOW_IR_SCHEMA_VERSION = 3 as const;
export const WORKFLOW_IR_SCHEMA_VERSION_LEGACY = 2 as const;

export const workflowNodeKinds = [
  "start",
  "external_message_trigger",
  "webhook_trigger",
  "finish",
  "ai",
  "agent",
  "tool",
  "http_request",
  "knowledge",
  "document_sources",
  "condition",
  "smalltalk_router",
  "router",
  "approval",
  "delay",
  "merge",
  "chat_message",
  "assistant_action",
  "bot_action",
  "transcript",
  "transcript_card",
  "form_card",
  "script_transform",
  "custom_code_node",
  "canvas_document",
  "document_card",
  "respond_webhook",
  "typed_template",
  "docx_render",
  "grounded_extract",
  "constrained_generate",
  "select_suggest",
  "finalization_gate",
  "checklist_verify",
  "reference_data",
  "data_transform",
] as const;
export const workflowEntryNodeKinds = ["start", "external_message_trigger", "webhook_trigger"] as const;
export const workflowWebhookTriggerAuthModes = ["none", "bearer_personal_token"] as const;

export const workflowRefTypes = ["model", "action", "operation", "package_skill", "knowledge_base", "approval_role"] as const;
export const workflowValidationSeverities = ["error", "warning"] as const;
export const workflowValidationIssueCodes = [
  "SCHEMA_VERSION_MISMATCH",
  "UNSUPPORTED_NODE_SEMANTICS",
  "DUPLICATE_NODE_ID",
  "DUPLICATE_EDGE_ID",
  "MISSING_ENTRY_NODE",
  "MULTIPLE_ENTRY_NODES",
  "MISSING_TERMINAL_NODE",
  "DANGLING_EDGE",
  "INVALID_PORT_CONNECTION",
  "INVALID_BRANCH_TOPOLOGY",
  "INVALID_MERGE_SEMANTICS",
  "INCOMPATIBLE_BINDING",
  "UNRESOLVED_REF",
  "UNREACHABLE_TERMINAL_PATH",
  "CYCLE_DETECTED",
  "MISSING_REQUIRED_CONFIG",
  "INVALID_NODE_CONFIG",
  "UNREACHABLE_NODE",
  "DEAD_END_PATH",
  "INVALID_EDGE_CARDINALITY",
  "INVALID_ROUTER_CONFIG",
  "INVALID_VALUE_REFERENCE",
  "TEMPLATE_TAG_UNDECLARED",
  "TEMPLATE_SLOT_UNBOUND",
  // Волна 1 хардненга F7: источник/вход узла document-assembly не задан явной плашкой — рантайм
  // молча падает на legacy sourceStepId/slotKey либо автоопределение единственного upstream.
  // Пока severity=warning (не блокирует публикацию); депрекация тихого резолва — след. волнами.
  "SOURCE_NOT_EXPLICIT",
] as const;

export const workflowValueTypes = ["string", "number", "boolean"] as const;
export const workflowRouterOperators = [
  "equals",
  "not_equals",
  "contains",
  "not_contains",
  "starts_with",
  "ends_with",
  "is_empty",
  "is_not_empty",
  "greater_than",
  "greater_than_or_equal",
  "less_than",
  "less_than_or_equal",
  "between",
  "is_true",
  "is_false",
] as const;

export const workflowValueReferenceModes = ["catalog", "expression"] as const;
export const workflowAssistantActionKinds = ["ANALYZING", "TRANSCRIBING", "TYPING"] as const;
export const workflowAiChatOutputModes = ["none", "after_completion", "stream"] as const;
export const workflowFinishChatResponseModes = ["auto", "always", "never"] as const;
export const workflowKnowledgeSources = ["assistant", "specific"] as const;
export const workflowKnowledgeRagResponseFormats = ["text", "markdown", "html"] as const;
export const workflowBotActionOperations = ["start", "update", "done", "error"] as const;
export const workflowTranscriptOperations = ["create", "update"] as const;
export const workflowChatMessageRoles = ["assistant", "system"] as const;
export const workflowTranscriptStatuses = ["processing", "postprocessing", "ready", "failed", "auto_action_failed"] as const;
export const workflowToolSources = ["action", "plugin_operation"] as const;
export const workflowHttpRequestMethods = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"] as const;
export const workflowHttpRequestAuthModes = ["none", "bearer", "basic", "header", "query"] as const;
export const workflowHttpRequestBodyModes = ["none", "json", "raw", "form_urlencoded"] as const;
export const workflowHttpRequestResponseFormats = ["auto", "json", "text"] as const;
export const workflowScriptRuntimeLanguages = ["javascript"] as const;
export const workflowCanvasDocumentOperations = ["create", "update"] as const;
export const workflowAgentRuntimeProviders = ["unica_agent"] as const;
export const workflowAgentWritePolicies = ["approval_required", "read_only"] as const;
export const workflowAgentCapabilityOptimizationProfiles = ["universal_agent_v1"] as const;
export const workflowAgentTraceLevels = ["basic", "verbose"] as const;
export const workflowSmalltalkPhraseSources = ["local", "global"] as const;
export const workflowModelSources = ["local", "agent_default", "fast_path_default"] as const;
export const workflowAssistantActionModeSchema = z.enum(["set", "clear"]);
export const workflowExpressionTokenTypeSchema = z.enum(["field", "function", "text", "llm"]);
export const workflowRefTypeSchema = z.enum(workflowRefTypes);
export const workflowValidationSeveritySchema = z.enum(workflowValidationSeverities);
export const workflowValidationIssueCodeSchema = z.enum(workflowValidationIssueCodes);
export const workflowNodeKindSchema = z.enum(workflowNodeKinds);
export const workflowValueTypeSchema = z.enum(workflowValueTypes);
export const workflowRouterOperatorSchema = z.enum(workflowRouterOperators);
export const workflowValueReferenceModeSchema = z.enum(workflowValueReferenceModes);
export const workflowAssistantActionKindSchema = z.enum(workflowAssistantActionKinds);
export const workflowAiChatOutputModeSchema = z.enum(workflowAiChatOutputModes);
export const workflowFinishChatResponseModeSchema = z.enum(workflowFinishChatResponseModes);
export const workflowKnowledgeSourceSchema = z.enum(workflowKnowledgeSources);
export const workflowKnowledgeRagResponseFormatSchema = z.enum(workflowKnowledgeRagResponseFormats);
export const workflowBotActionOperationSchema = z.enum(workflowBotActionOperations);
export const workflowTranscriptOperationSchema = z.enum(workflowTranscriptOperations);
export const workflowChatMessageRoleSchema = z.enum(workflowChatMessageRoles);
export const workflowTranscriptStatusSchema = z.enum(workflowTranscriptStatuses);
export const workflowToolSourceSchema = z.enum(workflowToolSources);
export const workflowHttpRequestMethodSchema = z.enum(workflowHttpRequestMethods);
export const workflowHttpRequestAuthModeSchema = z.enum(workflowHttpRequestAuthModes);
export const workflowHttpRequestBodyModeSchema = z.enum(workflowHttpRequestBodyModes);
export const workflowHttpRequestResponseFormatSchema = z.enum(workflowHttpRequestResponseFormats);
export const workflowScriptRuntimeLanguageSchema = z.enum(workflowScriptRuntimeLanguages);
export const workflowCanvasDocumentOperationSchema = z.enum(workflowCanvasDocumentOperations);
export const workflowAgentRuntimeProviderSchema = z.enum(workflowAgentRuntimeProviders);
export const workflowAgentWritePolicySchema = z.enum(workflowAgentWritePolicies);
export const workflowAgentCapabilityOptimizationProfileSchema = z.enum(workflowAgentCapabilityOptimizationProfiles);
export const workflowAgentTraceLevelSchema = z.enum(workflowAgentTraceLevels);
export const workflowSmalltalkPhraseSourceSchema = z.enum(workflowSmalltalkPhraseSources);
export const workflowModelSourceSchema = z.enum(workflowModelSources);
export const workflowWebhookTriggerAuthModeSchema = z.enum(workflowWebhookTriggerAuthModes);

type WorkflowExpressionToken = {
  type: "field" | "function" | "text" | "llm";
  value: string;
  args?: string[];
  llmConfig?: {
    prompt: WorkflowMappingExpression;
    temperature?: number;
  };
};

export type WorkflowMappingExpression = WorkflowExpressionToken[];

const workflowMappingExpressionSchema: z.ZodType<WorkflowMappingExpression> = z.lazy(() =>
  z.array(workflowExpressionTokenSchema),
);

const workflowLlmTokenConfigSchema: z.ZodType<WorkflowExpressionToken["llmConfig"]> = z.lazy(() =>
  z.object({
    prompt: workflowMappingExpressionSchema,
    temperature: z.number().min(0).max(1).optional(),
  }),
);

export const workflowExpressionTokenSchema: z.ZodType<WorkflowExpressionToken> = z.lazy(() =>
  z.object({
    type: workflowExpressionTokenTypeSchema,
    value: z.string(),
    args: z.array(z.string()).optional(),
    llmConfig: workflowLlmTokenConfigSchema.optional(),
  }),
);

export { workflowMappingExpressionSchema };

export type WorkflowConfigScalar = string | number | boolean | null;
export type WorkflowConfigValue = WorkflowConfigScalar | WorkflowConfigValue[] | { [key: string]: WorkflowConfigValue };

const workflowConfigScalarSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const workflowConfigValueSchema: z.ZodType<WorkflowConfigValue> = z.lazy(() =>
  z.union([
    workflowConfigScalarSchema,
    z.array(workflowConfigValueSchema),
    z.record(z.string(), workflowConfigValueSchema),
  ]),
);

export const workflowNodeConfigSchema = z.record(z.string(), workflowConfigValueSchema);

export const workflowValueReferenceSchema = z.object({
  mode: workflowValueReferenceModeSchema,
  path: z.string().min(1).nullable().optional(),
  label: z.string().min(1).nullable().optional(),
  expression: workflowMappingExpressionSchema.optional(),
});

export const workflowRouterLiteralValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

export const workflowRouterRouteSchema = z.object({
  routeId: z.string().min(1),
  label: z.string().trim().min(1).max(255),
  operator: workflowRouterOperatorSchema,
  value: workflowRouterLiteralValueSchema.optional(),
  secondaryValue: workflowRouterLiteralValueSchema.optional(),
});

export const workflowNodeOutputFieldSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  // L1.2b: структурный тип (WorkflowValueType2, superset) — output-поле может описывать
  // grounded-запись/record/список. Скалярные значения парсятся как прежде.
  valueType: workflowValueType2Schema,
});

export const workflowValueCatalogEntrySchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  path: z.string().min(1),
  // L1.2b: родительские записи каталога могут нести структурный тип; листовые (вложенные пути)
  // проецируются в скаляр (см. buildWorkflowValueCatalog / valueType2ToScalarLeaf).
  valueType: workflowValueType2Schema,
  groupKey: z.string().min(1),
  groupLabel: z.string().min(1),
  nodeId: z.string().min(1).nullable().optional(),
  nodeKind: workflowNodeKindSchema.nullable().optional(),
  outputFieldKey: z.string().min(1).nullable().optional(),
});

export const workflowViewportSchema = z.object({
  x: z.number(),
  y: z.number(),
  zoom: z.number().min(0.5).max(2),
});

export const workflowPanelLayoutSchema = z.object({
  paletteSize: z.number(),
  inspectorSize: z.number(),
  validationOpen: z.boolean(),
});

export const workflowEditorNodeSchema = z.object({
  id: z.string().min(1),
  kind: workflowNodeKindSchema,
  title: z.string().min(1),
  position: z.object({
    x: z.number(),
    y: z.number(),
  }),
  config: workflowNodeConfigSchema,
});

export const workflowEditorEdgeSchema = z.object({
  id: z.string().min(1),
  sourceId: z.string().min(1),
  sourcePortId: z.string().min(1),
  targetId: z.string().min(1),
  targetPortId: z.string().min(1),
});

export const workflowEditorSelectionSchema = z.object({
  nodeIds: z.array(z.string().min(1)),
  edgeIds: z.array(z.string().min(1)),
});

export const editorDocumentV2Schema = z.object({
  schemaVersion: z.literal(WORKFLOW_EDITOR_DOCUMENT_SCHEMA_VERSION),
  viewport: workflowViewportSchema,
  panelLayout: workflowPanelLayoutSchema,
  nodes: z.array(workflowEditorNodeSchema),
  edges: z.array(workflowEditorEdgeSchema),
  selection: workflowEditorSelectionSchema,
});

export const editorDocumentV1Schema = editorDocumentV2Schema;

export const workflowRefSchema = z.object({
  id: z.string().min(1),
  refType: workflowRefTypeSchema,
  target: z.string().min(1),
  sourceNodeId: z.string().min(1),
});

export const workflowJsonRefsSchema = z.object({
  models: z.array(workflowRefSchema),
  actions: z.array(workflowRefSchema),
  operations: z.array(workflowRefSchema).default([]),
  skills: z.array(workflowRefSchema).default([]),
  knowledgeBases: z.array(workflowRefSchema),
  approvalRoles: z.array(workflowRefSchema),
});

export const workflowStatusTemplateIdsSchema = z.array(z.string().min(1)).default([]);
const workflowJsonObjectSchema = z.record(z.string(), z.unknown());

const workflowJsonNodeBaseSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
});

export const workflowStartNodeSchema = workflowJsonNodeBaseSchema.extend({
  kind: z.literal("start"),
});

export const workflowExternalMessageTriggerNodeSchema = workflowJsonNodeBaseSchema.extend({
  kind: z.literal("external_message_trigger"),
});

export const workflowWebhookTriggerNodeSchema = workflowJsonNodeBaseSchema.extend({
  kind: z.literal("webhook_trigger"),
  authMode: workflowWebhookTriggerAuthModeSchema.default("bearer_personal_token"),
});

export const workflowFinishNodeSchema = workflowJsonNodeBaseSchema.extend({
  kind: z.literal("finish"),
  outcome: z.string().min(1),
  chatResponseMode: workflowFinishChatResponseModeSchema,
});

export const workflowAiNodeSchema = workflowJsonNodeBaseSchema.extend({
  kind: z.literal("ai"),
  bindings: z.object({
    prompt: workflowMappingExpressionSchema,
  }),
  modelSource: workflowModelSourceSchema.default("local"),
  modelRefId: z.string().min(1).nullable(),
  skillRefId: z.string().min(1).nullable().optional(),
  chatOutputMode: workflowAiChatOutputModeSchema,
  statusTemplateIds: workflowStatusTemplateIdsSchema,
  resultSchema: workflowJsonObjectSchema.nullable().optional(),
});

export const workflowAgentNodeSchema = workflowJsonNodeBaseSchema.extend({
  kind: z.literal("agent"),
  bindings: z.object({
    goal: workflowMappingExpressionSchema,
  }),
  modelSource: workflowModelSourceSchema.default("local"),
  modelRefId: z.string().min(1).nullable(),
  runtimeProvider: workflowAgentRuntimeProviderSchema,
  allowedActionRefIds: z.array(z.string().min(1)).default([]),
  allowedOperationRefIds: z.array(z.string().min(1)).default([]),
  allowedSystemOperationKeys: z.array(z.string().min(1)).default([]),
  allowedSkillRefIds: z.array(z.string().min(1)).default([]),
  allowedConnectionIds: z.array(z.string().min(1)).default([]),
  maxSteps: z.number().int().min(1).max(100).nullable(),
  maxToolCalls: z.number().int().min(1).max(100).nullable(),
  timeoutSec: z.number().int().min(1).max(3600).nullable(),
  maxCostUsd: z.number().min(0).max(1000).nullable().optional(),
  writePolicy: workflowAgentWritePolicySchema.default("approval_required"),
  capabilityOptimizationProfile: workflowAgentCapabilityOptimizationProfileSchema.nullable().optional(),
  traceLevel: workflowAgentTraceLevelSchema.default("basic"),
  finishSchema: workflowJsonObjectSchema.nullable().optional(),
});

export const workflowToolNodeSchema = workflowJsonNodeBaseSchema.extend({
  kind: z.literal("tool"),
  toolSource: workflowToolSourceSchema.default("action"),
  timeoutSec: z.number().int().min(1).nullable(),
  actionRefId: z.string().min(1).nullable(),
  operationRefId: z.string().min(1).nullable().optional(),
  connectionId: z.string().min(1).nullable().optional(),
  operationInputTemplate: z.string().max(20000).nullable().optional(),
  statusTemplateIds: workflowStatusTemplateIdsSchema,
});

export const workflowHttpRequestNodeSchema = workflowJsonNodeBaseSchema.extend({
  kind: z.literal("http_request"),
  method: workflowHttpRequestMethodSchema.default("GET"),
  bindings: z.object({
    url: workflowMappingExpressionSchema,
  }),
  queryJson: z.string().max(20000).nullable().optional(),
  headersJson: z.string().max(20000).nullable().optional(),
  authMode: workflowHttpRequestAuthModeSchema.default("none"),
  authBearerToken: z.string().max(20000).nullable().optional(),
  authUsername: z.string().max(20000).nullable().optional(),
  authPassword: z.string().max(20000).nullable().optional(),
  authHeaderName: z.string().max(255).nullable().optional(),
  authHeaderValue: z.string().max(20000).nullable().optional(),
  authQueryParam: z.string().max(255).nullable().optional(),
  authQueryValue: z.string().max(20000).nullable().optional(),
  bodyMode: workflowHttpRequestBodyModeSchema.default("none"),
  bodyJson: z.string().max(100000).nullable().optional(),
  rawBody: z.string().max(100000).nullable().optional(),
  rawContentType: z.string().max(255).nullable().optional(),
  timeoutSec: z.number().int().min(1).max(300).default(30),
  responseFormat: workflowHttpRequestResponseFormatSchema.default("auto"),
  continueOnFail: z.boolean().default(false),
});

export const workflowKnowledgeRagConfigSchema = z.object({
  topK: z.number().int().min(1).max(20).nullable().optional(),
  minScore: z.number().min(0).max(1).nullable().optional(),
  maxContextTokens: z.number().int().min(500).max(20000).nullable().optional(),
  historyMessagesLimit: z.number().int().min(0).max(20).nullable().optional(),
  historyCharsLimit: z.number().int().min(0).max(50000).nullable().optional(),
  enableQueryRewriting: z.boolean().nullable().optional(),
  queryRewriteModel: z.string().min(1).max(200).nullable().optional(),
  bm25Weight: z.number().min(0).max(1).nullable().optional(),
  bm25Limit: z.number().int().min(1).max(20).nullable().optional(),
  vectorWeight: z.number().min(0).max(1).nullable().optional(),
  vectorLimit: z.number().int().min(1).max(20).nullable().optional(),
  llmModelSource: workflowModelSourceSchema.nullable().optional(),
  llmProviderId: z.string().min(1).max(200).nullable().optional(),
  llmModel: z.string().min(1).max(200).nullable().optional(),
  llmTemperature: z.number().min(0).max(2).nullable().optional(),
  llmMaxCompletionTokens: z.number().int().min(16).nullable().optional(),
  llmResponseFormat: workflowKnowledgeRagResponseFormatSchema.nullable().optional(),
  systemPrompt: z.string().max(20000).nullable().optional(),
});

export const workflowKnowledgeNodeSchema = workflowJsonNodeBaseSchema.extend({
  kind: z.literal("knowledge"),
  bindings: z.object({
    query: workflowMappingExpressionSchema,
  }),
  source: workflowKnowledgeSourceSchema.default("specific"),
  knowledgeBaseRefId: z.string().min(1).nullable(),
  ragConfig: workflowKnowledgeRagConfigSchema.nullable().optional(),
  chatOutputMode: workflowAiChatOutputModeSchema,
  statusTemplateIds: workflowStatusTemplateIdsSchema,
});

export const workflowDocumentSourceMatchStrategies = ["by_order"] as const;
export const workflowDocumentSourceMatchStrategySchema = z.enum(workflowDocumentSourceMatchStrategies);

// Правило детерминированного сопоставления файла слоту по ИМЕНИ файла (регистр игнорируется).
// Несколько правил в одном слоте объединяются по И (должны выполниться все).
export const workflowDocumentFilenameRuleOperators = [
  "contains",
  "not_contains",
  "equals",
  "starts_with",
  "ends_with",
] as const;
export const workflowDocumentFilenameRuleOperatorSchema = z.enum(workflowDocumentFilenameRuleOperators);

export const workflowDocumentFilenameRuleSchema = z.object({
  operator: workflowDocumentFilenameRuleOperatorSchema,
  value: z.string().trim().min(1).max(240),
});

// Объявление одного типизированного входного слота документа (напр. «обвинительное заключение», «протокол»).
// role — свободная пользовательская метка без семантики в движке (домен-агностичность).
// filenameRules — детерминированный матчинг по имени файла; при наличии правил слот НЕ откатывается
// на позиционный порядок (не нашёл подходящий файл → остаётся пустым с предупреждением).
export const workflowDocumentSlotDeclSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(/^[a-zA-Z0-9_]+$/, "Ключ слота: латиница, цифры и подчёркивание"),
  label: z.string().trim().min(1).max(240),
  required: z.boolean().default(true),
  acceptedMime: z.array(z.string().trim().min(1).max(255)).default([]),
  // preprocess отбрасывает правила с пустым значением (транзиентные из редактора) ДО валидации
  // элементов — забытое пустое правило не роняет safeParse всего слота (иначе слот молча выпал бы).
  filenameRules: z
    .preprocess(
      (raw) =>
        Array.isArray(raw)
          ? raw.filter(
              (rule) =>
                rule != null &&
                typeof rule === "object" &&
                typeof (rule as { value?: unknown }).value === "string" &&
                (rule as { value: string }).value.trim().length > 0,
            )
          : [],
      z.array(workflowDocumentFilenameRuleSchema).max(20),
    )
    .default([]),
  role: z.string().trim().max(120).nullable().optional(),
});

export type WorkflowDocumentFilenameRuleOperator = (typeof workflowDocumentFilenameRuleOperators)[number];
export type WorkflowDocumentFilenameRule = z.infer<typeof workflowDocumentFilenameRuleSchema>;

export const workflowDocumentSourcesNodeSchema = workflowJsonNodeBaseSchema.extend({
  kind: z.literal("document_sources"),
  slots: z.array(workflowDocumentSlotDeclSchema).min(1).max(10),
  matchStrategy: workflowDocumentSourceMatchStrategySchema.default("by_order"),
});

// Один автодетектнутый тег шаблона (кэш инспекции DocxTemplateInspection.tags в конфиге узла).
export const workflowTypedTemplateDetectedTagSchema = z.object({
  path: z.string().trim().min(1).max(240),
  scope: z.string().trim().max(240).nullable().default(null),
  kind: z.enum(["field", "loop_start", "loop_end"]),
});

// typed_template — first-class типизированный шаблон документа: автор загружает docx, движок
// автодетектит теги, автор объявляет на каждый слот тип и резолвер. Рантайм выдаёт
// resolvedFields / unresolvedSlots / manifest. Рендер — отдельный узел (docx_render).
export const workflowTypedTemplateNodeSchema = workflowJsonNodeBaseSchema.extend({
  kind: z.literal("typed_template"),
  templateStorageKey: z.string().trim().max(400).nullable().default(null),
  templateName: z.string().trim().max(240).nullable().default(null),
  detectedTags: z.array(workflowTypedTemplateDetectedTagSchema).max(500).default([]),
  slots: z.array(documentSlotSpecSchema).max(200).default([]),
});

// grounded_extract — извлекает поля из текста слота upstream document_sources с поцитатной привязкой.
export const workflowGroundedExtractGroundingModes = ["substring", "tokens"] as const;

// Детерминированная правка вырезанного span-фрагмента (нормализация): find→replace, literal или regex.
export const workflowGroundedExtractSpanRuleSchema = z.object({
  find: z.string().min(1).max(500),
  replace: z.string().max(500).default(""),
  isRegex: z.boolean().default(false),
});

export const workflowGroundedExtractFieldModes = ["value", "span"] as const;

export const workflowGroundedExtractFieldSchema = z.object({
  id: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(/^[a-zA-Z0-9_]+$/, "Ключ поля: латиница, цифры и подчёркивание"),
  name: z.string().trim().max(240).default(""),
  description: z.string().trim().max(1000).default(""),
  required: z.boolean().default(false),
  derived: z.boolean().default(false),
  // "value" — модель отдаёт значение+цитату (обычное извлечение). "span" — модель отдаёт ТОЛЬКО якоря
  // начала/конца, а фрагмент между ними ДОСЛОВНО вырезает платформа (перенос без галлюцинаций);
  // spanRules — детерминированная нормализация вырезанного (даты, канцелярские формулы).
  mode: z.enum(workflowGroundedExtractFieldModes).default("value"),
  spanRules: z.array(workflowGroundedExtractSpanRuleSchema).max(50).default([]),
});

export const workflowGroundedExtractNodeSchema = workflowJsonNodeBaseSchema.extend({
  kind: z.literal("grounded_extract"),
  // Единственный источник текста — variable-ссылка (плашка `{{steps.<узел>.slots.<ключ>.text}}`).
  // Пусто → ошибка конфигурации (fail-closed). Legacy sourceStepId/slotKey и автоопределение удалены:
  // источник задаётся ТОЛЬКО явно, движок ничего не резолвит «под капотом».
  sourceText: z.string().trim().max(20000).nullable().default(null),
  fields: z.array(workflowGroundedExtractFieldSchema).max(60).default([]),
  // Глобального «Требовать цитату» здесь НЕТ (в отличие от constrained_generate/select_suggest):
  // цитата обязательна ВСЕГДА, кроме пер-полевого флага «Выводимое» (derived). Пер-поле —
  // единственный источник правды (тот же принцип, что и убранный узловой «Режим»).
  grounding: z.enum(workflowGroundedExtractGroundingModes).default("substring"),
  minCoverage: z.number().min(0).max(1).default(0.6),
  instruction: z.string().trim().max(4000).default(""),
  // Лимит символов документа, отдаваемых модели. 0 (дефолт) — БЕЗ усечения: резать по символам вслепую
  // нельзя — это не знает ни токенизатора, ни контекстного окна модели и молча выбрасывает ХВОСТ документа
  // (резолютивная часть, выводы). Границу контекста задаёт сама модель: не поместилось — провайдер вернёт
  // внятную ошибку. Ненулевое значение — осознанный лимит для узких локальных окон.
  maxDocChars: z.number().int().min(0).max(200000).default(0),
});

// constrained_generate — порождает поля из текста слота upstream document_sources под ограничениями
// (длина/стиль/запреты) с посегментным грундингом. Выход — records[] той же формы, что у grounded_extract
// (совместимо с резолвером слота typed_template). Верификацию держит скилл constrained_text.
export const workflowConstrainedGenerateFieldSchema = z.object({
  id: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(/^[a-zA-Z0-9_]+$/, "Ключ поля: латиница, цифры и подчёркивание"),
  name: z.string().trim().max(240).default(""),
  description: z.string().trim().max(1000).default(""),
  instruction: z.string().trim().max(2000).default(""),
  maxWords: z.number().int().min(0).max(20000).nullable().default(null),
  minWords: z.number().int().min(0).max(20000).nullable().default(null),
  required: z.boolean().default(false),
});

export const workflowConstrainedGenerateNodeSchema = workflowJsonNodeBaseSchema.extend({
  kind: z.literal("constrained_generate"),
  // Единственный источник текста — variable-ссылка (плашка). Пусто → ошибка конфигурации
  // (fail-closed). Legacy sourceStepId/slotKey и автоопределение удалены.
  sourceText: z.string().trim().max(20000).nullable().default(null),
  // Узловой «общей» инструкции здесь НЕТ: правила задаются пер-полем (field.instruction) —
  // единственный источник правды (тот же принцип, что у убранных узловых «Режим»/«Требовать цитату»).
  fields: z.array(workflowConstrainedGenerateFieldSchema).max(60).default([]),
  forbid: z.array(z.string().trim().max(120)).max(200).default([]),
  noEmoji: z.boolean().default(false),
  requireQuote: z.boolean().default(true),
  grounding: z.enum(workflowGroundedExtractGroundingModes).default("substring"),
  minCoverage: z.number().min(0).max(1).default(0.6),
  // Лимит символов документа, отдаваемых модели. 0 (дефолт) — БЕЗ усечения: резать по символам вслепую
  // нельзя — это не знает ни токенизатора, ни контекстного окна модели и молча выбрасывает ХВОСТ документа
  // (резолютивная часть, выводы). Границу контекста задаёт сама модель: не поместилось — провайдер вернёт
  // внятную ошибку. Ненулевое значение — осознанный лимит для узких локальных окон.
  maxDocChars: z.number().int().min(0).max(200000).default(0),
});

// select_suggest — LLM предлагает вариант значения поля из ДЕТЕРМИНИРОВАННОГО набора опций
// с обоснованием и дословной цитатой из документа-источника; человек подтверждает через form_card.
// Опции резолвятся платформой (static / from_data / by_rule) ДО вызова модели — модель только выбирает.
// Выход — records[] той же формы, что grounded_extract (совместимо с select-резолвером typed_template),
// плюс готовые formSchema/initialPayload для биндингов узла form_card.
export const workflowSelectOptionSchema = z.object({
  id: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(240),
  value: z.string().trim().max(4000).default(""),
});

export const workflowSelectOptionsModes = ["static", "from_data", "by_rule"] as const;

// Условие правила by_rule — зеркало route роутера: dot-путь по контексту + оператор + литерал.
// Домен-логика («судимость → набор наказаний») целиком в данных правила, не в коде.
export const workflowSelectOptionRuleWhenSchema = z.object({
  path: z.string().trim().min(1).max(1000),
  valueType: workflowValueTypeSchema.default("string"),
  operator: workflowRouterOperatorSchema,
  value: workflowRouterLiteralValueSchema.optional(),
  secondaryValue: workflowRouterLiteralValueSchema.optional(),
});

export const workflowSelectOptionRuleSchema = z.object({
  when: workflowSelectOptionRuleWhenSchema,
  options: z.array(workflowSelectOptionSchema).max(50).default([]),
});

export const workflowSelectOptionsDeclSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("static"),
    options: z.array(workflowSelectOptionSchema).max(50).default([]),
  }),
  z.object({
    mode: z.literal("from_data"),
    path: z.string().trim().min(1).max(1000),
    idKey: z.string().trim().max(120).default("id"),
    labelKey: z.string().trim().max(120).default("label"),
    valueKey: z.string().trim().max(120).default("value"),
    maxOptions: z.number().int().min(1).max(50).default(50),
  }),
  z.object({
    mode: z.literal("by_rule"),
    rules: z.array(workflowSelectOptionRuleSchema).max(50).default([]),
    fallback: z.array(workflowSelectOptionSchema).max(50).default([]),
  }),
]);

export const workflowSelectSuggestFieldSchema = z.object({
  id: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(/^[a-zA-Z0-9_]+$/, "Ключ поля: латиница, цифры и подчёркивание"),
  name: z.string().trim().max(240).default(""),
  description: z.string().trim().max(1000).default(""),
  instruction: z.string().trim().max(2000).default(""),
  required: z.boolean().default(false),
  // Анти-anchoring: высокорисковое поле всегда уходит на ручную проверку и не предвыбирается.
  alwaysReview: z.boolean().default(false),
  options: workflowSelectOptionsDeclSchema.default({ mode: "static", options: [] }),
});

export const workflowSelectSuggestNodeSchema = workflowJsonNodeBaseSchema.extend({
  kind: z.literal("select_suggest"),
  // Единственный источник текста — variable-ссылка (плашка). Пусто → ошибка конфигурации
  // (fail-closed). Legacy sourceStepId/slotKey и автоопределение удалены.
  sourceText: z.string().trim().max(20000).nullable().default(null),
  // Узловой «общей» инструкции здесь НЕТ: правила выбора задаются пер-полем (field.instruction) —
  // единственный источник правды. Доменные правила набора опций — в options (static/from_data/by_rule).
  fields: z.array(workflowSelectSuggestFieldSchema).max(60).default([]),
  requireQuote: z.boolean().default(true),
  grounding: z.enum(workflowGroundedExtractGroundingModes).default("substring"),
  minCoverage: z.number().min(0).max(1).default(0.6),
  // Лимит символов документа, отдаваемых модели. 0 (дефолт) — БЕЗ усечения: резать по символам вслепую
  // нельзя — это не знает ни токенизатора, ни контекстного окна модели и молча выбрасывает ХВОСТ документа
  // (резолютивная часть, выводы). Границу контекста задаёт сама модель: не поместилось — провайдер вернёт
  // внятную ошибку. Ненулевое значение — осознанный лимит для узких локальных окон.
  maxDocChars: z.number().int().min(0).max(200000).default(0),
});

// docx_render — рендерит .docx из resolvedFields upstream-узла typed_template.
// sourceStepId — id узла typed_template (пусто → автоопределение). Рендер — отдельный шаг
// (single responsibility): typed_template резолвит, docx_render заполняет и отдаёт файл.
// reviewStepId (L3.2) — id form_card-узла ReviewQueue: его reviewedFields (правки человека)
// накладываются поверх resolvedFields перед рендером (пусто → автоопределение).
export const workflowDocxRenderNodeSchema = workflowJsonNodeBaseSchema.extend({
  kind: z.literal("docx_render"),
  sourceStepId: z.string().trim().max(200).nullable().default(null),
  reviewStepId: z.string().trim().max(200).nullable().default(null),
  fileName: z.string().trim().max(240).nullable().default(null),
});

// finalization_gate — вердикт качества драфта: читает выход upstream typed_template
// (provenance/unresolvedSlots/manifest) и детерминированно выдаёт status success/partial/failed
// + список полей на ручную проверку. Чистый вердикт-узел: ветвление — downstream router/condition
// по steps.<gate>.status; ручная проверка — узлом approval. partial — семантика выхода, не статуса прогона.
export const workflowFinalizationGateUnresolvedPolicies = ["failed", "partial"] as const;
export const workflowFinalizationGateFlaggedPolicies = ["partial", "success"] as const;

export const workflowFinalizationGateNodeSchema = workflowJsonNodeBaseSchema.extend({
  kind: z.literal("finalization_gate"),
  sourceStepId: z.string().trim().max(200).nullable().default(null),
  treatUnresolvedAs: z.enum(workflowFinalizationGateUnresolvedPolicies).default("failed"),
  treatFlaggedAs: z.enum(workflowFinalizationGateFlaggedPolicies).default("partial"),
});

// checklist_verify — прогоняет структурированный вход по чек-листу, где сами проверки заданы
// КОНФИГУРАЦИЕЙ (данные пресета), а не кодом: доменные кейсы собираются без доменных правок платформы.
// 4 вида проверок: rule (детерминированное сравнение значений контекста), cross (сверка двух наборов),
// llm_judge (вердикт LLM по узкому контексту «норма+фрагмент» через Python-рантайм, батчами),
// reco (статическая рекомендация-триггер без LLM). Полнота «одна строка на пункт» — по построению
// (цикл по пунктам — код узла), а не просьба к модели. Выход duck-совместим с finalization_gate
// (manifest/provenance/unresolvedSlots) и пригоден docx_render (resolvedFields.rows → loop-теги).
export const workflowChecklistCheckKinds = ["rule", "cross", "llm_judge", "reco"] as const;

// Статусы строки отчёта. degraded ставит только платформа (недоступность модели/рантайма),
// в конфиге и в ответе модели он не участвует.
export const workflowChecklistRowStatuses = [
  "compliant",
  "violation",
  "needs_review",
  "not_applicable",
  "degraded",
] as const;
export const workflowChecklistAssignableStatuses = [
  "compliant",
  "violation",
  "needs_review",
  "not_applicable",
] as const;

// Условие проверки — тот же контракт, что route роутера и when-тройка by_rule селекта:
// dot-путь по контексту прогона (плашка {{steps.<узел>.<поле>}} допустима) + оператор + литерал.
export const workflowChecklistConditionSchema = workflowSelectOptionRuleWhenSchema;

// rule: все условия истинны → onMatch, иначе → onMiss; путь не резолвится (undefined) → onMissing.
// Дефолт onMissing=needs_review: «данных нет» ≠ «нарушение» — страховка от опечаток путей пресета.
export const workflowChecklistRuleSpecSchema = z.object({
  conditions: z.array(workflowChecklistConditionSchema).min(1).max(20),
  onMatch: z.enum(workflowChecklistAssignableStatuses).default("compliant"),
  onMiss: z.enum(workflowChecklistAssignableStatuses).default("violation"),
  onMissing: z.enum(workflowChecklistAssignableStatuses).default("needs_review"),
});

// cross: детерминированная сверка двух наборов (плашки/пути на массивы строк или объектов).
// Расхождение (only_left/only_right/diff по ключу) → onMismatch; неразрешимый путь → onMissing.
export const workflowChecklistCrossSpecSchema = z.object({
  leftPath: z.string().trim().min(1).max(1000),
  rightPath: z.string().trim().min(1).max(1000),
  leftLabel: z.string().trim().max(240).default(""),
  rightLabel: z.string().trim().max(240).default(""),
  // Ключ элемента-объекта для сравнения; пусто → элемент сериализуется целиком (строки — как есть).
  itemKey: z.string().trim().max(120).default(""),
  normalize: z.enum(["exact", "trim_lower"]).default("trim_lower"),
  onMismatch: z.enum(workflowChecklistAssignableStatuses).default("violation"),
  onMissing: z.enum(workflowChecklistAssignableStatuses).default("needs_review"),
});

// llm_judge: узкий контекст пункта = sourceText (фрагмент документа, плашка/путь) + normText
// (текст нормы: литерал пресета или плашка на выход knowledge-узла). Вердикт строго из
// allowedVerdicts; requireQuote → решающий вердикт (violation/compliant) без дословной цитаты
// невозможен (грундинг find_quote на Python-стороне, провал → needs_review).
export const workflowChecklistJudgeSpecSchema = z.object({
  instruction: z.string().trim().max(4000).default(""),
  sourceText: z.string().trim().max(20000).default(""),
  normText: z.string().trim().max(20000).default(""),
  allowedVerdicts: z
    .array(z.enum(workflowChecklistAssignableStatuses))
    .max(4)
    .default(["compliant", "violation", "needs_review"]),
  requireQuote: z.boolean().default(true),
});

// reco: статическая рекомендация-триггер. Условия истинны (или их нет) → onTrigger с текстом
// рекомендации в essence; условия не выполнены → onIdle (по умолчанию «не применимо»).
export const workflowChecklistRecoSpecSchema = z.object({
  text: z.string().trim().min(1).max(4000),
  conditions: z.array(workflowChecklistConditionSchema).max(20).default([]),
  onTrigger: z.enum(workflowChecklistAssignableStatuses).default("needs_review"),
  onIdle: z.enum(workflowChecklistAssignableStatuses).default("not_applicable"),
});

export const workflowChecklistCheckSchema = z.object({
  // Идентификатор пункта («I.1»): латиница/цифры/точка/дефис/подчёркивание — попадает в строку отчёта.
  id: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(/^[a-zA-Z0-9_.-]+$/, "Идентификатор пункта: латиница, цифры, точка, дефис, подчёркивание"),
  section: z.string().trim().max(120).default(""),
  title: z.string().trim().max(500).default(""),
  kind: z.enum(workflowChecklistCheckKinds),
  // Ссылка на норму/документ-основание (литерал пресета) — колонка «Источник» строки отчёта.
  sourceRef: z.string().trim().max(500).default(""),
  // Шаблоны отображения: {{path}} заменяется значением из контекста прогона. fragment — «где в
  // документе», essence — «суть» для детерминированных исходов (у llm_judge суть даёт модель).
  fragment: z.string().trim().max(4000).default(""),
  essence: z.string().trim().max(4000).default(""),
  rule: workflowChecklistRuleSpecSchema.nullable().default(null),
  cross: workflowChecklistCrossSpecSchema.nullable().default(null),
  judge: workflowChecklistJudgeSpecSchema.nullable().default(null),
  reco: workflowChecklistRecoSpecSchema.nullable().default(null),
});

export const workflowChecklistVerifyNodeSchema = workflowJsonNodeBaseSchema.extend({
  kind: z.literal("checklist_verify"),
  checks: z.array(workflowChecklistCheckSchema).max(200).default([]),
  // Общий контекст LLM-судьи (роль/домен) — попадает в каждый батч llm_judge-пунктов.
  instruction: z.string().trim().max(4000).default(""),
  // Фолбэк-источник текста для llm_judge-пунктов без своего sourceText (та же плашка-ссылка,
  // что у grounded_extract/select_suggest).
  sourceText: z.string().trim().max(20000).nullable().default(null),
  // Батчинг llm_judge-пунктов на Python-стороне: 8–15 пунктов на один LLM-вызов — рамка для
  // слабой модели вместо мега-промпта на весь чек-лист.
  batchSize: z.number().int().min(1).max(50).default(10),
  grounding: z.enum(workflowGroundedExtractGroundingModes).default("substring"),
  minCoverage: z.number().min(0).max(1).default(0.6),
  // Лимит символов документа, отдаваемых модели. 0 (дефолт) — БЕЗ усечения: резать по символам вслепую
  // нельзя — это не знает ни токенизатора, ни контекстного окна модели и молча выбрасывает ХВОСТ документа
  // (резолютивная часть, выводы). Границу контекста задаёт сама модель: не поместилось — провайдер вернёт
  // внятную ошибку. Ненулевое значение — осознанный лимит для узких локальных окон.
  maxDocChars: z.number().int().min(0).max(200000).default(0),
});

export const workflowConditionNodeSchema = workflowJsonNodeBaseSchema.extend({
  kind: z.literal("condition"),
  bindings: z.object({
    predicate: workflowMappingExpressionSchema,
  }),
});

export const workflowSmalltalkRouterNodeSchema = workflowJsonNodeBaseSchema.extend({
  kind: z.literal("smalltalk_router"),
  phraseSource: workflowSmalltalkPhraseSourceSchema.default("local"),
  phrases: z.array(z.string().trim().min(1)).default([]),
});

export const workflowRouterNodeSchema = workflowJsonNodeBaseSchema.extend({
  kind: z.literal("router"),
  checkedValueType: workflowValueTypeSchema,
  checkedValuePath: z.string().min(1).nullable(),
  checkedValueLabel: z.string().min(1).nullable(),
  bindings: z.object({
    checkedValue: workflowMappingExpressionSchema,
  }),
  routes: z.array(workflowRouterRouteSchema).min(1),
  defaultPortId: z.literal("default"),
});

export const workflowApprovalNodeSchema = workflowJsonNodeBaseSchema.extend({
  kind: z.literal("approval"),
  timeoutSec: z.number().int().min(1).nullable(),
  approvalRoleRefId: z.string().min(1).nullable(),
});

export const workflowDelayNodeSchema = workflowJsonNodeBaseSchema.extend({
  kind: z.literal("delay"),
  durationMinutes: z.number().int().min(1),
});

export const workflowMergeNodeSchema = workflowJsonNodeBaseSchema.extend({
  kind: z.literal("merge"),
  strategy: z.enum(["all_required", "first_completed"]),
});

export const workflowChatMessageNodeSchema = workflowJsonNodeBaseSchema.extend({
  kind: z.literal("chat_message"),
  role: workflowChatMessageRoleSchema,
  bindings: z.object({
    text: workflowMappingExpressionSchema,
  }),
});

export const workflowAssistantActionNodeSchema = workflowJsonNodeBaseSchema.extend({
  kind: z.literal("assistant_action"),
  mode: z.enum(["set", "clear"]),
  actionType: workflowAssistantActionKindSchema.nullable(),
  bindings: z.object({
    text: workflowMappingExpressionSchema,
  }),
});

export const workflowBotActionNodeSchema = workflowJsonNodeBaseSchema.extend({
  kind: z.literal("bot_action"),
  operation: workflowBotActionOperationSchema,
  actionType: z.string().min(1),
  bindings: z.object({
    actionId: workflowMappingExpressionSchema,
    displayText: workflowMappingExpressionSchema,
  }),
});

export const workflowTranscriptNodeSchema = workflowJsonNodeBaseSchema.extend({
  kind: z.literal("transcript"),
  operation: workflowTranscriptOperationSchema,
  status: workflowTranscriptStatusSchema,
  statusTemplateIds: workflowStatusTemplateIdsSchema,
  bindings: z.object({
    transcriptId: workflowMappingExpressionSchema,
    title: workflowMappingExpressionSchema,
    fullText: workflowMappingExpressionSchema,
    previewText: workflowMappingExpressionSchema,
  }),
});

export const workflowTranscriptCardNodeSchema = workflowJsonNodeBaseSchema.extend({
  kind: z.literal("transcript_card"),
  bindings: z.object({
    transcriptId: workflowMappingExpressionSchema,
    title: workflowMappingExpressionSchema,
    previewText: workflowMappingExpressionSchema,
  }),
});

export const workflowFormCardNodeSchema = workflowJsonNodeBaseSchema.extend({
  kind: z.literal("form_card"),
  formSchema: workflowJsonObjectSchema.nullable().optional(),
  bindings: z.object({
    title: workflowMappingExpressionSchema,
    description: workflowMappingExpressionSchema,
    formSchema: workflowMappingExpressionSchema,
    initialPayload: workflowMappingExpressionSchema,
  }),
});

export const workflowScriptTransformNodeSchema = workflowJsonNodeBaseSchema.extend({
  kind: z.literal("script_transform"),
  language: workflowScriptRuntimeLanguageSchema.default("javascript"),
  sourceCode: z.string().min(1),
  inputTemplate: z.string().max(50000).nullable().optional(),
  outputSchema: workflowJsonObjectSchema.nullable().optional(),
});

export const workflowCustomCodeNodeSchema = workflowJsonNodeBaseSchema.extend({
  kind: z.literal("custom_code_node"),
  customNodeDefinitionId: z.string().min(1),
  customNodeVersionId: z.string().min(1),
  customNodeName: z.string().min(1).max(255),
  customNodeLibraryName: z.string().min(1).max(255).nullable().optional(),
  inputTemplate: z.string().max(50000).nullable().optional(),
  inputSchema: workflowJsonObjectSchema.nullable().optional(),
  outputSchema: workflowJsonObjectSchema.nullable().optional(),
});

export const workflowCanvasDocumentNodeSchema = workflowJsonNodeBaseSchema.extend({
  kind: z.literal("canvas_document"),
  operation: workflowCanvasDocumentOperationSchema,
  bindings: z.object({
    documentId: workflowMappingExpressionSchema,
    transcriptId: workflowMappingExpressionSchema,
    title: workflowMappingExpressionSchema,
    content: workflowMappingExpressionSchema,
  }),
});

export const workflowDocumentCardNodeSchema = workflowJsonNodeBaseSchema.extend({
  kind: z.literal("document_card"),
  bindings: z.object({
    documentId: workflowMappingExpressionSchema,
    title: workflowMappingExpressionSchema,
    previewText: workflowMappingExpressionSchema,
  }),
});

export const workflowRespondWebhookNodeSchema = workflowJsonNodeBaseSchema.extend({
  kind: z.literal("respond_webhook"),
  bindings: z.object({
    statusCode: workflowMappingExpressionSchema,
  }),
  headersJson: z.string().max(20000).nullable().optional(),
  bodyMode: workflowHttpRequestBodyModeSchema.default("none"),
  bodyJson: z.string().max(100000).nullable().optional(),
  rawBody: z.string().max(100000).nullable().optional(),
});

/**
 * Узел-источник «Справочник» (reference sets, docs/reference-sets-design.md §6.1):
 * при исполнении читает утверждённую версию инстанс-справочника через gateway
 * (`reference.getActive`/`getVersion`) и отдаёт payload+meta в steps.<id>.*.
 * pinVersionNo — закрепление версии для golden-прогонов; null = активная.
 */
export const workflowReferenceDataNodeSchema = workflowJsonNodeBaseSchema.extend({
  kind: z.literal("reference_data"),
  setKey: z.string().trim().min(1).max(200),
  pinVersionNo: z.number().int().min(1).nullable().optional(),
});

// data_transform — детерминированное преобразование скалярного значения БЕЗ LLM и Python:
// вход — variable-плашка на скаляр любого узла (steps.<узел>.fields.<поле>.value), вид
// преобразования — enum (первый: initials «ФИО → Фамилия И.О.»; задел под падежи/регистр/даты).
// Выход: value/sourceValue/transform/changed — слоты и инструкции ссылаются {{steps.<узел>.value}}.
export const workflowDataTransformKinds = ["initials"] as const;
export type WorkflowDataTransformKind = (typeof workflowDataTransformKinds)[number];

export const workflowDataTransformNodeSchema = workflowJsonNodeBaseSchema.extend({
  kind: z.literal("data_transform"),
  // Единственный источник значения — явная variable-плашка (fail-closed, F7): пусто → ошибка
  // конфигурации SOURCE_NOT_EXPLICIT, автоопределения upstream нет.
  sourceValue: z.string().trim().max(20000).nullable().default(null),
  transform: z.enum(workflowDataTransformKinds).default("initials"),
});

export const workflowJsonNodeSchema = z.discriminatedUnion("kind", [
  workflowStartNodeSchema,
  workflowExternalMessageTriggerNodeSchema,
  workflowWebhookTriggerNodeSchema,
  workflowFinishNodeSchema,
  workflowAiNodeSchema,
  workflowAgentNodeSchema,
  workflowToolNodeSchema,
  workflowHttpRequestNodeSchema,
  workflowKnowledgeNodeSchema,
  workflowDocumentSourcesNodeSchema,
  workflowConditionNodeSchema,
  workflowSmalltalkRouterNodeSchema,
  workflowRouterNodeSchema,
  workflowApprovalNodeSchema,
  workflowDelayNodeSchema,
  workflowMergeNodeSchema,
  workflowChatMessageNodeSchema,
  workflowAssistantActionNodeSchema,
  workflowBotActionNodeSchema,
  workflowTranscriptNodeSchema,
  workflowTranscriptCardNodeSchema,
  workflowFormCardNodeSchema,
  workflowScriptTransformNodeSchema,
  workflowCustomCodeNodeSchema,
  workflowCanvasDocumentNodeSchema,
  workflowDocumentCardNodeSchema,
  workflowRespondWebhookNodeSchema,
  workflowTypedTemplateNodeSchema,
  workflowDocxRenderNodeSchema,
  workflowGroundedExtractNodeSchema,
  workflowConstrainedGenerateNodeSchema,
  workflowSelectSuggestNodeSchema,
  workflowFinalizationGateNodeSchema,
  workflowChecklistVerifyNodeSchema,
  workflowReferenceDataNodeSchema,
  workflowDataTransformNodeSchema,
]);

export const workflowControlEdgeSchema = z.object({
  id: z.string().min(1),
  sourceId: z.string().min(1),
  sourcePortId: z.string().min(1),
  targetId: z.string().min(1),
  targetPortId: z.string().min(1),
});

export const workflowDataBindingSchema = z.object({
  id: z.string().min(1),
  targetNodeId: z.string().min(1),
  targetSlot: z.string().min(1),
  sourceNamespace: z.string().min(1),
  sourcePath: z.string().min(1),
  expression: workflowMappingExpressionSchema,
});

export const workflowJsonV2Schema = z.object({
  schemaVersion: z.literal(WORKFLOW_JSON_SCHEMA_VERSION),
  metadata: z.object({
    title: z.string().trim().min(1).max(255),
    description: z.string().max(5000).nullable(),
  }),
  entryNodeId: z.string().min(1).nullable(),
  refs: workflowJsonRefsSchema,
  nodes: z.array(workflowJsonNodeSchema),
  controlEdges: z.array(workflowControlEdgeSchema),
  dataBindings: z.array(workflowDataBindingSchema),
});

export const workflowJsonV1Schema = workflowJsonV2Schema;

export const workflowResolvedRefSchema = z.object({
  refId: z.string().min(1),
  refType: workflowRefTypeSchema,
  target: z.string().min(1),
  resolved: z.boolean(),
  entityId: z.string().nullable(),
  displayName: z.string().nullable(),
  scope: z.enum(["global", "workspace", "system"]).nullable(),
});

export const workflowCompiledBindingSchema = z.object({
  id: z.string().min(1),
  kind: z.enum([
    "prompt",
    "agent_goal",
    "http_request_url",
    "respond_webhook_status_code",
    "query",
    "predicate",
    "checked_value",
    "chat_text",
    "assistant_action_text",
    "bot_action_id",
    "bot_action_display_text",
    "transcript_id",
    "transcript_title",
    "transcript_full_text",
    "transcript_preview_text",
    "transcript_card_title",
    "transcript_card_preview_text",
    "form_card_title",
    "form_card_description",
    "form_card_schema",
    "form_card_initial_payload",
    "canvas_document_id",
    "canvas_document_transcript_id",
    "canvas_document_title",
    "canvas_document_content",
    "document_card_document_id",
    "document_card_title",
    "document_card_preview_text",
  ]),
  expression: workflowMappingExpressionSchema,
  referencedNamespaces: z.array(z.string().min(1)),
});

export const workflowIrBranchSchema = z.object({
  portId: z.string().min(1),
  targetStepId: z.string().min(1),
});

export const workflowIrRouterConfigSchema = z.object({
  checkedValueType: workflowValueTypeSchema,
  checkedValuePath: z.string().min(1).nullable(),
  checkedValueLabel: z.string().min(1).nullable(),
  checkedValueExpression: workflowMappingExpressionSchema,
  routes: z.array(workflowRouterRouteSchema).min(1),
  defaultPortId: z.literal("default"),
});

export const workflowIrSmalltalkConfigSchema = z.object({
  phraseSource: workflowSmalltalkPhraseSourceSchema,
  phrases: z.array(z.string().trim().min(1)).default([]),
});

export const workflowIrStepSchema = z.object({
  id: z.string().min(1),
  nodeId: z.string().min(1),
  kind: workflowNodeKindSchema,
  order: z.number().int().min(0),
  dependsOn: z.array(z.string().min(1)),
  next: z.array(workflowIrBranchSchema),
  inputNamespace: z.string().min(1),
  outputNamespace: z.string().min(1).nullable(),
  bindings: z.array(workflowCompiledBindingSchema),
  resolvedRefs: z.array(workflowResolvedRefSchema),
  branchMode: z.enum(["linear", "condition", "router", "approval", "merge", "terminal"]),
  terminalOutcome: z.string().nullable(),
  routerConfig: workflowIrRouterConfigSchema.nullable().optional(),
  smalltalkConfig: workflowIrSmalltalkConfigSchema.nullable().optional(),
  aiChatOutputMode: workflowAiChatOutputModeSchema.nullable().optional(),
  aiModelSource: workflowModelSourceSchema.nullable().optional(),
  aiSkillId: z.string().min(1).nullable().optional(),
  agentRuntimeProvider: workflowAgentRuntimeProviderSchema.nullable().optional(),
  agentModelSource: workflowModelSourceSchema.nullable().optional(),
  agentModelId: z.string().min(1).nullable().optional(),
  agentAllowedActionIds: z.array(z.string().min(1)).default([]),
  agentAllowedOperationIds: z.array(z.string().min(1)).default([]),
  agentAllowedSystemOperationKeys: z.array(z.string().min(1)).default([]),
  agentAllowedSkillIds: z.array(z.string().min(1)).default([]),
  agentAllowedConnectionIds: z.array(z.string().min(1)).default([]),
  agentMaxSteps: z.number().int().min(1).max(100).nullable().optional(),
  agentMaxToolCalls: z.number().int().min(1).max(100).nullable().optional(),
  agentTimeoutSec: z.number().int().min(1).max(3600).nullable().optional(),
  agentMaxCostUsd: z.number().min(0).max(1000).nullable().optional(),
  agentWritePolicy: workflowAgentWritePolicySchema.nullable().optional(),
  agentCapabilityOptimizationProfile: workflowAgentCapabilityOptimizationProfileSchema.nullable().optional(),
  agentTraceLevel: workflowAgentTraceLevelSchema.nullable().optional(),
  agentFinishSchema: workflowJsonObjectSchema.nullable().optional(),
  finishChatResponseMode: workflowFinishChatResponseModeSchema.nullable().optional(),
  knowledgeSource: workflowKnowledgeSourceSchema.nullable().optional(),
  knowledgeRagConfig: workflowKnowledgeRagConfigSchema.nullable().optional(),
  knowledgeChatOutputMode: workflowAiChatOutputModeSchema.nullable().optional(),
  statusTemplateIds: workflowStatusTemplateIdsSchema,
});

export const workflowIrBranchMetaSchema = z.object({
  nodeId: z.string().min(1),
  stepId: z.string().min(1),
  mode: z.enum(["condition", "router", "approval", "merge"]),
  branches: z.array(workflowIrBranchSchema),
});

export const workflowResolvedRefsSummarySchema = z.object({
  models: z.array(workflowResolvedRefSchema),
  actions: z.array(workflowResolvedRefSchema),
  operations: z.array(workflowResolvedRefSchema).default([]),
  skills: z.array(workflowResolvedRefSchema).default([]),
  knowledgeBases: z.array(workflowResolvedRefSchema),
  approvalRoles: z.array(workflowResolvedRefSchema),
});

export const workflowTerminalOutcomeSchema = z.object({
  nodeId: z.string().min(1),
  stepId: z.string().min(1),
  outcome: z.string().min(1),
});

export const workflowExportOutputSchema = z.object({
  name: z.string().min(1),
  sourceNamespace: z.string().min(1),
  sourcePath: z.string().min(1),
});

// Тело IR без литерала версии — переиспользуется схемами V3 (current) и legacy V2.
const workflowIrBodySchema = z.object({
  metadata: z.object({
    title: z.string().trim().min(1).max(255),
    description: z.string().max(5000).nullable(),
  }),
  entryStepId: z.string().min(1).nullable(),
  contextNamespaces: z.array(z.string().min(1)),
  steps: z.array(workflowIrStepSchema),
  branches: z.array(workflowIrBranchMetaSchema),
  resolvedRefs: workflowResolvedRefsSummarySchema,
  terminalOutcomes: z.array(workflowTerminalOutcomeSchema),
  exportOutputs: z.array(workflowExportOutputSchema),
});

// Канонический IR (V3): структурные value-типы в дескрипторах output-полей/каталога.
export const workflowIrV3Schema = workflowIrBodySchema.extend({
  schemaVersion: z.literal(WORKFLOW_IR_SCHEMA_VERSION),
});

// Legacy IR (V2): читается для обратной совместимости (тело идентично — V3 является superset'ом).
export const workflowIrLegacyV2Schema = workflowIrBodySchema.extend({
  schemaVersion: z.literal(WORKFLOW_IR_SCHEMA_VERSION_LEGACY),
});

// Обратно-совместимые алиасы: существующий код ссылается на workflowIrV2Schema/workflowIrV1Schema
// как на «текущую IR» — указываем на V3, чтобы не трогать 30+ потребителей.
export const workflowIrV2Schema = workflowIrV3Schema;
export const workflowIrV1Schema = workflowIrV3Schema;

// Толерантное чтение персиста IR (starter-бандлы, снапшоты): current (V3) ∪ legacy (V2).
export const workflowIrReadSchema = z.union([workflowIrV3Schema, workflowIrLegacyV2Schema]);

/**
 * Толерантно читает персистентный IR и апгрейдит legacy V2 → V3 (тело идентично, отличается только
 * литерал версии — V3 является superset'ом V2 по value-типам). Зеркалит паттерн миграции
 * `normalizeEditorDocument`. Версия из будущего (> V3) отвергается на уровне read-union.
 */
export function normalizeWorkflowIr(raw: unknown): {
  ir: WorkflowIrV3;
  migrationInfo: WorkflowMigrationInfo;
} {
  const migrationInfo: WorkflowMigrationInfo = { steps: [] };
  const parsed = workflowIrReadSchema.parse(raw);
  if (parsed.schemaVersion === WORKFLOW_IR_SCHEMA_VERSION) {
    return { ir: parsed, migrationInfo };
  }
  const upgraded: WorkflowIrV3 = { ...parsed, schemaVersion: WORKFLOW_IR_SCHEMA_VERSION };
  migrationInfo.steps.push({
    entity: "workflow_ir",
    fromVersion: parsed.schemaVersion,
    toVersion: WORKFLOW_IR_SCHEMA_VERSION,
    applied: true,
    notes: ["Legacy IR V2 relabelled to V3 (structural value-type vocabulary is a superset)."],
  });
  return { ir: upgraded, migrationInfo };
}

/**
 * Чистый апгрейд уже распарсенного IR (current V3 либо legacy V2) к V3. Используется на границе
 * чтения персиста (starter-бандлы), чтобы downstream-потребители видели канонический V3.
 */
export function upgradeWorkflowIrToV3(ir: WorkflowIrV3 | WorkflowIrLegacyV2): WorkflowIrV3 {
  return ir.schemaVersion === WORKFLOW_IR_SCHEMA_VERSION
    ? ir
    : { ...ir, schemaVersion: WORKFLOW_IR_SCHEMA_VERSION };
}

export const workflowValidationIssueSchema = z.object({
  code: workflowValidationIssueCodeSchema,
  severity: workflowValidationSeveritySchema,
  message: z.string().min(1),
  path: z.string().nullable().optional(),
  nodeId: z.string().nullable().optional(),
  edgeId: z.string().nullable().optional(),
  bindingId: z.string().nullable().optional(),
});

export const workflowValidationResultSchema = z.object({
  issues: z.array(workflowValidationIssueSchema),
  hasBlockingIssues: z.boolean(),
});

export const workflowMigrationStepSchema = z.object({
  entity: z.enum(["editor_document", "workflow_json", "workflow_ir"]),
  fromVersion: z.number().int().nullable(),
  toVersion: z.number().int().min(1),
  applied: z.boolean(),
  notes: z.array(z.string()),
});

export const workflowMigrationInfoSchema = z.object({
  steps: z.array(workflowMigrationStepSchema),
});

export const workflowCompilePreviewRequestSchema = z.object({
  title: z.string().trim().min(1).max(255).optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  draftEditorDocument: z.unknown().optional(),
});

export const workflowCompilePreviewResponseSchema = z.object({
  workflowJson: workflowJsonV2Schema,
  ir: workflowIrV2Schema,
  validation: workflowValidationResultSchema,
  migrationInfo: workflowMigrationInfoSchema.optional(),
});

export type WorkflowNodeKind = z.infer<typeof workflowNodeKindSchema>;
export type WorkflowModelSource = z.infer<typeof workflowModelSourceSchema>;
export type WorkflowValueType = z.infer<typeof workflowValueTypeSchema>;
export type WorkflowRouterOperator = z.infer<typeof workflowRouterOperatorSchema>;
export type WorkflowValueReference = z.infer<typeof workflowValueReferenceSchema>;
export type WorkflowRouterRoute = z.infer<typeof workflowRouterRouteSchema>;
export type WorkflowNodeOutputField = z.infer<typeof workflowNodeOutputFieldSchema>;
export type WorkflowValueCatalogEntry = z.infer<typeof workflowValueCatalogEntrySchema>;
export type EditorDocumentV2 = z.infer<typeof editorDocumentV2Schema>;
export type EditorDocumentV1 = EditorDocumentV2;
export type WorkflowRef = z.infer<typeof workflowRefSchema>;
export type WorkflowJsonNode = z.infer<typeof workflowJsonNodeSchema>;
export type WorkflowJsonV2 = z.infer<typeof workflowJsonV2Schema>;
export type WorkflowJsonV1 = WorkflowJsonV2;
export type WorkflowControlEdge = z.infer<typeof workflowControlEdgeSchema>;
export type WorkflowDataBinding = z.infer<typeof workflowDataBindingSchema>;
export type WorkflowResolvedRef = z.infer<typeof workflowResolvedRefSchema>;
export type WorkflowCompiledBinding = z.infer<typeof workflowCompiledBindingSchema>;
export type WorkflowKnowledgeRagConfig = z.infer<typeof workflowKnowledgeRagConfigSchema>;
export type WorkflowIrStep = z.infer<typeof workflowIrStepSchema>;
export type WorkflowIrV3 = z.infer<typeof workflowIrV3Schema>;
export type WorkflowIrLegacyV2 = z.infer<typeof workflowIrLegacyV2Schema>;
export type WorkflowIrV2 = z.infer<typeof workflowIrV2Schema>;
export type WorkflowIrV1 = WorkflowIrV2;
export type WorkflowValidationIssue = z.infer<typeof workflowValidationIssueSchema>;
export type WorkflowValidationResult = z.infer<typeof workflowValidationResultSchema>;
export type WorkflowMigrationInfo = z.infer<typeof workflowMigrationInfoSchema>;
export type WorkflowCompilePreviewRequest = z.infer<typeof workflowCompilePreviewRequestSchema>;
export type WorkflowCompilePreviewResponse = z.infer<typeof workflowCompilePreviewResponseSchema>;
