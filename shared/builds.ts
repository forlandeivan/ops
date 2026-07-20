import { z } from "zod";

/**
 * Build (рус. UI «Сборка») — публикуемая версионируемая поставка ассистента:
 * неизменяемый снимок конфигурации ассистента (без баз знаний) + его действий + связок.
 * Домен-агностично: судебная система и т.п. выражаются через category/контент, не код.
 */
export const BUILD_MANIFEST_FORMAT_VERSION = 1 as const;

/** Минимальная semver-валидация (X.Y.Z с опциональным pre-release/build). */
export const SEMVER_REGEX = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;

export const buildVisibilityValues = ["private", "instance"] as const;
export type BuildVisibility = (typeof buildVisibilityValues)[number];

export const buildStatusValues = ["active", "deprecated", "removed"] as const;
export type BuildStatus = (typeof buildStatusValues)[number];

export const buildInstallStatusValues = [
  "installed",
  "disabled",
  "update_available",
  "broken",
  "degraded",
  "uninstalled",
] as const;
export type BuildInstallStatus = (typeof buildInstallStatusValues)[number];

export const installModeValues = ["reference", "fork"] as const;
export type InstallMode = (typeof installModeValues)[number];

/**
 * Политика применения обновлений установленной сборки.
 * Фаза 2a реализует только manual + pinned; auto_* заложены для Фазы 2b.
 */
export const buildUpdatePolicyValues = ["manual", "auto_patch", "auto_minor", "pinned"] as const;
export type BuildUpdatePolicy = (typeof buildUpdatePolicyValues)[number];

export const buildActionResolutionOutcomes = [
  "created",
  "reused",
  "updated",
  "conflict",
  "removed",
  "skipped",
] as const;
export type BuildActionResolutionOutcome = (typeof buildActionResolutionOutcomes)[number];

/** Тип события истории обновлений установленной сборки (аудит, основа отката). */
export const buildUpdateEventValues = [
  "checked",
  "notified",
  "applied",
  "skipped",
  "failed",
  "rolled_back",
] as const;
export type BuildUpdateEvent = (typeof buildUpdateEventValues)[number];

const jsonRecord: z.ZodType<Record<string, unknown>> = z.record(z.string(), z.unknown());

/**
 * Поведенческий снимок определения действия (БЕЗ окружения: без workspaceId,
 * llmProviderConfigId, llmModelId, llmConfigId, scope, id, status, timestamps).
 * Именно эти поля участвуют в content_hash идентичности.
 */
export const buildActionDefinitionSchema = z.object({
  label: z.string().trim().min(1).max(255),
  description: z.string().max(4000).nullable().optional(),
  target: z.string().trim().min(1).max(64),
  sources: z.array(z.string().trim().min(1).max(64)).optional(),
  placements: z.array(z.string().trim().min(1).max(64)).default([]),
  promptTemplate: z.string().default(""),
  inputType: z.string().trim().min(1).max(64),
  outputMode: z.string().trim().min(1).max(64),
  actionKind: z.string().trim().max(32).optional(),
  toolName: z.string().trim().max(255).nullable().optional(),
  toolConfig: jsonRecord.optional(),
  inheritAssistantSystemPrompt: z.boolean().optional(),
  llmTemperature: z.number().nullable().optional(),
  llmMaxCompletionTokens: z.number().int().nullable().optional(),
  llmTopP: z.number().nullable().optional(),
  llmTopK: z.number().int().nullable().optional(),
  llmRepeatPenalty: z.number().nullable().optional(),
  llmSeed: z.number().int().nullable().optional(),
  inputContract: jsonRecord.optional(),
  outputContract: jsonRecord.optional(),
});
export type BuildActionDefinition = z.infer<typeof buildActionDefinitionSchema>;

export const buildActionSnapshotSchema = z.object({
  /** Стабильный ключ действия внутри Build (slug из label + индекс). */
  actionKey: z.string().trim().min(1).max(255),
  /** Логическая идентичность действия: "build:<buildId>@<actionKey>". */
  originRef: z.string().trim().min(1).max(255),
  /** sha256 от поведенческих полей определения. */
  contentHash: z.string().trim().min(1).max(128),
  definition: buildActionDefinitionSchema,
});
export type BuildActionSnapshot = z.infer<typeof buildActionSnapshotSchema>;

