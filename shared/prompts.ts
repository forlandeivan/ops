import { z } from "zod";
import { promptPlacements, promptScopes, type PromptPlacement, type PromptScope } from "./schema";

/**
 * Библиотека промптов и стартовые подсказки чата (Фаза 1, docs/prompt-library-strategy.md).
 * Общие DTO и zod-схемы ввода — используются серверными роутами и клиентом.
 */

export const PROMPT_TITLE_MAX = 200;
export const PROMPT_BODY_MAX = 4000;
export const PROMPT_DESCRIPTION_MAX = 500;
export const PROMPT_CATEGORY_MAX = 100;

/** Сколько подсказок показывает стартовая страница за один запрос. */
export const START_PROMPTS_LIMIT = 4;

export interface PromptDto {
  id: string;
  scope: PromptScope;
  workspaceId: string | null;
  title: string;
  body: string;
  description: string | null;
  category: string | null;
  placement: PromptPlacement[];
  isActive: boolean;
  sortOrder: number;
  /** Счётчик вставок в композер (Фаза 3); в кэшированных списках может отставать на TTL кэша. */
  usageCount: number;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Компактная форма для выдачи стартовой страницы. */
export interface StartPromptDto {
  id: string;
  scope: PromptScope;
  title: string;
  body: string;
}

/** Ответ GET /api/start-prompts: с assistantId — starters ассистента + его автосенд-флаг. */
export interface StartPromptsResponse {
  prompts: StartPromptDto[];
  autoSend?: boolean;
}

// --- Starters ассистента (Фаза 2A) ---

export const ASSISTANT_STARTER_PROMPTS_MAX = 6;
export const ASSISTANT_STARTER_TEXT_MAX = 400;

/** Редактор starters сохраняет список целиком (порядок = порядок показа, без ротации). */
export const assistantStarterPromptsInputSchema = z.object({
  autoSend: z.boolean().default(false),
  prompts: z
    .array(
      z.object({
        text: z.string().trim().min(1, "Текст подсказки обязателен").max(ASSISTANT_STARTER_TEXT_MAX),
      }),
    )
    .max(ASSISTANT_STARTER_PROMPTS_MAX, `Не больше ${ASSISTANT_STARTER_PROMPTS_MAX} подсказок`),
});
export type AssistantStarterPromptsInput = z.infer<typeof assistantStarterPromptsInputSchema>;

export interface AssistantStarterPromptsPayload {
  prompts: StartPromptDto[];
  autoSend: boolean;
}

// --- Слэш-меню композера (Фаза 2B) ---

/** Сколько пунктов показывает слэш-меню; остальное — за кнопкой «Показать все». */
export const SLASH_MENU_LIMIT = 8;

/** Компактная форма пункта меню: тела достаточно для вставки, превью строит клиент. */
export interface SlashPromptDto {
  id: string;
  scope: PromptScope;
  title: string;
  body: string;
}

/**
 * Приоритет владельца: чем ближе скоуп к пользователю, тем выше пункт при равной
 * релевантности. Личное выше workspace (ближе к пользователю), но ниже starters
 * ассистента: их владелец завёл именно под контекст открытого чата.
 */
const SLASH_SCOPE_RANK: Record<PromptScope, number> = {
  assistant: 0,
  personal: 1,
  workspace: 2,
  instance: 3,
  system: 4,
};

/**
 * Ранжирование слэш-меню: префикс названия → вхождение в название; внутри одного
 * класса — приоритет скоупа, затем исходный порядок владельца. Пустой запрос («/»)
 * показывает всё меню в порядке скоупов. Слэш-команд у промптов нет (удалены 17.07.2026,
 * решение владельца) — меню ищет только по названию. Чистая функция — клиент фильтрует
 * кэшированный список без сетевого запроса.
 */
export function rankSlashPrompts<T extends { scope: PromptScope; title: string }>(
  items: readonly T[],
  query: string,
): T[] {
  const needle = query.trim().toLowerCase();
  const scored: Array<{ item: T; rank: number; index: number }> = [];

  items.forEach((item, index) => {
    const title = item.title.toLowerCase();
    let rank: number;
    if (needle.length === 0) {
      rank = 2;
    } else if (title.startsWith(needle)) {
      rank = 0;
    } else if (title.includes(needle)) {
      rank = 1;
    } else {
      return;
    }
    scored.push({ item, rank, index });
  });

  return scored
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        SLASH_SCOPE_RANK[a.item.scope] - SLASH_SCOPE_RANK[b.item.scope] ||
        a.index - b.index,
    )
    .map((entry) => entry.item);
}

// --- Переменные шаблонов (Фаза 2A) ---

export const PROMPT_VARIABLES_MAX = 10;

const PROMPT_VARIABLE_PATTERN = /\{\{\s*([^{}\n]+?)\s*\}\}/g;

/**
 * Нетипизированные переменные вида {{имя}} (паттерн TypingMind): извлекаются из текста
 * в порядке первого вхождения, без дублей. Заполняются формой перед вставкой в композер.
 */
export function extractPromptVariables(body: string): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const match of body.matchAll(PROMPT_VARIABLE_PATTERN)) {
    const name = match[1]!.trim();
    if (!name || seen.has(name)) {
      continue;
    }
    seen.add(name);
    names.push(name);
    if (names.length >= PROMPT_VARIABLES_MAX) {
      break;
    }
  }
  return names;
}

