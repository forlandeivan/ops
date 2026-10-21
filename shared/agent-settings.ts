import { z } from "zod";
import { answerQualitySettingsSchema } from "./answer-quality";

import { confirmationPolicyValues, type JsonObject } from "./plugin-system";
import { systemOperationCategoryValues } from "./system-operations";

export const agentCapabilityKindValues = [
  "action",
  "plugin_operation",
  "system_operation",
  "integration_operation",
] as const;
export type AgentCapabilityKind = (typeof agentCapabilityKindValues)[number];

export const agentCapabilityAccessLevelValues = ["read", "write", "admin"] as const;
export type AgentCapabilityAccessLevel = (typeof agentCapabilityAccessLevelValues)[number];

const jsonObjectSchema: z.ZodType<JsonObject> = z.record(z.string(), z.unknown());

const optionalBooleanFromQuerySchema = z.preprocess((value) => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (value === true || value === "true") {
    return true;
  }
  if (value === false || value === "false") {
    return false;
  }
  return value;
}, z.boolean().optional());

export const agentCapabilityCatalogQuerySchema = z.object({
  search: z.string().trim().max(255).optional(),
  kind: z.enum(agentCapabilityKindValues).optional(),
  accessLevel: z.enum(agentCapabilityAccessLevelValues).optional(),
  requiresConnection: optionalBooleanFromQuerySchema,
  category: z.enum(systemOperationCategoryValues).optional(),
  tag: z.string().trim().min(1).max(255).optional(),
});

export const agentCapabilityCatalogItemSchema = z.object({
  id: z.string().trim().min(1),
  kind: z.enum(agentCapabilityKindValues),
  kindLabel: z.string().trim().min(1),
  fullKey: z.string().trim().min(1),
  name: z.string().trim().min(1),
  description: z.string().trim().nullable(),
  sourceLabel: z.string().trim().min(1),
  accessLevel: z.enum(agentCapabilityAccessLevelValues),
  accessLevelLabel: z.string().trim().min(1),
  category: z.enum(systemOperationCategoryValues).nullable().optional(),
  categoryLabel: z.string().trim().min(1).nullable().optional(),
  confirmationPolicy: z.enum(confirmationPolicyValues),
  confirmationPolicyLabel: z.string().trim().min(1),
  requiresConnection: z.boolean(),
  connectionTypeLabel: z.string().trim().nullable(),
  isAgentCallable: z.boolean(),
  statusLabel: z.string().trim().min(1),
  tags: z.array(z.string().trim().min(1)).default([]),
  inputSchema: jsonObjectSchema.default({}),
  outputSchema: jsonObjectSchema.default({}),
  sourceMetadata: jsonObjectSchema.default({}),
});

export const agentCapabilityCatalogResponseSchema = z.object({
  items: z.array(agentCapabilityCatalogItemSchema),
  meta: z.object({
    total: z.number().int().nonnegative(),
    byKind: z.object({
      action: z.number().int().nonnegative(),
      plugin_operation: z.number().int().nonnegative(),
      system_operation: z.number().int().nonnegative(),
      integration_operation: z.number().int().nonnegative(),
    }),
  }),
});

export const agentRuntimeLimitsDefaults = {
  // З-04: `maxSteps` строго больше `maxToolCalls` — при включённом «один инструмент за ход»
  // (`single_tool_per_turn`, дефолт рантайма) каждый вызов инструмента съедает целый раунд модели.
  // При равных значениях последний раунд уходит на последний вызов, цикл выходит по исчерпанию
  // раундов и ставит `llm_budget_exhausted`: финальный ответ структурно недостижим.
  maxSteps: 40,
  maxToolCalls: 32,
  timeoutSec: 600,
} as const;

/**
 * З-04: сколько раундов модели резервируется сверх бюджета вызовов инструментов. Один — на сам
 * финальный ответ, один — на хвост (раунд с отброшенным лишним вызовом, повтор невалидных
 * аргументов). Меньше двух — прогон регулярно упирается в потолок раундов вместо финала.
 */
export const AGENT_RUNTIME_STEP_RESERVE = 2;

export const agentRuntimeLimitRanges = {
  maxSteps: { min: 1, max: 100 },
  maxToolCalls: { min: 1, max: 100 },
  timeoutSec: { min: 30, max: 3600 },
} as const;

