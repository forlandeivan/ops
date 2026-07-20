import { z } from "zod";

export const featureAccessTargetKinds = ["all", "group", "workspace"] as const;
export type FeatureAccessTargetKind = (typeof featureAccessTargetKinds)[number];

export const platformFeatureKeys = [
  "knowledge.ai_import",
  "knowledge.web_crawl",
  "assistants.execution_policy",
  "assistants.builds",
  "assistants.reasoning",
] as const;
export type PlatformFeatureKey = (typeof platformFeatureKeys)[number];

export const platformFeatureAreas = ["knowledge", "assistants"] as const;
export type PlatformFeatureArea = (typeof platformFeatureAreas)[number];

export const platformFeatureValueKinds = [
  "boolean",
  "assistant_execution_policy",
  "assistant_builds_access",
] as const;
export type PlatformFeatureValueKind = (typeof platformFeatureValueKinds)[number];

export const assistantFeatureExecutionModes = ["standard", "workflow"] as const;
export type AssistantFeatureExecutionMode = (typeof assistantFeatureExecutionModes)[number];

export const assistantWorkflowSources = ["global_template", "workspace_scenario"] as const;
export type AssistantWorkflowSource = (typeof assistantWorkflowSources)[number];

export type AssistantExecutionPolicyValue = {
  allowedExecutionModes: AssistantFeatureExecutionMode[];
  allowedWorkflowSources: AssistantWorkflowSource[];
};

/**
 * Поднастройки доступа к сборкам внутри одной фичи `assistants.builds`:
 *  - canPublish — публикация ассистента как сборки;
 *  - canConsume — доступ к витрине (просмотр) + установка/скачивание сборок.
 * Флаги независимы; гейтятся раздельно в рантайме.
 */
export type BuildsAccessValue = {
  canPublish: boolean;
  canConsume: boolean;
};

export type PlatformFeatureAccessRuleValue =
  | boolean
  | AssistantExecutionPolicyValue
  | BuildsAccessValue;

export type PlatformFeatureCatalogEntry = {
  key: PlatformFeatureKey;
  title: string;
  description: string;
  area: PlatformFeatureArea;
  areaLabel: string;
  valueKind: PlatformFeatureValueKind;
  defaultValue: PlatformFeatureAccessRuleValue;
};

export const assistantExecutionPolicyValueSchema = z.object({
  allowedExecutionModes: z.array(z.enum(assistantFeatureExecutionModes)).default(["standard"]),
  allowedWorkflowSources: z.array(z.enum(assistantWorkflowSources)).default([]),
});

function uniqueList<T extends string>(values: readonly T[]): T[] {
  return Array.from(new Set(values));
}

export function normalizeAssistantExecutionPolicyValue(
  value: AssistantExecutionPolicyValue,
): AssistantExecutionPolicyValue {
  const allowedExecutionModes = uniqueList(value.allowedExecutionModes);
  const allowedWorkflowSources = allowedExecutionModes.includes("workflow")
    ? uniqueList(value.allowedWorkflowSources)
    : [];

  return {
    allowedExecutionModes,
    allowedWorkflowSources,
  };
}

export function parseAssistantExecutionPolicyValue(value: unknown): AssistantExecutionPolicyValue {
  return normalizeAssistantExecutionPolicyValue(assistantExecutionPolicyValueSchema.parse(value));
}

export const buildsAccessValueSchema = z.object({
  canPublish: z.boolean().default(false),
  canConsume: z.boolean().default(true),
});

export function normalizeBuildsAccessValue(value: BuildsAccessValue): BuildsAccessValue {
  return {
    canPublish: value.canPublish === true,
    canConsume: value.canConsume === true,
  };
}

export function parseBuildsAccessValue(value: unknown): BuildsAccessValue {
  // Терпимость к legacy: фича была плоским boolean «публикация вкл/выкл», а витрина и
  // скачивание были открыты всем (только RBAC). До прогона миграции 0276 в БЗ могут
  // лежать boolean-значения — нормализуем их, чтобы parse не падал.
  if (typeof value === "boolean") {
    return { canPublish: value, canConsume: true };
  }
  return normalizeBuildsAccessValue(buildsAccessValueSchema.parse(value));
}

