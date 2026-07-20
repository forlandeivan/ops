import { z } from "zod";

export const packageKindValues = ["plugin", "skill"] as const;
export type PackageKind = (typeof packageKindValues)[number];

export const packageVisibilityValues = ["private", "workspace", "public"] as const;
export type PackageVisibility = (typeof packageVisibilityValues)[number];

export const packageStatusValues = ["draft", "active", "archived"] as const;
export type PackageStatus = (typeof packageStatusValues)[number];

// "user" — пользовательский скилл, созданный в пространстве (prompt-only, без `code`; см.
// assistant-context-and-skills-design.md §4.7). Владелец фиксируется в skill_registry
// (source_workspace_id/origin_user_id); код запрещён и срезается при публикации.
export const packageSourceValues = ["local", "upload", "marketplace", "user"] as const;
export type PackageSource = (typeof packageSourceValues)[number];

export const packageDraftStatusValues = ["draft", "validated", "approved", "published", "failed"] as const;
export type PackageDraftStatus = (typeof packageDraftStatusValues)[number];

export const packageDraftSourceKindValues = ["prompt", "openapi", "file", "text"] as const;
export type PackageDraftSourceKind = (typeof packageDraftSourceKindValues)[number];

export const packageBuildRunStatusValues = ["running", "succeeded", "failed"] as const;
export type PackageBuildRunStatus = (typeof packageBuildRunStatusValues)[number];

export const packageValidationStatusValues = ["passed", "failed"] as const;
export type PackageValidationStatus = (typeof packageValidationStatusValues)[number];

export const pluginTrustLevelValues = ["untrusted", "trusted"] as const;
export type PluginTrustLevel = (typeof pluginTrustLevelValues)[number];

export const connectionStatusValues = ["draft", "ready", "error", "disabled"] as const;
export type ConnectionStatus = (typeof connectionStatusValues)[number];

export const installStatusValues = ["installed", "disabled"] as const;
export type InstallStatus = (typeof installStatusValues)[number];

export const installLogActionValues = [
  "sync_local",
  "install",
  "uninstall",
  "upgrade",
  // Целостность пакетов (gap-analysis 4.6): закрепление пина при установке/одобрении, его адаптация
  // (trust-on-first-use для существующих установок), карантин при несовпадении и повторное закрепление
  // после повторного одобрения. Колонка `action` — varchar без DB-CHECK, расширение union миграции не требует.
  "integrity_pin",
  "integrity_pin_adopted",
  "integrity_quarantine",
  "integrity_repin",
] as const;
export type InstallLogAction = (typeof installLogActionValues)[number];

export const installLogStatusValues = ["success", "failed"] as const;
export type InstallLogStatus = (typeof installLogStatusValues)[number];

// Статус целостности установленного пакета (скилла) / обнаруженного MCP-tool'а (gap-analysis 4.6).
// `active` — пин совпал (или адаптирован) → определение допускается в снимок возможностей агента.
// `quarantined` — пин НЕ совпал (rug-pull) ИЛИ подпись невалидна → определение НЕ грузится в агента,
// требуется повторное одобрение (re-pin). Fail-closed: на положительное свидетельство подмены — карантин.
export const packageIntegrityStatusValues = ["active", "quarantined"] as const;
export type PackageIntegrityStatus = (typeof packageIntegrityStatusValues)[number];

export const eventSourceValues = ["system", "webhook"] as const;
export type EventSource = (typeof eventSourceValues)[number];

export const capabilityCategoryValues = [
  "integration",
  "knowledge",
  "messaging",
  "automation",
  "storage",
  "custom",
] as const;
export type CapabilityCategory = (typeof capabilityCategoryValues)[number];

export const operationTypeValues = [
  "search",
  "list",
  "get",
  "create",
  "update",
  "comment",
  "transition",
  "send",
  "sync",
  "webhook",
] as const;
export type OperationType = (typeof operationTypeValues)[number];

export const operationPermissionLevelValues = ["read", "write", "admin"] as const;
export type OperationPermissionLevel = (typeof operationPermissionLevelValues)[number];

export const confirmationPolicyValues = ["never", "ask", "always"] as const;
export type ConfirmationPolicy = (typeof confirmationPolicyValues)[number];

export const executorKindValues = ["builtin", "trusted_script", "http", "none"] as const;
export type ExecutorKind = (typeof executorKindValues)[number];

export const httpAuthKindValues = ["none", "api_key_header", "api_key_query", "bearer", "basic"] as const;
export type HttpAuthKind = (typeof httpAuthKindValues)[number];

