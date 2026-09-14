/**
 * Метрики достоверности ответов RAG (Faithfulness / Answer Relevance / Cosine Similarity) —
 * общий контракт двух контуров: офлайн-судьи в арене и асинхронной проверки каждого ответа
 * с источниками после того, как ответ уже отдан пользователю
 * (docs/rag-answer-quality-metrics-strategy-2026-09.md).
 *
 * Здесь только перечисления, пороги по умолчанию, DTO и чистая функция вердикта — без
 * зависимостей от сервера, чтобы файл могли читать клиент, сервер и зеркала схемы.
 */
import { z } from "zod";

/** Вердикт отметки под ответом. `no_sources` — источники не подключались, судья не вызывался. */
export const answerQualityVerdicts = ["supported", "partial", "unsupported", "abstained", "no_sources"] as const;
export type AnswerQualityVerdict = (typeof answerQualityVerdicts)[number];

/** Статус одного утверждения ответа по фрагментам-доказательствам. */
export const answerQualityClaimStatuses = ["supported", "contradicted", "not_found"] as const;
export type AnswerQualityClaimStatus = (typeof answerQualityClaimStatuses)[number];

/** Итог проверки: `done` — метрики посчитаны; `skipped` — проверка пропущена с причиной; `failed` — сбой. */
export const answerQualityCheckStatuses = ["done", "skipped", "failed"] as const;
export type AnswerQualityCheckStatus = (typeof answerQualityCheckStatuses)[number];

/** Статус задания очереди воркера `chat-answer-quality`. */
export const answerQualityJobStatuses = ["pending", "running", "done", "skipped", "failed"] as const;
export type AnswerQualityJobStatus = (typeof answerQualityJobStatuses)[number];

/** Откуда пришёл проверяемый ответ. */
export const answerQualitySources = ["chat", "public_api", "arena"] as const;
export type AnswerQualitySource = (typeof answerQualitySources)[number];

/**
 * Режим онлайн-проверки: `off` — задания не ставятся; `signals` — ярусы 0–1 (сигналы и близость,
 * без модели, отметка пользователю не показывается); `judge` — все ярусы, судья на каждом ответе
 * с источниками (решение владельца 14.09.2026, 2в).
 */
export const answerQualityModes = ["off", "signals", "judge"] as const;
export type AnswerQualityMode = (typeof answerQualityModes)[number];

/** Кому показывать отметку под ответом. */
export const answerQualityVisibilities = ["nobody", "admins", "everyone"] as const;
export type AnswerQualityVisibility = (typeof answerQualityVisibilities)[number];

/** Учёт токенов судьи: платформенная стоимость или списание с пространства. */
export const answerQualityCostModes = ["platform", "workspace"] as const;
export type AnswerQualityCostMode = (typeof answerQualityCostModes)[number];

/** Причины пропуска проверки — фиксированный словарь для метрик и карточки запуска. */
export const answerQualitySkipReasons = [
  "mode_off",
  "feature_disabled",
  "no_sources",
  "empty_answer",
  "run_missing",
  "queue_overflow",
  "judge_unavailable",
  "judge_failed",
] as const;
export type AnswerQualitySkipReason = (typeof answerQualitySkipReasons)[number];

/** Версия промпта судьи — пишется в каждую запись, чтобы сравнивать калибровки между собой. */
export const ANSWER_QUALITY_JUDGE_PROMPT_VERSION = "2026-09-14.v1";

/** Потолок глубины очереди — константа кода, не настройка (решение 2в). */
export const ANSWER_QUALITY_QUEUE_CAP = 5_000;

export const answerQualityRanges = {
  workerConcurrency: { min: 1, max: 8 },
  threshold: { min: 0, max: 1 },
  claimsRetentionDays: { min: 7, max: 400 },
} as const;

