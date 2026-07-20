import { z } from "zod";
import {
  assistantWorkflowContextRequestSubmissionSchema,
  contextRefSchema,
  contextRefTargetTypes,
  resolvedContextRefSchema,
  workflowContextRequestChatMetadataSchema,
} from "./context-refs";
import {
  assistantEmbeddingModes,
  assistantExecutionModes,
  assistantLlmModelSelections,
  assistantMediaInputModes,
  assistantModes,
  assistantRagModes,
  assistantSearchModes,
  assistantTranscriptionModes,
  assistantTranscriptionFlowModes,
  unicaAsrDiarizationPolicies,
} from "./schema";
import {
  workflowCompatibilityStatuses,
  workflowDefinitionKinds,
  workflowDefinitionScopeKinds,
  type WorkflowCompatibilityStatus,
  workflowTemplateSourceSchema,
  type WorkflowTemplateSource,
} from "./workflows";
import {
  workflowLangGraphReadinessStatuses,
  type WorkflowLangGraphReadinessStatus,
} from "./workflow-langgraph";
import type {
  AssistantEmbeddingMode,
  AssistantExecutionMode,
  AssistantLlmModelSelection,
  AssistantMediaInputMode,
  AssistantMode,
  AssistantRagMode,
  AssistantSearchMode,
  SearchProfileStrategy,
  AssistantTranscriptionMode,
  AssistantTranscriptionFlowMode,
  UnicaAsrAdvancedOptions,
} from "./schema";

export const DEFAULT_ASSISTANT_MAX_COMPLETION_TOKENS = 16000;

export const assistantIconColors = [
  "gray",
  "lightgray",
  "brown",
  "yellow",
  "orange",
  "green",
  "blue",
  "purple",
  "pink",
  "red",
] as const;
export type AssistantIconColor = (typeof assistantIconColors)[number];

export const DEFAULT_ASSISTANT_ICON_COLOR: AssistantIconColor = "gray";

export type AssistantIconColorPreset = {
  value: AssistantIconColor;
  label: string;
  foreground: string;
  background: string;
  border: string;
};

export const ASSISTANT_ICON_COLOR_PRESETS: Record<AssistantIconColor, AssistantIconColorPreset> = {
  gray: {
    value: "gray",
    label: "Серый",
    foreground: "#787774",
    background: "#F1F1EF",
    border: "#D9D9D6",
  },
  lightgray: {
    value: "lightgray",
    label: "Светло-серый",
    foreground: "#9B9A97",
    background: "#F7F7F5",
    border: "#E3E2DF",
  },
  brown: {
    value: "brown",
    label: "Коричневый",
    foreground: "#976D57",
    background: "#F3EEEE",
    border: "#E4D7D1",
  },
  yellow: {
    value: "yellow",
    label: "Жёлтый",
    foreground: "#C29343",
    background: "#FAF3DD",
    border: "#EADAA8",
  },
  orange: {
    value: "orange",
    label: "Оранжевый",
    foreground: "#CC782F",
    background: "#F8ECDF",
    border: "#E9D2BB",
  },
  green: {
    value: "green",
    label: "Зелёный",
    foreground: "#548164",
    background: "#EEF3ED",
    border: "#D3E0D2",
  },
  blue: {
    value: "blue",
    label: "Синий",
    foreground: "#487CA5",
    background: "#E9F3F7",
    border: "#CADFE8",
  },
  purple: {
    value: "purple",
    label: "Фиолетовый",
    foreground: "#8A67AB",
    background: "#F6F3F8",
    border: "#DED4E7",
  },
  pink: {
    value: "pink",
    label: "Розовый",
    foreground: "#B35488",
    background: "#F9F2F5",
    border: "#E8D1DD",
  },
  red: {
    value: "red",
    label: "Красный",
    foreground: "#C4554D",
    background: "#FDEBEC",
    border: "#F0CFD0",
  },
};

export const ASSISTANT_ICON_COLOR_OPTIONS = assistantIconColors.map(
  (value) => ASSISTANT_ICON_COLOR_PRESETS[value],
);