export const httpMethodValues = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"] as const;
export type HttpMethod = (typeof httpMethodValues)[number];

export type JsonObject = Record<string, unknown>;
export const integrationArtifactFormat = "unica.integration-package" as const;
export const integrationArtifactFormatVersion = 1 as const;

const optionalString = (max: number) => z.string().trim().max(max).nullable().optional();
const stringArraySchema = z.array(z.string().trim().min(1).max(255)).default([]);
const jsonObjectSchema: z.ZodType<JsonObject> = z.record(z.string(), z.unknown());

export const httpAuthSchema = z.object({
  kind: z.enum(httpAuthKindValues).default("none"),
  headerName: optionalString(255),
  queryParam: optionalString(255),
  secretField: optionalString(255),
  usernameField: optionalString(255),
  passwordField: optionalString(255),
  prefix: optionalString(100),
  description: optionalString(4000),
  configSchema: jsonObjectSchema.default({}),
  secretSchema: jsonObjectSchema.default({}),
  metadata: jsonObjectSchema.default({}),
});

export const httpRequestTemplateSchema = z.object({
  method: z.enum(httpMethodValues).default("GET"),
  url: optionalString(4000),
  path: optionalString(4000),
  query: jsonObjectSchema.default({}),
  headers: jsonObjectSchema.default({}),
  body: z.unknown().optional(),
  timeoutMs: z.number().int().positive().max(120000).optional(),
});

export const httpResponseMappingSchema = z.object({
  statusPath: optionalString(500),
  itemsPath: optionalString(500),
  entityPath: optionalString(500),
  warningsPath: optionalString(500),
  errorsPath: optionalString(500),
  linksPaths: z.array(z.string().trim().min(1).max(500)).default([]),
  meta: jsonObjectSchema.default({}),
});

export const httpExecutorConfigSchema = z.object({
  request: httpRequestTemplateSchema,
  response: httpResponseMappingSchema.default({
    statusPath: null,
    itemsPath: null,
    entityPath: null,
    warningsPath: null,
    errorsPath: null,
    linksPaths: [],
    meta: {},
  }),
  successStatusCodes: z.array(z.number().int().min(100).max(599)).default([]),
});

export const httpHealthCheckSchema = z.object({
  kind: z.literal("http"),
  request: httpRequestTemplateSchema,
  successStatusCodes: z.array(z.number().int().min(100).max(599)).default([200, 201, 202, 204]),
  successMessage: optionalString(500),
});

export const packageAuthorSchema = z.object({
  name: z.string().trim().min(1).max(255),
  url: z.string().trim().url().max(2048).nullable().optional(),
  email: z.string().trim().email().max(320).nullable().optional(),
});

export const packageCompatibilitySchema = z.object({
  minPlatformVersion: optionalString(100),
  maxPlatformVersion: optionalString(100),
  platforms: stringArraySchema,
});

export const packagePermissionSchema = z.object({
  id: z.string().trim().min(1).max(255),
  description: optionalString(500),
});

export const executorBindingSchema = z.object({
  key: z.string().trim().min(1).max(255),
  kind: z.enum(executorKindValues),
  target: z.string().trim().min(1).max(500),
  config: jsonObjectSchema.default({}),
});

export const connectionTypeManifestSchema = z.object({
  key: z.string().trim().min(1).max(255),
  name: z.string().trim().min(1).max(255),
  description: optionalString(4000),
  authSchema: jsonObjectSchema.default({}),
  configSchema: jsonObjectSchema.default({}),
  secretSchema: jsonObjectSchema.default({}),
  healthCheck: jsonObjectSchema.default({}),
  scopeRules: jsonObjectSchema.default({}),
  metadata: jsonObjectSchema.default({}),
});

export const capabilityManifestSchema = z.object({
  key: z.string().trim().min(1).max(255),
  name: z.string().trim().min(1).max(255),
  description: optionalString(4000),
  category: z.enum(capabilityCategoryValues).default("integration"),
  operationKeys: stringArraySchema,
  metadata: jsonObjectSchema.default({}),
});

export const operationManifestSchema = z.object({
  key: z.string().trim().min(1).max(255),
  name: z.string().trim().min(1).max(255),
  description: optionalString(4000),
  type: z.enum(operationTypeValues),
  requiredConnectionType: optionalString(255),
  capabilityKey: optionalString(255),
  permissionLevel: z.enum(operationPermissionLevelValues).default("read"),
  confirmationPolicy: z.enum(confirmationPolicyValues).default("ask"),
  inputSchema: jsonObjectSchema.default({}),
  outputSchema: jsonObjectSchema.default({}),
  executorBinding: executorBindingSchema,
  metadata: jsonObjectSchema.default({}),
  tags: stringArraySchema,
});

