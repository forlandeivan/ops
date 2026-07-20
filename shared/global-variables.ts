import { z } from "zod";

/**
 * Реестр глобальных переменных документов (L2.1).
 *
 * Двухуровневая модель: админ инстанса задаёт ОБЩУЮ схему переменных (ориентир для типовых
 * сценариев, `workspaceId = null`), менеджеры пространств создают СВОИ переменные уровня
 * пространства (`workspaceId = <ws>`). Значения всегда живут на уровне пространства.
 * Домен-агностично: `court.city` и `company.inn` — просто ключи, движок по ним не ветвится.
 *
 * Модуль общий для server/client/tests: DTO, Zod-схемы и чистые утилиты без зависимостей рантайма.
 */

// Тип значения переменной (валидация значения — validateGlobalVariableValue).
export const globalVariableValueTypes = ["string", "number", "boolean", "date", "enum"] as const;
export type GlobalVariableValueType = (typeof globalVariableValueTypes)[number];
export const globalVariableValueTypeSchema = z.enum(globalVariableValueTypes);

/**
 * Формат ключа: сегменты через точку, каждый начинается с буквы (числовой сегмент конфликтовал бы
 * с индексацией массивов в dot-path резолве контекста workflow).
 */
export const GLOBAL_VARIABLE_KEY_REGEX = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/;
export const GLOBAL_VARIABLE_KEY_MAX = 200;

/**
 * Зарезервированные корни неймспейса: первые сегменты, которые конфликтуют с корнями контекста
 * рантайма workflow (`steps.*`, `inputs.*`, `workflow.*`, проекция `globals.*`) и с будущими
 * per-run локальными переменными (`locals.*` — отдельный эпик).
 */
export const GLOBAL_VARIABLE_RESERVED_ROOTS = [
  "steps",
  "inputs",
  "workflow",
  "globals",
  "locals",
] as const;

function keyRootSegment(key: string): string {
  const dotIndex = key.indexOf(".");
  return dotIndex === -1 ? key : key.slice(0, dotIndex);
}

export const globalVariableKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(GLOBAL_VARIABLE_KEY_MAX)
  .regex(
    GLOBAL_VARIABLE_KEY_REGEX,
    "Ключ: сегменты через точку, латиница/цифры/подчёркивание, сегмент начинается с буквы",
  )
  .refine(
    (key) => !(GLOBAL_VARIABLE_RESERVED_ROOTS as readonly string[]).includes(keyRootSegment(key)),
    { message: `Корень ключа зарезервирован: ${GLOBAL_VARIABLE_RESERVED_ROOTS.join(", ")}` },
  );

// База без superRefine — чтобы patch-схема могла собираться через .omit().partial().
// key опционален: UX не показывает ключ — сервис генерирует его транслитом из label+groupKey
// (buildUniqueGlobalVariableKey); явный key остаётся в API для программных клиентов/тестов.
const globalVariableDefinitionBaseSchema = z.object({
  key: globalVariableKeySchema.optional(),
  label: z.string().trim().min(1).max(240),
  description: z.string().max(2000).default(""),
  valueType: globalVariableValueTypeSchema.default("string"),
  required: z.boolean().default(false),
  enumOptions: z.array(z.string().trim().min(1).max(500)).max(200).default([]),
  // Только UI-подсказка (prefill формы значений): рантайм-fallback запрещён —
  // подстановка дефолта в документ была бы фабрикацией факта.
  defaultValue: z.unknown().nullable().default(null),
  groupKey: z.string().trim().min(1).max(120).nullable().default(null),
  isSecret: z.boolean().default(false),
  sortOrder: z.number().int().min(0).max(100000).default(0),
});

function refineDefinitionConsistency(
  value: Pick<z.infer<typeof globalVariableDefinitionBaseSchema>, "valueType" | "enumOptions" | "defaultValue">,
  ctx: z.RefinementCtx,
) {
  if (value.valueType === "enum" && value.enumOptions.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["enumOptions"],
      message: "Для типа enum задайте хотя бы одну опцию",
    });
  }
  if (value.defaultValue !== null && value.defaultValue !== undefined) {
    const result = validateGlobalVariableValue(
      { valueType: value.valueType, required: false, enumOptions: value.enumOptions },
      value.defaultValue,
    );
    if (!result.ok) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["defaultValue"],
        message: `Значение по умолчанию не соответствует типу: ${result.message}`,
      });
    }
  }
}