// --- З-12: одна семантика цепочки лимитов «узел сценария → Настройки агента» ---------------------
// Пусто в узле → значение из «Настроек агента». Число в узле → не выше админского потолка
// (min(узел, админ)). Инвариант резерва шагов (З-04) восстанавливается после слияния: если шагов
// меньше, чем вызовов плюс резерв, срезается число вызовов — потолок шагов остаётся главным.
// Раньше админские значения применялись только как «пол» для universal-агента при вложениях
// json/csv/tsv (регулярное выражение по расширению файла), а для остального не читались вовсе —
// владелец поднимал лимит в консоли и не получал эффекта.

export type AgentRuntimeLimitSource = "node" | "admin" | "node_capped_by_admin" | "reserve_invariant";

export type AgentRuntimeNodeLimits = {
  maxSteps?: number | null;
  maxToolCalls?: number | null;
  timeoutSec?: number | null;
};

export type AgentRuntimeAdminLimits = {
  maxSteps: number;
  maxToolCalls: number;
  timeoutSec: number;
};

export type AgentRuntimeEffectiveLimits = {
  limits: AgentRuntimeAdminLimits;
  sources: Record<keyof AgentRuntimeAdminLimits, AgentRuntimeLimitSource>;
};

function resolveOneAgentRuntimeLimit(
  nodeValue: number | null | undefined,
  adminValue: number,
): { value: number; source: AgentRuntimeLimitSource } {
  if (typeof nodeValue !== "number" || !Number.isFinite(nodeValue) || nodeValue <= 0) {
    return { value: adminValue, source: "admin" };
  }
  const floored = Math.floor(nodeValue);
  if (floored > adminValue) {
    return { value: adminValue, source: "node_capped_by_admin" };
  }
  return { value: floored, source: "node" };
}

export function resolveEffectiveAgentRuntimeLimits(
  node: AgentRuntimeNodeLimits | null | undefined,
  admin: AgentRuntimeAdminLimits,
): AgentRuntimeEffectiveLimits {
  const maxSteps = resolveOneAgentRuntimeLimit(node?.maxSteps, admin.maxSteps);
  const maxToolCalls = resolveOneAgentRuntimeLimit(node?.maxToolCalls, admin.maxToolCalls);
  const timeoutSec = resolveOneAgentRuntimeLimit(node?.timeoutSec, admin.timeoutSec);
  if (maxSteps.value < maxToolCalls.value + AGENT_RUNTIME_STEP_RESERVE) {
    maxToolCalls.value = Math.max(maxSteps.value - AGENT_RUNTIME_STEP_RESERVE, 0);
    maxToolCalls.source = "reserve_invariant";
  }
  return {
    limits: { maxSteps: maxSteps.value, maxToolCalls: maxToolCalls.value, timeoutSec: timeoutSec.value },
    sources: { maxSteps: maxSteps.source, maxToolCalls: maxToolCalls.source, timeoutSec: timeoutSec.source },
  };
}

function integerSettingSchema(min: number, max: number) {
  return z.preprocess((value) => {
    if (typeof value === "string" && value.trim().length > 0) {
      return Number(value);
    }
    return value;
  }, z.number().int().min(min).max(max));
}

// Лимит с «Авто»: пусто/null/undefined → null (авто), иначе целое в диапазоне. Пустая строка из
// number-инпута админки трактуется как «Авто», а не как ошибка валидации.
function nullableIntegerSettingSchema(min: number, max: number) {
  return z.preprocess((value) => {
    if (value === null || value === undefined) {
      return null;
    }
    if (typeof value === "string") {
      const trimmed = value.trim();
      return trimmed.length > 0 ? Number(trimmed) : null;
    }
    return value;
  }, z.number().int().min(min).max(max).nullable());
}

export const agentSettingsMainSectionSchema = z.object({
  agentDefaultModelId: z.string().trim().max(255).optional().nullable(),
  // Быстрая служебная модель: выбор пути в «Авто», вердикт гейта честности, судья качества, описание баз знаний.
  fastPathModelId: z.string().trim().max(255).optional().nullable(),
});

// Срок шага ИИ в сценариях без своего срока. Шаги и вызовы инструментов читал только прежний агент — ручек нет.
export const agentSettingsRuntimeLimitsSectionSchema = z.object({
  timeoutSec: integerSettingSchema(
    agentRuntimeLimitRanges.timeoutSec.min,
    agentRuntimeLimitRanges.timeoutSec.max,
  ).default(agentRuntimeLimitsDefaults.timeoutSec),
});

