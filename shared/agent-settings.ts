import { z } from "zod";

import { confirmationPolicyValues, type JsonObject } from "./plugin-system";
import { reasoningModes } from "./schema";
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
  maxSteps: 32,
  maxToolCalls: 32,
  timeoutSec: 600,
  // null = «Авто»: потолок генерации берём из реестра модели (models.max_completion_tokens),
  // иначе runtime-дефолт рантайма. Число = явный override (клампится к диапазону ниже).
  maxCompletionTokens: null as number | null,
} as const;

export const agentRuntimeLimitRanges = {
  maxSteps: { min: 1, max: 100 },
  maxToolCalls: { min: 1, max: 100 },
  timeoutSec: { min: 30, max: 3600 },
  maxCompletionTokens: { min: 256, max: 32000 },
} as const;

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

// Режим reasoning для агентских запусков. "model_default" = брать defaultMode из
// inputCapabilities.reasoning модели; конкретный режим клампится к поддерживаемым моделью.
export const agentReasoningModeValues = ["model_default", ...reasoningModes] as const;
export type AgentReasoningModeSetting = (typeof agentReasoningModeValues)[number];

// Slim reasoning-конфиг ВЫБРАННОЙ модели агента: те же поля, что чат-композер отдаёт своему
// reasoning-пикеру (минус request/output). Источник на сервере — getChatReasoningConfigForModel.
// Нужен клиенту, т.к. публичный /api/models не отдаёт metadata моделей. Опции селектора reasoning
// строятся из него: «По умолчанию модели» + modes (с labels модели).
export const modelReasoningConfigSchema = z.object({
  supported: z.boolean(),
  modes: z.array(z.enum(reasoningModes)),
  defaultMode: z.enum(reasoningModes),
  labels: z.record(z.string(), z.string()).optional(),
});
export type ModelReasoningConfigDto = z.infer<typeof modelReasoningConfigSchema>;

export const agentSettingsMainSectionSchema = z.object({
  agentDefaultModelId: z.string().trim().max(255).optional().nullable(),
  fastPathModelId: z.string().trim().max(255).optional().nullable(),
  reasoningMode: z.enum(agentReasoningModeValues).optional(),
  // Debug-трейс запусков агента: журнал пишет полные payload (LLM-дельты, скрипты, stdout).
  debugTraceEnabled: z.boolean().optional(),
});

export const agentSettingsRuntimeLimitsSectionSchema = z.object({
  maxSteps: integerSettingSchema(
    agentRuntimeLimitRanges.maxSteps.min,
    agentRuntimeLimitRanges.maxSteps.max,
  ).default(agentRuntimeLimitsDefaults.maxSteps),
  maxToolCalls: integerSettingSchema(
    agentRuntimeLimitRanges.maxToolCalls.min,
    agentRuntimeLimitRanges.maxToolCalls.max,
  ).default(agentRuntimeLimitsDefaults.maxToolCalls),
  timeoutSec: integerSettingSchema(
    agentRuntimeLimitRanges.timeoutSec.min,
    agentRuntimeLimitRanges.timeoutSec.max,
  ).default(agentRuntimeLimitsDefaults.timeoutSec),
  maxCompletionTokens: nullableIntegerSettingSchema(
    agentRuntimeLimitRanges.maxCompletionTokens.min,
    agentRuntimeLimitRanges.maxCompletionTokens.max,
  ).default(null),
});

// --- Задача 5.1: контроль перегрузки (overload control) ---
// Все поля «Авто»-стиля (nullable): null = взять env-дефолт/«выключено», число = явный админ-override.
// Числовые фолбэки (когда и админ, и env молчат) применяет СЕРВЕР (resolveAgentOverloadConfig);
// здесь они нужны для подсказок-плейсхолдеров UI и как документированный baseline.
export const agentOverloadControlFallbacks = {
  // per-реплика (прокидываются в рантайм): 0 = выключено (поведение рантайма не меняется).
  maxConcurrentRuns: 0,
  maxConcurrentCodeExec: 0,
  capacityRetryAfterSec: 5,
  // бюджет переочереди одного шага из-за back-pressure до честного «занято».
  maxCapacityRetries: 5,
  // глобальная (Redis) квота тенанта: 0 = выключено.
  maxConcurrentRunsPerWorkspace: 0,
  // глобальный (Redis) token-bucket повторов: capacity 0 = выключено.
  retryBucketCapacity: 0,
  retryBucketRefillPerMin: 60,
} as const;

