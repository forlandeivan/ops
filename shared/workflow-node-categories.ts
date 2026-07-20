import { z } from "zod";

import type { WorkflowNodeKind } from "./workflow-compiler";

/**
 * Функциональные категории узлов workflow-редактора.
 *
 * Категория описывает РОЛЬ узла в графе (что он делает с потоком/данными),
 * а не механизм реализации (использует ли LLM — деталь). Категория нигде не
 * персистится: в документ сценария сериализуется только `kind`, а категория
 * всегда вычисляется из него. Поэтому таксономию можно менять без миграций.
 */
export const workflowNodeCategories = [
  "triggers",
  "ai_agents",
  "flow_logic",
  "human_in_loop",
  "data_documents",
  "data_transform",
  "integrations",
  "channel_output",
  "advanced",
] as const;

export type WorkflowNodeCategory = (typeof workflowNodeCategories)[number];

export const workflowNodeCategorySchema = z.enum(workflowNodeCategories);

/**
 * ЕДИНЫЙ ИСТОЧНИК ИСТИНЫ: категория КАЖДОГО типа узла.
 * Потребители: группировка/поиск в палитре редактора; в перспективе — правила
 * по типу блока (валидация, права, ограничения размещения) как параллельные
 * карты `Record<WorkflowNodeCategory, ...>` рядом с этой.
 *
 * `Record<WorkflowNodeKind, ...>` делает карту ИСЧЕРПЫВАЮЩЕЙ: добавив тип узла
 * в `workflowNodeKinds`, вы получите ошибку компиляции здесь, пока явно не
 * назначите ему категорию. Так новый узел не может «тихо» остаться вне палитры.
 *
 * Инвариант: `triggers` ⟺ `workflowEntryNodeKinds` (закреплён тестом
 * tests/client/workflow-node-categories.test.ts).
 */
export const workflowNodeCategoryByKind: Record<WorkflowNodeKind, WorkflowNodeCategory> = {
  start: "triggers",
  external_message_trigger: "triggers",
  webhook_trigger: "triggers",
  finish: "flow_logic",
  ai: "ai_agents",
  agent: "ai_agents",
  tool: "integrations",
  http_request: "integrations",
  knowledge: "ai_agents",
  document_sources: "data_documents",
  condition: "flow_logic",
  smalltalk_router: "flow_logic",
  router: "flow_logic",
  approval: "human_in_loop",
  delay: "flow_logic",
  merge: "flow_logic",
  chat_message: "channel_output",
  assistant_action: "channel_output",
  bot_action: "channel_output",
  transcript: "data_documents",
  transcript_card: "channel_output",
  form_card: "human_in_loop",
  script_transform: "advanced",
  custom_code_node: "advanced",
  canvas_document: "data_documents",
  document_card: "channel_output",
  respond_webhook: "integrations",
  typed_template: "data_documents",
  docx_render: "data_documents",
  grounded_extract: "data_documents",
  constrained_generate: "data_documents",
  select_suggest: "data_documents",
  finalization_gate: "data_documents",
  checklist_verify: "data_documents",
  reference_data: "data_documents",
  data_transform: "data_transform",
};

export function getWorkflowNodeCategory(kind: WorkflowNodeKind): WorkflowNodeCategory {
  return workflowNodeCategoryByKind[kind];
}