// --- Возобновление после сбоя: пороги сторожа зависших прогонов. Константы кода, ручек нет (ревизия 21.10.2026). ---
export const agentRunRecoveryFallbacks = {
  // как часто опрашивать незавершённые прогоны (сек). Той же каденцией работает и reaper залипшего
  // pending идемпотентности (он — сестринский воркер сторожа).
  watchdogIntervalSec: 60,
  // молчание heartbeat (сек) дольше этого → прогон зависший, переводим в терминальный статус.
  // 15 мин = с большим запасом над heartbeat-интервалом рантайма (~20 сек) и сетевыми блипами.
  staleHeartbeatTimeoutSec: 900,
  // AGENT-IDEMPOTENCY-STUCK-PENDING: возраст pending-строки идемпотентности (по started_at) дольше
  // этого → прогон заведомо мёртв, строка реапится (safe_retry→failed / unknown→abandoned). 15 мин =
  // тот же запас над окном живого in-flight вызова, что и у таймаута heartbeat.
  pendingReapTtlSec: 900,
  // AGENT-IDEMPOTENCY-RETENTION: тот же reaper удаляет completed/failed старше N дней (pending/abandoned
  // не трогает). Интерим до janitor-сервиса.
  idempotencyRetentionDays: 30,
} as const;

// --- Черновики файлов агента: файл уходит в чат только в конце прогона (З-33), до этого лежит черновиком. ---
export const agentRunExecutionFallbacks = {
  // Сколько живёт неопубликованный черновик файла до снятия reaper'ом (сек). З-33: файлы агента
  // публикуются только в конце прогона, после проверок — переключателя режима с 14.09.2026 нет.
  artifactDraftTtlSec: 3600,
} as const;

/**
 * Потолок окна контекста, который платформа отдаёт рантайму агента (токены).
 *
 * Реестр моделей хранит полное окно (`models.max_prompt_tokens_budget`) — у qwen3.8-27b это 500 000.
 * Брать его целиком нельзя по двум причинам: на длинном контексте модель теряет начало разговора и
 * начинает путать источники, а один вызов становится непредсказуемо дорогим. Брать библиотечный
 * дефолт (58 000) — тоже плохо: история прогона упирается в него на середине задачи, и агент режет
 * собственный контекст там, где модель ещё справилась бы.
 *
 * 128 000 — рабочая середина: помещается многошаговый прогон с документами, но окно остаётся в
 * пределах, на которых модель держит внимание. Настройкой в админке потолок станет в волне 1,
 * вместе с остальными параметрами сессий.
 */
export const AGENT_CONTEXT_WINDOW_CAP_TOKENS = 128_000;

// --- Step-debug D6.4: кап живых дебаг-сессий на пространство и два срока сессии. Константы кода, ручек нет.
//  • armTtlSeconds — сколько армированная сессия ждёт входящий вызов; после захвата не применяется.
//  • sessionTtlSeconds — сколько живёт сессия после захвата; каждая активность автора продлевает срок.
export const workflowDebugFallbacks = {
  maxOpenSessionsPerWorkspace: 3,
  armTtlSeconds: 5 * 60,
  sessionTtlSeconds: 60 * 60,
} as const;

// --- W2 Code Node (workflow-code-node-roadmap.md): лимиты code runner'а узла «Код (JavaScript)». ---
// В админке — таймаут и память (null = «Авто» = дефолт ниже); остальное — константы кода. Применяет workflow-сервис
// (resolveCodeRunnerConfig) на каждом исполнении. В external-режиме (sidecar в k8s) память и конкурентность задаёт
// деплой раннера (env контейнера); админ-значение памяти действует только на internal-пул.
export const workflowCodeExecFallbacks = {
  timeoutMs: 5_000,
  memoryMb: 128,
  concurrency: 4,
  maxPayloadMb: 5,
  queueWaitMs: 10_000,
} as const;

export const workflowCodeExecRanges = {
  timeoutMs: { min: 50, max: 300_000 },
  memoryMb: { min: 32, max: 4_096 },
} as const;

// --- Узел checklist_verify: параллельность батч-судьи /v1/checklist-judge Python-рантайма. Константа кода. ---
export const workflowChecklistJudgeFallbacks = {
  concurrency: 4,
} as const;