export function isAssistantIconColor(value: unknown): value is AssistantIconColor {
  return typeof value === "string" && assistantIconColors.includes(value as AssistantIconColor);
}

export function normalizeAssistantIconColor(value: unknown): AssistantIconColor {
  return isAssistantIconColor(value) ? value : DEFAULT_ASSISTANT_ICON_COLOR;
}

export function getAssistantIconColorPreset(value: unknown): AssistantIconColorPreset {
  return ASSISTANT_ICON_COLOR_PRESETS[normalizeAssistantIconColor(value)];
}

const optionalString = (limit: number) =>
  z
    .union([z.string(), z.null()])
    .optional()
    .refine((value) => {
      if (value === null || value === undefined) {
        return true;
      }
      return value.length <= limit;
    }, `Длина поля не должна превышать ${limit} символов`);

const optionalText = (limit: number) =>
  z
    .union([z.string(), z.null()])
    .optional()
    .refine((value) => {
      if (value === null || value === undefined) {
        return true;
      }
      return value.length <= limit;
    }, `Длина поля не должна превышать ${limit} символов`);

const knowledgeBaseIdSchema = z.string().min(1);

const ragConfigInputSchema = z.object({
  mode: z.enum(assistantRagModes).optional(),
  searchMode: z.enum(assistantSearchModes).optional(),
  embeddingMode: z.enum(assistantEmbeddingModes).optional(),
  strategy: z.enum(["rrf", "weighted_thresholded", "union"]).nullable().optional(),
  collectionIds: z.array(z.string().min(1)).optional(),
  topK: z.number().int().min(1).max(50).nullable().optional(),
  minScore: z.number().min(0).max(1).nullable().optional(),
  maxContextTokens: z.number().int().min(500).max(20000).nullable().optional(),
  showSources: z.boolean().nullable().optional(),
  historyMessagesLimit: z.number().int().min(0).max(20).nullable().optional(),
  historyCharsLimit: z.number().int().min(0).max(50000).nullable().optional(),
  enableQueryRewriting: z.boolean().nullable().optional(),
  queryRewriteModel: z.string().max(200).nullable().optional(),
  enableContextCaching: z.boolean().nullable().optional(),
  contextCacheTtlSeconds: z.number().int().min(60).max(1800).nullable().optional(), // от 1 минуты до 30 минут
  bm25Weight: z.number().min(0).max(1).nullable().optional(),
  bm25Limit: z.number().int().min(1).max(50).nullable().optional(),
  vectorWeight: z.number().min(0).max(1).nullable().optional(),
  vectorLimit: z.number().int().min(1).max(50).nullable().optional(),
  bm25Threshold: z.number().min(0).max(1).nullable().optional(),
  vectorThreshold: z.number().min(0).max(1).nullable().optional(),
  rrfK: z.number().int().min(1).max(500).nullable().optional(),
  rerankEnabled: z.boolean().nullable().optional(),
  rerankProviderId: optionalString(255),
  rerankModel: optionalString(255),
  rerankPrompt: optionalText(20000),
  rerankCandidateCount: z.number().int().min(1).max(50).nullable().optional(),
  embeddingProviderId: optionalString(255),
  embeddingModel: optionalString(255),
  llmTemperature: z.number().min(0).max(2).nullable().optional(),
  llmMaxCompletionTokens: z.number().int().min(16).nullable().optional(),
  llmResponseFormat: z.enum(["text", "markdown", "html"]).nullable().optional(),
});

const contextInputLimitSchema = z.number().int().min(100).max(50000).nullable().optional();
const unicaAsrAdvancedOptionValueSchema = z.union([z.string(), z.number(), z.boolean()]);
const unicaAsrAdvancedOptionRecordSchema = z
  .record(
    z
      .string()
      .trim()
      .min(1, "Ключ параметра не может быть пустым")
      .max(100, "Ключ параметра не должен превышать 100 символов"),
    unicaAsrAdvancedOptionValueSchema,
  )
  .refine((value) => Object.keys(value).length <= 50, {
    message: "Допускается не более 50 параметров в секции",
  });
