/**
 * @shared-фасад агентского кластера для workflow-runtime (W2/S8 Tier-2). Сигнатуры функций монолита, которые ядро
 * сценариев зовёт через `WorkflowGateway.agent`, и форма их результатов — чтобы поддерево рантайма компилировалось
 * без type-импортов `../agent-runtime/*`. Дрейф ловится на wire.
 *
 * Агент в Унике один — новый (сервис сессий): узел agent ставит сессию и не ждёт её, итог забирает после пробуждения
 * прогона. Прежний синхронный вызов агента и его предзагрузки удалены.
 */

import type { JsonObject } from "@shared/plugin-system";

/**
 * «Стоп» на узле agent: останавливает сессию нового агента по `runId`. Метод короткий и идемпотентный.
 * `aborted` остаётся ради контракта шлюза и всегда 0: сессия живёт в сервисе сессий, а не в памяти монолита.
 */
export type CancelAgentRuntimeFacade = (params: {
  runId: string;
  reason?: string | null;
}) => Promise<{ aborted: number }>;

// ── новый агент (сервис сессий агента) ───────────────────────────────────────

/**
 * server/agent-runtime/agent-session-service.ts startAgentSession — сессию нового агента ставят и не ждут: узел agent
 * засыпает в ожидании `agent_session`, а итог сервис сессий сам приносит в монолит. Повтор для того же прогона и узла
 * возвращает идущую сессию. Сервис недоступен — ошибка `AGENT_SESSION_SERVICE_UNAVAILABLE` с понятным текстом, шаг
 * падает: другого агента в Унике нет.
 */
export type StartAgentSessionFacade = (params: {
  goal: string;
  context: JsonObject;
  limits: { maxCostUsd: number | null };
  invocation: {
    runId: string;
    stepId: string;
    nodeId: string;
    workspaceId: string;
    chatId: string;
    userId: string | null;
  };
  modelId?: string | null;
  /**
   * Что узел разрешает агенту: навыки и те же списки инструментов, что у старого агента. Монолит считает из них
   * инструменты платформы сессии — операции, действия, MCP, операции подключений — и хранит в записи прогона.
   */
  capabilityIds: {
    skillIds: string[];
    actionIds?: string[];
    operationIds?: string[];
    systemOperationKeys?: string[];
    connectionIds?: string[];
  };
  /** Политика записи узла: read_only — новому агенту доступно только чтение платформы. */
  writePolicy?: "approval_required" | "read_only";
  /** Схема итога узла (JSON Schema): новый агент сдаёт `payload` по ней, узел отдаёт его дальше как `finalPayload`. */
  resultSchema?: JsonObject | null;
  assistantId?: string | null;
}) => Promise<StartAgentSessionResult>;

/**
 * `deadlineAt` — до какого момента узел ждёт итог сессии. Позже подметальщик сервиса сценариев останавливает сессию
 * и закрывает прогон понятной ошибкой. Срок — с запасом над потолком длительности сессии из «Настроек агента»:
 * сессия может постоять в очереди сервиса до первого захвата.
 */
export type StartAgentSessionResult = {
  executionId: string;
  sessionId: string;
  status: string;
  created: boolean;
  deadlineAt: string;
};

/** Итог сессии нового агента из журнала запусков; `running` — итога ещё нет. */
export type AgentSessionResult = {
  executionId: string;
  sessionId: string | null;
  status: "running" | "success" | "partial" | "cancelled" | "error" | "timeout";
  sessionStatus: string | null;
  answer: string | null;
  summary: string | null;
  /** Итог по схеме узла (`resultSchema`); null — схемы не было или агент итог по ней не сдал. */
  payload?: JsonObject | null;
  /** Итог не совпал со схемой и принят как есть: описание расхождения. Шаг не падает, узел предупреждает. */
  payloadMismatch?: string | null;
  files: Array<{ name: string; attachmentId: string }>;
  errorCode: string | null;
  errorMessage: string | null;
};

export type GetAgentSessionResultFacade = (params: { executionId: string }) => Promise<AgentSessionResult | null>;
