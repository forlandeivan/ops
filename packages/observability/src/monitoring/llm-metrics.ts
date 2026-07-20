/**
 * LLM Prometheus emission helpers.
 *
 * Единая точка эмиссии метрик центрального слоя вызова LLM-провайдеров
 * (server/llm-client.ts). Вынесено отдельно от metrics.ts, чтобы:
 *   - классификация статуса/причины недоступности была чистой и тестируемой;
 *   - call-site в llm-client остался тонким, а эмиссия не могла уронить запрос.
 *
 * Метрики, которые здесь заполняются:
 *   - llm_requests_total{provider,model,status}
 *   - llm_request_duration_seconds{provider,model,status}
 *   - llm_tokens_total{provider,model,type}
 *   - llm_provider_unavailable_total{provider,reason}
 *   - llm_retries_total{provider,model,reason}
 *   - llm_tool_call_invalid_json_total{provider,model,route}
 */

import {
  llmRequestsTotal,
  llmRequestDuration,
  llmTokensTotal,
  llmProviderUnavailableTotal,
  llmRetriesTotal,
  llmToolCallInvalidJsonTotal,
} from "./metrics";

export type LlmRequestStatus =
  | "success"
  | "http_4xx"
  | "http_429"
  | "http_5xx"
  | "timeout"
  | "aborted";

export type LlmUnavailableReason = "conn_refused" | "dns" | "timeout" | "breaker_open";

export type LlmRetryReason = "http_429" | "http_503" | "http_5xx" | "timeout" | "network";

const UNKNOWN_LABEL = "unknown";

/** Нормализует значение метки: непустая строка либо "unknown" (защита от undefined-меток prom-client). */
export function normalizeMetricLabel(value: string | null | undefined): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }
  return UNKNOWN_LABEL;
}

/** Классифицирует HTTP-код ответа провайдера в статус метрики (2xx/3xx → success на уровне HTTP). */
export function classifyHttpStatus(status: number): "success" | "http_4xx" | "http_429" | "http_5xx" {
  if (status === 429) {
    return "http_429";
  }
  if (status >= 500) {
    return "http_5xx";
  }
  if (status >= 400) {
    return "http_4xx";
  }
  return "success";
}

/**
 * Сопоставляет низкоуровневый код ошибки (нет HTTP-ответа) с причиной полной недоступности.
 * Возвращает null, если код не свидетельствует о недоступности провайдера.
 */
export function classifyUnavailableReason(
  code: string | null | undefined,
): LlmUnavailableReason | null {
  const normalized = (code ?? "").toUpperCase();
  if (!normalized) {
    return null;
  }
  if (normalized === "ECONNREFUSED" || normalized === "ECONNRESET" || normalized === "EPIPE") {
    return "conn_refused";
  }
  if (normalized === "ENOTFOUND" || normalized === "EAI_AGAIN") {
    return "dns";
  }
  if (normalized === "ETIMEDOUT" || normalized === "ESOCKETTIMEDOUT") {
    return "timeout";
  }
  return null;
}

export interface LlmRequestOutcomeInput {
  provider: string | null | undefined;
  model: string | null | undefined;
  startedAtMs: number;
  /** Время завершения (для тестов); по умолчанию Date.now(). */
  nowMs?: number;
  succeeded: boolean;
  /** HTTP-код, если ответ был получен; null — ответа не было (сетевой сбой/таймаут до ответа). */
  httpStatus: number | null;
  timedOut: boolean;
  aborted: boolean;
  /** error.code/name последней ошибки запроса (для сетевой классификации). */
  errorCode: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
}

export interface LlmRequestOutcomeResolved {
  status: LlmRequestStatus;
  unavailableReason: LlmUnavailableReason | null;
}

/**
 * Сводит сигналы исхода запроса в (status, unavailableReason).
 * Приоритет: успех → отмена → таймаут → HTTP-ошибка → сетевой сбой без ответа →
 * прочий сбой при 2xx (пустой/непарсимый ответ) трактуется как server-side http_5xx.
 * conn_refused/dns по контракту лежат в серии http_5xx (llm_requests_total), но
 * различимы через llm_provider_unavailable_total.
 */