const unicaAsrAdvancedOptionsSchema = z
  .object({
    diarize: z.boolean().optional(),
    diarizationPolicy: z.enum(unicaAsrDiarizationPolicies).optional(),
    processingOptions: unicaAsrAdvancedOptionRecordSchema.optional(),
    vadOptions: unicaAsrAdvancedOptionRecordSchema.optional(),
    generalOptions: unicaAsrAdvancedOptionRecordSchema.optional(),
  })
  .optional();

const assistantEditableFieldsSchema = z.object({
  name: optionalString(200),
  description: optionalText(4000),
  systemPrompt: optionalText(20000),
  modelId: optionalString(200),
  llmProviderConfigId: optionalString(200),
  llmModelSelection: z.enum(assistantLlmModelSelections).optional(),
  collectionName: optionalString(200),
  executionMode: z.enum(assistantExecutionModes).optional(),
  mediaInputMode: z.enum(assistantMediaInputModes).optional(),
  workflowDefinitionId: z.string().uuid().nullable().optional(),
  workflowSystemTemplateKey: optionalString(255),
  transcriptionWorkflowDefinitionId: z.string().uuid().nullable().optional(),
  mode: z.enum(assistantModes).optional(),
  knowledgeBaseIds: z.array(knowledgeBaseIdSchema).optional(),
  ragConfig: ragConfigInputSchema.optional(),
  icon: optionalString(100),
  iconColor: z.enum(assistantIconColors).nullable().optional(),
  onTranscriptionMode: z.enum(assistantTranscriptionModes).optional(),
  onTranscriptionAutoActionId: optionalString(200),
  transcriptionFlowMode: z.enum(assistantTranscriptionFlowModes).optional(),
  asrProviderId: optionalString(200),
  contextInputLimit: contextInputLimitSchema,
  llmTopP: z.number().min(0).max(1).nullable().optional(),
  llmTopK: z.number().int().min(1).max(200).nullable().optional(),
  llmRepeatPenalty: z.number().min(0).max(2).nullable().optional(),
  llmSeed: z.number().int().min(0).max(999999).nullable().optional(),
  unicaAsrAdvancedOptions: unicaAsrAdvancedOptionsSchema,
});

export const createAssistantSchema = assistantEditableFieldsSchema;
export const updateAssistantSchema = assistantEditableFieldsSchema;

export type CreateAssistantPayload = z.infer<typeof createAssistantSchema>;
export type UpdateAssistantPayload = z.infer<typeof updateAssistantSchema>;

export type AssistantWorkflowBinding = {
  definitionId: string;
  kind: "template" | "scenario";
  scopeKind: "global" | "workspace";
  workspaceId: string | null;
  templateSource: WorkflowTemplateSource | null;
  systemTemplateKey: string | null;
  title: string;
  description: string | null;
  currentPublishedVersionId: string | null;
  currentPublishedVersionNo: number | null;
  currentPublishedAt: string | null;
  currentReleaseNote: string | null;
  compatibilityStatus: WorkflowCompatibilityStatus | null;
  langgraphReadinessStatus: WorkflowLangGraphReadinessStatus | null;
  liveReady: boolean;
  autoUpdates: boolean;
};

export type AssistantTranscriptionWorkflowBinding = AssistantWorkflowBinding;

/**
 * Занятость workspace-сценария workflow-ассистентом (строгое 1:1). Используется пикером
 * сценария в настройках ассистента, чтобы дизейблить definition, уже привязанные к ДРУГОМУ
 * ассистенту. `assistantId` — id ассистента, который сейчас держит этот сценарий.
 */
export type WorkflowScenarioBindingDto = {
  definitionId: string;
  assistantId: string;
};

export type WorkflowScenarioBindingsResponseDto = {
  bindings: WorkflowScenarioBindingDto[];
};

export type AssistantEffectiveLlmConfig = {
  source: "assistant" | "assistant_default" | "global_unica_chat" | "fallback_single_provider";
  providerId: string;
  providerName: string;
  providerType: string | null;
  modelId: string | null;
  modelKey: string | null;
  modelDisplayName: string | null;
  requestModel: string | null;
};

