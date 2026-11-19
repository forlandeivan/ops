import { normalizeActionInheritance } from "./legacy-keys";
import { z } from "zod";

import { workflowBundleSchema } from "./workflows";

/**
 * Build (рус. UI «Сборка») — публикуемая версионируемая поставка агента:
 * неизменяемый снимок конфигурации агента (без баз знаний) + его действий + связок,
 * а с formatVersion 2 — опционально и снимок workspace-сценария (workflowBundle).
 * Домен-агностично: судебная система и т.п. выражаются через category/контент, не код.
 */
export const BUILD_MANIFEST_FORMAT_VERSION = 1 as const;
/** Текущая версия манифеста при публикации. Версии 1 и 2 продолжают читаться (обратная совместимость). */
export const BUILD_MANIFEST_CURRENT_FORMAT_VERSION = 3 as const;

/** Минимальная semver-валидация (X.Y.Z с опциональным pre-release/build). */
export const SEMVER_REGEX = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;

/** Предел длины инструкции к сборке (Markdown), знаков. */
export const BUILD_INSTRUCTION_MAX_LENGTH = 100_000;

export const buildVisibilityValues = ["private", "instance"] as const;
export type BuildVisibility = (typeof buildVisibilityValues)[number];

export const buildStatusValues = ["active", "deprecated", "removed"] as const;
export type BuildStatus = (typeof buildStatusValues)[number];

/** Группа категорий каталога: одно значение на сборку или несколько. */
export const buildCategorySelectionValues = ["single", "multi"] as const;
export type BuildCategorySelection = (typeof buildCategorySelectionValues)[number];

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
export const buildActionDefinitionFields = z.object({
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
  inheritAgentSystemPrompt: z.boolean().optional(),
  llmTemperature: z.number().nullable().optional(),
  llmMaxCompletionTokens: z.number().int().nullable().optional(),
  llmTopP: z.number().nullable().optional(),
  llmTopK: z.number().int().nullable().optional(),
  llmRepeatPenalty: z.number().nullable().optional(),
  llmSeed: z.number().int().nullable().optional(),
  inputContract: jsonRecord.optional(),
  outputContract: jsonRecord.optional(),
});
export const buildActionDefinitionSchema = z.preprocess(normalizeActionInheritance, buildActionDefinitionFields);
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
 * Снимок файла агента в сборке (Фаза 2c). Байты НЕ в манифесте — лежат в
 * build-scoped MinIO-префиксе исходного workspace; здесь только метаданные + ссылка.
 * contentHash обеспечивает дедупликацию между версиями и целостность.
 */
export const buildFileSnapshotSchema = z.object({
  /** Имя файла для отображения и пересоздания. */
  originalName: z.string().trim().min(1).max(512),
  /**
   * Назначение файла у агента. Старые манифесты не содержат поле role,
   * поэтому при чтении они сохраняют прежнее поведение rag_source.
   */
  role: z.enum(["rag_source", "material"]).default("rag_source"),
  mimeType: z.string().max(255).nullable().optional(),
  sizeBytes: z.number().int().nonnegative().nullable().optional(),
  /** sha256 содержимого — дедупликация и проверка целостности. */
  contentHash: z.string().trim().min(1).max(128),
  /** Ключ объекта в бакете исходного workspace (build-scoped, не tenant-файл). */
  storageKey: z.string().trim().min(1).max(1024),
});
export type BuildFileSnapshot = z.infer<typeof buildFileSnapshotSchema>;

/** Стабильный ключ сценария внутри сборки (форвард-совместимость с multi-scenario). */
export const BUILD_WORKFLOW_KEY = "main" as const;

/** Ссылка на базу знаний, которую сценарий сборки читает на ране (для resolutionReport установки). */
export const buildWorkflowKnowledgeRequirementSchema = z.object({
  id: z.string().trim().min(1).max(255),
  name: z.string().trim().min(1).max(512),
  ownerWorkspaceId: z.string().trim().min(1).max(255),
  /** Была ли база instance-shared на момент публикации (авто-шаринг публикации). */
  instanceShared: z.boolean().default(false),
});
export type BuildWorkflowKnowledgeRequirement = z.infer<typeof buildWorkflowKnowledgeRequirementSchema>;