export const agentSettingsWorkflowCodeExecSectionSchema = z.object({
  /**
   * W3.1: разрешено ли править код узла в сценариях ПРОСТРАНСТВ (право `workflows:edit_code`).
   * null = «Авто» (умолчание — разрешено), false = только платформенный админ.
   * Это же поле — шов под будущую лицензионную проверку: лицензия ANDится к рубильнику,
   * остальной контур (гейт, UI-зеркало, аудит) не меняется.
   */
  delegationEnabled: z.boolean().nullable().default(null),
  timeoutMs: nullableIntegerSettingSchema(
    workflowCodeExecRanges.timeoutMs.min,
    workflowCodeExecRanges.timeoutMs.max,
  ).default(null),
  memoryMb: nullableIntegerSettingSchema(
    workflowCodeExecRanges.memoryMb.min,
    workflowCodeExecRanges.memoryMb.max,
  ).default(null),
});

// --- Блок 8, задача 8.1: Tool-RAG — сужение внешнего хвоста инструментов (mcpTools/actions/operations) по смыслу
// запроса. Константы кода, ручек нет (ревизия 21.10.2026): отбор включён всегда, а при числе внешних инструментов ниже
// порога промоции не применяется вовсе — на типовом пространстве это no-op.
export const agentToolRagFallbacks = {
  // Порог промоции: ретривал применяется, только если резидентных внешних инструментов >= этого числа
  // (ориентир дизайна ~40–50 — за зоной деградации внимания слабой модели, но в пределах окна).
  promotionThreshold: 40,
  // Жёсткий потолок кандидатного набора (адаптивная глубина не превышает его). Высокий recall важнее
  // точности на первой стадии, но без потолка снимок не сужается.
  maxCandidates: 24,
  // Адаптивная глубина: добираем кандидатов, пока их RRF-скор >= adaptiveScoreRatio * (скор лидера).
  // Меньше → глубже/шире (выше recall), больше → жёстче отсечка. 0 = брать ровно maxCandidates.
  adaptiveScoreRatioPct: 30, // храним как целые проценты (0..100) для number-инпута админки
  // RRF-константа слияния (как в search-профилях КБ): rrf_score = Σ 1/(rrfK + rank).
  rrfK: 60,
  // Веса слияния половин (целые проценты для UI; сервер нормализует к сумме 1). По умолчанию равные.
  bm25WeightPct: 50,
  vectorWeightPct: 50,
  // Интервал фонового хэш-сверщика (reconciler), сек.
  reconcilerIntervalSec: 15 * 60,
  // TTL кэша результата ретривала (getCache, tenant-scoped), сек. 0 = не кэшировать.
  cacheTtlSec: 60,
} as const;

// nullable boolean: пусто/null/undefined → null (= «Авто»/env-дефолт), иначе boolean.
function nullableBooleanSettingSchema() {
  return z.preprocess((value) => {
    if (value === null || value === undefined || value === "") {
      return null;
    }
    if (value === true || value === "true") {
      return true;
    }
    if (value === false || value === "false") {
      return false;
    }
    return value;
  }, z.boolean().nullable());
}

// Режим «Авто»: порог уверенности модели выбора пути для передачи задачи агенту. NULL = «Авто» = дефолт кода.
// Модели роутера и выключателя нет: выбор пути идёт на быстрой служебной модели (ревизия 21.10.2026).
export const chatRouterFallbacks = {
  // Эскалация в агента только при уверенности не ниже порога — чат дешевле и быстрее.
  agentConfidenceThresholdPct: 70,
} as const;

export const chatRouterRanges = {
  // 0 значил бы «всегда агент», 100 — «никогда»: оба положения ломают «Авто», поэтому диапазон сужен.
  agentConfidenceThresholdPct: { min: 30, max: 95 },
} as const;

export const agentSettingsChatRouterSectionSchema = z.object({
  agentConfidenceThresholdPct: nullableIntegerSettingSchema(
    chatRouterRanges.agentConfidenceThresholdPct.min,
    chatRouterRanges.agentConfidenceThresholdPct.max,
  ).default(null),
});

// Гейт честности ответов чата: запрос, требующий точной опоры на источники, получает директиву «только из контекста
// с маркером источника / источников нет — скажи прямо». NULL = «Авто» = дефолт кода.
export const chatAnswerGroundingFallbacks = {
  // Выключен по умолчанию: служебный вызов вердикта добавляет модельный вызов на каждое сообщение чата.
  // Включение — решение администратора.
  gateEnabled: false,
} as const;