export const globalWorkflowTemplateSummarySchema = z.object({
  definitionId: z.string().uuid(),
  templateSource: workflowTemplateSourceSchema.nullable(),
  systemTemplateKey: z.string().min(1).nullable(),
  title: z.string().min(1),
  description: z.string().nullable(),
  currentPublishedVersionId: z.string().uuid().nullable(),
  currentPublishedVersionNo: z.number().int().min(1).nullable(),
  currentPublishedAt: z.string().datetime().nullable(),
  currentReleaseNote: z.string().nullable(),
  compatibilityStatus: z.enum(workflowCompatibilityStatuses).nullable(),
  langgraphReadinessStatus: z.enum(workflowLangGraphReadinessStatuses).nullable(),
  liveReady: z.boolean(),
  autoUpdates: z.boolean(),
});

export const workflowDefinitionBindingSummarySchema = z.object({
  definitionId: z.string().uuid(),
  kind: z.enum(workflowDefinitionKinds),
  scopeKind: z.enum(workflowDefinitionScopeKinds),
  workspaceId: z.string().nullable(),
  templateSource: workflowTemplateSourceSchema.nullable(),
  systemTemplateKey: z.string().min(1).nullable(),
  title: z.string().min(1),
  description: z.string().nullable(),
  currentPublishedVersionId: z.string().uuid().nullable(),
  currentPublishedVersionNo: z.number().int().min(1).nullable(),
  currentPublishedAt: z.string().datetime().nullable(),
  currentReleaseNote: z.string().nullable(),
  compatibilityStatus: z.enum(workflowCompatibilityStatuses).nullable(),
  langgraphReadinessStatus: z.enum(workflowLangGraphReadinessStatuses).nullable(),
  liveReady: z.boolean(),
  autoUpdates: z.boolean(),
});

export const globalWorkflowTemplateVersionSchema = z.object({
  versionId: z.string().uuid(),
  versionNo: z.number().int().min(1),
  publishedAt: z.string().datetime(),
  releaseNote: z.string().nullable(),
  compatibilityStatus: z.enum(workflowCompatibilityStatuses).nullable(),
  langgraphReadinessStatus: z.enum(workflowLangGraphReadinessStatuses).nullable(),
  liveReady: z.boolean(),
});

export const globalWorkflowTemplateDetailSchema = globalWorkflowTemplateSummarySchema.extend({
  versions: z.array(globalWorkflowTemplateVersionSchema),
});

export const systemWorkflowTemplateSummarySchema = globalWorkflowTemplateSummarySchema;
export const systemWorkflowTemplateVersionSchema = globalWorkflowTemplateVersionSchema;
export const systemWorkflowTemplateDetailSchema = globalWorkflowTemplateDetailSchema;

export const assistantWorkflowApprovalDecisionSchema = z.object({
  comment: z.string().trim().max(4000).nullable().optional(),
});

export const workflowApprovalChatDetailSchema = z.object({
  label: z.string().trim().min(1).max(120),
  value: z.string().trim().min(1).max(4000),
});

export const workflowApprovalChatMetadataSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["pending", "approved", "rejected", "expired", "cancelled"]),
  roleCode: z.string(),
  nodeId: z.string(),
  stepId: z.string(),
  kind: z.enum(["agent_system_operation", "agent_action", "agent_operation", "agent_mcp_tool", "workflow_approval"]).optional(),
  title: z.string().trim().min(1).max(240).optional(),
  summary: z.string().trim().min(1).max(4000).optional(),
  details: z.array(workflowApprovalChatDetailSchema).max(8).optional(),
});

export const agentChoicePromptOptionSchema = z.object({
  id: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(120),
  value: z.string().trim().min(1).max(1000),
});

export const agentChoicePromptSchema = z.object({
  question: z.string().trim().min(1).max(1000),
  options: z.array(agentChoicePromptOptionSchema).min(1).max(4),
  allowFreeText: z.boolean().optional().default(true),
  inputPlaceholder: z.string().trim().max(240).nullable().optional(),
});