/** LLM-провайдер, на который ссылаются knowledge-узлы сценария (ragLlmProviderId). */
export const buildWorkflowLlmProviderRequirementSchema = z.object({
  id: z.string().trim().min(1).max(255),
  name: z.string().trim().max(255).nullable().optional(),
});
export type BuildWorkflowLlmProviderRequirement = z.infer<typeof buildWorkflowLlmProviderRequirementSchema>;

/**
 * Снимок .docx-шаблона узла typed_template в сборке. Шаблон пространства лежит в бакете автора,
 * поэтому при публикации байты копируются в глобальное хранилище витрины (как файлы агента),
 * а при установке — в бакет получателя под новым ключом. Шаблоны инстанса
 * (instance-workflow-templates/…) читаются из любого пространства и в снимок не входят.
 */
export const buildWorkflowTemplateSnapshotSchema = z.object({
  /** Узел typed_template в editorDocument, которому принадлежит шаблон. */
  nodeId: z.string().trim().min(1).max(255),
  templateName: z.string().trim().max(240).nullable().optional(),
  mimeType: z.string().max(255).nullable().optional(),
  sizeBytes: z.number().int().nonnegative().nullable().optional(),
  /** sha256 содержимого — целостность, дедупликация и контент-хеш сценария вместо ключа. */
  contentHash: z.string().trim().min(1).max(128),
  /** Ключ объекта в хранилище витрины (catalog-storage). */
  storageKey: z.string().trim().min(1).max(1024),
});
export type BuildWorkflowTemplateSnapshot = z.infer<typeof buildWorkflowTemplateSnapshotSchema>;

/**
 * Снимок workspace-сценария в сборке (Сборки v2, срез workflowBundle стратегии В4-05).
 * Несёт полный workflow_bundle_v1 published-версии автора; при установке источник считается
 * недоверенным — материализация перекомпилирует editorDocument в скоупе получателя.
 * contentHash — sha256 stable-JSON от {title, description, editorDocument} (НЕ
 * bundleManifest.contentSha256: тот включает generatedAt/versionNo и нестабилен).
 */
export const buildWorkflowSnapshotSchema = z.object({
  workflowKey: z.literal(BUILD_WORKFLOW_KEY),
  source: z.literal("workspace_scenario"),
  /** Логическая идентичность сценария: "build:<buildId>@workflow:main". */
  originRef: z.string().trim().min(1).max(255),
  contentHash: z.string().trim().min(1).max(128),
  /** versionNo published-версии автора (для диффа "vN → vM" в update-preview). */
  authorVersionNo: z.number().int().positive(),
  bundle: workflowBundleSchema,
  requiredResources: z
    .object({
      knowledgeBases: z.array(buildWorkflowKnowledgeRequirementSchema).default([]),
      llmProviders: z.array(buildWorkflowLlmProviderRequirementSchema).default([]),
    })
    .default({ knowledgeBases: [], llmProviders: [] }),
  /** Шаблоны .docx узлов typed_template из бакета автора. Старые манифесты — пустой список. */
  templates: z.array(buildWorkflowTemplateSnapshotSchema).default([]),
});
export type BuildWorkflowSnapshot = z.infer<typeof buildWorkflowSnapshotSchema>;

/**
 * Файл навыка в сборке. Текст едет содержимым; бинарный файл (шаблон документа) — метаданными и ключом
 * в хранилище витрины (catalog-storage), как файлы агента.
 */
export const buildSkillFileSnapshotSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("text"),
    path: z.string().trim().min(1).max(400),
    content: z.string(),
  }),
  z.object({
    kind: z.literal("binary"),
    path: z.string().trim().min(1).max(400),
    mimeType: z.string().max(255),
    sizeBytes: z.number().int().nonnegative(),
    contentHash: z.string().trim().min(1).max(128),
    storageKey: z.string().trim().min(1).max(1024),
  }),
]);
export type BuildSkillFileSnapshot = z.infer<typeof buildSkillFileSnapshotSchema>;

/**
 * Навык пространства в сборке. У получателя становится копией, которую сборка ставит и обновляет
 * (`managed_by_build`): правится только новой версией сборки. contentHash — sha256 определения и файлов.
 */
