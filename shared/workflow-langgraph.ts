import { z } from "zod";

import {
  WORKFLOW_JSON_SCHEMA_VERSION,
  workflowNodeKindSchema,
  workflowNodeKinds,
  type WorkflowNodeKind,
} from "./workflow-compiler";

export const WORKFLOW_LANGGRAPH_TARGET_SCHEMA_VERSION = 1 as const;

export const workflowLangGraphSupportLevels = [
  "supported",
  "adapter_required",
  "unsupported",
] as const;

export const workflowLangGraphReadinessStatuses = [
  "fully_compatible",
  "partial_adapter_required",
  "incompatible",
] as const;

export const workflowLangGraphSupportLevelSchema = z.enum(workflowLangGraphSupportLevels);
export const workflowLangGraphReadinessStatusSchema = z.enum(workflowLangGraphReadinessStatuses);

export const workflowLangGraphStateChannelSchema = z.object({
  key: z.string().min(1),
  valueType: z.string().min(1),
  reducer: z.enum(["overwrite", "merge_object", "custom_adapter"]),
  description: z.string().min(1),
});

export const workflowLangGraphTargetNodeSchema = z.object({
  id: z.string().min(1),
  stepId: z.string().min(1),
  nodeId: z.string().min(1),
  title: z.string().min(1),
  kind: workflowNodeKindSchema,
  targetType: z.enum(["start", "node", "router", "end"]),
  supportLevel: workflowLangGraphSupportLevelSchema,
  stateWrites: z.array(z.string().min(1)),
  notes: z.array(z.string().min(1)),
});

export const workflowLangGraphTargetEdgeSchema = z.object({
  id: z.string().min(1),
  from: z.string().min(1),
  to: z.string().min(1),
  viaPort: z.string().min(1).nullable(),
  condition: z.string().min(1).nullable(),
});

export const workflowLangGraphReducerSchema = z.object({
  key: z.string().min(1),
  strategy: z.enum(["merge_object", "custom_adapter"]),
  reason: z.string().min(1),
});

export const workflowLangGraphInterruptSchema = z.object({
  nodeId: z.string().min(1),
  stepId: z.string().min(1),
  reason: z.string().min(1),
});

export const workflowLangGraphAdapterRequirementSchema = z.object({
  nodeId: z.string().min(1),
  stepId: z.string().min(1),
  kind: workflowNodeKindSchema,
  adapterKey: z.string().min(1),
  description: z.string().min(1),
});

export const workflowLangGraphUnsupportedMappingSchema = z.object({
  nodeId: z.string().min(1),
  stepId: z.string().min(1),
  kind: workflowNodeKindSchema,
  reason: z.string().min(1),
});

export const langGraphTargetV1Schema = z.object({
  schemaVersion: z.literal(WORKFLOW_LANGGRAPH_TARGET_SCHEMA_VERSION),
  sourceWorkflowSchemaVersion: z.number().int().min(1).nullable(),
  sourceIrSchemaVersion: z.number().int().min(1).nullable(),
  stateSchema: z.object({
    namespaces: z.array(z.string().min(1)),
    channels: z.array(workflowLangGraphStateChannelSchema),
  }),
  nodes: z.array(workflowLangGraphTargetNodeSchema),
  edges: z.array(workflowLangGraphTargetEdgeSchema),
  reducers: z.array(workflowLangGraphReducerSchema),
  interrupts: z.array(workflowLangGraphInterruptSchema),
  adapterRequirements: z.array(workflowLangGraphAdapterRequirementSchema),
  unsupported: z.array(workflowLangGraphUnsupportedMappingSchema),
});

export const workflowLangGraphNodeSupportSchema = z.object({
  nodeId: z.string().min(1),
  stepId: z.string().min(1),
  title: z.string().min(1),
  kind: workflowNodeKindSchema,
  targetNodeId: z.string().min(1),
  supportLevel: workflowLangGraphSupportLevelSchema,
  reasons: z.array(z.string().min(1)),
  adapterRequirements: z.array(z.string().min(1)),
  blocking: z.boolean(),
});

export const workflowLangGraphPackageVerificationSchema = z.object({
  verified: z.boolean(),
  langgraphVersion: z.string().min(1).nullable(),
  coreVersion: z.string().min(1).nullable(),
  checkedExports: z.array(z.string().min(1)),
  warnings: z.array(z.string().min(1)),
});