/** Подстановка значений в шаблон; незаполненные переменные остаются плейсхолдерами. */
export function applyPromptVariables(body: string, values: Record<string, string>): string {
  return body.replace(PROMPT_VARIABLE_PATTERN, (whole, rawName: string) => {
    const name = rawName.trim();
    const value = values[name];
    return value !== undefined && value !== "" ? value : whole;
  });
}

const placementEnum = z.enum(promptPlacements as unknown as [PromptPlacement, ...PromptPlacement[]]);

/**
 * База без дефолтов: в zod 4 `.default()` срабатывает и внутри `.partial()`,
 * поэтому patch-схема, производная от схемы создания, молча подставляла бы
 * placement/isActive/sortOrder в не переданные поля (PATCH {isActive} сбрасывал
 * размещение и порядок). Дефолты навешиваются только на схему создания.
 */
const promptInputBaseSchema = z.object({
  title: z.string().trim().min(1, "Название обязательно").max(PROMPT_TITLE_MAX),
  body: z.string().trim().min(1, "Текст промпта обязателен").max(PROMPT_BODY_MAX),
  description: z.string().trim().max(PROMPT_DESCRIPTION_MAX).nullish(),
  category: z.string().trim().max(PROMPT_CATEGORY_MAX).nullish(),
  placement: z.array(placementEnum).min(1),
  isActive: z.boolean(),
  sortOrder: z.number().int().min(0).max(100_000),
});

export const promptCreateInputSchema = promptInputBaseSchema.extend({
  placement: promptInputBaseSchema.shape.placement.default(["start_screen"]),
  isActive: promptInputBaseSchema.shape.isActive.default(true),
  sortOrder: promptInputBaseSchema.shape.sortOrder.default(0),
});
export type PromptCreateInput = z.infer<typeof promptCreateInputSchema>;

export const promptPatchInputSchema = promptInputBaseSchema.partial();
export type PromptPatchInput = z.infer<typeof promptPatchInputSchema>;

/** Патч системного промпта: у вендорского сида правится только видимость и порядок. */
export const systemPromptPatchInputSchema = z.object({
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(100_000).optional(),
});
export type SystemPromptPatchInput = z.infer<typeof systemPromptPatchInputSchema>;

// --- Импорт/экспорт JSON-набора (Фаза 3) ---

export const PROMPT_BUNDLE_VERSION = 1;
export const PROMPT_BUNDLE_MAX_ITEMS = 2000;
export const PROMPT_BUNDLE_ID_MAX = 200;

/**
 * Элемент набора: поля сида миграции 0293 (id + scope + контент) — один и тот же bundle
 * можно доставить и миграцией-сидом, и админ-импортом (паттерн workflow starter bundles).
 * Переносимы только глобальные скоупы: workspace/personal/assistant привязаны к локальным
 * сущностям инстанса и в набор не входят.
 */
export const promptBundleItemSchema = promptCreateInputSchema.extend({
  id: z.string().trim().min(1, "Идентификатор промпта обязателен").max(PROMPT_BUNDLE_ID_MAX),
  scope: z.enum(["system", "instance"]),
});
export type PromptBundleItem = z.infer<typeof promptBundleItemSchema>;

export const promptBundleSchema = z
  .object({
    version: z.literal(PROMPT_BUNDLE_VERSION),
    prompts: z
      .array(promptBundleItemSchema)
      .min(1, "Набор пуст")
      .max(PROMPT_BUNDLE_MAX_ITEMS, `Не больше ${PROMPT_BUNDLE_MAX_ITEMS} промптов в наборе`),
  })
  .superRefine((bundle, ctx) => {
    const seen = new Set<string>();
    bundle.prompts.forEach((prompt, index) => {
      if (seen.has(prompt.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["prompts", index, "id"],
          message: `Дубль идентификатора «${prompt.id}» в наборе`,
        });
      }
      seen.add(prompt.id);
    });
  });
export type PromptBundle = z.infer<typeof promptBundleSchema>;

/** Итог импорта: upsert по id — сколько строк создано и сколько обновлено. */
export interface PromptImportResultDto {
  inserted: number;
  updated: number;
}

// --- Лимит промптов инстанса (Фаза 3; прецедент Copilot: 1000/тенант) ---

export const PROMPTS_INSTANCE_LIMIT_MAX = 100_000;

/** null = «Авто» (env PROMPTS_INSTANCE_LIMIT → fallback); 0 = запрет создания новых. */
export const promptsAdminSettingsInputSchema = z.object({
  limit: z.number().int().min(0).max(PROMPTS_INSTANCE_LIMIT_MAX).nullable(),
});
export type PromptsAdminSettingsInput = z.infer<typeof promptsAdminSettingsInputSchema>;

export interface PromptsAdminSettingsDto {
  /** Явный админ-override; null = «Авто». */
  limit: number | null;
  /** Действующее значение после резолва admin → env → fallback. */
  effectiveLimit: number;
  /** Занято лимитируемыми промптами (instance + workspace + personal). */
  usedCount: number;
}

export { promptPlacements, promptScopes };
export type { PromptPlacement, PromptScope };