export const buildSkillSnapshotSchema = z.object({
  /** Id исходного навыка у автора — стабильный ключ навыка внутри сборки. */
  skillKey: z.string().trim().min(1).max(255),
  /** Логическая идентичность навыка: "build:<buildId>@skill:<skillKey>". */
  originRef: z.string().trim().min(1).max(255),
  contentHash: z.string().trim().min(1).max(128),
  definition: z.object({
    name: z.string().trim().min(1).max(255),
    description: z.string().max(4000).nullable().optional(),
    instruction: z.string().min(1),
    triggerHints: z.array(z.string()).default([]),
    allowedCapabilities: z.array(z.string()).default([]),
  }),
  files: z.array(buildSkillFileSnapshotSchema).default([]),
});
export type BuildSkillSnapshot = z.infer<typeof buildSkillSnapshotSchema>;

/** Навык платформы, привязанный к агенту: есть в каждом пространстве, в сборку идёт ссылкой. */
export const buildSkillRefSchema = z.object({
  skillId: z.string().trim().min(1).max(255),
  name: z.string().max(255).nullable().optional(),
});
export type BuildSkillRef = z.infer<typeof buildSkillRefSchema>;

const buildManifestContents = z.object({
  build: z.object({
    name: z.string().trim().min(1).max(255),
    description: z.string().max(4000).nullable().optional(),
    icon: z.string().max(2048).nullable().optional(),
    category: z.string().max(100).nullable().optional(),
  }),
  actions: z.array(buildActionSnapshotSchema).default([]),
  bindings: z.array(buildBindingSnapshotSchema).default([]),
  requiredKnowledge: z.array(buildRequiredKnowledgeSchema).optional(),
  /** Файлы агента (опционально включаются автором). Индексация — после install. */
  files: z.array(buildFileSnapshotSchema).default([]),
  /** Снимок workspace-сценария (только formatVersion ≥ 2, сценарные агенты). */
  workflowBundle: buildWorkflowSnapshotSchema.optional(),
  /** Навыки пространства, привязанные к агенту. Старые манифесты — пустой список. */
  skills: z.array(buildSkillSnapshotSchema).default([]),
  /** Навыки платформы, привязанные к агенту, — ссылками. */
  skillRefs: z.array(buildSkillRefSchema).default([]),
});
// Normalize historical manifests in memory. Published rows and their hashes remain immutable.
const currentBuildManifest = buildManifestContents.extend({
  formatVersion: z.literal(BUILD_MANIFEST_CURRENT_FORMAT_VERSION),
  agent: jsonRecord,
});
const legacyBuildManifest = buildManifestContents.extend({
  formatVersion: z.union([z.literal(BUILD_MANIFEST_FORMAT_VERSION), z.literal(2)]),
  assistant: jsonRecord,
}).transform(({ assistant, ...contents }) => ({
  ...contents,
  formatVersion: BUILD_MANIFEST_CURRENT_FORMAT_VERSION,
  agent: assistant,
}));
export const buildManifestSchema = z.union([currentBuildManifest, legacyBuildManifest]);
export type BuildManifest = z.infer<typeof buildManifestSchema>;

/* ----------------------------- API input schemas ----------------------------- */

// Accept requests sent by older clients and expose one canonical key to services.
function withAgentIdAlias<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((raw, ctx) => {
    if (!raw || typeof raw !== "object" || !("assistantId" in raw)) return raw;
    const { assistantId, ...rest } = raw;
    if ("agentId" in rest && (
      typeof rest.agentId !== "string" || typeof assistantId !== "string" ||
      rest.agentId.trim() !== assistantId.trim()
    )) {
      ctx.addIssue({ code: "custom", path: ["agentId"], message: "Переданы разные идентификаторы агента" });
      return z.NEVER;
    }
    return { ...rest, agentId: assistantId };
  }, schema);
}

export const buildInstructionImageTargetSchema = withAgentIdAlias(z.object({
  agentId: z.string().trim().min(1).optional(),
  buildId: z.string().trim().min(1).optional(),
}).refine((target) => target.agentId || target.buildId, "Не указана сборка или агент"));