export const platformFeatureCatalog: Record<PlatformFeatureKey, PlatformFeatureCatalogEntry> = {
  "knowledge.ai_import": {
    key: "knowledge.ai_import",
    title: "AI-импорт документов",
    description: "Разрешает импорт PDF и изображений через AI OCR в базе знаний.",
    area: "knowledge",
    areaLabel: "Знания",
    valueKind: "boolean",
    defaultValue: false,
  },
  "knowledge.web_crawl": {
    key: "knowledge.web_crawl",
    title: "Импорт с сайта (краулинг)",
    description: "Разрешает импорт документов с веб-сайтов через краулинг в базе знаний.",
    area: "knowledge",
    areaLabel: "Знания",
    valueKind: "boolean",
    defaultValue: false,
  },
  "assistants.execution_policy": {
    key: "assistants.execution_policy",
    title: "Режим сценария в Ассистентах",
    description:
      "Управляет доступными режимами обработки для Ассистентов рабочего пространства и доступностью переключателя «Чат/Агент» в окне чата.",
    area: "assistants",
    areaLabel: "Ассистенты",
    valueKind: "assistant_execution_policy",
    defaultValue: {
      allowedExecutionModes: ["standard"],
      allowedWorkflowSources: [],
    },
  },
  "assistants.builds": {
    key: "assistants.builds",
    title: "Сборки ассистентов: публикация и витрина",
    description:
      "Управляет доступом пространства к сборкам через две независимые поднастройки: " +
      "«Публикация сборок» (выкладывать ассистента как сборку) и «Витрина и скачивание» " +
      "(видеть витрину сборок и устанавливать их). По умолчанию публикация выключена, " +
      "а витрина и скачивание открыты всем пространствам.",
    area: "assistants",
    areaLabel: "Ассистенты",
    valueKind: "assistant_builds_access",
    defaultValue: {
      canPublish: false,
      canConsume: true,
    },
  },
  "assistants.reasoning": {
    key: "assistants.reasoning",
    title: "Режим размышления (Reasoning)",
    description:
      "Разрешает пользователям включать режим размышления (reasoning/thinking) в окне чата. " +
      "По умолчанию выключено даже для моделей с поддержкой reasoning.",
    area: "assistants",
    areaLabel: "Ассистенты",
    valueKind: "boolean",
    defaultValue: false,
  },
};

export function isPlatformFeatureKey(value: string): value is PlatformFeatureKey {
  return platformFeatureKeys.includes(value as PlatformFeatureKey);
}

export function cloneFeatureAccessValue(value: PlatformFeatureAccessRuleValue): PlatformFeatureAccessRuleValue {
  if (typeof value === "boolean") {
    return value;
  }

  if ("canPublish" in value) {
    return {
      canPublish: value.canPublish,
      canConsume: value.canConsume,
    };
  }

  return {
    allowedExecutionModes: [...value.allowedExecutionModes],
    allowedWorkflowSources: [...value.allowedWorkflowSources],
  };
}

export function getDefaultFeatureAccessValue(featureKey: PlatformFeatureKey): PlatformFeatureAccessRuleValue {
  return cloneFeatureAccessValue(platformFeatureCatalog[featureKey].defaultValue);
}

/**
 * Эффективный дефолт фичи: значение глобального правила (targetKind="all"), заданного
 * админом, иначе — встроенный каталожный дефолт. Позволяет менять «по умолчанию вкл/выкл»
 * без релиза.
 */
export function resolveEffectiveFeatureDefault(
  featureKey: PlatformFeatureKey,
  allRuleValue: PlatformFeatureAccessRuleValue | null,
): PlatformFeatureAccessRuleValue {
  return allRuleValue !== null
    ? cloneFeatureAccessValue(allRuleValue)
    : getDefaultFeatureAccessValue(featureKey);
}

export function parseFeatureAccessRuleValue(
  featureKey: PlatformFeatureKey,
  value: unknown,
): PlatformFeatureAccessRuleValue {
  if (
    featureKey === "knowledge.ai_import" ||
    featureKey === "knowledge.web_crawl" ||
    featureKey === "assistants.reasoning"
  ) {
    return z.boolean().parse(value);
  }

  if (featureKey === "assistants.builds") {
    return parseBuildsAccessValue(value);
  }

  if (featureKey === "assistants.execution_policy") {
    return parseAssistantExecutionPolicyValue(value);
  }

  const exhaustive: never = featureKey;
  throw new Error(`Unknown platform feature: ${exhaustive}`);
}

export function isAssistantWorkflowModeAllowed(value: PlatformFeatureAccessRuleValue): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    "allowedExecutionModes" in value &&
    value.allowedExecutionModes.includes("workflow") &&
    value.allowedWorkflowSources.length > 0
  );
}