export const agentOverloadControlRanges = {
  maxConcurrentRuns: { min: 0, max: 1024 },
  maxConcurrentCodeExec: { min: 0, max: 1024 },
  capacityRetryAfterSec: { min: 1, max: 3600 },
  maxCapacityRetries: { min: 0, max: 100 },
  maxConcurrentRunsPerWorkspace: { min: 0, max: 1024 },
  retryBucketCapacity: { min: 0, max: 100_000 },
  retryBucketRefillPerMin: { min: 1, max: 100_000 },
} as const;

// Все семь полей nullable: пусто/null → «Авто» (env-дефолт), иначе целое в диапазоне. Пустой
// number-инпут админки = «Авто», а не ошибка валидации (как maxCompletionTokens).
export const agentSettingsOverloadControlSectionSchema = z.object({
  maxConcurrentRuns: nullableIntegerSettingSchema(
    agentOverloadControlRanges.maxConcurrentRuns.min,
    agentOverloadControlRanges.maxConcurrentRuns.max,
  ).default(null),
  maxConcurrentCodeExec: nullableIntegerSettingSchema(
    agentOverloadControlRanges.maxConcurrentCodeExec.min,
    agentOverloadControlRanges.maxConcurrentCodeExec.max,
  ).default(null),
  capacityRetryAfterSec: nullableIntegerSettingSchema(
    agentOverloadControlRanges.capacityRetryAfterSec.min,
    agentOverloadControlRanges.capacityRetryAfterSec.max,
  ).default(null),
  maxCapacityRetries: nullableIntegerSettingSchema(
    agentOverloadControlRanges.maxCapacityRetries.min,
    agentOverloadControlRanges.maxCapacityRetries.max,
  ).default(null),
  maxConcurrentRunsPerWorkspace: nullableIntegerSettingSchema(
    agentOverloadControlRanges.maxConcurrentRunsPerWorkspace.min,
    agentOverloadControlRanges.maxConcurrentRunsPerWorkspace.max,
  ).default(null),
  retryBucketCapacity: nullableIntegerSettingSchema(
    agentOverloadControlRanges.retryBucketCapacity.min,
    agentOverloadControlRanges.retryBucketCapacity.max,
  ).default(null),
  retryBucketRefillPerMin: nullableIntegerSettingSchema(
    agentOverloadControlRanges.retryBucketRefillPerMin.min,
    agentOverloadControlRanges.retryBucketRefillPerMin.max,
  ).default(null),
});

// --- Задача 5.2: возобновление после сбоя (resume recovery) ---
// Пороги сторожа зависших агент-прогонов. Поля «Авто»-стиля (nullable): null = env-дефолт, число =
// явный админ-override. Числовые фолбэки применяет СЕРВЕР (resolveAgentRunRecoveryConfig); здесь —
// подсказки-плейсхолдеры UI и документированный baseline.
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

export const agentRunRecoveryRanges = {
  watchdogIntervalSec: { min: 10, max: 3600 },
  staleHeartbeatTimeoutSec: { min: 60, max: 86400 },
  pendingReapTtlSec: { min: 60, max: 86400 },
  idempotencyRetentionDays: { min: 1, max: 3650 },
} as const;

