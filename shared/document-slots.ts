import { z } from "zod";

import { workflowValueType2Schema } from "./workflow-value-type2";

/**
 * Типизированная модель слота документа (L2.0).
 *
 * Единый источник истины для типа слота, переиспользуемый узлами «типизированной сборки
 * документов» (typed_template и последующими). Домен-специфика живёт в *значениях*
 * дескрипторов конкретного шаблона, не в движке — движок по ним не ветвится.
 *
 * Обратная совместимость: аддитивно; не трогает WORKFLOW_IR_SCHEMA_VERSION.
 */

// Скалярные метки типа слота для UI-дропдаунов. Полный структурный словарь — WorkflowValueType2
// (L1.2b); эти строки — его скалярное подмножество (валидны как есть внутри superset'а).
export const slotValueTypes = [
  "string",
  "number",
  "boolean",
  "date",
  "record",
  "record[]",
  "richtext",
] as const;
export type SlotValueType = (typeof slotValueTypes)[number];
export const slotValueTypeSchema = z.enum(slotValueTypes);

// Типы резолверов (слот → источник значения). Дискриминатор — поле `type`.
//
// Record-backed резолверы (extract/generate/select) УДАЛЕНЫ: они требовали ручного ввода id узла и
// id поля, а пустой stepRef означал «автоопределение последнего шага с records» — тихий резолв, из-за
// которого при добавлении второго узла-источника слот молча брал чужие записи. Их заменяет `expression`:
// узлы отдают `fields` (записи по ИМЕНИ поля), поэтому значение адресуется явной плашкой
// `{{steps.<узел>.fields.<поле>.value}}` из каталога переменных — узел виден в самом пути.
export const slotResolverTypes = [
  "literal", // CONST — литерал в шаблоне
  "manual", // РУЧНОЙ ВВОД — значение из входа/дефолта
  "expression", // ПЕРЕМЕННАЯ — плашка/dot-путь по контексту (в т.ч. steps.<узел>.fields.<поле>.value)
  "global", // ГЛОБАЛЬНАЯ — реестр глобальных переменных пространства (L2.1c: varKey → значение)
  "block", // ИМЕНОВАННЫЙ БЛОК (deferred: Волна 4)
] as const;
export type SlotResolverType = (typeof slotResolverTypes)[number];

/**
 * Дискриминированный union резолверов. В рантайме L1.2 реально резолвятся
 * literal/manual/expression; остальные объявлены (валидная конфигурация), но в рантайме
 * уходят в unresolvedSlots до своих волн.
 */
export const slotResolverSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("literal"), text: z.string().max(20000).default("") }),
  z.object({
    type: z.literal("manual"),
    field: z.string().trim().min(1).max(200),
    defaultValue: z.string().max(20000).nullable().optional(),
  }),
  z.object({
    type: z.literal("expression"),
    // Путь по контексту рантайма, напр. "steps.document_sources.slots.oz.text".
    expression: z.string().trim().min(1).max(1000),
  }),
  z.object({ type: z.literal("global"), varKey: z.string().trim().min(1).max(200) }),
  z.object({ type: z.literal("block"), spec: z.record(z.string(), z.unknown()).default({}) }),
]);
export type SlotResolver = z.infer<typeof slotResolverSchema>;

// Резолверы, у которых есть детерминированный рантайм. Значения из upstream-узлов (извлечение,
// генерация, выбор) адресуются через `expression` — плашкой steps.<узел>.fields.<поле>.value.
export const runtimeResolvedSlotResolverTypes = ["literal", "manual", "expression", "global"] as const;

// Политика уверенности (минимально; расширяется в Волне 5 — SlotValue/провенанс).
export const slotConfidencePolicySchema = z.object({
  requireHumanConfirm: z.boolean().default(false),
  minConfidence: z.number().min(0).max(1).nullable().optional(),
  onLowConfidence: z.enum(["flag", "block", "fallback_manual"]).default("flag"),
});
export type SlotConfidencePolicy = z.infer<typeof slotConfidencePolicySchema>;

/**
 * Дескриптор одного слота шаблона.
 * `id` — стабильный ключ (не меняется при перетипизации резолвера).
 * `tag` — docx-плейсхолдер, к которому привязан слот (ключ в resolvedFields при рендере).
 */
export const documentSlotSpecSchema = z.object({
  id: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(/^[a-zA-Z0-9_]+$/, "Ключ слота: латиница, цифры и подчёркивание"),
  label: z.string().trim().min(1).max(240),
  tag: z.string().trim().min(1).max(240),
  // L1.2b: структурный тип значения слота (WorkflowValueType2). Легаси-строки
  // (string/number/boolean/date/record/record[]/richtext) остаются валидными — они внутри superset'а.
  // Значение проецируется в плоский текст для docx_render через projectSlotValueToText.
  valueType: workflowValueType2Schema.default("string"),
  resolver: slotResolverSchema,
  optional: z.boolean().default(false),
  // Условное включение (bool-дериватив, L1.6/L2.4): dot-путь по контексту рантайма с опциональным
  // ведущим "!" (напр. "!steps.spe.result"). Резолвится в typed-template-resolve.ts через
  // getContextValueByPath + булеву коэрсию; false → слот молча опускается (status "skipped").
  includeWhen: z.string().max(1000).nullable().default(null),
  confidencePolicy: slotConfidencePolicySchema.optional(),
});
export type DocumentSlotSpec = z.infer<typeof documentSlotSpecSchema>;

// Исчерпаемость switch по resolver.type (TS-enforced).
export function assertNeverResolver(value: never): never {
  throw new Error(`Необработанный тип резолвера слота: ${JSON.stringify(value)}`);
}