export const buildBindingSnapshotSchema = z.object({
  actionKey: z.string().trim().min(1).max(255),
  enabled: z.boolean().default(true),
  enabledPlacements: z.array(z.string().trim().min(1).max(64)).default([]),
  labelOverride: z.string().max(255).nullable().optional(),
});
export type BuildBindingSnapshot = z.infer<typeof buildBindingSnapshotSchema>;

/** Декларация потребности в базах знаний — БЕЗ данных и без knowledgeBaseId. */
export const buildRequiredKnowledgeSchema = z.object({
  role: z.string().trim().min(1).max(255),
  hint: z.string().max(2000).nullable().optional(),
});
export type BuildRequiredKnowledge = z.infer<typeof buildRequiredKnowledgeSchema>;

/**
 * Снимок файла ассистента в сборке (Фаза 2c). Байты НЕ в манифесте — лежат в
 * build-scoped MinIO-префиксе исходного workspace; здесь только метаданные + ссылка.
 * contentHash обеспечивает дедупликацию между версиями и целостность.
 */
export const buildFileSnapshotSchema = z.object({
  /** Имя файла для отображения и пересоздания. */
  originalName: z.string().trim().min(1).max(512),
  mimeType: z.string().max(255).nullable().optional(),
  sizeBytes: z.number().int().nonnegative().nullable().optional(),
  /** sha256 содержимого — дедупликация и проверка целостности. */
  contentHash: z.string().trim().min(1).max(128),
  /** Ключ объекта в бакете исходного workspace (build-scoped, не tenant-файл). */
  storageKey: z.string().trim().min(1).max(1024),
});
export type BuildFileSnapshot = z.infer<typeof buildFileSnapshotSchema>;

export const buildManifestSchema = z.object({
  formatVersion: z.literal(BUILD_MANIFEST_FORMAT_VERSION),
  build: z.object({
    name: z.string().trim().min(1).max(255),
    description: z.string().max(4000).nullable().optional(),
    icon: z.string().max(2048).nullable().optional(),
    category: z.string().max(100).nullable().optional(),
  }),
  /** Снимок конфигурации ассистента (формируется buildExportAssistantPayload, без окружения и KB). */
  assistant: jsonRecord,
  actions: z.array(buildActionSnapshotSchema).default([]),
  bindings: z.array(buildBindingSnapshotSchema).default([]),
  requiredKnowledge: z.array(buildRequiredKnowledgeSchema).optional(),
  /** Файлы ассистента (опционально включаются автором). Индексация — после install. */
  files: z.array(buildFileSnapshotSchema).default([]),
});
export type BuildManifest = z.infer<typeof buildManifestSchema>;

/* ----------------------------- API input schemas ----------------------------- */

export const buildPublishInputSchema = z.object({
  assistantId: z.string().trim().min(1),
  version: z.string().trim().regex(SEMVER_REGEX, "Версия должна быть в формате semver (X.Y.Z)"),
  visibility: z.enum(buildVisibilityValues).default("private"),
  name: z.string().trim().min(1).max(255).optional(),
  description: z.string().max(4000).nullable().optional(),
  category: z.string().max(100).nullable().optional(),
  changelog: z.string().max(4000).nullable().optional(),
  /** Включить файлы ассистента в сборку (Фаза 2c). По умолчанию включено. */
  includeFiles: z.boolean().default(true),
});
export type BuildPublishInput = z.infer<typeof buildPublishInputSchema>;

export const buildInstallInputSchema = z.object({
  buildId: z.string().trim().min(1),
  versionId: z.string().uuid().optional(),
  mode: z.enum(installModeValues).default("reference"),
});
export type BuildInstallInput = z.infer<typeof buildInstallInputSchema>;

/** Вход применения обновления установленной сборки (по умолчанию — последняя версия). */
export const buildUpdateInputSchema = z.object({
  targetVersionId: z.string().uuid().optional(),
});
export type BuildUpdateInput = z.infer<typeof buildUpdateInputSchema>;