export const buildPublishInputSchema = withAgentIdAlias(z.object({
  agentId: z.string().trim().min(1),
  version: z.string().trim().regex(SEMVER_REGEX, "Версия должна быть в формате semver (X.Y.Z)"),
  visibility: z.enum(buildVisibilityValues).default("private"),
  name: z.string().trim().min(1).max(255).optional(),
  description: z.string().max(4000).nullable().optional(),
  /** Устарело: свободная строка категории. Категории сборки — `categoryIds` из заведённых администратором. */
  category: z.string().max(100).nullable().optional(),
  /**
   * Категории из заведённых администратором. Не прислали — у уже опубликованной сборки категории остаются прежними;
   * прислали — набор заменяется (обязательные группы и «одно значение» проверяет сервер).
   */
  categoryIds: z.array(z.string().uuid()).max(50).optional(),
  changelog: z.string().max(4000).nullable().optional(),
  /** Включить файлы агента в сборку (Фаза 2c). По умолчанию включено. */
  includeFiles: z.boolean().default(true),
  /**
   * Информированное согласие на авто-instance-share баз знаний сценария (Сборки v2):
   * публикация сборки со сценарием расшаривает его базы на весь инстанс. Без true при
   * непустом списке кандидатов сервер отвечает 409 BUILD_KB_SHARE_CONFIRMATION_REQUIRED.
   */
  confirmKnowledgeSharing: z.boolean().default(false),
  /**
   * Инструкция к сборке (Markdown). Одна на сборку и правится без новой версии: поле не прислали — прежняя
   * инструкция остаётся, пустая строка — инструкция убирается.
   */
  instructionMarkdown: z.string().max(BUILD_INSTRUCTION_MAX_LENGTH).nullable().optional(),
}));
export type BuildPublishInput = z.infer<typeof buildPublishInputSchema>;

/* ----------------------------- Instruction ----------------------------- */

/** Правка инструкции сборки без выпуска версии. Пустая строка убирает инструкцию. */
export const buildInstructionUpdateInputSchema = z.object({
  markdown: z.string().max(BUILD_INSTRUCTION_MAX_LENGTH),
});
export type BuildInstructionUpdateInput = z.infer<typeof buildInstructionUpdateInputSchema>;

/* ----------------------------- Categories ----------------------------- */

/** Предел значений категорий на одной сборке (по всем группам). */
export const BUILD_CATEGORIES_PER_BUILD_MAX = 50;

export const buildCategoryGroupInputSchema = z.object({
  name: z.string().trim().min(1, "Укажите название группы").max(100),
  description: z.string().trim().max(1000).nullable().optional(),
  selection: z.enum(buildCategorySelectionValues).default("multi"),
  required: z.boolean().default(false),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
});
export type BuildCategoryGroupInput = z.infer<typeof buildCategoryGroupInputSchema>;

export const buildCategoryGroupUpdateSchema = buildCategoryGroupInputSchema
  .partial()
  .extend({ archived: z.boolean().optional() });
export type BuildCategoryGroupUpdate = z.infer<typeof buildCategoryGroupUpdateSchema>;

export const buildCategoryInputSchema = z.object({
  label: z.string().trim().min(1, "Укажите название категории").max(100),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
});
export type BuildCategoryInput = z.infer<typeof buildCategoryInputSchema>;

export const buildCategoryUpdateSchema = buildCategoryInputSchema.partial().extend({ archived: z.boolean().optional() });
export type BuildCategoryUpdate = z.infer<typeof buildCategoryUpdateSchema>;

/** Категории сборки целиком (замена набора). */
export const buildCategoryIdsSchema = z.array(z.string().uuid()).max(BUILD_CATEGORIES_PER_BUILD_MAX);

export type BuildCategoryValueDto = {
  id: string;
  label: string;
  sortOrder: number;
  archived: boolean;
  /** Сколько сборок с этим значением (в админке — все, кроме удалённых). */
  buildCount?: number;
};

export type BuildCategoryGroupDto = {
  id: string;
  name: string;
  description: string | null;
  selection: BuildCategorySelection;
  required: boolean;
  sortOrder: number;
  archived: boolean;
  categories: BuildCategoryValueDto[];
};

/* ----------------------------- Catalog query ----------------------------- */

