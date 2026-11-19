/**
 * @shared-фасад журнала исполнений ассистента для workflow-runtime (W2/S8 Tier-2,
 * docs/w2-workflow-packaging-plan.md §5). Подмножество `AgentResponseExecutionLogService`
 * (`logStep`/`finishExecution`), которое использует ядро через `WorkflowGateway.executionLog`.
 *
 * Реализация (класс) остаётся в монолите; wire присваивает singleton-сервис полю порта, tsc
 * проверяет совместимость. Статусы/типы шагов и запись исполнения уже в `@shared`.
 */

import type {
  AgentResponseExecutionRecord,
  AgentResponseExecutionStatus,
  AgentResponseExecutionStepStatus,
  AgentResponseExecutionStepType,
} from "@shared/agent-response-execution-log";

/** server/agent-response-execution-log-service.ts — параметры записи шага исполнения. */
export interface LogStepParams {
  executionId: string;
  type: AgentResponseExecutionStepType;
  status: AgentResponseExecutionStepStatus;
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
    finalStatus: AgentResponseExecutionStatus,
    extra?: Partial<Pick<AgentResponseExecutionRecord, "userMessageId" | "agentMessageId">>,
  ): Promise<void>;
};
