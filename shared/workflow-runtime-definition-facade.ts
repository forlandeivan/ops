/**
 * @shared-фасад резолверов дефиниций workflow (W2/S8 Tier-2,
 * docs/w2-workflow-packaging-plan.md §5). Сигнатуры 4 функций
 * `assistant-workflow-control-service`, которые ядро зовёт через `WorkflowDefinitionPort` —
 * чтобы `workflow-definition-port.ts` компилировался без type-импорта `../workflow-control/*`.
 *
 * Row-типы дефиниции/версии уже экспортируются из `@shared/schema`
 * (`WorkflowDefinition`/`WorkflowDefinitionVersion` = `$inferSelect` тех же таблиц),
 * binding-типы — из `@shared/assistants`. Дрейф ловится на wire.
 */

import type { WorkflowDefinition, WorkflowDefinitionVersion } from "@shared/schema";
import type {
  AssistantTranscriptionWorkflowBinding,
  AssistantWorkflowBinding,
} from "@shared/assistants";

/** Скоуп исполнения — та же пара вариантов, что у definitions-service/рантайма. */
export type WorkflowExecutionScope =
  | { scopeKind: "global"; kind: "template"; workspaceId: null }
  | { scopeKind: "workspace"; kind: "scenario"; workspaceId: string };

/** Резолверы дефиниций/версий/скоупа — подмножество, инжектируемое в порт рантайма. */
export type WorkflowDefinitionResolversFacade = {
  resolveWorkflowDefinitionForExecution(params: {
    workspaceId: string;
    definitionId: string;
    requireLiveReady?: boolean;
  }): Promise<{
    definition: WorkflowDefinition;
    version: WorkflowDefinitionVersion;
    scope: WorkflowExecutionScope;
  }>;
  resolveWorkflowExecutionScopeByDefinitionId(
    workspaceId: string,
    definitionId: string,
  ): Promise<WorkflowExecutionScope>;
  resolveAssistantWorkflowDefinition(params: {
    definitionId: string;
    requireLiveReady?: boolean;
  }): Promise<{
    definition: WorkflowDefinition;
    version: WorkflowDefinitionVersion;
    binding: AssistantWorkflowBinding;
  }>;
  resolveAssistantTranscriptionWorkflowDefinition(params: {
    workspaceId: string;
    definitionId: string;
    requireLiveReady?: boolean;
  }): Promise<{
    definition: WorkflowDefinition;
    version: WorkflowDefinitionVersion;
    binding: AssistantTranscriptionWorkflowBinding;
  }>;
};