// Все поля nullable: пусто/null → «Авто» (env-дефолт), иначе целое в диапазоне.
export const agentSettingsRunRecoverySectionSchema = z.object({
  watchdogIntervalSec: nullableIntegerSettingSchema(
    agentRunRecoveryRanges.watchdogIntervalSec.min,
    agentRunRecoveryRanges.watchdogIntervalSec.max,
  ).default(null),
  staleHeartbeatTimeoutSec: nullableIntegerSettingSchema(
    agentRunRecoveryRanges.staleHeartbeatTimeoutSec.min,
    agentRunRecoveryRanges.staleHeartbeatTimeoutSec.max,
  ).default(null),
  pendingReapTtlSec: nullableIntegerSettingSchema(
    agentRunRecoveryRanges.pendingReapTtlSec.min,
    agentRunRecoveryRanges.pendingReapTtlSec.max,
  ).default(null),
  idempotencyRetentionDays: nullableIntegerSettingSchema(
    agentRunRecoveryRanges.idempotencyRetentionDays.min,
    agentRunRecoveryRanges.idempotencyRetentionDays.max,
  ).default(null),
});

// --- Волна 1 D: устойчивость агента (runtime resilience) ---
// Бюджет guard-повторов и deadline-запасы Python-рантайма. Поля «Авто»-стиля (nullable): null =
// env-дефолт реплики, число = явный админ-override. 0 — валидное значение (kill-switch механизма),
// а не «Авто». Числовые фолбэки применяет СЕРВЕР (resolveAgentResilienceConfig); здесь —
// подсказки-плейсхолдеры UI и документированный baseline.
export const agentResilienceFallbacks = {
  // бюджет guard-повторов (повтор шага по вердикту guard'ов) на один прогон. 0 = без повторов.
  guardRetryMaxPerRun: 2,
  // guard-повтор допускается, только если до дедлайна прогона осталось не меньше этого (сек).
  guardRetryMinRemainingSec: 60,
  // запас Python-дедлайна к таймауту прогона (сек): рантайм завершает работу раньше отсечки Node,
  // чтобы успеть отдать честный частичный результат.
  deadlineSafetyMarginSec: 20,
  // новый LLM-раунд стартует, только если до дедлайна осталось не меньше этого (сек).
  roundMinRemainingSec: 30,
  // лимит эха предыдущего ответа в промпте guard-повтора (символов). 0 = не эхировать.
  retryEchoMaxChars: 1500,
} as const;

export const agentResilienceRanges = {
  guardRetryMaxPerRun: { min: 0, max: 5 },
  guardRetryMinRemainingSec: { min: 0, max: 600 },
  deadlineSafetyMarginSec: { min: 0, max: 120 },
  roundMinRemainingSec: { min: 0, max: 300 },
  retryEchoMaxChars: { min: 0, max: 20_000 },
} as const;

// --- Step-debug D6.4: устойчивость пошаговой отладки сценариев ---
// Кап живых дебаг-сессий (armed/capturing/active) на пространство: дебаг не должен голодить
// прод-ёмкость воркеров. NULL = «Авто» (env WORKFLOW_DEBUG_MAX_OPEN_SESSIONS_PER_WORKSPACE →
// fallback); 0 — валидный kill-switch (arm всегда отклоняется). Применяет сервер
// (resolveWorkflowDebugConfig) на каждом arm — правка действует без рестарта.
//
// Два РАЗНЫХ таймаута сессии (один общий TTL смешивал несмешиваемое):
//  • armTtlSeconds — сколько армированная сессия ждёт входящий вызов в выбранном канале. Короткий:
//    брошенный arm не должен занимать кап пространства. После захвата не применяется.
//  • sessionTtlSeconds — сколько живёт САМА сессия после захвата входа. Скользящий: каждая
//    активность автора (шаг/перезапуск/правка узла/пин/сабмит формы) продлевает срок; истечение
//    закрывает сессию и отменяет захваченный прогон (иначе он вечно висит в waiting_debug_step).
// 0 в этих полях недопустим (сессия без времени жизни бессмысленна) — min задан ненулевым.
export const workflowDebugFallbacks = {
  maxOpenSessionsPerWorkspace: 3,
  armTtlSeconds: 5 * 60,
  sessionTtlSeconds: 60 * 60,
} as const;

export const workflowDebugRanges = {
  maxOpenSessionsPerWorkspace: { min: 0, max: 50 },
  armTtlSeconds: { min: 60, max: 60 * 60 },
  sessionTtlSeconds: { min: 5 * 60, max: 8 * 60 * 60 },
} as const;

