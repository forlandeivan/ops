/**
 * Рантайм-класс контрактной ошибки НАПРАВЛЕНИЯ 1 шва «монолит ↔ workflow-runtime»
 * (gateway-contract.md v1). Живёт в @shared, а НЕ в ядре рантайма, потому что
 * реконструируется по ОБЕ стороны HTTP-шва:
 *  - workflow-сервис бросает его в direction-1 роутах и сериализует в error-конверт `{message, code}` + статус;
 *  - монолит-как-клиент (`server/workflow-runtime-http-client.ts`) реконструирует НАСТОЯЩИЙ инстанс из
 *    конверта, поэтому `instanceof AssistantWorkflowRuntimeError` на call-sites монолита продолжает
 *    работать через шов (в отличие от гардов направления 2, где доменных классов нет).
 *
 * До WD4.4a класс жил в `server/workflow-runtime/assistant-workflow-runtime-service.ts`; вынесен сюда,
 * чтобы HTTP-путь направления 1 (`workflow-runtime-http-client` + порт `workflow-runtime-client`)
 * импортировался БЕЗ каталога `server/workflow-runtime/*` (тот физически удаляется в WD4.4b). Сервис-файл
 * ядра ре-экспортит класс для обратной совместимости (strangler) — подклассы рантайма продолжают
 * `extends AssistantWorkflowRuntimeError`, импортёры ядра не ломаются.
 *
 * @shared-модуль: НИКАКИХ импортов server/** — только `extends Error`. Пропагируется в workflow-репо копией.
 */

export class AssistantWorkflowRuntimeError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, status = 400, code = "ASSISTANT_WORKFLOW_RUNTIME_ERROR") {
    super(message);
    this.name = "AssistantWorkflowRuntimeError";
    this.status = status;
    this.code = code;
  }
}
