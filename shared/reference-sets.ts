/**
 * Справочники (reference sets) — DTO, Zod-схемы и константы.
 *
 * Инстанс-глобальные версионируемые данные (нормативные таблицы и т.п.) с
 * maker-checker-апрувом; читаются workflow-runner'ом gateway-операциями
 * `reference.getActive` / `reference.getVersion`. Дизайн: docs/reference-sets-design.md.
 *
 * Модуль общий для server/client/tests и НЕ импортирует schema.ts —
 * типы jsonb-колонок schema.ts импортируются отсюда.
 */
import { z } from "zod";

// ─── Ключ справочника ────────────────────────────────────────────────────────

export const REFERENCE_SET_KEY_MAX_LENGTH = 200;
/** Домен-префиксные ключи вида `normative.uk-rf.228`: [a-z0-9] + разделители `.`/`_`/`-`. */
export const REFERENCE_SET_KEY_REGEX = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;

export const referenceSetKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(REFERENCE_SET_KEY_MAX_LENGTH)
  .regex(
    REFERENCE_SET_KEY_REGEX,
    "Ключ: строчные латиница/цифры с разделителями «.», «_», «-» (например normative.uk-rf.228)",
  );

// ─── Enum-значения ───────────────────────────────────────────────────────────

export const referenceSetVersionStatuses = ["draft", "active", "superseded", "rejected"] as const;
export type ReferenceSetVersionStatus = (typeof referenceSetVersionStatuses)[number];

export const referenceSetCreatedByTypes = ["user", "agent"] as const;
export type ReferenceSetCreatedByType = (typeof referenceSetCreatedByTypes)[number];

export const referenceSetActorTypes = ["user", "agent", "system"] as const;
export type ReferenceSetActorType = (typeof referenceSetActorTypes)[number];

/** Итог последней проверки источников hash-гейтом. */
export const referenceSetCheckOutcomes = ["ok", "source_changed", "source_missing", "error"] as const;
export type ReferenceSetCheckOutcome = (typeof referenceSetCheckOutcomes)[number];

export const referenceSetAuditActions = [
  "set_created",
  "set_updated",
  "draft_created",
  "approved",
  "rejected",
  "source_check",
  "source_changed",
  "stale_alert",
] as const;
export type ReferenceSetAuditAction = (typeof referenceSetAuditActions)[number];

// ─── Источники версии (снимок на момент извлечения) ────────────────────────

export const referenceSetSourceDocSchema = z.object({
  /** id документа БЗ (knowledge_documents.id). */
  docId: z.string().trim().min(1),
  title: z.string().trim().max(500).nullish(),
  /** content_hash документа на момент извлечения; NULL = хеш недоступен. */
  contentHash: z.string().trim().max(128).nullish(),
  versionNo: z.number().int().positive().nullish(),
});
export type ReferenceSetSourceDoc = z.infer<typeof referenceSetSourceDocSchema>;

// ─── Payload ────────────────────────────────────────────────────────────────

/** Лимит сериализованного payload (страховка от случайной загрузки не-справочника). */
export const REFERENCE_SET_PAYLOAD_MAX_BYTES = 2_000_000;

export const referenceSetPayloadSchema = z.record(z.string(), z.unknown());

// ─── Структурный дифф версий (jsonb diff_summary) ──────────────────────────

export type ReferenceSetDiffEntryKind = "changed" | "added" | "removed";

export type ReferenceSetDiffEntry = {
  /** Точечный путь в payload, например `tables.drug_sizes.substances[1].large`. */
  path: string;
  kind: ReferenceSetDiffEntryKind;
  before?: unknown;
  after?: unknown;
};

export type ReferenceSetDiffSummary = {
  entries: ReferenceSetDiffEntry[];
  /** Число неизменённых листьев (для строки «N значений без изменений»). */
  unchangedLeafCount: number;
  /** entries обрезаны по лимиту (сервис ограничивает объём jsonb). */
  truncated?: boolean;
};

// ─── Input-схемы (admin API) ────────────────────────────────────────────────

export const createReferenceSetInputSchema = z.object({
  key: referenceSetKeySchema,
  title: z.string().trim().min(1).max(300),
  description: z.string().trim().max(4000).default(""),
  /** NULL/omitted = источники вне БЗ (внешний импорт) — hash-гейт набор пропускает. */
  sourceKnowledgeBaseId: z.string().trim().min(1).nullish(),
  /** NULL = env-дефолт (паттерн «NULL = Авто»). */
  staleAfterDays: z.number().int().min(1).max(365).nullish(),
  /** Эффект с Фазы 2 (авто-черновик); в Фазе 1 — только хранится. */
  autoDraftOnChange: z.boolean().default(false),
});
export type CreateReferenceSetInput = z.infer<typeof createReferenceSetInputSchema>;

