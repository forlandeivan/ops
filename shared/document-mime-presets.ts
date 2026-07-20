// Курируемый список MIME-типов документов, из которых Unica умеет извлекать текст.
// SoT по фактической поддержке — server/text-extraction.ts (detectExtension/extractText).
// ДЕРЖАТЬ СИНХРОННО: добавляя новый формат в извлечение текста, добавь пресет сюда,
// иначе выпадашка в редакторе слотов document_sources не покажет его пользователю.

export type WorkflowDocumentMimePreset = {
  /** Канонический MIME-тип, который кладётся в acceptedMime слота. */
  value: string;
  /** Человекочитаемая подпись в выпадающем списке. */
  label: string;
};

export const workflowDocumentMimePresets: readonly WorkflowDocumentMimePreset[] = [
  { value: "application/pdf", label: "PDF (.pdf)" },
  {
    value: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    label: "Word (.docx)",
  },
  { value: "application/msword", label: "Word 97–2003 (.doc)" },
  { value: "application/rtf", label: "RTF (.rtf)" },
  { value: "text/plain", label: "Текст (.txt)" },
  { value: "text/csv", label: "CSV (.csv)" },
  { value: "text/tab-separated-values", label: "TSV (.tsv)" },
  { value: "application/json", label: "JSON (.json)" },
] as const;

const presetByValue = new Map(workflowDocumentMimePresets.map((preset) => [preset.value, preset]));

/** Подпись пресета по MIME-значению; для нестандартного значения возвращает само значение. */
export function getWorkflowDocumentMimeLabel(value: string): string {
  return presetByValue.get(value)?.label ?? value;
}

/** true, если MIME-значение есть в курируемом списке (иначе это «свой» кастомный тип). */
export function isKnownWorkflowDocumentMime(value: string): boolean {
  return presetByValue.has(value);
}