export const workflowLangGraphCompatibilitySchema = z.object({
  status: workflowLangGraphReadinessStatusSchema,
  checkedAt: z.string().datetime(),
  targetSchemaVersion: z.literal(WORKFLOW_LANGGRAPH_TARGET_SCHEMA_VERSION),
  sourceWorkflowSchemaVersion: z.number().int().min(1).nullable(),
  sourceIrSchemaVersion: z.number().int().min(1).nullable(),
  expectedWorkflowSchemaVersion: z.literal(WORKFLOW_JSON_SCHEMA_VERSION),
  // L1.2b: IR-бамп V2→V3 — старые starter-бандлы/снапшоты несут expectedIrSchemaVersion=2.
  // Толерантно принимаем legacy (свежая компиляция пишет текущую версию). Потолок «версия из
  // будущего → incompatible» проверяет server/workflow-governance по sourceIrSchemaVersion.
  expectedIrSchemaVersion: z.number().int().min(1),
  supportedNodeCount: z.number().int().nonnegative(),
  adapterRequiredNodeCount: z.number().int().nonnegative(),
  unsupportedNodeCount: z.number().int().nonnegative(),
  adapterRequirements: z.array(z.string().min(1)),
  reasons: z.array(z.string().min(1)),
  supportMatrix: z.array(workflowLangGraphNodeSupportSchema),
  packageVerification: workflowLangGraphPackageVerificationSchema.optional(),
});

export const workflowLangGraphPreviewSchema = z.object({
  target: langGraphTargetV1Schema,
  generatedCode: z.string(),
  compatibility: workflowLangGraphCompatibilitySchema,
  supportMatrix: z.array(workflowLangGraphNodeSupportSchema),
});

export type WorkflowLangGraphSupportLevel = z.infer<typeof workflowLangGraphSupportLevelSchema>;
export type WorkflowLangGraphReadinessStatus = z.infer<typeof workflowLangGraphReadinessStatusSchema>;
export type LangGraphTargetV1 = z.infer<typeof langGraphTargetV1Schema>;
export type WorkflowLangGraphNodeSupportDto = z.infer<typeof workflowLangGraphNodeSupportSchema>;
export type WorkflowLangGraphCompatibilityDto = z.infer<typeof workflowLangGraphCompatibilitySchema>;
export type WorkflowLangGraphPreviewDto = z.infer<typeof workflowLangGraphPreviewSchema>;

/**
 * ЕДИНЫЙ ИСТОЧНИК ИСТИНЫ: уровень live-поддержки КАЖДОГО типа узла движком LangGraph.
 * Из этой карты выводятся одновременно два потребителя, которые раньше дублировали список руками
 * и из-за этого разъезжались:
 *  - whitelist рантайма `workflowLangGraphLiveSupportedNodeKinds` (pre-flight гвард исполнения);
 *  - уровень совместимости в compile-preview `getSupportClassification` (гейт публикации + UI-бейдж).
 *
 * `Record<WorkflowNodeKind, ...>` делает карту ИСЧЕРПЫВАЮЩЕЙ: добавив тип узла в `workflowNodeKinds`,
 * вы получите ошибку компиляции здесь, пока явно не укажете его уровень поддержки. Так новый узел
 * не может «тихо отвалиться» на исполнении, пройдя публикацию (как было с `respond_webhook`).
 */
export const workflowLangGraphNodeLiveSupport: Record<WorkflowNodeKind, WorkflowLangGraphSupportLevel> = {
  start: "supported",
  external_message_trigger: "supported",
  webhook_trigger: "supported",
  finish: "supported",
  ai: "supported",
  agent: "supported",
  tool: "supported",
  http_request: "supported",
  knowledge: "supported",
  document_sources: "supported",
  condition: "supported",
  smalltalk_router: "supported",
  router: "supported",
  approval: "supported",
  delay: "supported",
  merge: "supported",
  chat_message: "supported",
  assistant_action: "supported",
  bot_action: "supported",
  transcript: "supported",
  transcript_card: "supported",
  form_card: "supported",
  script_transform: "supported",
  custom_code_node: "supported",
  canvas_document: "supported",
  document_card: "supported",
  respond_webhook: "supported",
  typed_template: "supported",
  docx_render: "supported",
  grounded_extract: "supported",
  constrained_generate: "supported",
  select_suggest: "supported",
  finalization_gate: "supported",
  checklist_verify: "supported",
  reference_data: "supported",
  data_transform: "supported",
};

/** Типы узлов, исполнимые live-движком LangGraph (выведены из единого источника выше). */
export const workflowLangGraphLiveSupportedNodeKinds: WorkflowNodeKind[] = workflowNodeKinds.filter(
  (kind) => workflowLangGraphNodeLiveSupport[kind] === "supported",
);
