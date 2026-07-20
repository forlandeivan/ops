import { z } from "zod";

/**
 * WorkflowValueType2 (L1.2b) — структурная система типов значений workflow.
 *
 * Расширяет плоский `workflowValueTypes = ["string","number","boolean"]` до структурных типов:
 * дат, перечислений (enum), вложенных записей (record), списков (array) и grounded-значений
 * (значение + цитата как первокласс). Строгий **superset**: все прежние плоские строки и легаси-
 * алиасы слотов ("date"/"record"/"record[]"/"richtext") остаются валидными — старые конфиги узлов
 * и IR парсятся без миграции данных.
 *
 * Оставлен leaf-модулем (импортирует только zod), чтобы `workflow-compiler.ts` и `document-slots.ts`
 * могли зависеть от него без циклов. Скалярный `workflowValueTypeSchema` (router/binding-сравнения)
 * НЕ трогается — сравнение роутера по определению скалярно.
 */

// Скалярный лист для router/binding-совместимости — совпадает с плоским `WorkflowValueType`
// из workflow-compiler (тот определяется независимо; здесь не импортируем во избежание цикла).
export type WorkflowScalarValueType = "string" | "number" | "boolean";

// Скаляры и легаси-алиасы слотов (парсятся как есть; проецируются в текст как строки).
export const workflowValueType2Scalars = [
  "string",
  "number",
  "boolean",
  "date",
  "richtext",
  // Легаси-алиасы прежнего slotValueTypes — для обратной совместимости старых slot-конфигов.
  "record",
  "record[]",
] as const;
export type WorkflowValueType2Scalar = (typeof workflowValueType2Scalars)[number];
const workflowValueType2ScalarSchema = z.enum(workflowValueType2Scalars);

export type WorkflowEnumOption = { value: string; label: string };
export type WorkflowRecordField = { key: string; label: string; type: WorkflowValueType2 };

export type WorkflowValueType2 =
  | WorkflowValueType2Scalar
  | { kind: "enum"; options: WorkflowEnumOption[] }
  | { kind: "record"; fields: WorkflowRecordField[] }
  | { kind: "array"; items: WorkflowValueType2 }
  | { kind: "grounded"; of: WorkflowValueType2 };

const workflowEnumOptionSchema: z.ZodType<WorkflowEnumOption> = z.object({
  value: z.string().max(500),
  label: z.string().max(500),
});

const workflowRecordFieldSchema: z.ZodType<WorkflowRecordField> = z.lazy(() =>
  z.object({
    key: z.string().trim().min(1).max(200),
    label: z.string().trim().min(1).max(500),
    type: workflowValueType2Schema,
  }),
);

/**
 * Рекурсивная Zod-схема WorkflowValueType2. Union (не discriminated — смешивает строки и объекты);
 * порядок: скаляр-строка → объектные варианты по `kind`.
 */
export const workflowValueType2Schema: z.ZodType<WorkflowValueType2> = z.lazy(() =>
  z.union([
    workflowValueType2ScalarSchema,
    z.object({ kind: z.literal("enum"), options: z.array(workflowEnumOptionSchema).default([]) }),
    z.object({ kind: z.literal("record"), fields: z.array(workflowRecordFieldSchema).default([]) }),
    z.object({ kind: z.literal("array"), items: workflowValueType2Schema }),
    z.object({ kind: z.literal("grounded"), of: workflowValueType2Schema }),
  ]),
);

/** Структурный тип = объект с `kind` (enum/record/array/grounded), а не скаляр-строка. */
export function isStructuralValueType(
  value: WorkflowValueType2,
): value is Exclude<WorkflowValueType2, WorkflowValueType2Scalar> {
  return typeof value === "object" && value !== null;
}

/**
 * Проецирует структурный тип в скалярный лист для router/binding-пикеров.
 * grounded/array разворачиваются к внутреннему; enum/record/date/richtext/record[] → "string".
 */
export function valueType2ToScalarLeaf(value: WorkflowValueType2): WorkflowScalarValueType {
  if (typeof value === "string") {
    if (value === "number") return "number";
    if (value === "boolean") return "boolean";
    return "string"; // string / date / richtext / record / record[]
  }
  switch (value.kind) {
    case "grounded":
      return valueType2ToScalarLeaf(value.of);
    case "array":
      return valueType2ToScalarLeaf(value.items);
    case "enum":
    case "record":
      return "string";
    default:
      return assertNeverValueType2(value);
  }
}

export type WorkflowValueTypeChild = {
  /** Суффикс dot-пути к вложенному значению (напр. "value", "quote", "[]", ключ record-поля). */
  pathSuffix: string;
  label: string;
  type: WorkflowValueType2;
};

/**
 * Перечисляет вложенные пути структурного типа для каталога значений (dot-path к полям
 * record/grounded). Скаляры и enum детей не имеют.
 */
export function projectValueTypeChildren(value: WorkflowValueType2): WorkflowValueTypeChild[] {
  if (typeof value === "string") {
    return [];
  }
  switch (value.kind) {
    case "grounded":
      return [
        { pathSuffix: "value", label: "Значение", type: value.of },
        { pathSuffix: "quote", label: "Цитата", type: "string" },
        { pathSuffix: "present", label: "Присутствует", type: "boolean" },
        { pathSuffix: "confidence", label: "Уверенность", type: "number" },
      ];
    case "record":
      return value.fields.map((field) => ({ pathSuffix: field.key, label: field.label, type: field.type }));
    case "array":
      return [{ pathSuffix: "[]", label: "Элемент", type: value.items }];
    case "enum":
      return [];
    default:
      return assertNeverValueType2(value);
  }
}

/** Человекочитаемая метка типа для UI. */
export function getWorkflowValueType2Label(value: WorkflowValueType2): string {
  if (typeof value === "string") {
    switch (value) {
      case "string":
        return "Строка";
      case "number":
        return "Число";
      case "boolean":
        return "Логическое";
      case "date":
        return "Дата";
      case "richtext":
        return "Форматированный текст";
      case "record":
        return "Запись";
      case "record[]":
        return "Список записей";
      default:
        return value;
    }
  }
  switch (value.kind) {
    case "enum":
      return "Перечисление";
    case "record":
      return "Запись";
    case "array":
      return "Список";
    case "grounded":
      return `Grounded (${getWorkflowValueType2Label(value.of)})`;
    default:
      return assertNeverValueType2(value);
  }
}

/** Компактная строковая метка типа (для display-only полей: манифест слота, журнал). */
export function valueType2ToShortString(value: WorkflowValueType2): string {
  return typeof value === "string" ? value : value.kind;
}

/** Исчерпаемость switch по структурным вариантам (TS-enforced). */
export function assertNeverValueType2(value: never): never {
  throw new Error(`Необработанный WorkflowValueType2: ${JSON.stringify(value)}`);
}