export const buildCatalogSortValues = ["popular", "stars", "new"] as const;
export type BuildCatalogSort = (typeof buildCatalogSortValues)[number];

/** Параметры витрины. `categoryIds` — И между группами, ИЛИ внутри группы. */
export const buildCatalogQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  categoryIds: z
    .preprocess(
      (value) => (typeof value === "string" ? value.split(",").filter(Boolean) : value),
      z.array(z.string().uuid()).max(BUILD_CATEGORIES_PER_BUILD_MAX),
    )
    .optional(),
  sort: z.enum(buildCatalogSortValues).default("popular"),
  limit: z.coerce.number().int().min(1).max(200).default(200),
  offset: z.coerce.number().int().min(0).default(0),
});
export type BuildCatalogQuery = z.infer<typeof buildCatalogQuerySchema>;

/* ----------------------------- Admin ----------------------------- */

export const buildAdminListQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  state: z.enum(["all", "visible", "hidden"]).default("all"),
  categoryId: z.string().uuid().optional(),
  /** Только сборки без использования столько дней (с момента публикации, если не пользовались). */
  unusedDays: z.coerce.number().int().min(1).max(3650).optional(),
});
export type BuildAdminListQuery = Partial<z.infer<typeof buildAdminListQuerySchema>>;

export const buildHideInputSchema = z.object({
  /** Пояснение автору — он увидит его на странице своего агента. */
  reason: z.string().trim().max(1000).nullable().optional(),
});

/* ----------------------------- Feedback ----------------------------- */

/** Предел длины комментария к сборке, знаков. */
export const BUILD_COMMENT_MAX_LENGTH = 2000;

/** Комментариев на странице ленты сборки. */
export const BUILD_COMMENTS_PAGE_SIZE = 50;

export const buildCommentsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(BUILD_COMMENTS_PAGE_SIZE),
  before: z.string().uuid().optional(),
});

export const buildCommentInputSchema = z.object({
  body: z.string().max(BUILD_COMMENT_MAX_LENGTH * 2),
});
export type BuildCommentInput = z.infer<typeof buildCommentInputSchema>;

/** Автор сборки или комментария: имя и почта (она же логин) — чтобы с ним можно было связаться. */
export type BuildAuthor = { id: string; fullName: string; email: string };

export type BuildCommentDto = {
  id: string;
  body: string;
  createdAt: string;
  edited: boolean;
  /** null — учётка автора комментария удалена. */
  author: BuildAuthor | null;
  /** Пишет владелец сборки. */
  isBuildAuthor: boolean;
  /** В пространстве, из которого написан комментарий, сборка установлена. */
  isUser: boolean;
  canEdit: boolean;
  canDelete: boolean;
};

/** Страница ленты комментариев, новые сверху. */
export type BuildCommentsPage = {
  comments: BuildCommentDto[];
  hasMore: boolean;
  /** Курсор следующей страницы — id последнего комментария этой. */
  nextBefore: string | null;
};

/** Фасет витрины: значения группы с числом сборок в выборке без учёта фильтра этой же группы. */
export type BuildCatalogFacet = {
  groupId: string;
  name: string;
  selection: BuildCategorySelection;
  values: Array<{ id: string; label: string; count: number }>;
};

export type BuildInstruction = {
  buildId: string;
  markdown: string | null;
  updatedAt: string | null;
};

/** Руководство сборки, из которой поставлен агент, — для пункта в боковой панели чата. */
export type AssistantBuildInstruction = {
  build: { id: string; name: string; description: string | null; icon: string | null; latestVersion: string | null } | null;
  hasInstruction: boolean;
};

export const BUILD_INSTRUCTION_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const BUILD_INSTRUCTION_IMAGE_MIME_EXT: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/gif": ".gif",
  "image/webp": ".webp",
};

/**
 * Адрес картинки инструкции. Он не зависит от пространства читателя: Markdown один на всех, доступ решает сервер
 * по видимости сборки.
 */
export function buildInstructionImagePath(buildId: string, fileName: string): string {
  return `/api/builds/${encodeURIComponent(buildId)}/instruction-images/${fileName}`;
}

/** Имя файла картинки инструкции: sha256 содержимого и расширение. */
export const BUILD_INSTRUCTION_IMAGE_FILE_RE = /^[a-f0-9]{64}\.(png|jpg|gif|webp)$/;

