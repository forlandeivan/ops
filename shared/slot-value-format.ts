import {
  assertNeverValueType2,
  type WorkflowEnumOption,
  type WorkflowRecordField,
  type WorkflowValueType2,
} from "./workflow-value-type2";

/**
 * Проекция структурных значений слота (WorkflowValueType2) в ПЛОСКИЙ текст для docx_render (L1.2b).
 *
 * Контракт docx_render — `resolvedFields: Record<tag, string>`. Резолвер typed_template хранит
 * структурный оригинал (value/quote/grounded) в провенансе, а в resolvedFields кладёт результат
 * `projectSlotValueToText`. Форматтеры детерминированы (RU-дефолты), без пер-слот формат-конфига.
 */

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Grounded-обёртка рантайма: { value, quote?, grounded?, present?, confidence? }.
function isGroundedEnvelope(value: unknown): value is Record<string, unknown> {
  return (
    isPlainObject(value) &&
    "value" in value &&
    ("quote" in value || "grounded" in value || "present" in value || "confidence" in value)
  );
}

/** Форматирует дату в RU-формат DD.MM.YYYY. Невалидное/неразобранное → исходная строка. */
export function formatDateRu(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value !== "string" && typeof value !== "number" && !(value instanceof Date)) {
    return String(value);
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return typeof value === "string" ? value : String(value);
  }
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const year = String(date.getUTCFullYear());
  return `${day}.${month}.${year}`;
}

function scalarToText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  if (isPlainObject(value) || Array.isArray(value)) {
    return JSON.stringify(value);
  }
  return String(value);
}

function projectEnumToText(value: unknown, options: WorkflowEnumOption[]): string {
  const raw = value === null || value === undefined ? "" : String(value);
  const match = options.find((option) => option.value === raw);
  return match ? match.label : raw;
}

function projectArrayToText(value: unknown, items: WorkflowValueType2): string {
  if (Array.isArray(value)) {
    return value
      .map((element) => projectSlotValueToText(element, items))
      .filter((text) => text.length > 0)
      .join("; ");
  }
  return scalarToText(value);
}

function projectRecordToText(value: unknown, fields: WorkflowRecordField[]): string {
  if (isPlainObject(value)) {
    // Человекочитаемая проекция: первое непустое строковое поле по декларации; иначе — JSON.
    for (const field of fields) {
      const fieldValue = value[field.key];
      if (typeof fieldValue === "string" && fieldValue.trim().length > 0) {
        return fieldValue;
      }
    }
    return JSON.stringify(value);
  }
  return scalarToText(value);
}

/**
 * Проецирует резолвнутое значение слота в плоский текст согласно его WorkflowValueType2.
 * grounded-обёртка разворачивается к внутреннему значению; date форматируется; enum → label
 * выбранной опции; record → display-поле/JSON; array → значения через «; ».
 */
export function projectSlotValueToText(value: unknown, valueType: WorkflowValueType2): string {
  if (value === null || value === undefined) {
    return "";
  }
  // Значение пришло grounded-обёрткой — разворачиваем к внутреннему (тип тоже разворачиваем).
  if (isGroundedEnvelope(value)) {
    const inner = typeof valueType === "object" && valueType.kind === "grounded" ? valueType.of : valueType;
    return projectSlotValueToText(value.value, inner);
  }
  if (typeof valueType === "string") {
    return valueType === "date" ? formatDateRu(value) : scalarToText(value);
  }
  switch (valueType.kind) {
    case "grounded":
      return projectSlotValueToText(value, valueType.of);
    case "enum":
      return projectEnumToText(value, valueType.options);
    case "array":
      return projectArrayToText(value, valueType.items);
    case "record":
      return projectRecordToText(value, valueType.fields);
    default:
      return assertNeverValueType2(valueType);
  }
}
