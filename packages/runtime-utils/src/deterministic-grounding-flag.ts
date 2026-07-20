/**
 * Единый обратимый рубильник ДЕТЕРМИНИРОВАННЫХ guard'ов источника и бюджета контекста универсального
 * агента. Это НЕ роутинг: маршрут (какая capability group обрабатывает запрос) определяет строго
 * LLM-классификатор (`selectUniversalAgentCapabilityGroups`), pre-LLM keyword/phrase fast-lane'ы удалены.
 *
 * Что гасит при выключении (`UNICA_AGENT_DETERMINISTIC_GROUNDING_ENABLED=false`):
 *  - жёсткую «привязку к источнику» (source-grounding): требование «отвечай только по источнику»,
 *    обязательные группы по непокрытому источнику и retry-гейт → становится советом (инвентарь и
 *    availableSourceFamilies сохраняются, модель видит источники, но не обязана их читать);
 *  - урезание семейств инструментов по requestPolicy (buildAgentSystemOperationKeys) — бюджет контекста;
 *  - фиксированный docx-набор (shouldUseDocxAssemblyOperationSubset) — бюджет контекста под docx-сборку.
 *
 * Эти три guard'а — про безопасность/привязку к источнику и бюджет контекста слабой модели, а НЕ про
 * выбор пути; поэтому они расцеплены от выпиленного routing-флага и живут под собственным рубильником.
 *
 * По умолчанию ВКЛЮЧЕНО (текущее прод-поведение). Значения, выключающие guard'ы: `false`/`0`/`off`/`no`
 * (регистронезависимо). Любое другое значение → включено. Флаг читается на каждый вызов, так что
 * переключение env + рестарт процесса обратимо без правок кода.
 *
 * Обратная совместимость: пока новый env не задан, читается УСТАРЕВШИЙ `UNICA_AGENT_DETERMINISTIC_ROUTING_ENABLED`
 * (раньше он гейтил эти же guard'ы вместе с уже удалёнными fast-lane'ами). Так оператор, отключивший
 * grounding старым флагом, сохраняет поведение после выпила роутинга. Новый env имеет приоритет.
 */
function interpretFlag(raw: string | undefined): boolean | null {
  if (raw === undefined) {
    return null;
  }
  const value = raw.trim().toLowerCase();
  return !["false", "0", "off", "no"].includes(value);
}

export function isDeterministicGroundingEnabled(): boolean {
  const current = interpretFlag(process.env.UNICA_AGENT_DETERMINISTIC_GROUNDING_ENABLED);
  if (current !== null) {
    return current;
  }
  const legacy = interpretFlag(process.env.UNICA_AGENT_DETERMINISTIC_ROUTING_ENABLED);
  if (legacy !== null) {
    return legacy;
  }
  return true;
}