/** Разрешён ли конкретный источник сценария (global_template / workspace_scenario). */
export function isAssistantWorkflowSourceAllowed(
  value: PlatformFeatureAccessRuleValue,
  source: AssistantWorkflowSource,
): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    "allowedExecutionModes" in value &&
    value.allowedExecutionModes.includes("workflow") &&
    value.allowedWorkflowSources.includes(source)
  );
}

/**
 * Извлекает поднастройки доступа к сборкам из значения правила. Терпим к legacy-boolean
 * (плоская фича до миграции 0276) и к пустому значению (нет решения) — отдаёт безопасный
 * дефолт каталога `{ canPublish: false, canConsume: true }`.
 */
export function getBuildsAccess(value: PlatformFeatureAccessRuleValue | null | undefined): BuildsAccessValue {
  if (typeof value === "boolean") {
    return { canPublish: value, canConsume: true };
  }
  if (value && typeof value === "object" && "canPublish" in value) {
    return { canPublish: value.canPublish === true, canConsume: value.canConsume === true };
  }
  return { canPublish: false, canConsume: true };
}

export function isFeatureAccessAllowed(value: PlatformFeatureAccessRuleValue): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  if ("canPublish" in value) {
    return value.canPublish || value.canConsume;
  }

  return isAssistantWorkflowModeAllowed(value);
}

export function describeFeatureAccessValue(value: PlatformFeatureAccessRuleValue): string {
  if (typeof value === "boolean") {
    return value ? "Включено" : "Выключено";
  }

  if ("canPublish" in value) {
    if (value.canPublish && value.canConsume) return "Публикация + витрина";
    if (value.canPublish) return "Только публикация";
    if (value.canConsume) return "Только витрина";
    return "Выключено";
  }

  if (isAssistantWorkflowModeAllowed(value)) {
    return "Стандартный режим и сценарий";
  }

  if (value.allowedExecutionModes.includes("workflow")) {
    return "Сценарий без глобальных шаблонов";
  }

  return "Только стандартный режим";
}

export type FeatureAccessRuleDto = {
  id: string;
  featureKey: PlatformFeatureKey;
  targetKind: FeatureAccessTargetKind;
  targetId: string | null;
  targetLabel: string;
  value: PlatformFeatureAccessRuleValue;
  valueLabel: string;
  note: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type FeatureAccessGroupMemberDto = {
  workspaceId: string;
  workspaceName: string;
  createdAt: string;
};

export type FeatureAccessGroupDto = {
  id: string;
  name: string;
  description: string;
  memberCount: number;
  usedByRulesCount: number;
  members?: FeatureAccessGroupMemberDto[];
  auditLog?: FeatureAccessAuditLogDto[];
  createdAt: string;
  updatedAt: string;
};

export type FeatureAccessAuditLogDto = {
  id: number;
  action: string;
  actorUserId: string | null;
  featureKey: PlatformFeatureKey | null;
  groupId: string | null;
  workspaceId: string | null;
  targetType: string;
  targetId: string | null;
  details: Record<string, unknown>;
  createdAt: string;
};

export type FeatureAccessDecisionSource = "workspace_rule" | "group_rule" | "all_rule" | "default";

export type FeatureAccessDecisionDto = {
  featureKey: PlatformFeatureKey;
  value: PlatformFeatureAccessRuleValue;
  valueLabel: string;
  allowed: boolean;
  source: FeatureAccessDecisionSource;
  reason: string;
  matchedRuleIds: string[];
};

export type FeatureAccessFeatureSummaryDto = {
  key: PlatformFeatureKey;
  title: string;
  description: string;
  area: PlatformFeatureArea;
  areaLabel: string;
  valueKind: PlatformFeatureValueKind;
  /** Встроенный каталожный дефолт (требует релиза для изменения) — референс. */
  defaultValue: PlatformFeatureAccessRuleValue;
  defaultValueLabel: string;
  /** Эффективный дефолт сейчас: all-правило админа, иначе каталог. */
  effectiveDefaultValue: PlatformFeatureAccessRuleValue;
  effectiveDefaultLabel: string;
  defaultSource: "all_rule" | "catalog";
  rulesCount: number;
  updatedAt: string | null;
};

export type FeatureAccessFeatureDetailDto = FeatureAccessFeatureSummaryDto & {
  rules: FeatureAccessRuleDto[];
  auditLog: FeatureAccessAuditLogDto[];
};