/** Дефолты кода: NULL в `unica_chat_config` = «Авто» = это значение. */
export const answerQualityDefaults = {
  mode: "judge" as AnswerQualityMode,
  judgeModelId: null as string | null,
  workerConcurrency: 2,
  supportedThreshold: 0.8,
  partialThreshold: 0.5,
  visibility: "everyone" as AnswerQualityVisibility,
  claimsRetentionDays: 90,
  costMode: "platform" as AnswerQualityCostMode,
  arenaJudgeEnabled: true,
  arenaJudgeModelId: null as string | null,
};

export const answerQualityClaimSchema = z.object({
  /** Локальный идентификатор утверждения в пределах проверки: `c1`, `c2`, … */
  id: z.string().trim().min(1).max(16),
  text: z.string().trim().min(1).max(2000),
  status: z.enum(answerQualityClaimStatuses),
  /** id фрагментов-доказательств — только из списка, переданного судье (чужие id отбрасываются). */
  evidenceChunkIds: z.array(z.string().trim().min(1)).max(20).default([]),
  note: z.string().trim().max(500).nullable().optional(),
});
export type AnswerQualityClaim = z.infer<typeof answerQualityClaimSchema>;

/** Числовые оценки одной проверки; null = ярус не дошёл или метрика неприменима. */
export interface AnswerQualityScores {
  lexicalCoverage: number | null;
  cosineAnswerContextMax: number | null;
  cosineAnswerContextMean: number | null;
  cosineQuestionAnswer: number | null;
  faithfulness: number | null;
  answerRelevance: number | null;
  /** Доля обязательных фактов кейса в ответе — только офлайн (арена). */
  completeness: number | null;
  claimsTotal: number | null;
  claimsSupported: number | null;
  claimsContradicted: number | null;
}

export const EMPTY_ANSWER_QUALITY_SCORES: AnswerQualityScores = {
  lexicalCoverage: null,
  cosineAnswerContextMax: null,
  cosineAnswerContextMean: null,
  cosineQuestionAnswer: null,
  faithfulness: null,
  answerRelevance: null,
  completeness: null,
  claimsTotal: null,
  claimsSupported: null,
  claimsContradicted: null,
};

/** Сведения о вызове судьи (ярус 2). */
export interface AnswerQualityJudgeMeta {
  judgeModel: string | null;
  judgePromptVersion: string | null;
  judgeTokensIn: number | null;
  judgeTokensOut: number | null;
  judgeDurationMs: number | null;
}

/**
 * Компактное зеркало проверки в `chat_messages.metadata.grounding.quality`: клиент получает отметку
 * вместе с сообщением, детализация утверждений — отдельной ручкой по `checkId`.
 */
export interface ChatMessageAnswerQuality {
  checkId: string;
  verdict: AnswerQualityVerdict;
  tier: number;
  faithfulness: number | null;
  answerRelevance: number | null;
  claimsTotal: number;
  claimsSupported: number;
  claimsContradicted: number;
  /** Кому показывать отметку на момент проверки: `admins` — клиент прячет её от остальных. */
  visibility: AnswerQualityVisibility;
  checkedAt: string;
}

/** Утверждения и доказательства для панели «Проверка ответа» и карточки запуска. */
export interface AnswerQualityClaimsDto {
  checkId: string;
  verdict: AnswerQualityVerdict | null;
  status: AnswerQualityCheckStatus;
  skipReason: AnswerQualitySkipReason | null;
  tierReached: number;
  scores: AnswerQualityScores;
  claims: AnswerQualityClaim[];
  judge: AnswerQualityJudgeMeta;
  createdAt: string;
  judgedAt: string | null;
}

/** Ответ публичного API: поле `quality` у ручки `answer`, когда проверка успела. */
export type PublicAnswerQualityDto = Omit<ChatMessageAnswerQuality, "checkId" | "tier">;

export interface ResolveAnswerQualityVerdictInput {
  sourcesAttached: boolean;
  abstained: boolean;
  claimsTotal: number;
  claimsSupported: number;
  claimsContradicted: number;
  supportedThreshold: number;
  partialThreshold: number;
}