export const agentSettingsAnswerGroundingSectionSchema = z.object({
  gateEnabled: nullableBooleanSettingSchema().default(null),
});

// Проверка достоверности после ответа (docs/rag-answer-quality-metrics-strategy-2026-09.md, §5.4): одна ручка
// «Проверка ответов», положения — в shared/answer-quality.ts.
export const agentSettingsAnswerQualitySectionSchema = answerQualitySettingsSchema;

export const agentSettingsSmalltalkSectionSchema = z.object({
  phrases: z.array(z.string().trim().min(1)).default([]),
});

// --- Каскадный fallback: ОБЩИЙ пул запасных LLM-моделей (2 ступени) для fast-path и основной роли.
// Списки model id по приоритету; порядок = очередь каскада (tier1 → tier2). Пусто = каскада нет
// (только основная модель роли). Мягкие ссылки: недоступную модель каскад пропускает в рантайме.
export const agentSettingsModelPoolSectionSchema = z.object({
  tier1: z.array(z.string().trim().min(1)).default([]),
  tier2: z.array(z.string().trim().min(1)).default([]),
});

// --- Сессии агента: сервис сессий агента (волна 1, docs/agent-session-service-design.md §3.14) ---
// Группа «Сессии агента» в «Настройках агента». Хранится одной jsonb-колонкой unica_chat_config.agent_session_settings
// (миграция 0386). null в числовом поле = «Авто» = значение из agentSessionFallbacks. Агент в Унике один — все его
// задачи выполняет сервис сессий, поэтому списка ассистентов в разделе нет: сохранённый ранее `assistantIds`
// при чтении пропускается.
// Потолки на установку сервис читает у монолита, потолки на сессию монолит кладёт в команду старта.
// Адреса сервиса в разделе нет: связь между сервисами задаёт DevOps переменной окружения монолита
// (server/agent-runtime/agent-session-config.ts). Сохранённый ранее `serviceUrl` при чтении пропускается.
/** Провайдер агента (сервис сессий) в журнале запусков и в конверте прогона (`metadata.agentProvider`). */
export const AGENT_SESSION_PROVIDER_ID = "unica_agent_session" as const;

export const agentSessionFallbacks = {
  // Сессия в работе почти ничего не стоит: потолок защищает базу и песочницы, а не модель. 0 — пауза приёма: новые
  // сессии ждут в очереди, начатые дорабатывают.
  maxActiveSessions: 200,
  maxActivePerWorkspace: 20,
  // Один человек не занимает все места установки.
  maxActivePerUser: 3,
  // Одновременные вызовы модели на всю установку — по ёмкости GPU.
  maxModelCalls: 16,
  sandboxIdleMinutes: 3,
  sessionTokenCeiling: 30_000_000,
  sessionMaxDurationHours: 8,
  // Модель недоступна дольше — сессия завершается понятной ошибкой, а не ждёт вечно.
  modelWaitMaxMinutes: 15,
  sandboxCpu: 2,
  sandboxMemoryGib: 2,
  // Место на диске сессий (SEC-08.2): предел папки сессии и одного файла, МБ; свободного места на томе ниже порога —
  // команды не запускаются. Сроки хранения данных сессий — не здесь, а в «Политиках очистки».
  sessionWorkspaceMaxMb: 5120,
  maxFileMb: 1024,
  minFreeDiskPercent: 10,
  contextWindowCapTokens: AGENT_CONTEXT_WINDOW_CAP_TOKENS,
  // Исполнители одной сессии: сколько работают разом (каждый занимает слот модели) и сколько раз одно поручение
  // зовёт модель — зациклившийся исполнитель возвращает поручение, а не расходует бюджет сессии.
  parallelWorkers: 3,
  workerModelCalls: 20,
} as const;

// Ручки администратора — только нагрузка (ревизия 21.10.2026); остальные потолки — константы `agentSessionFallbacks`.
export const agentSessionRanges = {
  maxActiveSessions: { min: 0, max: 5000 },
  maxActivePerWorkspace: { min: 1, max: 5000 },
  maxActivePerUser: { min: 1, max: 1000 },
  maxModelCalls: { min: 1, max: 1000 },
  sandboxMemoryGib: { min: 1, max: 128 },
  sessionWorkspaceMaxMb: { min: 100, max: 1_048_576 },
} as const;

