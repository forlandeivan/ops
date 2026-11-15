/**
 * Режимы запроса чата и решение о том, кто выполняет ход.
 *
 * Режимов два, оба выбирает человек: «Чат» — один ответ модели текстом, «Агент» — многошаговый исполнитель
 * с инструментами. Отдельного диспетчера, который до ответа угадывает исполнителя, нет: режим «Авто» с
 * LLM-роутером снят 11.11.2026. Вместо него режим «Чат» сам передаёт ход агенту, когда для результата
 * мало текста: модель чата первой строкой ответа ставит метку `[[АГЕНТ:причина]]` (см. `chatHandoffReasons`).
 *
 * Один shared-тип вместо десятка дубликатов юниона `"chat" | "agent"` на сервере и клиенте.
 */

export const chatRequestModes = ["chat", "agent"] as const;
export type ChatRequestMode = (typeof chatRequestModes)[number];

/** Режим, который понимает исполнение. Совпадает с режимом запроса: оставлен именем для вызывающих. */
export type ChatExplicitMode = ChatRequestMode;

export const chatRoutes = ["chat", "agent"] as const;
export type ChatRoute = (typeof chatRoutes)[number];

/**
 * Откуда взялось решение: `explicit` — режим выбрал человек (или он следует из ассистента и команды);
 * `handoff` — режим «Чат» сам передал ход агенту меткой в начале ответа.
 */
export const chatRouteSources = ["explicit", "handoff"] as const;
export type ChatRouteSource = (typeof chatRouteSources)[number];

/** Причины решения — закрытый словарь для метрик и фильтров, не свободный текст. */
export const chatRouteReasons = [
  "explicit_mode",
  /** Модель режима «Чат» поставила метку передачи хода: задачу выполняет агент. */
  "chat_handoff",
] as const;
export type ChatRouteReason = (typeof chatRouteReasons)[number];

/**
 * Передача хода из режима «Чат» агенту. Модель чата первой строкой ответа ставит метку
 * `[[АГЕНТ:причина]]`; сервер читает только начало ответа. Причина — закрытый словарь: что нужно
 * пользователю и чего «Чат» не умеет. Неизвестное слово после двоеточия — `other`.
 *
 * `material` ставит не модель, а сервер: в чате с поиском по базам знаний пришёл большой текст — материал для
 * работы, а не вопрос к базе (`server/chat-router/chat-material-message.ts`). В правило о метке для модели не входит.
 */
export const chatHandoffReasons = ["file", "web", "documents", "compute", "workspace", "skill", "memory", "material", "other"] as const;
export type ChatHandoffReason = (typeof chatHandoffReasons)[number];

export function resolveChatHandoffReason(value: unknown): ChatHandoffReason {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return (chatHandoffReasons as readonly string[]).includes(normalized) ? (normalized as ChatHandoffReason) : "other";
}

/** Пометка на сообщении пользователя: его ход «Чат» передал агенту. */
export type ChatHandoffMarker = { reason: ChatHandoffReason };

/** Решение о маршруте хода: пишется в журнал исполнения и в метрику. */
export type ChatRouteDecision = {
  v: 1;
  /** Что запросил клиент. */
  mode: ChatRequestMode;
  /** Что выбрано исполнять. */
  route: ChatRoute;
  source: ChatRouteSource;
  reason: ChatRouteReason;
  decidedAt: string;
};

/** Компактный сигнал клиенту: в 202 JSON, событиях потока user_message и agent_handoff и в non-stream JSON. */
export type ChatRouteSignal = {
  mode: ChatRequestMode;
  route: ChatRoute;
  source: ChatRouteSource;
  reason: ChatRouteReason;
};

export function isChatRequestMode(value: unknown): value is ChatRequestMode {
  return typeof value === "string" && (chatRequestModes as readonly string[]).includes(value);
}

export function isChatRoute(value: unknown): value is ChatRoute {
  return typeof value === "string" && (chatRoutes as readonly string[]).includes(value);
}

/**
 * Неизвестное или пустое значение — «чат». Сюда же попадает снятый режим «auto»: его может прислать вкладка,
 * открытая до обновления, и он хранится за старыми чатами — такие запросы и чаты идут как «Чат».
 */
export function resolveRequestedChatMode(value: unknown): ChatRequestMode {
  return isChatRequestMode(value) ? value : "chat";
}

export function toChatRouteSignal(decision: ChatRouteDecision): ChatRouteSignal {
  return {
    mode: decision.mode,
    route: decision.route,
    source: decision.source,
    reason: decision.reason,
  };
}
