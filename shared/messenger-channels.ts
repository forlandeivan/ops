import { z } from "zod";

/**
 * Каналы мессенджеров: бот уровня инсталляции (заводит администратор Уники), пространства его включают,
 * сотрудник привязывает свой аккаунт мессенджера в «Моих подключениях». Каждое сообщение идёт от самого
 * сотрудника — через его обычный чат и обычные проверки доступа. Первый адаптер — Telegram; Max и
 * корпоративные мессенджеры подключаются новым адаптером того же слоя (server/messenger-channels).
 */
export const messengerProviders = ["telegram"] as const;
export type MessengerProvider = (typeof messengerProviders)[number];

export const messengerBotStatuses = ["active", "disabled"] as const;
export type MessengerBotStatus = (typeof messengerBotStatuses)[number];

/** Вебхук — мессенджер сам приносит события по публичному адресу; опрос — Уника забирает их сама. */
export const messengerReceiveModes = ["webhook", "polling"] as const;
export type MessengerReceiveMode = (typeof messengerReceiveModes)[number];

export const messengerBotAvailabilities = ["all", "selected"] as const;
export type MessengerBotAvailability = (typeof messengerBotAvailabilities)[number];

/** Что выпускаем наружу: только текст ответа или текст и файлы. Данные уходят на серверы мессенджера. */
export const messengerReleaseModes = ["text", "text_and_files"] as const;
export type MessengerReleaseMode = (typeof messengerReleaseModes)[number];

export const messengerOutboxKinds = ["message", "file", "card", "notification", "service", "topic"] as const;
export type MessengerOutboxKind = (typeof messengerOutboxKinds)[number];

/**
 * Тема в личном чате с ботом (Threaded Mode): одна на пару «пространство + агент». `pending` — ещё не создана
 * в мессенджере, `open` — работает, `closed` — доступ потерян, история сохранена; при возврате доступа открывается.
 */
export const messengerTopicStates = ["pending", "open", "closed"] as const;
export type MessengerTopicState = (typeof messengerTopicStates)[number];

export const messengerOutboxStatuses = ["pending", "sending", "sent", "failed", "skipped"] as const;
export type MessengerOutboxStatus = (typeof messengerOutboxStatuses)[number];

export const messengerInboundStatuses = ["processed", "ignored", "failed"] as const;
export type MessengerInboundStatus = (typeof messengerInboundStatuses)[number];

/** Кнопки: данные кнопки живут в базе, в мессенджер уходит только короткий идентификатор. */
export const messengerActionKinds = [
  "approval_approve",
  "approval_reject",
  "question_option",
  "select_workspace",
  "select_agent",
] as const;
export type MessengerActionKind = (typeof messengerActionKinds)[number];

/** Категории уведомлений, которые человек может получать в мессенджер (`shared/notifications.ts`). */
export const messengerNotifyCategories = ["results", "errors", "attention", "assistant_updates", "product_updates"] as const;
export type MessengerNotifyCategory = (typeof messengerNotifyCategories)[number];

export const messengerNotifyPreferencesSchema = z
  .object({
    results: z.boolean(),
    errors: z.boolean(),
    attention: z.literal(true),
    assistant_updates: z.boolean(),
    product_updates: z.boolean(),
  })
  .strict();
export type MessengerNotifyPreferences = z.infer<typeof messengerNotifyPreferencesSchema>;

export const DEFAULT_MESSENGER_NOTIFY_PREFERENCES: MessengerNotifyPreferences = {
  results: true,
  errors: true,
  attention: true,
  assistant_updates: false,
  product_updates: false,
};

/** Срок одноразовой ссылки привязки. */
export const MESSENGER_LINK_CODE_TTL_MS = 10 * 60 * 1000;

const optionalUrl = z
  .string()
  .trim()
  .max(500)
  .url()
  .nullable()
  .optional();

/**
 * Добавление бота — пресет мессенджера: администратор вводит только токен (и при желании название).
 * Название по умолчанию — имя бота в мессенджере; приём — вебхук, если у установки есть публичный HTTPS-адрес,
 * иначе опрос; адрес Bot API — стандартный; доступен всем пространствам, но выключен в них: включает
 * администратор («Сразу включать в пространствах») или менеджер пространства.
 */