/**
 * Вердикт для отметки выводится из достоверности (§2 стратегии): `supported` — доля подтверждённых
 * ≥ порога и нет противоречий; `partial` — между порогами или одно противоречие; `unsupported` —
 * ниже нижнего порога или противоречия в большинстве; `abstained` — честный отказ без утверждений;
 * `no_sources` — источники не подключались.
 */
export function resolveAnswerQualityVerdict(input: ResolveAnswerQualityVerdictInput): AnswerQualityVerdict {
  if (!input.sourcesAttached) {
    return "no_sources";
  }
  if (input.abstained || input.claimsTotal <= 0) {
    return "abstained";
  }
  const faithfulness = input.claimsSupported / input.claimsTotal;
  if (input.claimsContradicted * 2 > input.claimsTotal) {
    return "unsupported";
  }
  if (faithfulness >= input.supportedThreshold && input.claimsContradicted === 0) {
    return "supported";
  }
  if (faithfulness >= input.partialThreshold || input.claimsContradicted === 1) {
    return "partial";
  }
  return "unsupported";
}

/** Достоверность как доля подтверждённых утверждений; null, если утверждений нет. */
export function computeFaithfulness(claimsTotal: number, claimsSupported: number): number | null {
  if (claimsTotal <= 0) {
    return null;
  }
  return Math.min(1, Math.max(0, claimsSupported / claimsTotal));
}

/** Соответствие вердикта судьи ручной оценке эксперта в арене (одна шкала для «согласия»). */
export function mapArenaReviewToQualityVerdict(review: {
  verdict?: string | null;
  supportedAnswer?: boolean | null;
}): AnswerQualityVerdict | null {
  if (review.supportedAnswer === true) {
    return "supported";
  }
  if (review.supportedAnswer === false) {
    return "unsupported";
  }
  switch (review.verdict) {
    case "correct":
      return "supported";
    case "partially_correct":
    case "incomplete":
      return "partial";
    case "dangerous_error":
      return "unsupported";
    default:
      return null;
  }
}

// --- Админ-настройки (секция `answerQuality` конфига настроек агента) ---

export const answerQualitySettingsSchema = z.object({
  mode: z.enum(answerQualityModes).nullable().default(null),
  judgeModelId: z.string().trim().min(1).nullable().default(null),
  workerConcurrency: z
    .number()
    .int()
    .min(answerQualityRanges.workerConcurrency.min)
    .max(answerQualityRanges.workerConcurrency.max)
    .nullable()
    .default(null),
  supportedThreshold: z
    .number()
    .min(answerQualityRanges.threshold.min)
    .max(answerQualityRanges.threshold.max)
    .nullable()
    .default(null),
  partialThreshold: z
    .number()
    .min(answerQualityRanges.threshold.min)
    .max(answerQualityRanges.threshold.max)
    .nullable()
    .default(null),
  visibility: z.enum(answerQualityVisibilities).nullable().default(null),
  claimsRetentionDays: z
    .number()
    .int()
    .min(answerQualityRanges.claimsRetentionDays.min)
    .max(answerQualityRanges.claimsRetentionDays.max)
    .nullable()
    .default(null),
  costMode: z.enum(answerQualityCostModes).nullable().default(null),
  arenaJudgeEnabled: z.boolean().nullable().default(null),
  arenaJudgeModelId: z.string().trim().min(1).nullable().default(null),
});
export type AnswerQualitySettingsDto = z.infer<typeof answerQualitySettingsSchema>;

/** Эффективные настройки после подстановки дефолтов (`null` → `answerQualityDefaults`). */
export interface ResolvedAnswerQualityConfig {
  mode: AnswerQualityMode;
  judgeModelId: string | null;
  workerConcurrency: number;
  supportedThreshold: number;
  partialThreshold: number;
  visibility: AnswerQualityVisibility;
  claimsRetentionDays: number;
  costMode: AnswerQualityCostMode;
  arenaJudgeEnabled: boolean;
  arenaJudgeModelId: string | null;
}

