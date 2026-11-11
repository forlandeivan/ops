/**
 * Режимы запроса чата и решение роутера «Авто» (волна В1 стратегии
 * docs/system-knowledge-bases-auto-route-strategy-2026-09.md, §6).
 *
 * Один shared-тип вместо десятка дубликатов юниона `"chat" | "agent"` на сервере и клиенте.
 * «Авто» — третий режим запроса: сервер сам выбирает исполнителя (чат или агентский прогон) и
 * сообщает решение клиенту сигналом `routing`. Роутер только выбирает рантайм и никогда не отвечает
 * за модель — этим он отличается от снятых ранее детерминированных перехватчиков.
 */

export const chatRequestModes = ["chat", "agent", "auto"] as const;
export type ChatRequestMode = (typeof chatRequestModes)[number];

/** Явные режимы, которые понимает исполнение (без «Авто»). */
export type ChatExplicitMode = Exclude<ChatRequestMode, "auto">;

export const chatRoutes = ["chat", "agent"] as const;
export type ChatRoute = (typeof chatRoutes)[number];

/** `handoff` — режим «Чат» сам передал ход агенту меткой в начале ответа (см. `chatHandoffReasons`). */
export const chatRouteSources = ["explicit", "policy", "floor", "llm", "fallback", "handoff"] as const;
export type ChatRouteSource = (typeof chatRouteSources)[number];

/** Причины решения — закрытый словарь для метрик и фильтров, не свободный текст. */
export const chatRouteReasons = [
  "explicit_mode",
  "auto_mode_feature_off",
  "auto_mode_not_eligible",
  "assistant_workflow",
  "policy_no_workflow",
  "universal_agent_missing",
  /** Живая сессия агента в чате ждёт ответа на свой вопрос или подтверждения — реплика идёт ей. */
  "agent_session_waiting",
  "router_disabled",
  "smalltalk_library",
  "explicit_file_artifact",
  "structured_attachment",
  "context_refs",
  "llm",
  "low_confidence",
  "timeout",
  "invalid_json",
  "no_model",
  "cascade_failed",
  /** Модель режима «Чат» поставила метку передачи хода: задачу выполняет агент. */
  "chat_handoff",
] as const;
export type ChatRouteReason = (typeof chatRouteReasons)[number];

/**
 * Передача хода из режима «Чат» агенту. Модель чата первой строкой ответа ставит метку
 * `[[АГЕНТ:причина]]`; сервер читает только начало ответа. Причина — закрытый словарь: что нужно
 * пользователю и чего «Чат» не умеет. Неизвестное слово после двоеточия — `other`.
 */
export const chatHandoffReasons = ["file", "web", "documents", "compute", "workspace", "skill", "memory", "other"] as const;
export type ChatHandoffReason = (typeof chatHandoffReasons)[number];

export function resolveChatHandoffReason(value: unknown): ChatHandoffReason {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return (chatHandoffReasons as readonly string[]).includes(normalized) ? (normalized as ChatHandoffReason) : "other";
}

/** Пометка на сообщении пользователя: его ход «Чат» передал агенту. */
export type ChatHandoffMarker = { reason: ChatHandoffReason };

export type ChatRouteDecision = {
  v: 1;
  /** Что запросил клиент. */
  mode: ChatRequestMode;
  /** Что выбрано исполнять. */
  route: ChatRoute;
  source: ChatRouteSource;
  reason: ChatRouteReason;
  /** Уверенность LLM-роутера, 0..1; null для остальных слоёв. */
  confidence: number | null;
  latencyMs: number;
  /** Решение принято в обход модели из-за сбоя (таймаут, невалидный JSON, нет модели). */
  degraded: boolean;
  /** Вердикт гейта честности от роутера (один вызов на оба решения); null — роутер не отвечал. */
  citationRequired: boolean | null;
  routerModel: string | null;
  decidedAt: string;
  /** Решение взято из кэша повтора запроса, модель повторно не звали. */
  reused: boolean;
  /**
   * «RAG перед RAG» (этап C): базы знаний, выбранные роутером из кандидатов каталога, — id в порядке
   * ответа модели. Нет поля/null — кандидатов роутеру не показывали или модель не отвечала.
   */
  selectedKnowledgeBaseIds?: string[] | null;
  /** Уверенность выбора баз, 0..1. */
  basesConfidence?: number | null;
  /**
   * Кто выбрал базы в `selectedKnowledgeBaseIds`: llm — роутер из кандидатов каталога; user — пользователь
   * явно указал базы в сообщении («@»-чипы): тогда решение любого слоя несёт его id, кандидаты не считаются.
   */
  knowledgeBasesSelectedBy?: "llm" | "user";
};

/** Компактный сигнал клиенту: в 202 JSON, событии user_message и non-stream JSON. */
export type ChatRouteSignal = {
  mode: ChatRequestMode;
  route: ChatRoute;
  source: ChatRouteSource;
  reason: ChatRouteReason;
  degraded: boolean;
};

export function isChatRequestMode(value: unknown): value is ChatRequestMode {
  return typeof value === "string" && (chatRequestModes as readonly string[]).includes(value);
}

export function isChatRoute(value: unknown): value is ChatRoute {
  return typeof value === "string" && (chatRoutes as readonly string[]).includes(value);
}

/** Неизвестное или пустое значение — «чат»: прежнее поведение платформы по умолчанию. */
export function resolveRequestedChatMode(value: unknown): ChatRequestMode {
  return isChatRequestMode(value) ? value : "chat";
}

export function toChatRouteSignal(decision: ChatRouteDecision): ChatRouteSignal {
  return {
    mode: decision.mode,
    route: decision.route,
    source: decision.source,
    reason: decision.reason,
    degraded: decision.degraded,
  };
}