/** Полная схема создания дефиниции (admin — инстанс, workspace-manager — своё пространство). */
export const globalVariableDefinitionInputSchema =
  globalVariableDefinitionBaseSchema.superRefine(refineDefinitionConsistency);
export type GlobalVariableDefinitionInput = z.infer<typeof globalVariableDefinitionInputSchema>;

/** Patch-схема: key immutable — правится только через пересоздание дефиниции. */
export const globalVariableDefinitionPatchSchema = globalVariableDefinitionBaseSchema
  .omit({ key: true })
  .partial();
export type GlobalVariableDefinitionPatch = z.infer<typeof globalVariableDefinitionPatchSchema>;

export type GlobalVariableDefinitionDto = {
  id: string;
  /** null — инстанс-схема; иначе — дефиниция конкретного пространства. */
  workspaceId: string | null;
  key: string;
  label: string;
  description: string;
  valueType: GlobalVariableValueType;
  required: boolean;
  enumOptions: string[];
  defaultValue: unknown;
  groupKey: string | null;
  isSecret: boolean;
  sortOrder: number;
  createdAt: string | null;
  updatedAt: string | null;
};

/**
 * Значение пространства для API. Маскирование секрета — `value: null` + `secretMasked: true`
 * (НЕ строка-заглушка: она утекла бы в save-flow и рендеры). `isSet` сохраняет сигнал заполненности.
 */
export type GlobalVariableWorkspaceValueDto = {
  definitionId: string;
  key: string;
  value: unknown;
  isSet: boolean;
  secretMasked: boolean;
  setByUserId: string | null;
  updatedAt: string | null;
};

function isEmptyRawValue(raw: unknown): boolean {
  return raw === null || raw === undefined || (typeof raw === "string" && raw.trim().length === 0);
}

const DATE_VALUE_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;
const STRING_VALUE_MAX = 20000;

export type GlobalVariableValueValidation =
  | { ok: true; value: unknown }
  | { ok: false; message: string };

/**
 * Валидация «сырого» значения против типа дефиниции. Возвращает нормализованное значение
 * (trim строк, приведение числовой строки к number). Пустое значение всегда ошибка —
 * очистка делается удалением строки значения, не записью пустоты.
 */
export function validateGlobalVariableValue(
  definition: Pick<GlobalVariableDefinitionDto, "valueType" | "required" | "enumOptions">,
  raw: unknown,
): GlobalVariableValueValidation {
  if (isEmptyRawValue(raw)) {
    return {
      ok: false,
      message: definition.required
        ? "Значение обязательно"
        : "Пустое значение не сохраняется — удалите значение вместо записи пустого",
    };
  }
  switch (definition.valueType) {
    case "string": {
      if (typeof raw !== "string") {
        return { ok: false, message: "Ожидается строка" };
      }
      const value = raw.trim();
      if (value.length > STRING_VALUE_MAX) {
        return { ok: false, message: `Строка длиннее ${STRING_VALUE_MAX} символов` };
      }
      return { ok: true, value };
    }
    case "number": {
      if (typeof raw === "number") {
        return Number.isFinite(raw)
          ? { ok: true, value: raw }
          : { ok: false, message: "Число должно быть конечным" };
      }
      if (typeof raw === "string") {
        const parsed = Number(raw.trim());
        if (Number.isFinite(parsed)) {
          return { ok: true, value: parsed };
        }
      }
      return { ok: false, message: "Ожидается число" };
    }
    case "boolean": {
      if (typeof raw !== "boolean") {
        return { ok: false, message: "Ожидается логическое значение (true/false)" };
      }
      return { ok: true, value: raw };
    }
    case "date": {
      if (typeof raw !== "string") {
        return { ok: false, message: "Ожидается дата в формате YYYY-MM-DD" };
      }
      const match = DATE_VALUE_REGEX.exec(raw.trim());
      if (!match) {
        return { ok: false, message: "Ожидается дата в формате YYYY-MM-DD" };
      }
      const year = Number(match[1]);
      const month = Number(match[2]);
      const day = Number(match[3]);
      const date = new Date(Date.UTC(year, month - 1, day));
      const valid =
        date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
      if (!valid) {
        return { ok: false, message: "Несуществующая календарная дата" };
      }
      return { ok: true, value: match[0] };
    }
    case "enum": {
      if (typeof raw !== "string") {
        return { ok: false, message: "Ожидается строка из списка опций" };
      }
      const value = raw.trim();
      if (!definition.enumOptions.includes(value)) {
        return { ok: false, message: "Значение вне списка опций" };
      }
      return { ok: true, value };
    }
    default: {
      const exhaustive: never = definition.valueType;
      return { ok: false, message: `Неизвестный тип значения: ${String(exhaustive)}` };
    }
  }
}