export function resolveAnswerQualityConfigFromSettings(
  settings: Partial<AnswerQualitySettingsDto> | null | undefined,
): ResolvedAnswerQualityConfig {
  const supportedThreshold = settings?.supportedThreshold ?? answerQualityDefaults.supportedThreshold;
  const partialThreshold = Math.min(
    settings?.partialThreshold ?? answerQualityDefaults.partialThreshold,
    supportedThreshold,
  );
  return {
    mode: settings?.mode ?? answerQualityDefaults.mode,
    judgeModelId: settings?.judgeModelId ?? answerQualityDefaults.judgeModelId,
    workerConcurrency: settings?.workerConcurrency ?? answerQualityDefaults.workerConcurrency,
    supportedThreshold,
    partialThreshold,
    visibility: settings?.visibility ?? answerQualityDefaults.visibility,
    claimsRetentionDays: settings?.claimsRetentionDays ?? answerQualityDefaults.claimsRetentionDays,
    costMode: settings?.costMode ?? answerQualityDefaults.costMode,
    arenaJudgeEnabled: settings?.arenaJudgeEnabled ?? answerQualityDefaults.arenaJudgeEnabled,
    arenaJudgeModelId: settings?.arenaJudgeModelId ?? answerQualityDefaults.arenaJudgeModelId,
  };
}

// --- Админ-страница «Знания и поиск → Качество» и вкладка «Качество» у ассистента ---

export const answerQualityPeriodSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  workspaceId: z.string().trim().min(1).optional(),
  assistantId: z.string().trim().min(1).optional(),
  llmModel: z.string().trim().min(1).optional(),
});
export type AnswerQualityPeriodQuery = z.infer<typeof answerQualityPeriodSchema>;

export type AnswerQualityVerdictCounts = Record<AnswerQualityVerdict, number>;

export interface AnswerQualitySummaryDto {
  from: string;
  to: string;
  checksTotal: number;
  withSourcesTotal: number;
  skippedTotal: number;
  verdictCounts: AnswerQualityVerdictCounts;
  /** Доли считаются от ответов с подключёнными источниками. */
  supportedRate: number | null;
  unsupportedRate: number | null;
  avgFaithfulness: number | null;
  avgAnswerRelevance: number | null;
  avgCosineAnswerContext: number | null;
  judgeCalls: number;
  judgeTokensIn: number;
  judgeTokensOut: number;
  avgJudgeDurationMs: number | null;
}

export interface AnswerQualityDayPointDto {
  day: string;
  supported: number;
  partial: number;
  unsupported: number;
  abstained: number;
  noSources: number;
  skipped: number;
  avgFaithfulness: number | null;
}

export const answerQualityBreakdownDimensions = ["assistant", "workspace", "model"] as const;
export type AnswerQualityBreakdownDimension = (typeof answerQualityBreakdownDimensions)[number];

export interface AnswerQualityBreakdownRowDto {
  key: string;
  label: string;
  checks: number;
  withSources: number;
  supportedRate: number | null;
  unsupportedRate: number | null;
  avgFaithfulness: number | null;
}

export interface AnswerQualityCheckListItemDto {
  id: string;
  createdAt: string;
  workspaceId: string;
  workspaceName: string | null;
  assistantId: string | null;
  assistantName: string | null;
  source: AnswerQualitySource;
  llmModel: string | null;
  status: AnswerQualityCheckStatus;
  skipReason: AnswerQualitySkipReason | null;
  verdict: AnswerQualityVerdict | null;
  tierReached: number;
  faithfulness: number | null;
  answerRelevance: number | null;
  cosineAnswerContextMax: number | null;
  claimsTotal: number | null;
  claimsSupported: number | null;
  claimsContradicted: number | null;
  question: string | null;
  askAiRunId: string | null;
  chatId: string | null;
  chatMessageId: string | null;
  assistantExecutionId: string | null;
}