export const agentSettingsWorkflowDebugSectionSchema = z.object({
  maxOpenSessionsPerWorkspace: nullableIntegerSettingSchema(
    workflowDebugRanges.maxOpenSessionsPerWorkspace.min,
    workflowDebugRanges.maxOpenSessionsPerWorkspace.max,
  ).default(null),
  armTtlSeconds: nullableIntegerSettingSchema(
    workflowDebugRanges.armTtlSeconds.min,
    workflowDebugRanges.armTtlSeconds.max,
  ).default(null),
  sessionTtlSeconds: nullableIntegerSettingSchema(
    workflowDebugRanges.sessionTtlSeconds.min,
    workflowDebugRanges.sessionTtlSeconds.max,
  ).default(null),
});

// Все поля nullable: пусто/null → «Авто» (env-дефолт), иначе целое в диапазоне (0 валиден).
export const agentSettingsResilienceSectionSchema = z.object({
  guardRetryMaxPerRun: nullableIntegerSettingSchema(
    agentResilienceRanges.guardRetryMaxPerRun.min,
    agentResilienceRanges.guardRetryMaxPerRun.max,
  ).default(null),
  guardRetryMinRemainingSec: nullableIntegerSettingSchema(
    agentResilienceRanges.guardRetryMinRemainingSec.min,
    agentResilienceRanges.guardRetryMinRemainingSec.max,
  ).default(null),
  deadlineSafetyMarginSec: nullableIntegerSettingSchema(
    agentResilienceRanges.deadlineSafetyMarginSec.min,
    agentResilienceRanges.deadlineSafetyMarginSec.max,
  ).default(null),
  roundMinRemainingSec: nullableIntegerSettingSchema(
    agentResilienceRanges.roundMinRemainingSec.min,
    agentResilienceRanges.roundMinRemainingSec.max,
  ).default(null),
  retryEchoMaxChars: nullableIntegerSettingSchema(
    agentResilienceRanges.retryEchoMaxChars.min,
    agentResilienceRanges.retryEchoMaxChars.max,
  ).default(null),
});

// --- Блок 8, задача 8.1: Tool-RAG (поиск по инструментам), Phase A ---
// Ретривал-сужение ВНЕШНЕГО хвоста (mcpTools/actions/operations) по смыслу запроса перед показом модели.
// Все поля «Авто»-стиля (nullable): null = взять env-дефолт/документированный fallback, значение = явный
// админ-override. Числовые фолбэки (когда и админ, и env молчат) применяет СЕРВЕР
// (resolveAgentToolRagConfig); здесь — подсказки-плейсхолдеры UI и документированный baseline.
//
// Инвариант нулевого регресса: при числе резидентных внешних инструментов < promotionThreshold ретривал
// НЕ применяется (снимок не меняется). На малом/встроенном каталоге Tool-RAG — no-op; включается только на
// больших MCP/action-насыщенных тенантах (там это надёжность, P1). enabled по умолчанию ВКЛ, но порог
// промоции защищает типового тенанта.
export const agentToolRagFallbacks = {
  // Мастер-рубильник Tool-RAG. true = ретривал активен (выше порога промоции), false = всегда полный хвост.
  enabled: true,
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
  // Recall-floor гейта приёмки (офлайн-замер на эталоне): целевой минимальный recall@k. Наблюдаемость/
  // документированный порог; рантайм его не применяет (это офлайн-гейт).
  recallFloorPct: 80,
  // Возраст (сек), после которого проиндексированная запись считается stale при сверке/индикаторе.
  staleAgeSec: 7 * 24 * 60 * 60,
  // Интервал фонового хэш-сверщика (reconciler), сек.
  reconcilerIntervalSec: 15 * 60,
  // TTL кэша результата ретривала (getCache, tenant-scoped), сек. 0 = не кэшировать.
  cacheTtlSec: 60,
} as const;

