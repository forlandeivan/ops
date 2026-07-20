/**
 * @shared-фасад журнала исполнений ассистента для workflow-runtime (W2/S8 Tier-2,
 * docs/w2-workflow-packaging-plan.md §5). Подмножество `AssistantExecutionLogService`
 * (`logStep`/`finishExecution`), которое использует ядро через `WorkflowGateway.executionLog`.
 *
 * Реализация (класс) остаётся в монолите; wire присваивает singleton-сервис полю порта, tsc
 * проверяет совместимость. Статусы/типы шагов и запись исполнения уже в `@shared`.
 */

import type {
  AssistantExecutionRecord,
  AssistantExecutionStatus,
  AssistantExecutionStepStatus,
  AssistantExecutionStepType,
} from "@shared/assistant-execution-log";

/** server/assistant-execution-log-service.ts — параметры записи шага исполнения. */
export interface LogStepParams {
  executionId: string;
  type: AssistantExecutionStepType;
  status: AssistantExecutionStepStatus;
  input?: unknown;
  output?: unknown;
  errorCode?: string;
  errorMessage?: string;
  diagnosticInfo?: string;
  durationMs?: number | null;
}

/** Журнал исполнений ассистента (используемое ядром подмножество). */
export type WorkflowGatewayExecutionLogPort = {
  logStep(params: LogStepParams): Promise<void>;
  finishExecution(
    executionId: string,
    finalStatus: AssistantExecutionStatus,
    extra?: Partial<Pick<AssistantExecutionRecord, "userMessageId" | "assistantMessageId">>,
  ): Promise<void>;
};