export const assistantWorkflowApprovalSummarySchema = z.object({
  id: z.string().uuid(),
  runId: z.string().uuid(),
  workspaceId: z.string(),
  assistantId: z.string(),
  assistantName: z.string().nullable(),
  chatId: z.string(),
  userMessageId: z.string().nullable(),
  nodeId: z.string(),
  stepId: z.string(),
  approvalRoleCode: z.string(),
  status: z.enum(["pending", "approved", "rejected", "expired", "cancelled"]),
  decisionComment: z.string().nullable(),
  requestedAt: z.string().datetime(),
  dueAt: z.string().datetime().nullable(),
  decidedAt: z.string().datetime().nullable(),
  decidedByUserId: z.string().nullable(),
});

// kind="date": значение поля — строка в RU-формате DD.MM.YYYY (контракт docx-оверлея и
// projectSlotValueToText); клиент рендерит календарь-датапикер вместо текстового инпута.
export const workflowFormFieldKinds = ["text", "textarea", "number", "boolean", "select", "date"] as const;

// Опция select-поля формы (L2.3c). Метаданные предложения LLM (rationale/citations/needsReview/
// recommended) объявлены ЯВНО: Zod стрипает неизвестные ключи, а схема парсится дважды
// (executeFormCardStep и submitWorkflowForm) — без явных полей проекция records осталась бы без цитат.
export const workflowFormSelectOptionSchema = z.object({
  id: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(240),
  value: z.string().trim().max(4000).default(""),
  rationale: z.string().trim().max(2000).nullable().optional(),
  citations: z.array(z.string().trim().max(2000)).max(8).optional(),
  needsReview: z.boolean().optional(),
  recommended: z.boolean().optional(),
});

// Review-метаданные поля ReviewQueue (L3.2: finalization_gate → form_card). Поле формы,
// построенное из reviewItem гейта, несёт происхождение кандидата (цитата/источник/причина);
// tag — мерж-ключ overlay в docx_render (id поля = slotId, лимит 120, а tag может быть длиннее).
// Объявлено ЯВНО по той же причине, что метаданные select-опций выше.
export const workflowFormFieldReviewSchema = z.object({
  tag: z.string().trim().min(1).max(240),
  category: z.enum(["blocking", "needs_review"]),
  reason: z.string().max(2000).nullable().default(null),
  source: z.string().max(120).nullable().default(null),
  quote: z.string().max(2000).nullable().default(null),
  grounded: z.boolean().nullable().default(null),
});

export const workflowFormFieldSchema = z.object({
  id: z.string().trim().min(1).max(120),
  label: z.string().trim().min(1).max(240),
  kind: z.enum(workflowFormFieldKinds),
  required: z.boolean().optional().default(false),
  placeholder: z.string().trim().max(240).nullable().optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  readOnly: z.boolean().optional().default(false),
  // Только для kind="select": payload поля хранит id выбранной опции (optionId).
  options: z.array(workflowFormSelectOptionSchema).max(50).optional(),
  // Только для полей ReviewQueue: провенанс кандидата (сабмит проецируется в reviewedFields).
  review: workflowFormFieldReviewSchema.optional(),
});

// Display-only запись «Происхождение полей» (L3.2 провенанс-UX): полная карта происхождения
// всех слотов драфта для чат-карточки. Значения строкифицированы/усечены билдером;
// секретные глобалки замаскированы на этапе билда (чат не проходит redactSecretGlobalValues).
export const workflowFormProvenanceEntrySchema = z.object({
  tag: z.string().trim().min(1).max(240),
  label: z.string().max(240).nullable().default(null),
  value: z.string().max(2000).default(""),
  source: z.string().max(120).nullable().default(null),
  grounded: z.boolean().nullable().default(null),
  needsReview: z.boolean().default(false),
  quote: z.string().max(2000).nullable().default(null),
  reviewReason: z.string().max(2000).nullable().default(null),
});