/**
 * Prefix-конфликт ключей: `court` и `court.city` не могут сосуществовать в одном видимом
 * неймспейсе — в nested-проекции `globals.*` они претендуют на один узел.
 * Возвращает конфликтующий существующий ключ или null.
 */
export function findKeyPrefixConflict(existingKeys: readonly string[], candidate: string): string | null {
  for (const existing of existingKeys) {
    if (existing === candidate) {
      return existing;
    }
    if (existing.startsWith(`${candidate}.`) || candidate.startsWith(`${existing}.`)) {
      return existing;
    }
  }
  return null;
}

// --- Автогенерация ключа (UX: пользователь задаёт только название и группу) ---

// Простой транслит RU→латиница для машинных идентификаторов (без претензии на ГОСТ —
// нужна стабильность и читаемость, не обратимость).
const TRANSLIT_MAP: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i",
  й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t",
  у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "",
  э: "e", ю: "yu", я: "ya",
};

const KEY_SEGMENT_MAX = 60;

/**
 * Превращает человекочитаемый текст (кириллица/латиница/что угодно) в валидный сегмент ключа:
 * NFC-нормализация, lowercase, транслит RU, всё прочее → `_`, схлопывание/обрезка `_`,
 * сегмент начинается с буквы (иначе префикс `v_`), непустой fallback `var`.
 */
export function transliterateToKeySegment(raw: string): string {
  const normalized = raw.normalize("NFC").toLowerCase();
  let out = "";
  for (const char of normalized) {
    if (/[a-z0-9]/.test(char)) {
      out += char;
    } else if (char in TRANSLIT_MAP) {
      out += TRANSLIT_MAP[char];
    } else {
      out += "_";
    }
  }
  out = out.replace(/_+/g, "_").replace(/^_+|_+$/g, "").slice(0, KEY_SEGMENT_MAX).replace(/_+$/g, "");
  if (out.length === 0) {
    return "var";
  }
  if (!/^[a-z]/.test(out)) {
    return `v_${out}`;
  }
  return out;
}

/**
 * Генерирует уникальный ключ переменной из группы и названия: `translit(group).translit(label)`
 * (без группы — просто `translit(label)`). Коллизия/prefix-конфликт → суффикс `_1`, `_2`, …
 * Возвращает null, если конфликт неустраним суффиксацией (существующий ключ равен самой группе —
 * тогда любой `group.*` остаётся prefix-конфликтом; краевой случай ручных ключей).
 */
export function buildUniqueGlobalVariableKey(
  existingKeys: readonly string[],
  groupLabel: string | null,
  label: string,
): string | null {
  const groupSegment = groupLabel && groupLabel.trim().length > 0
    ? transliterateToKeySegment(groupLabel)
    : null;
  const labelSegment = transliterateToKeySegment(label);
  // Существующий ключ, равный группе, делает все `group.*` prefix-конфликтными навсегда.
  if (groupSegment && existingKeys.includes(groupSegment)) {
    return null;
  }
  const base = groupSegment ? `${groupSegment}.${labelSegment}` : labelSegment;
  for (let attempt = 0; attempt <= 100; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}_${attempt}`;
    if (candidate.length > GLOBAL_VARIABLE_KEY_MAX) {
      return null;
    }
    if (!findKeyPrefixConflict(existingKeys, candidate)) {
      return candidate;
    }
  }
  return null;
}

/**
 * Nested-проекция плоской карты значений для dot-path контекста workflow:
 * `{ "court.city": "Тверь" } → { court: { city: "Тверь" } }`.
 * Дефенсивно: при коллизии сегмента с уже записанным скаляром ключ пропускается
 * (by construction невозможна — prefix-конфликты запрещены на записи схемы).
 */
export function buildNestedGlobalVariables(
  flat: Record<string, unknown>,
): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(flat)) {
    const segments = key.split(".");
    let cursor = root;
    let skip = false;
    for (let i = 0; i < segments.length - 1; i += 1) {
      const segment = segments[i];
      const next = cursor[segment];
      if (next === undefined) {
        const created: Record<string, unknown> = {};
        cursor[segment] = created;
        cursor = created;
        continue;
      }
      if (typeof next !== "object" || next === null || Array.isArray(next)) {
        skip = true;
        break;
      }
      cursor = next as Record<string, unknown>;
    }
    if (!skip) {
      cursor[segments[segments.length - 1]] = value;
    }
  }
  return root;
}