export const eventManifestSchema = z.object({
  key: z.string().trim().min(1).max(255),
  name: z.string().trim().min(1).max(255),
  description: optionalString(4000),
  source: z.enum(eventSourceValues),
  eventName: z.string().trim().min(1).max(255),
  payloadSchema: jsonObjectSchema.default({}),
  metadata: jsonObjectSchema.default({}),
});

export const templateManifestSchema = z.object({
  key: z.string().trim().min(1).max(255),
  name: z.string().trim().min(1).max(255),
  description: optionalString(4000),
  kind: z.string().trim().min(1).max(100),
  metadata: jsonObjectSchema.default({}),
});

export const skillRuntimeValues = ["python"] as const;
export type SkillRuntime = (typeof skillRuntimeValues)[number];

// Дескриптор исполняемого («code») скилла (вариант B: агент пишет код, исполняемый в песочнице).
// Связывает скилл с предустановленным в песочнице helper-модулем (`entry` — importable-модуль).
// Отсутствие поля (null) означает обычный prompt-only скилл (инструкционный режим мышления).
export const skillCodeManifestSchema = z.object({
  runtime: z.enum(skillRuntimeValues).default("python"),
  entry: z.string().trim().min(1).max(255),
  metadata: jsonObjectSchema.default({}),
});

// Прогрессивное раскрытие (модель Anthropic Skills): папка скилла может нести bundled-ресурсы —
// reference-доки (дочитываются моделью по требованию через system.skill.read_resource), шаблоны и
// helper-скрипты. `path` — относительный POSIX-путь от корня скилла; loader регистрирует только
// файлы из allowlist-подкаталогов (reference/templates/scripts), что заодно служит allowlist'ом
// для безопасного чтения (защита от path traversal на стороне чтения).
export const skillResourceKindValues = ["reference", "template", "script", "asset"] as const;
export type SkillResourceKind = (typeof skillResourceKindValues)[number];

export const skillResourceSchema = z.object({
  path: z.string().trim().min(1).max(1024),
  name: optionalString(255),
  kind: z.enum(skillResourceKindValues).default("reference"),
  description: optionalString(500),
  bytes: z.number().int().nonnegative().optional(),
  contentHash: optionalString(128),
});
export type SkillResource = z.infer<typeof skillResourceSchema>;

export const skillDefinitionSchema = z.object({
  key: z.string().trim().min(1).max(255),
  name: z.string().trim().min(1).max(255),
  description: optionalString(4000),
  instruction: z.string().trim().min(1).max(50000),
  triggerHints: stringArraySchema,
  allowedCapabilities: stringArraySchema,
  code: skillCodeManifestSchema.nullable().optional(),
  resources: z.array(skillResourceSchema).default([]),
  inputSchema: jsonObjectSchema.default({}),
  outputSchema: jsonObjectSchema.default({}),
  examples: z.array(z.string().trim().min(1).max(10000)).default([]),
  tests: z.array(jsonObjectSchema).default([]),
  metadata: jsonObjectSchema.default({}),
});

export const packageManifestBaseSchema = z.object({
  id: z.string().trim().min(1).max(255),
  name: z.string().trim().min(1).max(255),
  version: z.string().trim().min(1).max(100),
  description: optionalString(4000),
  icon: optionalString(2048),
  category: optionalString(100),
  author: packageAuthorSchema,
  permissions: z.array(packagePermissionSchema).default([]),
  visibility: z.enum(packageVisibilityValues).default("private"),
  compatibility: packageCompatibilitySchema.default({
    minPlatformVersion: null,
    maxPlatformVersion: null,
    platforms: [],
  }),
});

export const pluginManifestSchema = packageManifestBaseSchema.extend({
  kind: z.literal("plugin").default("plugin"),
  connectionTypes: z.array(connectionTypeManifestSchema).default([]),
  capabilities: z.array(capabilityManifestSchema).default([]),
  operations: z.array(operationManifestSchema).default([]),
  events: z.array(eventManifestSchema).default([]),
  bundledSkills: z.array(skillDefinitionSchema).default([]),
  templates: z.array(templateManifestSchema).default([]),
  executorBindings: z.array(executorBindingSchema).default([]),
  metadata: jsonObjectSchema.default({}),
});

