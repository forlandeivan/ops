import { z } from "zod";

import { PROMPT_TEXT_MAX, formatPromptLengthError } from "./prompt-limits";
import {
  agentWorkflowContextRequestSubmissionSchema,
  contextRefSchema,
  contextRefTargetTypes,
  resolvedContextRefSchema,
  workflowContextRequestChatMetadataSchema,
} from "./context-refs";
import {
  agentEmbeddingModes,
  agentExecutionModes,
  agentLlmModelSelections,
  agentMediaInputModes,
  agentModes,
  agentRagModes,
  agentSearchModes,
  agentTranscriptionModes,
  agentTranscriptionFlowModes,
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
  AgentEmbeddingMode,
  AgentExecutionMode,
  AgentLlmModelSelection,
  AgentMediaInputMode,
  AgentMode,
  AgentRagMode,
  AgentSearchMode,
  SearchProfileStrategy,
  AgentTranscriptionMode,
  AgentTranscriptionFlowMode,
  UnicaAsrAdvancedOptions,
} from "./schema";

export const DEFAULT_AGENT_MAX_COMPLETION_TOKENS = 16000;

export type AgentTranscriptionCompletionConfig = {
  onTranscriptionMode: AgentTranscriptionMode;
  onTranscriptionAutoActionId: string | null;
};

export function usesBuiltInAgentTranscription(
  executionMode: AgentExecutionMode,
  transcriptionFlowMode: AgentTranscriptionFlowMode,
): boolean {
  return executionMode === "standard" && transcriptionFlowMode === "standard";
}

export function normalizeAgentTranscriptionCompletionConfig(params: {
  executionMode: AgentExecutionMode;
  transcriptionFlowMode: AgentTranscriptionFlowMode;
  onTranscriptionMode?: AgentTranscriptionMode | null;
  onTranscriptionAutoActionId?: string | null;
}): AgentTranscriptionCompletionConfig {
  const autoActionId = params.onTranscriptionAutoActionId?.trim() || null;
  const canRunAutoAction =
    usesBuiltInAgentTranscription(params.executionMode, params.transcriptionFlowMode) &&
    params.onTranscriptionMode === "auto_action" &&
    Boolean(autoActionId);

  return canRunAutoAction
    ? {
        onTranscriptionMode: "auto_action",
        onTranscriptionAutoActionId: autoActionId,
      }
    : {
        onTranscriptionMode: "raw_only",
        onTranscriptionAutoActionId: null,
      };
}

export const agentIconColors = [
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
export type AgentIconColor = (typeof agentIconColors)[number];

export const DEFAULT_AGENT_ICON_COLOR: AgentIconColor = "gray";

export type AgentIconColorPreset = {
  value: AgentIconColor;
  label: string;
  foreground: string;
  background: string;
  border: string;
};

export const AGENT_ICON_COLOR_PRESETS: Record<AgentIconColor, AgentIconColorPreset> = {
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
    // Legacy persisted value: existing assistants keep rendering it, but the
    // preset is intentionally excluded from the selectable UI options below.
    label: "Красный",
    foreground: "#C4554D",
    background: "#FDEBEC",
    border: "#F0CFD0",
  },
};

export const AGENT_ICON_COLOR_OPTIONS = agentIconColors
  // Persisted legacy colors remain renderable, but new selections use one
  // canonical gray and exclude the retired red preset.
  .filter((value) => value !== "lightgray" && value !== "red")
  .map((value) => AGENT_ICON_COLOR_PRESETS[value]);

export function isAgentIconColor(value: unknown): value is AgentIconColor {
  return typeof value === "string" && agentIconColors.includes(value as AgentIconColor);
}

export function normalizeAgentIconColor(value: unknown): AgentIconColor {
  return isAgentIconColor(value) ? value : DEFAULT_AGENT_ICON_COLOR;
}

export function getAgentIconColorPreset(value: unknown): AgentIconColorPreset {
  return AGENT_ICON_COLOR_PRESETS[normalizeAgentIconColor(value)];
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
    }, {
      error: (issue) =>
        formatPromptLengthError(
          "Поле",
          limit,
          typeof issue.input === "string" ? issue.input.length : limit,
        ),
    });

const optionalText = (limit: number) =>
  z
    .union([z.string(), z.null()])
    .optional()
    .refine((value) => {
      if (value === null || value === undefined) {
        return true;
      }
      return value.length <= limit;
    }, {
      error: (issue) =>
        formatPromptLengthError(
          "Поле",
          limit,
          typeof issue.input === "string" ? issue.input.length : limit,
        ),
    });