/** `key` immutable после создания. */
export const updateReferenceSetInputSchema = createReferenceSetInputSchema
  .omit({ key: true })
  .partial();
export type UpdateReferenceSetInput = z.infer<typeof updateReferenceSetInputSchema>;

export const importReferenceSetVersionInputSchema = z.object({
  payload: referenceSetPayloadSchema,
  sourceDocs: z.array(referenceSetSourceDocSchema).max(100).default([]),
  provenance: z.record(z.string(), z.unknown()).default({}),
  createdByType: z.enum(referenceSetCreatedByTypes).default("user"),
});
export type ImportReferenceSetVersionInput = z.infer<typeof importReferenceSetVersionInputSchema>;

export const decideReferenceSetVersionInputSchema = z.object({
  comment: z.string().trim().max(2000).default(""),
});
export type DecideReferenceSetVersionInput = z.infer<typeof decideReferenceSetVersionInputSchema>;

// ─── DTO (admin API; даты — ISO-строки) ─────────────────────────────────────

export type ReferenceSetDto = {
  id: string;
  workspaceId: string | null;
  key: string;
  title: string;
  description: string;
  sourceKnowledgeBaseId: string | null;
  activeVersionId: string | null;
  activeVersionNo: number | null;
  /** Номер черновика, ожидающего решения (для бейджа в реестре), иначе null. */
  pendingDraftVersionNo: number | null;
  lastVerifiedAt: string | null;
  /** Эффективное значение с учётом env-дефолта. */
  staleAfterDaysEffective: number;
  /** Сырое значение колонки (NULL = env-дефолт). */
  staleAfterDays: number | null;
  autoDraftOnChange: boolean;
  lastCheckOutcome: ReferenceSetCheckOutcome | null;
  lastCheckAt: string | null;
  stale: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ReferenceSetVersionSummaryDto = {
  id: string;
  setId: string;
  versionNo: number;
  payloadHash: string;
  status: ReferenceSetVersionStatus;
  sourceDocs: ReferenceSetSourceDoc[];
  provenance: Record<string, unknown>;
  diffSummary: ReferenceSetDiffSummary | null;
  createdByType: ReferenceSetCreatedByType;
  createdByUserId: string | null;
  approvedByUserId: string | null;
  approvedAt: string | null;
  approveComment: string | null;
  createdAt: string;
};

export type ReferenceSetVersionDto = ReferenceSetVersionSummaryDto & {
  payload: Record<string, unknown>;
};

export type ReferenceSetAuditEntryDto = {
  id: string;
  setId: string;
  versionId: string | null;
  actorType: ReferenceSetActorType;
  actorUserId: string | null;
  action: ReferenceSetAuditAction;
  details: Record<string, unknown>;
  createdAt: string;
};

// ─── Gateway-DTO (чтение из workflow-runner'а) ──────────────────────────────

/** Указатель активной версии — маленький ответ `reference.getActive` (без payload). */
export type ReferenceSetActivePointerDto = {
  setKey: string;
  setId: string;
  versionId: string;
  versionNo: number;
  payloadHash: string;
  lastVerifiedAt: string | null;
  staleAfterDays: number;
  /** lastVerifiedAt старше staleAfterDays (или проверок ещё не было). */
  stale: boolean;
};

/** Полная версия с payload — ответ `reference.getVersion`; иммутабельна, кэшируется бессрочно. */
export type ReferenceSetGatewayVersionDto = {
  setKey: string;
  setId: string;
  versionId: string;
  versionNo: number;
  payloadHash: string;
  payload: Record<string, unknown>;
};

// ─── Порт gateway направления 2 (тип для WorkflowGateway.reference) ─────────

/**
 * Read-группа `reference` gateway-канала монолит↔workflow-runner (D3-ревизия).
 * Обе стороны шва типизируются отсюда (@shared) — по правилу S8 «type-поверхность
 * порта в @shared-фасадах».
 */
export type WorkflowGatewayReferencePort = {
  /** Указатель активной версии (без payload); null = набора/активной версии нет. */
  getActive: (setKey: string) => Promise<ReferenceSetActivePointerDto | null>;
  /** Утверждённая версия с payload (active|superseded); иммутабельна. */
  getVersion: (setKey: string, versionNo: number) => Promise<ReferenceSetGatewayVersionDto | null>;
};

// ─── Дефолты устойчивости ───────────────────────────────────────────────────

/** env-дефолт порога устаревания: UNICA_REFERENCE_SET_STALE_AFTER_DAYS. */
export const REFERENCE_SET_DEFAULT_STALE_AFTER_DAYS = 7;