export interface AnswerQualityCheckFragmentDto {
  chunkId: string;
  documentId: string | null;
  documentTitle: string | null;
  sectionTitle: string | null;
  snippet: string;
  score: number | null;
  cited: boolean;
}

export interface AnswerQualityCheckDetailDto extends AnswerQualityCheckListItemDto {
  scores: AnswerQualityScores;
  claims: AnswerQualityClaim[];
  judge: AnswerQualityJudgeMeta;
  error: string | null;
  judgedAt: string | null;
  answer: string | null;
  fragments: AnswerQualityCheckFragmentDto[];
  citationsCount: number | null;
  sourcesAttached: boolean | null;
  requestedIdentifiersFound: boolean | null;
}

export interface AnswerQualityListResponseDto {
  items: AnswerQualityCheckListItemDto[];
  nextCursor: string | null;
}

/** Пробел в знаниях: вопросы без опоры, сгруппированные по близости. */
export interface AssistantKnowledgeGapDto {
  id: string;
  title: string;
  questions: Array<{ checkId: string; question: string; createdAt: string; chatId: string | null }>;
  count: number;
  /** Базы пространства, не подключённые к ассистенту, чьи портреты ближе всего к теме. */
  suggestedKnowledgeBases: Array<{ id: string; name: string }>;
}

export const assistantQualityRecommendationKinds = [
  "enable_rerank",
  "raise_min_score",
  "attach_knowledge_base",
  "increase_top_k",
] as const;
export type AssistantQualityRecommendationKind = (typeof assistantQualityRecommendationKinds)[number];

export interface AssistantQualityRecommendationDto {
  kind: AssistantQualityRecommendationKind;
  title: string;
  description: string;
  evidenceCount: number;
}

export interface AssistantQualityDto {
  assistantId: string;
  from: string;
  to: string;
  summary: AnswerQualitySummaryDto;
  previousSummary: AnswerQualitySummaryDto | null;
  series: AnswerQualityDayPointDto[];
  gaps: AssistantKnowledgeGapDto[];
  recommendations: AssistantQualityRecommendationDto[];
  recentUnsupported: AnswerQualityCheckListItemDto[];
}

export const EMPTY_ANSWER_QUALITY_VERDICT_COUNTS: AnswerQualityVerdictCounts = {
  supported: 0,
  partial: 0,
  unsupported: 0,
  abstained: 0,
  no_sources: 0,
};

export function buildEmptyAnswerQualitySummary(from: string, to: string): AnswerQualitySummaryDto {
  return {
    from,
    to,
    checksTotal: 0,
    withSourcesTotal: 0,
    skippedTotal: 0,
    verdictCounts: { ...EMPTY_ANSWER_QUALITY_VERDICT_COUNTS },
    supportedRate: null,
    unsupportedRate: null,
    avgFaithfulness: null,
    avgAnswerRelevance: null,
    avgCosineAnswerContext: null,
    judgeCalls: 0,
    judgeTokensIn: 0,
    judgeTokensOut: 0,
    avgJudgeDurationMs: null,
  };
}

/** Подписи вердиктов — единый словарь для чата, арены и админки. */
export const answerQualityVerdictLabels: Record<AnswerQualityVerdict, string> = {
  supported: "Подтверждено источниками",
  partial: "Подтверждено частично",
  unsupported: "Без опоры на источники",
  abstained: "Ответ без утверждений",
  no_sources: "Источники не подключались",
};

export const answerQualitySkipReasonLabels: Record<AnswerQualitySkipReason, string> = {
  mode_off: "проверка выключена",
  feature_disabled: "функция выключена для пространства",
  no_sources: "источники не подключались",
  empty_answer: "пустой ответ",
  run_missing: "журнал прогона не найден",
  queue_overflow: "очередь переполнена",
  judge_unavailable: "модель судьи недоступна",
  judge_failed: "сбой судьи",
};