/** Путь картинки инструкции внутри Markdown (для политики показа картинок). */
export const BUILD_INSTRUCTION_IMAGE_PATH_RE = /^\/api\/builds\/[A-Za-z0-9_-]+\/instruction-images\/[a-f0-9]{64}\.(png|jpg|gif|webp)$/;

export const buildInstallInputSchema = z.object({
  buildId: z.string().trim().min(1),
  versionId: z.string().uuid().optional(),
  mode: z.enum(installModeValues).default("reference"),
});
export type BuildInstallInput = z.infer<typeof buildInstallInputSchema>;

/** Вход применения обновления установленной сборки (по умолчанию — последняя версия). */
export const buildUpdateInputSchema = z.object({
  targetVersionId: z.string().uuid().optional(),
  expectedInstallation: z.object({ id: z.string().uuid(), revision: z.number().int().positive() }).strict(),
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

/** Сводка переноса файлов агента при install/update. */
export type BuildFilesResolution = {
  created: number;
  reused: number;
  removed: number;
  failed: number;
};

/** Итог материализации сценария сборки при install/update (Сборки v2). */
export type BuildWorkflowResolutionEntry = {
  workflowKey: string;
  originRef: string;
  outcome: BuildActionResolutionOutcome;
  definitionId: string | null;
  publishedVersionNo?: number;
  message?: string;
  /** Предупреждения переноса шаблонов узлов typed_template (попадают в warnings отчёта). */
  warnings?: string[];
};

/** Сводка переноса навыков при install/update. */
export type BuildSkillsResolution = {
  created: number;
  updated: number;
  reused: number;
  removed: number;
  failed: number;
};

export type BuildResolutionReport = {
  actions: BuildActionResolutionEntry[];
  knowledgeRoles: string[];
  warnings: string[];
  files?: BuildFilesResolution;
  workflow?: BuildWorkflowResolutionEntry;
  skills?: BuildSkillsResolution;
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
  installation: { id: string; revision: number };
  buildId: string;
  fromVersion: string | null;
  toVersion: string;
  toVersionId: string;
  changelog: string | null;
  /** Изменяемые контентные поля агента (имена полей, без значений окружения). */
  changedAssistantFields: string[];
  actions: BuildUpdateActionsDiff;
  /** Новые требуемые роли баз знаний, которых не было раньше. */
  newKnowledgeRoles: string[];
  /** Файлы: сколько добавится / удалится при обновлении. */
  files: { added: number; removed: number };
  /** Навыки сборки: сколько добавится, изменится и удалится. */
  skills?: { added: number; updated: number; removed: number };
  warnings: string[];
  /** Изменение сценария сборки (Сборки v2): vN→vM автора либо конфликт локальных правок. */
  workflow?: {
    changed: boolean;
    fromAuthorVersionNo: number | null;
    toAuthorVersionNo: number | null;
    releaseNote: string | null;
    conflict: boolean;
  };
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
 * Результат поиска уже опубликованной сборки для данного агента.
 * Позволяет UI понять «этот агент уже публиковался» и предложить bump версии.
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
  /** Категории сборки (из заведённых администратором) — предвыбор в диалоге публикации. */
  categoryIds: string[];
  /** Сборка скрыта с витрины: кем и почему (пояснение администратора автору). */
  hidden: { byAdmin: boolean; reason: string | null } | null;
  starsCount: number;
  commentsCount: number;
  /**
   * Сценарный агент (Сборки v2): состояние привязанного workspace-сценария и список баз
   * знаний под авто-instance-share — для consent-блока PublishBuildDialog. Отсутствует у
   * обычных агентов.
   */
  workflowInfo?: {
    hasPublishedVersion: boolean;
    scenarioTitle: string | null;
    authorVersionNo: number | null;
    /** Свои базы сценария: будут расшарены на инстанс при публикации (или уже расшарены). */
    knowledgeBasesToShare: Array<{ id: string; name: string; alreadyShared: boolean }>;
    /** Базы чужих пространств: расшарить их автор не может — предупреждение. */
    foreignKnowledgeBases: Array<{ id: string; name: string }>;
  };
};