export const skillPackageManifestSchema = packageManifestBaseSchema.extend({
  kind: z.literal("skill").default("skill"),
  instruction: z.string().trim().min(1).max(50000),
  triggerHints: stringArraySchema,
  allowedCapabilities: stringArraySchema,
  code: skillCodeManifestSchema.nullable().optional(),
  resources: z.array(skillResourceSchema).default([]),
  inputSchema: jsonObjectSchema.default({}),
  outputSchema: jsonObjectSchema.default({}),
  examples: z.array(z.string().trim().min(1).max(10000)).default([]),
  tests: z.array(jsonObjectSchema).default([]),
  metadata: jsonObjectSchema.default({}),
});

export const packageManifestSchema = z.discriminatedUnion("kind", [
  pluginManifestSchema,
  skillPackageManifestSchema,
]);

export const integrationManifestSchema = pluginManifestSchema;
export const toolManifestSchema = operationManifestSchema;

export const integrationArchiveAssetSchema = z.object({
  path: z.string().trim().min(1).max(2048),
  kind: z.enum(["icon", "doc", "test", "asset"]).default("asset"),
  mimeType: optionalString(255),
  description: optionalString(500),
});

export const integrationReleaseArtifactSchema = z.object({
  format: z.literal(integrationArtifactFormat),
  formatVersion: z.literal(integrationArtifactFormatVersion),
  exportedAt: z.string().trim().min(1).max(100),
  source: z.object({
    pluginId: z.string().trim().min(1).max(255),
    pluginVersion: z.string().trim().min(1).max(100),
    pluginName: z.string().trim().min(1).max(255),
    trustLevel: z.enum(pluginTrustLevelValues).default("trusted"),
    source: z.enum(packageSourceValues).default("upload"),
  }),
  assets: z.array(integrationArchiveAssetSchema).default([]),
  releaseNotes: optionalString(4000),
  metadata: jsonObjectSchema.default({}),
});

export const workspaceConnectionCreateSchema = z.object({
  connectionTypeId: z.string().uuid(),
  name: z.string().trim().min(1).max(255),
  config: jsonObjectSchema.default({}),
  secrets: jsonObjectSchema.default({}),
  allowedScopes: jsonObjectSchema.default({}),
});

export const workspaceConnectionUpdateSchema = z.object({
  name: z.string().trim().min(1).max(255).nullable().optional(),
  config: jsonObjectSchema.optional(),
  secrets: jsonObjectSchema.optional(),
  allowedScopes: jsonObjectSchema.optional(),
  isActive: z.boolean().optional(),
});

export const packageInstallSchema = z.object({
  packageId: z.string().trim().min(1).max(255),
});

export const operationExecutionInputSchema = z.object({
  connectionId: z.string().uuid().nullable().optional(),
  input: jsonObjectSchema.default({}),
});

export const operationResultSchema = z.object({
  status: z.enum(["success", "partial", "error", "external_wait"]),
  items: z.array(jsonObjectSchema).optional(),
  entity: jsonObjectSchema.nullable().optional(),
  meta: jsonObjectSchema.default({}),
  externalWait: jsonObjectSchema.nullable().optional(),
  warnings: z.array(z.string().trim().min(1).max(2000)).default([]),
  errors: z.array(z.string().trim().min(1).max(2000)).default([]),
  links: z.array(z.string().trim().url().max(2048)).default([]),
});

export const packageDraftSourceInputSchema = z.object({
  kind: z.enum(packageDraftSourceKindValues).default("file"),
  name: z.string().trim().min(1).max(255),
  content: z.string().min(1).max(1_000_000),
  mimeType: optionalString(255),
  metadata: jsonObjectSchema.default({}),
});

export const packageDraftGenerateSchema = z.object({
  kind: z.enum(packageKindValues),
  title: optionalString(255),
  prompt: z.string().trim().min(1).max(50_000),
  modelKey: z.string().trim().min(1).max(255),
  existingDraftId: z.string().uuid().nullable().optional(),
  regenerateSections: stringArraySchema,
  sources: z.array(packageDraftSourceInputSchema).default([]),
  metadata: jsonObjectSchema.default({}),
});

export const packageDraftUpdateSchema = z.object({
  title: optionalString(255),
  prompt: optionalString(50_000),
  manifestDraft: z.unknown().optional(),
  notes: optionalString(4000),
});

export const packageDraftValidationInputSchema = z.object({
  operationKey: optionalString(255),
  connection: z
    .object({
      config: jsonObjectSchema.default({}),
      secrets: jsonObjectSchema.default({}),
    })
    .optional(),
});