export const workflowFormSchemaSchema = z.object({
  fields: z.array(workflowFormFieldSchema).min(1).max(100),
  submitLabel: z.string().trim().min(1).max(120).optional(),
  provenance: z.array(workflowFormProvenanceEntrySchema).max(200).optional(),
});

export const workflowFormChatMetadataSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["pending", "submitted", "expired", "cancelled"]),
  nodeId: z.string(),
  stepId: z.string(),
  title: z.string().trim().min(1).max(240),
  description: z.string().trim().max(4000).nullable().optional(),
  formSchema: workflowFormSchemaSchema,
  initialPayload: z.record(z.string(), z.unknown()).default({}),
  submittedPayload: z.record(z.string(), z.unknown()).default({}).optional(),
});

export const assistantWorkflowFormRequestSummarySchema = z.object({
  id: z.string().uuid(),
  runId: z.string().uuid(),
  workspaceId: z.string(),
  assistantId: z.string(),
  assistantName: z.string().nullable(),
  chatId: z.string(),
  userMessageId: z.string().nullable(),
  nodeId: z.string(),
  stepId: z.string(),
  title: z.string().nullable(),
  description: z.string().nullable(),
  formSchema: workflowFormSchemaSchema,
  initialPayload: z.record(z.string(), z.unknown()).default({}),
  submittedPayload: z.record(z.string(), z.unknown()).default({}),
  status: z.enum(["pending", "submitted", "expired", "cancelled"]),
  requestedAt: z.string().datetime(),
  submittedAt: z.string().datetime().nullable(),
  submittedByUserId: z.string().nullable(),
});

export const assistantWorkflowFormSubmissionSchema = z.object({
  payload: z.record(z.string(), z.unknown()),
});

export { assistantWorkflowContextRequestSubmissionSchema, workflowContextRequestChatMetadataSchema };

export const assistantWorkflowContextRequestSummarySchema = z.object({
  id: z.string().uuid(),
  runId: z.string().uuid(),
  workspaceId: z.string(),
  assistantId: z.string(),
  assistantName: z.string().nullable(),
  chatId: z.string(),
  userMessageId: z.string().nullable(),
  nodeId: z.string(),
  stepId: z.string(),
  acceptedTypes: z.array(z.enum(contextRefTargetTypes)),
  question: z.string(),
  queryHint: z.string().nullable(),
  submittedContextRefs: z.array(contextRefSchema).default([]),
  resolvedContextRefs: z.array(resolvedContextRefSchema).default([]),
  status: z.enum(["pending", "submitted", "expired", "cancelled"]),
  requestedAt: z.string().datetime(),
  submittedAt: z.string().datetime().nullable(),
  submittedByUserId: z.string().nullable(),
});

export type GlobalWorkflowTemplateSummary = z.infer<typeof globalWorkflowTemplateSummarySchema>;
export type GlobalWorkflowTemplateVersion = z.infer<typeof globalWorkflowTemplateVersionSchema>;
export type GlobalWorkflowTemplateDetail = z.infer<typeof globalWorkflowTemplateDetailSchema>;
export type WorkflowDefinitionBindingSummary = z.infer<typeof workflowDefinitionBindingSummarySchema>;
export type SystemWorkflowTemplateSummary = GlobalWorkflowTemplateSummary;
export type SystemWorkflowTemplateVersion = GlobalWorkflowTemplateVersion;
export type SystemWorkflowTemplateDetail = GlobalWorkflowTemplateDetail;
export type WorkflowApprovalChatDetail = z.infer<typeof workflowApprovalChatDetailSchema>;
export type WorkflowApprovalChatMetadata = z.infer<typeof workflowApprovalChatMetadataSchema>;
export type WorkflowFormField = z.infer<typeof workflowFormFieldSchema>;
export type WorkflowFormFieldReview = z.infer<typeof workflowFormFieldReviewSchema>;
export type WorkflowFormProvenanceEntry = z.infer<typeof workflowFormProvenanceEntrySchema>;
export type WorkflowFormSchema = z.infer<typeof workflowFormSchemaSchema>;
export type WorkflowFormChatMetadata = z.infer<typeof workflowFormChatMetadataSchema>;
export type AgentChoicePromptOption = z.infer<typeof agentChoicePromptOptionSchema>;
export type AgentChoicePrompt = z.infer<typeof agentChoicePromptSchema>;
export type AssistantWorkflowApprovalSummary = z.infer<typeof assistantWorkflowApprovalSummarySchema>;
export type AssistantWorkflowApprovalDecision = z.infer<typeof assistantWorkflowApprovalDecisionSchema>;
export type AssistantWorkflowFormRequestSummary = z.infer<typeof assistantWorkflowFormRequestSummarySchema>;
export type AssistantWorkflowFormSubmission = z.infer<typeof assistantWorkflowFormSubmissionSchema>;
export type WorkflowContextRequestChatMetadata = z.infer<typeof workflowContextRequestChatMetadataSchema>;
export type AssistantWorkflowContextRequestSummary = z.infer<
  typeof assistantWorkflowContextRequestSummarySchema