type AgentSessionNumericKey = keyof typeof agentSessionFallbacks;
type AgentSessionAdminKey = keyof typeof agentSessionRanges;

function agentSessionNumber(key: AgentSessionAdminKey) {
  return nullableIntegerSettingSchema(agentSessionRanges[key].min, agentSessionRanges[key].max).default(null);
}

export const agentSettingsAgentSessionSectionSchema = z.object({
  maxActiveSessions: agentSessionNumber("maxActiveSessions"),
  maxActivePerWorkspace: agentSessionNumber("maxActivePerWorkspace"),
  maxActivePerUser: agentSessionNumber("maxActivePerUser"),
  maxModelCalls: agentSessionNumber("maxModelCalls"),
  sandboxMemoryGib: agentSessionNumber("sandboxMemoryGib"),
  sessionWorkspaceMaxMb: agentSessionNumber("sessionWorkspaceMaxMb"),
});

export type AgentSessionSettingsSectionDto = z.infer<typeof agentSettingsAgentSessionSectionSchema>;
export type AgentSessionSettingsResolved = {
  [K in AgentSessionNumericKey]: number;
};

/**
 * Сохранённый раздел как задан администратором: поле, не прошедшее проверку, читается как «Авто» (null), а не роняет
 * страницу или прогон. Ключи вне схемы, например `assistantIds` прежнего списка ассистентов, пропускаются.
 */
export function readAgentSessionSettingsSection(raw: unknown): AgentSessionSettingsSectionDto {
  const stored = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const shape = agentSettingsAgentSessionSectionSchema.shape;
  return Object.fromEntries(
    (Object.keys(shape) as (keyof typeof shape)[]).map((key) => {
      const parsed = shape[key].safeParse(stored[key]);
      return [key, parsed.success ? parsed.data : null];
    }),
  ) as AgentSessionSettingsSectionDto;
}

/**
 * Действующие настройки сессий агента из сохранённого jsonb: заданное администратором, остальное — по умолчанию.
 * Битое или устаревшее значение не роняет прогон: поле, не прошедшее проверку, берётся по умолчанию.
 */
export function resolveAgentSessionSettings(raw: unknown): AgentSessionSettingsResolved {
  const section = readAgentSessionSettingsSection(raw);
  return Object.fromEntries(
    (Object.keys(agentSessionFallbacks) as AgentSessionNumericKey[]).map((key) => [
      key,
      (key in section ? section[key as AgentSessionAdminKey] : null) ?? agentSessionFallbacks[key],
    ]),
  ) as AgentSessionSettingsResolved;
}

export const updateAgentSettingsConfigSchema = z.object({
  main: agentSettingsMainSectionSchema.optional(),
  runtimeLimits: agentSettingsRuntimeLimitsSectionSchema.optional(),
  workflowCodeExec: agentSettingsWorkflowCodeExecSectionSchema.optional(),
  chatRouter: agentSettingsChatRouterSectionSchema.optional(),
  answerGrounding: agentSettingsAnswerGroundingSectionSchema.optional(),
  answerQuality: agentSettingsAnswerQualitySectionSchema.optional(),
  smalltalk: agentSettingsSmalltalkSectionSchema.optional(),
  modelPool: agentSettingsModelPoolSectionSchema.optional(),
  agentSession: agentSettingsAgentSessionSectionSchema.optional(),
}).refine((value) => (
  value.main !== undefined ||
  value.runtimeLimits !== undefined ||
  value.workflowCodeExec !== undefined ||
  value.chatRouter !== undefined ||
  value.answerGrounding !== undefined ||
  value.answerQuality !== undefined ||
  value.smalltalk !== undefined ||
  value.modelPool !== undefined ||
  value.agentSession !== undefined
), {
  message: "At least one agent settings section must be provided.",
});

// --- Блок 8.1: статус индексации инструментов (admin-индикатор на странице капабилити) ---
export const agentToolRagHealthValues = ["green", "yellow", "red", "disabled"] as const;
export type AgentToolRagHealth = (typeof agentToolRagHealthValues)[number];

export const agentToolRagAttentionItemSchema = z.object({
  workspaceId: z.string().nullable(),
  toolKind: z.string(),
  toolRef: z.string(),
  status: z.string(),
  lastError: z.string().nullable(),
  updatedAt: z.string().nullable(),
});