export const agentToolRagRanges = {
  promotionThreshold: { min: 1, max: 1000 },
  maxCandidates: { min: 1, max: 200 },
  adaptiveScoreRatioPct: { min: 0, max: 100 },
  rrfK: { min: 1, max: 1000 },
  bm25WeightPct: { min: 0, max: 100 },
  vectorWeightPct: { min: 0, max: 100 },
  recallFloorPct: { min: 0, max: 100 },
  staleAgeSec: { min: 60, max: 90 * 24 * 60 * 60 },
  reconcilerIntervalSec: { min: 60, max: 24 * 60 * 60 },
  cacheTtlSec: { min: 0, max: 24 * 60 * 60 },
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

// Все поля nullable: пусто/null → «Авто» (env-дефолт/fallback), иначе значение в диапазоне.
export const agentSettingsToolRagSectionSchema = z.object({
  enabled: nullableBooleanSettingSchema().default(null),
  promotionThreshold: nullableIntegerSettingSchema(
    agentToolRagRanges.promotionThreshold.min,
    agentToolRagRanges.promotionThreshold.max,
  ).default(null),
  maxCandidates: nullableIntegerSettingSchema(
    agentToolRagRanges.maxCandidates.min,
    agentToolRagRanges.maxCandidates.max,
  ).default(null),
  adaptiveScoreRatioPct: nullableIntegerSettingSchema(
    agentToolRagRanges.adaptiveScoreRatioPct.min,
    agentToolRagRanges.adaptiveScoreRatioPct.max,
  ).default(null),
  rrfK: nullableIntegerSettingSchema(
    agentToolRagRanges.rrfK.min,
    agentToolRagRanges.rrfK.max,
  ).default(null),
  bm25WeightPct: nullableIntegerSettingSchema(
    agentToolRagRanges.bm25WeightPct.min,
    agentToolRagRanges.bm25WeightPct.max,
  ).default(null),
  vectorWeightPct: nullableIntegerSettingSchema(
    agentToolRagRanges.vectorWeightPct.min,
    agentToolRagRanges.vectorWeightPct.max,
  ).default(null),
  recallFloorPct: nullableIntegerSettingSchema(
    agentToolRagRanges.recallFloorPct.min,
    agentToolRagRanges.recallFloorPct.max,
  ).default(null),
  staleAgeSec: nullableIntegerSettingSchema(
    agentToolRagRanges.staleAgeSec.min,
    agentToolRagRanges.staleAgeSec.max,
  ).default(null),
  reconcilerIntervalSec: nullableIntegerSettingSchema(
    agentToolRagRanges.reconcilerIntervalSec.min,
    agentToolRagRanges.reconcilerIntervalSec.max,
  ).default(null),
  cacheTtlSec: nullableIntegerSettingSchema(
    agentToolRagRanges.cacheTtlSec.min,
    agentToolRagRanges.cacheTtlSec.max,
  ).default(null),
});

// --- Блок 8, задача 8.2: реестр кластеров + двухстадийный (домен→инструмент) роутинг поверх Tool-RAG 8.1 ---
// Иерархический select-then-call: стадия 1 ранжирует ОПИСАНИЯ кластеров (домены) → сужает до нескольких
// доменов; стадия 2 ранжирует инструменты ВНУТРИ выбранных кластеров (переиспользует ретривал 8.1). Реестр
// кластеров и членство выводятся data-driven из каталога (БЕЗ таблицы); здесь только тюнеры конвейера.
// Все поля nullable: null = «Авто» (env-дефолт/fallback), значение = явный админ-override (resolveAgent-
// ToolClusterRoutingConfig применяет числовые fallback'и). Порог промоции и пороги стадии 2 наследуются от
// секции toolRag (тот же ретривал-субстрат); ниже порога / при выключенном рубильнике — плоский 8.1 (no-op).
export const agentToolClusterRoutingFallbacks = {
  // Мастер-рубильник иерархического роутинга. false → роутинг плоский (8.1 над всем хвостом, без стадии 1).
  enabled: true,
  // Число кластеров-кандидатов стадии 1 (жёсткий потолок адаптивной глубины доменного отбора; CORE сверх него).
  maxCandidateClusters: 3,
  // Адаптивная глубина стадии 1: добор кластеров, пока RRF-скор >= ratio * (скор лидера). Меньше → шире/выше
  // recall (промах домена опаснее промаха инструмента: домен скрывает все свои инструменты). Целые проценты.
  stage1ScoreRatioPct: 35,
  // Бюджет пере-запроса (operation agent.find_tools): потолок кандидатов при higher-recall повторе по намерению.
  // Шире, чем потолок стадии 2 (toolRag.maxCandidates) — пере-запрос намеренно жертвует точностью ради recall.
  requeryMaxCandidates: 48,
} as const;

export const agentToolClusterRoutingRanges = {
  maxCandidateClusters: { min: 1, max: 20 },
  stage1ScoreRatioPct: { min: 0, max: 100 },
  requeryMaxCandidates: { min: 1, max: 200 },
} as const;

// Все поля nullable: пусто/null → «Авто» (env-дефолт/fallback), иначе значение в диапазоне.
export const agentSettingsToolClusterRoutingSectionSchema = z.object({
  enabled: nullableBooleanSettingSchema().default(null),
  maxCandidateClusters: nullableIntegerSettingSchema(
    agentToolClusterRoutingRanges.maxCandidateClusters.min,
    agentToolClusterRoutingRanges.maxCandidateClusters.max,
  ).default(null),
  stage1ScoreRatioPct: nullableIntegerSettingSchema(
    agentToolClusterRoutingRanges.stage1ScoreRatioPct.min,
    agentToolClusterRoutingRanges.stage1ScoreRatioPct.max,
  ).default(null),
  requeryMaxCandidates: nullableIntegerSettingSchema(
    agentToolClusterRoutingRanges.requeryMaxCandidates.min,
    agentToolClusterRoutingRanges.requeryMaxCandidates.max,
  ).default(null),
});

// --- Волна 2A: Prefetch базы знаний (KB prefetch) ---
// Автоматическая подгрузка документов привязанной БЗ в контекст агента до первого вызова модели.
// Все поля «Авто»-стиля (nullable): null = env-дефолт/fallback, значение = явный админ-override.
// Числовые фолбэки применяет СЕРВЕР (resolveKbPrefetchConfig, Node-сторона — в Python не прокидывается);
// здесь — подсказки-плейсхолдеры UI и документированный baseline.
export const agentKbPrefetchFallbacks = {
  // Мастер-рубильник prefetch. true = документы БЗ инлайнятся в контекст до первого вызова модели.
  enabled: true,
  // Бюджет символов на инлайн содержимого документов. 0 = kill-switch: в контекст идёт только оглавление.
  charLimit: 60_000,
  // Максимум документов, инлайнящихся в контекст.
  maxDocs: 30,
} as const;

export const agentKbPrefetchRanges = {
  charLimit: { min: 0, max: 500_000 },
  maxDocs: { min: 1, max: 200 },
} as const;

// Все поля nullable: пусто/null → «Авто» (env-дефолт/fallback), иначе значение в диапазоне
// (0 у charLimit валиден — «только оглавление», не «Авто»).
export const agentSettingsKbPrefetchSectionSchema = z.object({
  enabled: nullableBooleanSettingSchema().default(null),
  charLimit: nullableIntegerSettingSchema(
    agentKbPrefetchRanges.charLimit.min,
    agentKbPrefetchRanges.charLimit.max,
  ).default(null),
  maxDocs: nullableIntegerSettingSchema(
    agentKbPrefetchRanges.maxDocs.min,
    agentKbPrefetchRanges.maxDocs.max,
  ).default(null),
});

export const agentSettingsSmalltalkSectionSchema = z.object({
  phrases: z.array(z.string().trim().min(1)).default([]),
});

export const agentSettingsReplyLibrariesSectionSchema = z.object({
  smalltalk: agentSettingsSmalltalkSectionSchema.default({ phrases: [] }),
});

export const updateAgentSettingsConfigSchema = z.object({
  main: agentSettingsMainSectionSchema.optional(),
  runtimeLimits: agentSettingsRuntimeLimitsSectionSchema.optional(),
  overloadControl: agentSettingsOverloadControlSectionSchema.optional(),
  runRecovery: agentSettingsRunRecoverySectionSchema.optional(),
  resilience: agentSettingsResilienceSectionSchema.optional(),
  workflowDebug: agentSettingsWorkflowDebugSectionSchema.optional(),
  kbPrefetch: agentSettingsKbPrefetchSectionSchema.optional(),
  toolRag: agentSettingsToolRagSectionSchema.optional(),
  toolClusterRouting: agentSettingsToolClusterRoutingSectionSchema.optional(),
  replyLibraries: agentSettingsReplyLibrariesSectionSchema.optional(),
  smalltalk: agentSettingsSmalltalkSectionSchema.optional(),
}).refine((value) => (
  value.main !== undefined ||
  value.runtimeLimits !== undefined ||
  value.overloadControl !== undefined ||
  value.runRecovery !== undefined ||
  value.resilience !== undefined ||
  value.workflowDebug !== undefined ||
  value.kbPrefetch !== undefined ||
  value.toolRag !== undefined ||
  value.toolClusterRouting !== undefined ||
  value.replyLibraries !== undefined ||
  value.smalltalk !== undefined
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
    reasoningMode: z.enum(agentReasoningModeValues),
    debugTraceEnabled: z.boolean(),
  }),
  runtimeLimits: agentSettingsRuntimeLimitsSectionSchema,
  overloadControl: agentSettingsOverloadControlSectionSchema,
  runRecovery: agentSettingsRunRecoverySectionSchema,
  resilience: agentSettingsResilienceSectionSchema,
  workflowDebug: agentSettingsWorkflowDebugSectionSchema,
  kbPrefetch: agentSettingsKbPrefetchSectionSchema,
  toolRag: agentSettingsToolRagSectionSchema,
  toolClusterRouting: agentSettingsToolClusterRoutingSectionSchema,
  smalltalk: z.object({
    phrases: z.array(z.string().trim().min(1)).default([]),
  }),
  replyLibraries: agentSettingsReplyLibrariesSectionSchema,
  // Reasoning-конфиг СОХРАНЁННОЙ основной модели агента (или null). Необязательно: обратная
  // совместимость со старым клиентом. Для несохранённого выбора в пикере — отдельный эндпоинт.
  modelReasoningConfig: modelReasoningConfigSchema.nullable().optional(),
});