>;
export type AssistantWorkflowContextRequestSubmission = z.infer<
  typeof assistantWorkflowContextRequestSubmissionSchema
>;

export type AssistantDto = {
  id: string;
  workspaceId: string;
  name?: string | null;
  description?: string | null;
  systemPrompt?: string | null;
  modelId?: string | null;
  llmProviderConfigId?: string | null;
  llmModelSelection: AssistantLlmModelSelection;
  collectionName?: string | null;
  isSystem: boolean;
  systemKey?: string | null;
  /** Read-only-инстанс из сборки (install mode=reference): конфиг защищён от правки. */
  locked: boolean;
  /** Провенанс: из какой сборки материализован ассистент (null — создан вручную). */
  originBuildId?: string | null;
  executionMode: AssistantExecutionMode;
  mediaInputMode: AssistantMediaInputMode;
  status: "active" | "archived";
  mode: AssistantMode;
  knowledgeBaseIds?: string[];
  ragConfig: AssistantRagConfig;
  transcriptionFlowMode: AssistantTranscriptionFlowMode;
  onTranscriptionMode: AssistantTranscriptionMode;
  onTranscriptionAutoActionId: string | null;
  asrProviderId?: string | null;
  unicaAsrAdvancedOptions: UnicaAsrAdvancedOptions;
  icon?: string | null;
  iconColor: AssistantIconColor;
  workflowBinding: AssistantWorkflowBinding | null;
  transcriptionWorkflowBinding: AssistantTranscriptionWorkflowBinding | null;
  effectiveLlmConfig: AssistantEffectiveLlmConfig | null;
  sharedChatFiles: boolean;
  contextInputLimit: number | null;
  llmTopP: number | null;
  llmTopK: number | null;
  llmRepeatPenalty: number | null;
  llmSeed: number | null;
  llmMaxCompletionTokens: number | null;
  createdAt: string;
  updatedAt: string;
};

export type AssistantRagConfig = {
  mode: AssistantRagMode;
  searchMode: AssistantSearchMode;
  embeddingMode: AssistantEmbeddingMode;
  strategy: SearchProfileStrategy | null;
  collectionIds: string[];
  topK: number | null;
  minScore: number | null;
  maxContextTokens: number | null;
  showSources: boolean;
  historyMessagesLimit: number | null;
  historyCharsLimit: number | null;
  enableQueryRewriting: boolean | null;
  queryRewriteModel: string | null;
  enableContextCaching: boolean | null;
  contextCacheTtlSeconds: number | null;
  bm25Weight: number | null;
  bm25Limit: number | null;
  vectorWeight: number | null;
  vectorLimit: number | null;
  bm25Threshold: number | null;
  vectorThreshold: number | null;
  rrfK: number | null;
  rerankEnabled: boolean | null;
  rerankProviderId: string | null;
  rerankModel: string | null;
  rerankPrompt: string | null;
  rerankCandidateCount: number | null;
  embeddingProviderId: string | null;
  embeddingModel: string | null;
  llmTemperature: number | null;
  llmMaxCompletionTokens: number | null;
  llmResponseFormat: "text" | "markdown" | "html" | null;
};