const knowledgeBaseIdSchema = z.string().min(1);

const ragConfigInputSchema = z.object({
  mode: z.enum(agentRagModes).optional(),
  searchMode: z.enum(agentSearchModes).optional(),
  embeddingMode: z.enum(agentEmbeddingModes).optional(),
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
  queryRewriteProviderId: optionalString(255),
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
  rerankPrompt: optionalText(PROMPT_TEXT_MAX),
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
    /** @deprecated Release-A passthrough only; SpeechRecognition v2 ignores this section. */
    processingOptions: unicaAsrAdvancedOptionRecordSchema.optional(),
    /** @deprecated Release-A passthrough only; SpeechRecognition v2 ignores this section. */
    vadOptions: unicaAsrAdvancedOptionRecordSchema.optional(),
    generalOptions: unicaAsrAdvancedOptionRecordSchema.optional(),
  })
  .optional();

const assistantEditableFieldsSchema = z.object({
  name: optionalString(200),
  description: optionalText(4000),
  systemPrompt: optionalText(PROMPT_TEXT_MAX),
  modelId: optionalString(200),
  llmProviderConfigId: optionalString(200),
  llmModelSelection: z.enum(agentLlmModelSelections).optional(),
  collectionName: optionalString(200),
  executionMode: z.enum(agentExecutionModes).optional(),
  mediaInputMode: z.enum(agentMediaInputModes).optional(),
  workflowDefinitionId: z.string().uuid().nullable().optional(),
  workflowSystemTemplateKey: optionalString(255),
  transcriptionWorkflowDefinitionId: z.string().uuid().nullable().optional(),
  mode: z.enum(agentModes).optional(),
  knowledgeBaseIds: z.array(knowledgeBaseIdSchema).optional(),
  ragConfig: ragConfigInputSchema.optional(),
  icon: optionalString(100),
  iconColor: z.enum(agentIconColors).nullable().optional(),
  onTranscriptionMode: z.enum(agentTranscriptionModes).optional(),
  onTranscriptionAutoActionId: optionalString(200),
  transcriptionFlowMode: z.enum(agentTranscriptionFlowModes).optional(),
  contextInputLimit: contextInputLimitSchema,
  llmTopP: z.number().min(0).max(1).nullable().optional(),
  llmTopK: z.number().int().min(1).max(200).nullable().optional(),
  llmRepeatPenalty: z.number().min(0).max(2).nullable().optional(),
  llmSeed: z.number().int().min(0).max(999999).nullable().optional(),
  unicaAsrAdvancedOptions: unicaAsrAdvancedOptionsSchema,
});

/**
 * У создания название обязательно, у правки — нет.
 *
 * Поля общего набора необязательны намеренно: правка присылает только то, что меняет, и
 * непереданное остаётся как было. Но для создания та же необязательность означала, что
 * пустое тело заводит агента с `name = null` — форма проверяет поле на клиенте, а за
 * ней не проверял никто, и безымянная запись занимала строку в списке. Требование ставится
 * на схему запроса, а не на общий тип полезной нагрузки: им же пользуется перенос
 * агентов, который собирает объект по частям.
 */
export const createAgentSchema = assistantEditableFieldsSchema.extend({
  name: z
    .string({ error: 'Укажите название агента' })
    .trim()
    .min(1, 'Укажите название агента')
    .max(200, 'Название не длиннее 200 символов'),
});
export const updateAgentSchema = assistantEditableFieldsSchema;

export type CreateAgentPayload = z.infer<typeof assistantEditableFieldsSchema>;
export type UpdateAgentPayload = z.infer<typeof updateAgentSchema>;