export const agentToolRagIndexStatusSchema = z.object({
  enabled: z.boolean(),
  promotionThreshold: z.number().int(),
  // Honest-индикатор: green = покрытие полное + конвейер жив; yellow = транзиентное (pending/смена модели);
  // red = внимание (failed/провайдер недоступен/индекс под старой моделью/сверщик застрял); disabled = выключен.
  health: z.enum(agentToolRagHealthValues),
  scope: z.literal("instance"),
  total: z.number().int().nonnegative(),
  indexed: z.number().int().nonnegative(),
  pending: z.number().int().nonnegative(),
  stale: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  coveragePct: z.number().int().min(0).max(100),
  lastIndexedAt: z.string().nullable(),
  embedModel: z.string().nullable(),
  embedModelVer: z.string().nullable(),
  indexModelVers: z.array(z.string()),
  modelMatchesIndex: z.boolean(),
  reconcilerLastRunAt: z.string().nullable(),
  reconcilerStale: z.boolean(),
  providerHealthy: z.boolean(),
  attention: z.array(agentToolRagAttentionItemSchema),
});

export type AgentToolRagAttentionItemDto = z.infer<typeof agentToolRagAttentionItemSchema>;
export type AgentToolRagIndexStatusDto = z.infer<typeof agentToolRagIndexStatusSchema>;

export const agentSettingsConfigSchema = z.object({
  main: z.object({
    agentDefaultModelId: z.string().trim(),
    fastPathModelId: z.string().trim(),
  }),
  runtimeLimits: agentSettingsRuntimeLimitsSectionSchema,
  workflowCodeExec: agentSettingsWorkflowCodeExecSectionSchema,
  chatRouter: agentSettingsChatRouterSectionSchema,
  answerGrounding: agentSettingsAnswerGroundingSectionSchema,
  answerQuality: agentSettingsAnswerQualitySectionSchema,
  smalltalk: z.object({
    phrases: z.array(z.string().trim().min(1)).default([]),
  }),
  modelPool: agentSettingsModelPoolSectionSchema,
  agentSession: agentSettingsAgentSessionSectionSchema,
  // Модель, которую наследуют ПУСТЫЕ селекты агента («По умолчанию») — эффективный дефолт
  // ассистентов. Селекты показывают её имя и следуют за сменой дефолта без пересохранения.
  inheritedDefaultModel: z
    .object({
      modelId: z.string(),
      displayName: z.string().nullable(),
      providerName: z.string().nullable(),
    })
    .nullable()
    .optional(),
});

export type AgentCapabilityCatalogQueryDto = z.infer<typeof agentCapabilityCatalogQuerySchema>;
export type AgentCapabilityCatalogItemDto = z.infer<typeof agentCapabilityCatalogItemSchema>;
export type AgentCapabilityCatalogResponseDto = z.infer<typeof agentCapabilityCatalogResponseSchema>;
export type AgentSettingsMainSectionDto = z.infer<typeof agentSettingsConfigSchema>["main"];
export type AgentSettingsRuntimeLimitsSectionDto = z.infer<typeof agentSettingsConfigSchema>["runtimeLimits"];
export type AgentSettingsWorkflowCodeExecSectionDto = z.infer<typeof agentSettingsConfigSchema>["workflowCodeExec"];
export type AgentSettingsChatRouterSectionDto = z.infer<typeof agentSettingsConfigSchema>["chatRouter"];
export type AgentSettingsAnswerGroundingSectionDto = z.infer<typeof agentSettingsConfigSchema>["answerGrounding"];
export type AgentSettingsAnswerQualitySectionDto = z.infer<typeof agentSettingsConfigSchema>["answerQuality"];
export type AgentSettingsSmalltalkSectionDto = z.infer<typeof agentSettingsConfigSchema>["smalltalk"];
export type AgentSettingsModelPoolSectionDto = z.infer<typeof agentSettingsConfigSchema>["modelPool"];
export type AgentSettingsAgentSessionSectionDto = z.infer<typeof agentSettingsConfigSchema>["agentSession"];
export type AgentSettingsConfigDto = z.infer<typeof agentSettingsConfigSchema>;
export type UpdateAgentSettingsConfigDto = z.infer<typeof updateAgentSettingsConfigSchema>;