export type AgentCapabilityCatalogQueryDto = z.infer<typeof agentCapabilityCatalogQuerySchema>;
export type AgentCapabilityCatalogItemDto = z.infer<typeof agentCapabilityCatalogItemSchema>;
export type AgentCapabilityCatalogResponseDto = z.infer<typeof agentCapabilityCatalogResponseSchema>;
export type AgentSettingsMainSectionDto = z.infer<typeof agentSettingsConfigSchema>["main"];
export type AgentSettingsRuntimeLimitsSectionDto = z.infer<typeof agentSettingsConfigSchema>["runtimeLimits"];
export type AgentSettingsOverloadControlSectionDto = z.infer<typeof agentSettingsConfigSchema>["overloadControl"];
export type AgentSettingsRunRecoverySectionDto = z.infer<typeof agentSettingsConfigSchema>["runRecovery"];
export type AgentSettingsResilienceSectionDto = z.infer<typeof agentSettingsConfigSchema>["resilience"];
export type AgentSettingsWorkflowDebugSectionDto = z.infer<typeof agentSettingsConfigSchema>["workflowDebug"];
export type AgentSettingsKbPrefetchSectionDto = z.infer<typeof agentSettingsConfigSchema>["kbPrefetch"];
export type AgentSettingsToolRagSectionDto = z.infer<typeof agentSettingsConfigSchema>["toolRag"];
export type AgentSettingsToolClusterRoutingSectionDto = z.infer<typeof agentSettingsConfigSchema>["toolClusterRouting"];
export type AgentSettingsSmalltalkSectionDto = z.infer<typeof agentSettingsConfigSchema>["smalltalk"];
export type AgentSettingsReplyLibrariesSectionDto = z.infer<typeof agentSettingsConfigSchema>["replyLibraries"];
export type AgentSettingsConfigDto = z.infer<typeof agentSettingsConfigSchema>;
export type UpdateAgentSettingsConfigDto = z.infer<typeof updateAgentSettingsConfigSchema>;