export type PackageAuthor = z.infer<typeof packageAuthorSchema>;
export type PackageCompatibility = z.infer<typeof packageCompatibilitySchema>;
export type PackagePermission = z.infer<typeof packagePermissionSchema>;
export type HttpAuthSchema = z.infer<typeof httpAuthSchema>;
export type HttpRequestTemplate = z.infer<typeof httpRequestTemplateSchema>;
export type HttpResponseMapping = z.infer<typeof httpResponseMappingSchema>;
export type HttpExecutorConfig = z.infer<typeof httpExecutorConfigSchema>;
export type HttpHealthCheck = z.infer<typeof httpHealthCheckSchema>;
export type ExecutorBindingManifest = z.infer<typeof executorBindingSchema>;
export type ConnectionTypeManifest = z.infer<typeof connectionTypeManifestSchema>;
export type CapabilityManifest = z.infer<typeof capabilityManifestSchema>;
export type OperationManifest = z.infer<typeof operationManifestSchema>;
export type EventManifest = z.infer<typeof eventManifestSchema>;
export type TemplateManifest = z.infer<typeof templateManifestSchema>;
export type SkillCodeManifest = z.infer<typeof skillCodeManifestSchema>;
export type SkillDefinition = z.infer<typeof skillDefinitionSchema>;
export type PluginManifest = z.infer<typeof pluginManifestSchema>;
export type SkillPackageManifest = z.infer<typeof skillPackageManifestSchema>;

// Сплит безопасности (§4.7 assistant-context-and-skills-design.md): пользовательский скилл
// (`source:'user'`) = prompt+data, БЕЗ исполняемого кода. Срезаем `code`→null и оставляем только
// data-ресурсы (reference/template/asset), отбрасывая `script`. Для прочих источников (local/upload/
// marketplace — поставляет разработчик/админ) манифест не трогаем. Возвращаем флаг `stripped` для
// аудит-лога. Чистая функция — переиспользуется и в сервисе публикации, и в тестах.
export function sanitizeUserSkillManifest(
  manifest: SkillPackageManifest,
  source: PackageSource,
): { manifest: SkillPackageManifest; stripped: boolean } {
  if (source !== "user") {
    return { manifest, stripped: false };
  }
  const hadCode = manifest.code != null;
  const safeResources = (manifest.resources ?? []).filter((resource) => resource.kind !== "script");
  const strippedResources = safeResources.length !== (manifest.resources?.length ?? 0);
  if (!hadCode && !strippedResources) {
    return { manifest, stripped: false };
  }
  return { manifest: { ...manifest, code: null, resources: safeResources }, stripped: true };
}
export type PackageManifest = z.infer<typeof packageManifestSchema>;
export type IntegrationManifest = z.infer<typeof integrationManifestSchema>;
export type ToolManifest = z.infer<typeof toolManifestSchema>;
export type IntegrationArchiveAsset = z.infer<typeof integrationArchiveAssetSchema>;
export type IntegrationReleaseArtifact = z.infer<typeof integrationReleaseArtifactSchema>;
export type WorkspaceConnectionCreateInput = z.infer<typeof workspaceConnectionCreateSchema>;
export type WorkspaceConnectionUpdateInput = z.infer<typeof workspaceConnectionUpdateSchema>;
export type PackageInstallInput = z.infer<typeof packageInstallSchema>;
export type OperationExecutionInput = z.infer<typeof operationExecutionInputSchema>;
export type OperationResult = z.infer<typeof operationResultSchema>;
export type PackageDraftSourceInput = z.infer<typeof packageDraftSourceInputSchema>;
export type PackageDraftGenerateInput = z.infer<typeof packageDraftGenerateSchema>;
export type PackageDraftUpdateInput = z.infer<typeof packageDraftUpdateSchema>;
export type PackageDraftValidationInput = z.infer<typeof packageDraftValidationInputSchema>;

export type GeneratedScenarioBlock = {
  id: string;
  pluginId: string;
  operationId: string;
  title: string;
  description: string | null;
  type: OperationType;
  requiredConnectionTypeId: string | null;
  inputSchema: JsonObject;
  outputSchema: JsonObject;
  confirmationPolicy: ConfirmationPolicy;
  permissionLevel: OperationPermissionLevel;
};

export type GeneratedAssistantAction = {
  id: string;
  pluginId: string;
  operationId: string;
  title: string;
  description: string | null;
  type: OperationType;
  requiredConnectionTypeId: string | null;
  confirmationPolicy: ConfirmationPolicy;
  permissionLevel: OperationPermissionLevel;
};