export const createMessengerBotSchema = z
  .object({
    provider: z.enum(messengerProviders).default("telegram"),
    title: z.string().trim().min(1).max(120).optional(),
    token: z.string().trim().min(10).max(255),
    receiveMode: z.enum(messengerReceiveModes).optional(),
    apiBaseUrl: optionalUrl,
    availability: z.enum(messengerBotAvailabilities).default("all"),
    workspaceIds: z.array(z.string().trim().min(1)).max(1000).default([]),
    autoEnable: z.boolean().default(false),
    releaseMode: z.enum(messengerReleaseModes).default("text_and_files"),
  })
  .strict();
export type CreateMessengerBotInput = z.input<typeof createMessengerBotSchema>;

/** Проверка токена до сохранения: мессенджер узнаёт бота и отдаёт его имя. */
export const previewMessengerBotSchema = z
  .object({
    provider: z.enum(messengerProviders).default("telegram"),
    token: z.string().trim().min(10).max(255),
  })
  .strict();

export type MessengerBotPreviewDto = {
  provider: MessengerProvider;
  botUsername: string | null;
  displayName: string | null;
  topicsEnabled: boolean;
  /** Каким будет приём сообщений, если не менять: зависит от публичного адреса установки. */
  receiveMode: MessengerReceiveMode;
};

export const updateMessengerBotSchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    token: z.string().trim().min(10).max(255).optional(),
    receiveMode: z.enum(messengerReceiveModes).optional(),
    apiBaseUrl: optionalUrl,
    availability: z.enum(messengerBotAvailabilities).optional(),
    workspaceIds: z.array(z.string().trim().min(1)).max(1000).optional(),
    autoEnable: z.boolean().optional(),
    releaseMode: z.enum(messengerReleaseModes).optional(),
    status: z.enum(messengerBotStatuses).optional(),
  })
  .strict();
export type UpdateMessengerBotInput = z.infer<typeof updateMessengerBotSchema>;

export const updateWorkspaceMessengerBotSchema = z
  .object({
    isActive: z.boolean().optional(),
    defaultAgentId: z.string().trim().min(1).nullable().optional(),
  })
  .strict();
export type UpdateWorkspaceMessengerBotInput = z.infer<typeof updateWorkspaceMessengerBotSchema>;

export const updateMyMessengerLinkSchema = z
  .object({
    notifyCategories: messengerNotifyPreferencesSchema,
  })
  .strict();

/** Бот в админке. Токен наружу не отдаётся никогда. */
export type MessengerBotDto = {
  id: string;
  provider: MessengerProvider;
  title: string;
  status: MessengerBotStatus;
  receiveMode: MessengerReceiveMode;
  apiBaseUrl: string | null;
  botUsername: string | null;
  availability: MessengerBotAvailability;
  workspaceIds: string[];
  autoEnable: boolean;
  releaseMode: MessengerReleaseMode;
  webhookUrl: string | null;
  /** Включён ли в мессенджере режим тем (Telegram: Threaded Mode в @BotFather). */
  topicsEnabled: boolean;
  lastError: string | null;
  lastCheckedAt: string | null;
  linkedUsers: number;
  enabledWorkspaces: number;
  createdAt: string;
  updatedAt: string;
};

export type MessengerBotLinkDto = {
  id: string;
  userId: string;
  userEmail: string | null;
  userFullName: string | null;
  externalUsername: string | null;
  linkedAt: string;
  blockedByUserAt: string | null;
};

export type MessengerBotActivityDto = {
  inbound: { processed: number; ignored: number; failed: number };
  /** skipped — не отправлено намеренно: бот выключен, привязка отозвана, человек заблокировал бота. */
  outbound: { sent: number; failed: number; pending: number; skipped: number };
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
  recentErrors: Array<{ at: string; direction: "inbound" | "outbound"; message: string }>;
};

/** Бот, доступный пространству: включён ли и какой агент по умолчанию. */
export type WorkspaceMessengerBotDto = {
  botId: string;
  provider: MessengerProvider;
  title: string;
  botUsername: string | null;
  isActive: boolean;
  defaultAgentId: string | null;
};

/** Бот в «Моих подключениях»: доступен ли человеку и привязан ли его аккаунт. */
export type MyMessengerDto = {
  botId: string;
  provider: MessengerProvider;
  title: string;
  botUsername: string | null;
  link: {
    id: string;
    externalUsername: string | null;
    linkedAt: string;
    blockedByUserAt: string | null;
    notifyCategories: MessengerNotifyPreferences;
  } | null;
};

export type MyMessengerLinkStartDto = {
  url: string;
  expiresAt: string;
};