export type AgentWorkflowBinding = {
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

export type AgentTranscriptionWorkflowBinding = AgentWorkflowBinding;

/**
 * Занятость workspace-сценария workflow-агентом (строгое 1:1). Используется пикером
 * сценария в настройках агента, чтобы дизейблить definition, уже привязанные к ДРУГОМУ
 * агенту. `assistantId` — id агента, который сейчас держит этот сценарий.
 */
export type WorkflowScenarioBindingDto = {
  definitionId: string;
  assistantId: string;
};

export type WorkflowScenarioBindingsResponseDto = {
  bindings: WorkflowScenarioBindingDto[];
};

export type AgentEffectiveLlmConfig = {
  source: "assistant" | "assistant_default" | "chat_override";
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

export const agentWorkflowApprovalDecisionSchema = z.object({
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
  // Строка под составом: чем станет показанный текст, например инструкцией для модели.
  notice: z.string().trim().min(1).max(240).optional(),
  // Состав не поместился в карточку: полный текст отдаёт GET согласования с include=display.
  hasFullText: z.boolean().optional(),
});

export const workflowApprovalDisplaySectionSchema = z.object({
  label: z.string().trim().min(1).max(120),
  text: z.string().max(20000),
});

/** Полный состав операции для блока «Показать полностью» в карточке согласования. */
export const workflowApprovalDisplaySchema = z.object({
  sections: z.array(workflowApprovalDisplaySectionSchema).max(24),
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

export const agentWorkflowApprovalSummarySchema = z.object({
  id: z.string().uuid(),
  runId: z.string().uuid(),
  workspaceId: z.string(),
  agentId: z.string().optional(),
  agentName: z.string().nullable().optional(),
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

export const agentWorkflowFormRequestSummarySchema = z.object({
  id: z.string().uuid(),
  runId: z.string().uuid(),
  workspaceId: z.string(),
  agentId: z.string().optional(),
  agentName: z.string().nullable().optional(),
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

export const agentWorkflowFormSubmissionSchema = z.object({
  payload: z.record(z.string(), z.unknown()),
});

export { agentWorkflowContextRequestSubmissionSchema, workflowContextRequestChatMetadataSchema };

export const agentWorkflowContextRequestSummarySchema = z.object({
  id: z.string().uuid(),
  runId: z.string().uuid(),
  workspaceId: z.string(),
  agentId: z.string().optional(),
  agentName: z.string().nullable().optional(),
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
export type WorkflowApprovalDisplay = z.infer<typeof workflowApprovalDisplaySchema>;
export type WorkflowFormField = z.infer<typeof workflowFormFieldSchema>;
export type WorkflowFormFieldReview = z.infer<typeof workflowFormFieldReviewSchema>;
export type WorkflowFormProvenanceEntry = z.infer<typeof workflowFormProvenanceEntrySchema>;
export type WorkflowFormSchema = z.infer<typeof workflowFormSchemaSchema>;
export type WorkflowFormChatMetadata = z.infer<typeof workflowFormChatMetadataSchema>;
export type AgentChoicePromptOption = z.infer<typeof agentChoicePromptOptionSchema>;
export type AgentChoicePrompt = z.infer<typeof agentChoicePromptSchema>;
export type AgentWorkflowApprovalSummary = z.infer<typeof agentWorkflowApprovalSummarySchema>;
export type AgentWorkflowApprovalDecision = z.infer<typeof agentWorkflowApprovalDecisionSchema>;
export type AgentWorkflowFormRequestSummary = z.infer<typeof agentWorkflowFormRequestSummarySchema>;
export type AgentWorkflowFormSubmission = z.infer<typeof agentWorkflowFormSubmissionSchema>;
export type WorkflowContextRequestChatMetadata = z.infer<typeof workflowContextRequestChatMetadataSchema>;
export type AgentWorkflowContextRequestSummary = z.infer<
  typeof agentWorkflowContextRequestSummarySchema
>;
export type AgentWorkflowContextRequestSubmission = z.infer<
  typeof agentWorkflowContextRequestSubmissionSchema
>;

/**
 * Откуда установлен агент, поставленный пакетом по ссылке: репозиторий Git-хостинга, архив или файл-агент.
 * У агента, созданного руками, загруженного архивом или скопированного из источника, происхождения нет.
 */
export type AgentPackageOriginDto = {
  sourceKind: "git" | "archive" | "file";
  /** Адрес источника: репозиторий без ветки и подпапки либо прямая ссылка. */
  sourceUrl: string;
  /** Папка агента или файл-агент внутри источника; пусто — корень. */
  sourcePath: string;
  /** Ветка или тег, если ссылка их называла. */
  ref: string | null;
  /** Точный установленный коммит; null у прямой ссылки. */
  commit: string | null;
  /** Версия из шапки AGENT.md. */
  version: string | null;
  installedAt: string;
};

export type AgentDto = {
  id: string;
  workspaceId: string;
  /** Заполняется в списке и карточке агента; отсутствует там, где происхождение не запрашивали. */
  packageOrigin?: AgentPackageOriginDto | null;
  name?: string | null;
  description?: string | null;
  systemPrompt?: string | null;
  modelId?: string | null;
  llmProviderConfigId?: string | null;
  llmModelSelection: AgentLlmModelSelection;
  collectionName?: string | null;
  isSystem: boolean;
  systemKey?: string | null;
  /** Read-only-инстанс из сборки (install mode=reference): конфиг защищён от правки. */
  locked: boolean;
  /** Провенанс: из какой сборки материализован агент (null — создан вручную). */
  originBuildId?: string | null;
  executionMode: AgentExecutionMode;
  mediaInputMode: AgentMediaInputMode;
  /** training_draft — черновик обучения: скрытая копия, в списки не попадает. */
  status: "active" | "archived" | "training_draft";
  mode: AgentMode;
  knowledgeBaseIds?: string[];
  ragConfig: AgentRagConfig;
  transcriptionFlowMode: AgentTranscriptionFlowMode;
  onTranscriptionMode: AgentTranscriptionMode;
  onTranscriptionAutoActionId: string | null;
  unicaAsrAdvancedOptions: UnicaAsrAdvancedOptions;
  icon?: string | null;
  iconColor: AgentIconColor;
  workflowBinding: AgentWorkflowBinding | null;
  transcriptionWorkflowBinding: AgentTranscriptionWorkflowBinding | null;
  effectiveLlmConfig: AgentEffectiveLlmConfig | null;
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

export type AgentRagConfig = {
  mode: AgentRagMode;
  searchMode: AgentSearchMode;
  embeddingMode: AgentEmbeddingMode;
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
  queryRewriteProviderId: string | null;
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

export type AgentResponse = {
  agent: AgentDto;
};

export type AgentListResponse = {
  agents: AgentDto[];
};

export type AgentCallbackTokenResponse = {
  token: string;
  lastFour: string;
  rotatedAt: string;
  assistant: AgentDto;
};

// Actions domain
export const actionScopes = ["system", "workspace"] as const;
export type ActionScope = (typeof actionScopes)[number];

export const actionTargets = ["transcript", "knowledge_document", "message", "selection", "conversation", "chat_attachment"] as const;
export type ActionTarget = (typeof actionTargets)[number];

export const actionSources = actionTargets;
export type ActionSource = (typeof actionSources)[number];

export const actionPlacements = ["canvas", "chat_message", "chat_toolbar", "composer_slash"] as const;
export type ActionPlacement = (typeof actionPlacements)[number];

/**
 * Кто может вызвать действие. Правило одно на оба листинга: каталог агента (хвост Tool-RAG) и
 * меню поля ввода. Живёт в shared, а не в серверном модуле действий, чтобы фильтрация не тянула
 * за собой доступ к базе — иначе маршруту и индексатору пришлось бы грузить репозиторий целиком.
 */
export function isAgentInvocableAction(action: { invocableBy?: ActionInvocableBy | null }): boolean {
  return action.invocableBy !== "user";
}

export function isUserInvocableAction(action: { invocableBy?: ActionInvocableBy | null }): boolean {
  return action.invocableBy !== "agent";
}

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

// agent — агентская команда: не исполняется движком действий, ход чата уходит агенту с задачей команды.
export const actionKinds = ["prompt", "tool", "hybrid", "agent"] as const;
export type ActionKind = (typeof actionKinds)[number];

// Кому доступно действие: только человеку из UI, только рантайму агента, либо обоим.
// Владеет полем код (для системных действий — реестр server/system-actions), пользовательские
// действия остаются "both". Нужно, чтобы системное действие можно было отдать пользователю,
// не отдавая его модели как инструмент.
export const actionInvocableBy = ["user", "agent", "both"] as const;
export type ActionInvocableBy = (typeof actionInvocableBy)[number];

export const actionLlmPolicyModes = ["action_managed", "inherit_binding", "inherit_agent"] as const;
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
  invocableBy: ActionInvocableBy;
  toolName: string | null;
  toolConfig: Record<string, unknown>;
  llmPolicyMode: ActionLlmPolicyMode;
  inheritAgentSystemPrompt: boolean;
  /** @deprecated Older action API clients read this alias. */
  inheritAssistantSystemPrompt?: boolean;
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

export type AgentActionDto = {
  id: string;
  agentId: string;
  assistantId: string;
  actionId: string;
  enabled: boolean;
  enabledPlacements: ActionPlacement[];
  labelOverride: string | null;
  createdAt: string;
  updatedAt: string;
};

export const actionBindingEntityTypes = [
  "agent",
  "knowledge_document",
  "knowledge_base",
  "chat",
  "workspace_default",
] as const;
export type ActionBindingEntityType = (typeof actionBindingEntityTypes)[number];

export function parseActionBindingEntityType(value: unknown): ActionBindingEntityType | undefined {
  const name = typeof value === "string" ? value.trim() : undefined;
  if (name === "assistant") return "agent";
  return actionBindingEntityTypes.find((type) => type === name);
}

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
