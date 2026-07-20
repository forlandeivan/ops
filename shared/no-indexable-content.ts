export const NO_INDEXABLE_CONTENT_CODE = "NO_INDEXABLE_CONTENT" as const;

export const NO_INDEXABLE_CONTENT_REASON_CODE = "no_indexable_content" as const;
export const TEXT_EXTRACTION_FAILED_REASON_CODE = "text_extraction_failed" as const;

export const KNOWLEDGE_DOCUMENT_NO_INDEXABLE_CONTENT_MESSAGE =
  "Документ не содержит индексируемого текста";

export type NoIndexableContentResponse = {
  status: "skipped";
  skipped: true;
  code: typeof NO_INDEXABLE_CONTENT_CODE;
  reason: string;
  totalChunks: 0;
};

export function buildNoIndexableContentResponse(
  reason = KNOWLEDGE_DOCUMENT_NO_INDEXABLE_CONTENT_MESSAGE,
): NoIndexableContentResponse {
  return {
    status: "skipped",
    skipped: true,
    code: NO_INDEXABLE_CONTENT_CODE,
    reason,
    totalChunks: 0,
  };
}

export function isNoIndexableContentCode(value: unknown): value is typeof NO_INDEXABLE_CONTENT_CODE {
  return value === NO_INDEXABLE_CONTENT_CODE;
}