export type AssistantResponse = {
  assistant: AssistantDto;
};

export type AssistantListResponse = {
  assistants: AssistantDto[];
};

export type AssistantCallbackTokenResponse = {
  token: string;
  lastFour: string;
  rotatedAt: string;
  assistant: AssistantDto;
};

// Actions domain
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

export function normalizeActionInputType(
  inputType: ActionInputType | string | null | undefined,
): ActionInputType {
  if (inputType === "selection" || inputType === "message_text") {
    return inputType;
  }

  return "full_text";
}

export function normalizeActionSources(
  sources: readonly unknown[] | null | undefined,
  fallbackTarget?: ActionTarget | string | null,
): ActionSource[] {
  const next: ActionSource[] = [];

  if (Array.isArray(sources)) {
    for (const source of sources) {
      if (typeof source !== "string") {
        continue;
      }
      if (!actionSources.includes(source as ActionSource)) {
        continue;
      }
      if (!next.includes(source as ActionSource)) {
        next.push(source as ActionSource);
      }
    }
  }

  if (next.length > 0) {
    return next;
  }

  if (typeof fallbackTarget === "string" && actionSources.includes(fallbackTarget as ActionSource)) {
    return [fallbackTarget as ActionSource];
  }

  return [];
}

export const actionOutputModes = ["replace_text", "new_version", "new_message", "document"] as const;
export type ActionOutputMode = (typeof actionOutputModes)[number];

export const actionKinds = ["prompt", "tool", "hybrid"] as const;
export type ActionKind = (typeof actionKinds)[number];

export const actionLlmPolicyModes = ["action_managed", "inherit_binding", "inherit_legacy_assistant"] as const;
export type ActionLlmPolicyMode = (typeof actionLlmPolicyModes)[number];

export const actionStatuses = ["active", "archived"] as const;
export type ActionStatus = (typeof actionStatuses)[number];

export type ActionDto = {
  id: string;
  scope: ActionScope;
  workspaceId: string | null;
  label: string;
  description: string | null;
  target: ActionTarget;
  sources: ActionSource[];
  placements: ActionPlacement[];
  promptTemplate: string;
  inputType: ActionInputType;
  outputMode: ActionOutputMode;
  actionKind: ActionKind;
  toolName: string | null;
  toolConfig: Record<string, unknown>;
  llmPolicyMode: ActionLlmPolicyMode;
  inheritAssistantSystemPrompt: boolean;
  llmProviderConfigId: string | null;
  llmModelId: string | null;
  llmTemperature: number | null;
  llmMaxCompletionTokens: number | null;
  llmTopP: number | null;
  llmTopK: number | null;
  llmRepeatPenalty: number | null;
  llmSeed: number | null;
  inputContract: Record<string, unknown>;
  outputContract: Record<string, unknown>;
  status: ActionStatus;
  // Legacy compatibility: старое поле action LLM-конфига.
  llmConfigId: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
};

export type AssistantActionDto = {
  id: string;
  assistantId: string;
  actionId: string;
  enabled: boolean;
  enabledPlacements: ActionPlacement[];
  labelOverride: string | null;
  createdAt: string;
  updatedAt: string;
};

export const actionBindingEntityTypes = [
  "assistant",
  "knowledge_document",
  "knowledge_base",
  "chat",
  "workspace_default",
] as const;
export type ActionBindingEntityType = (typeof actionBindingEntityTypes)[number];

export type ActionBindingDto = {
  id: string;
  workspaceId: string;
  actionId: string;
  entityType: ActionBindingEntityType;
  entityId: string;
  entityDisplayName?: string | null;
  entityHref?: string | null;
  enabled: boolean;
  placementConfig: Record<string, unknown>;
  constraints: Record<string, unknown>;
  labelOverride: string | null;
  source: "binding" | "legacy_assistant_action";
  createdAt: string;
  updatedAt: string;
};
