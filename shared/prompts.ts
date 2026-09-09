import { z } from "zod";
import { PROMPT_TEXT_MAX, promptLengthErrorParams } from "./prompt-limits";
import { promptScopes, type PromptScope } from "./schema";

/**
 * Библиотека промптов и стартовые подсказки чата (Фаза 1, docs/prompt-library-strategy.md).
 * Общие DTO и zod-схемы ввода — используются серверными роутами и клиентом.
 */

export const PROMPT_TITLE_MAX = 200;

/**
 * Тело промпта живёт по общему потолку длинных промптов (shared/prompt-limits.ts):
 * библиотека промптов и инструкция ассистента — одна и та же сущность для пользователя,
 * и разный предел у них означал только то, что в одном месте текст молча терялся.
 */
export const PROMPT_BODY_MAX = PROMPT_TEXT_MAX;
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
  /** Счётчик выборов промпта (Фаза 3); в кэшированных списках может отставать на TTL кэша. */
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

// --- Слэш-меню композера (Фаза 2B) ---

/**
 * Верхняя граница рендера слэш-меню. Отбором занимается не она, а поиск по вводу после «/»
 * (rankSlashPrompts): в меню попадают все промпты доступных скоупов, потому что настройки
 * размещения больше нет. Список не виртуализирован, поэтому потолок нужен как защита DOM;
 * значение обязано превышать реальную библиотеку инсталляции, иначе промпт молча пропадёт
 * из меню — ровно тот дефект, ради которого размещение и убирали. Остальное — «Показать все».
 */
export const SLASH_MENU_LIMIT = 40;

/** Потолок ответа сервера для слэш-меню: строго больше клиентского, чтобы клиент резал полный список. */
export const SLASH_MENU_FETCH_LIMIT = 200;

/** Компактная форма пункта меню: тела достаточно для вставки, превью строит клиент. */
export interface SlashPromptDto {
  id: string;
  scope: PromptScope;
  title: string;
  body: string;
}

/**
 * Приоритет владельца: чем ближе скоуп к пользователю, тем выше пункт при равной
 * релевантности. Личное выше workspace, поскольку находится ближе к пользователю.
 * Legacy-скоуп assistant оставлен в типе данных для чтения старых записей, но в
 * пользовательские списки больше не включается.
 */
const SLASH_SCOPE_RANK: Record<PromptScope, number> = {
  personal: 0,
  workspace: 1,
  instance: 2,
  system: 3,
  assistant: 4,
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

/**
 * База без дефолтов, и заводить их здесь нельзя: в zod 4 `.default()` срабатывает и внутри
 * `.partial()`, поэтому patch-схема молча подставляла бы дефолты создания в не переданные
 * поля — частичное сохранение затирало бы соседние.
 */
const promptInputBaseSchema = z.object({
  title: z.string().trim().min(1, "Название обязательно").max(PROMPT_TITLE_MAX),
  body: z
    .string()
    .trim()
    .min(1, "Текст промпта обязателен")
    .max(PROMPT_BODY_MAX, promptLengthErrorParams("Текст промпта", PROMPT_BODY_MAX)),
  description: z.string().trim().max(PROMPT_DESCRIPTION_MAX).nullish(),
  category: z.string().trim().max(PROMPT_CATEGORY_MAX).nullish(),
});

export const promptCreateInputSchema = promptInputBaseSchema;
export type PromptCreateInput = z.infer<typeof promptCreateInputSchema>;

export const promptPatchInputSchema = promptInputBaseSchema.partial();
export type PromptPatchInput = z.infer<typeof promptPatchInputSchema>;

// --- Импорт/экспорт JSON-набора (Фаза 3) ---

export const PROMPT_BUNDLE_VERSION = 1;
export const PROMPT_BUNDLE_MAX_ITEMS = 2000;
export const PROMPT_BUNDLE_ID_MAX = 200;

/** Поля, которые набор нёс до отказа от настроек показа (раздел 20 стратегии). */
const LEGACY_BUNDLE_FIELDS = ["placement", "isActive", "sortOrder"] as const;

/**
 * Элемент набора: id + scope + контент — один и тот же bundle можно доставить и миграцией-сидом,
 * и админ-импортом (паттерн workflow starter bundles). Переносимы только глобальные скоупы:
 * workspace/personal/assistant привязаны к локальным сущностям инстанса и в набор не входят.
 *
 * Схема строгая, в отличие от create/patch: файл набора пишут и правят руками, и молча
 * потерянное поле здесь опаснее отказа. Именно строгость отвергает наборы прежней версии
 * с placement/is_active/sort_order — zod по умолчанию такие ключи просто отбрасывает.
 */
export const promptBundleItemSchema = z.strictObject(
  {
    ...promptCreateInputSchema.shape,
    id: z.string().trim().min(1, "Идентификатор промпта обязателен").max(PROMPT_BUNDLE_ID_MAX),
    scope: z.enum(["system", "instance"]),
  },
  {
    error: (issue) => {
      if (issue.code !== "unrecognized_keys") {
        return undefined;
      }
      const keys = (issue as { keys?: string[] }).keys ?? [];
      const legacy = keys.filter((key) => (LEGACY_BUNDLE_FIELDS as readonly string[]).includes(key));
      return legacy.length > 0
        ? `Набор создан прежней версией платформы: поля ${legacy.join(", ")} больше не поддерживаются — выгрузите набор заново кнопкой «Экспортировать»`
        : `Неизвестные поля в промпте набора: ${keys.join(", ")}`;
    },
  },
);
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

export { promptScopes };
export type { PromptScope };