export function resolveLlmRequestOutcome(input: LlmRequestOutcomeInput): LlmRequestOutcomeResolved {
  if (input.succeeded) {
    return { status: "success", unavailableReason: null };
  }
  if (input.aborted && !input.timedOut) {
    return { status: "aborted", unavailableReason: null };
  }
  if (input.timedOut) {
    return { status: "timeout", unavailableReason: "timeout" };
  }
  if (input.httpStatus != null && input.httpStatus >= 400) {
    return { status: classifyHttpStatus(input.httpStatus), unavailableReason: null };
  }
  if (input.httpStatus == null) {
    const reason = classifyUnavailableReason(input.errorCode);
    if (reason === "timeout") {
      return { status: "timeout", unavailableReason: "timeout" };
    }
    if (reason) {
      return { status: "http_5xx", unavailableReason: reason };
    }
    return { status: "http_5xx", unavailableReason: null };
  }
  // HTTP 2xx/3xx, но обработка не дала валидного ответа (пустой ответ / ошибка парсинга):
  // провайдер достижим, считаем сбоем на стороне провайдера → http_5xx без отметки недоступности.
  return { status: "http_5xx", unavailableReason: null };
}

/**
 * Эмитит метрики исхода LLM-запроса (count + duration + tokens + опц. unavailable).
 * Никогда не бросает — телеметрия не должна ронять сам вызов LLM.
 */
export function recordLlmRequestOutcome(input: LlmRequestOutcomeInput): LlmRequestOutcomeResolved {
  const resolved = resolveLlmRequestOutcome(input);
  try {
    const provider = normalizeMetricLabel(input.provider);
    const model = normalizeMetricLabel(input.model);
    const endMs = typeof input.nowMs === "number" ? input.nowMs : Date.now();
    const durationSeconds = Math.max(0, (endMs - input.startedAtMs) / 1000);

    llmRequestsTotal.inc({ provider, model, status: resolved.status });
    llmRequestDuration.observe({ provider, model, status: resolved.status }, durationSeconds);

    if (input.succeeded) {
      if (typeof input.promptTokens === "number" && input.promptTokens > 0) {
        llmTokensTotal.inc({ provider, model, type: "input" }, input.promptTokens);
      }
      if (typeof input.completionTokens === "number" && input.completionTokens > 0) {
        llmTokensTotal.inc({ provider, model, type: "output" }, input.completionTokens);
      }
    }

    if (resolved.unavailableReason) {
      llmProviderUnavailableTotal.inc({ provider, reason: resolved.unavailableReason });
    }
  } catch {
    // Эмиссия метрик не должна влиять на основной поток.
  }
  return resolved;
}

/** Эмитит повтор LLM-запроса после транзиентной ошибки. */
export function recordLlmRetry(
  provider: string | null | undefined,
  model: string | null | undefined,
  reason: LlmRetryReason,
): void {
  try {
    llmRetriesTotal.inc({
      provider: normalizeMetricLabel(provider),
      model: normalizeMetricLabel(model),
      reason,
    });
  } catch {
    // ignore
  }
}

/** Эмитит событие полной недоступности провайдера (для путей вне основного исхода запроса). */
export function recordLlmProviderUnavailable(
  provider: string | null | undefined,
  reason: LlmUnavailableReason,
): void {
  try {
    llmProviderUnavailableTotal.inc({ provider: normalizeMetricLabel(provider), reason });
  } catch {
    // ignore
  }
}

/** Эмитит tool-call с битым/обрезанным JSON аргументов (Node-сторона). */
export function recordLlmToolCallInvalidJson(
  provider: string | null | undefined,
  model: string | null | undefined,
  route: string,
): void {
  try {
    llmToolCallInvalidJsonTotal.inc({
      provider: normalizeMetricLabel(provider),
      model: normalizeMetricLabel(model),
      route: normalizeMetricLabel(route),
    });
  } catch {
    // ignore
  }
}