/* ----------------------------- Resolution report ----------------------------- */

export type BuildActionResolutionEntry = {
  actionKey: string;
  originRef: string;
  outcome: BuildActionResolutionOutcome;
  actionId: string | null;
  message?: string;
};

/** Сводка переноса файлов ассистента при install/update. */
export type BuildFilesResolution = {
  created: number;
  reused: number;
  removed: number;
  failed: number;
};

export type BuildResolutionReport = {
  actions: BuildActionResolutionEntry[];
  knowledgeRoles: string[];
  warnings: string[];
  files?: BuildFilesResolution;
};

export function emptyResolutionReport(): BuildResolutionReport {
  return { actions: [], knowledgeRoles: [], warnings: [] };
}

/* ----------------------------- Update preview (diff) ----------------------------- */

/** Сводка изменений действий между установленной и целевой версией (dry-run резолва). */
export type BuildUpdateActionsDiff = {
  created: number;
  updated: number;
  removed: number;
  reused: number;
  conflicts: number;
};

/** Превью обновления установленной сборки: что изменится при apply. */
export type BuildUpdatePreview = {
  buildId: string;
  fromVersion: string | null;
  toVersion: string;
  toVersionId: string;
  changelog: string | null;
  /** Изменяемые контентные поля ассистента (имена полей, без значений окружения). */
  changedAssistantFields: string[];
  actions: BuildUpdateActionsDiff;
  /** Новые требуемые роли баз знаний, которых не было раньше. */
  newKnowledgeRoles: string[];
  /** Файлы: сколько добавится / удалится при обновлении. */
  files: { added: number; removed: number };
  warnings: string[];
};

/** Семантическая категория перехода версий (для политик auto_patch/auto_minor — Фаза 2b). */
export const buildSemverBumpValues = ["patch", "minor", "major", "unknown"] as const;
export type BuildSemverBump = (typeof buildSemverBumpValues)[number];

/** Категория перехода from→to по semver. Без pre-release/build-метаданных. */
export function classifySemverBump(from: string | null, to: string): BuildSemverBump {
  if (!from) return "unknown";
  const a = parseSemverCore(from);
  const b = parseSemverCore(to);
  if (!a || !b) return "unknown";
  if (b[0] !== a[0]) return "major";
  if (b[1] !== a[1]) return "minor";
  if (b[2] !== a[2]) return "patch";
  return "unknown";
}

/** Разбор X.Y.Z (игнорируя pre-release/build-метаданные). null если не semver. */
function parseSemverCore(value: string): [number, number, number] | null {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(value.trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

export const semverBumpLevels = ["patch", "minor", "major"] as const;
export type SemverBumpLevel = (typeof semverBumpLevels)[number];

/**
 * Следующая версия от base по уровню bump. Если base не semver — вернёт "1.0.0".
 * patch: X.Y.(Z+1) · minor: X.(Y+1).0 · major: (X+1).0.0
 */
export function nextSemver(base: string | null, level: SemverBumpLevel = "patch"): string {
  const core = base ? parseSemverCore(base) : null;
  if (!core) return "1.0.0";
  const [major, minor, patch] = core;
  if (level === "major") return `${major + 1}.0.0`;
  if (level === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

/* ----------------------------- Build-by-assistant lookup ----------------------------- */

/** Краткая запись версии сборки для UI истории/публикации. */
export type BuildVersionSummary = {
  id: string;
  version: string;
  changelog: string | null;
  createdAt: string;
};

/**
 * Результат поиска уже опубликованной сборки для данного ассистента.
 * Позволяет UI понять «этот ассистент уже публиковался» и предложить bump версии.
 */
export type BuildByAssistantResult = {
  exists: boolean;
  buildId: string;
  name: string | null;
  latestVersion: string | null;
  installCount: number;
  versions: BuildVersionSummary[];
  /** Рекомендованная следующая версия (patch-bump от latestVersion; "1.0.0" если сборки нет). */
  suggestedVersion: string;
};
