export const FEEDBACK_ATTACHMENT_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
] as const;

export const FEEDBACK_ATTACHMENT_MAX_SIZE_MB = 8;
export const FEEDBACK_ATTACHMENT_MAX_SIZE_BYTES = FEEDBACK_ATTACHMENT_MAX_SIZE_MB * 1024 * 1024;
export const FEEDBACK_ATTACHMENT_MAX_COUNT = 5;

export type FeedbackAttachmentValidationInput = {
  mimeType?: string | null;
  sizeBytes: number;
};

export type FeedbackAttachmentValidationResult =
  | { valid: true }
  | { valid: false; errorCode: "too_large" | "unsupported_type"; message: string };

function normalizeMimeType(mimeType?: string | null): string {
  return typeof mimeType === "string" ? mimeType.trim().toLowerCase() : "";
}

export function isFeedbackAttachmentMimeAllowed(mimeType?: string | null): boolean {
  const normalized = normalizeMimeType(mimeType);
  return (FEEDBACK_ATTACHMENT_MIME_TYPES as readonly string[]).includes(normalized);
}

export function validateFeedbackAttachment(
  input: FeedbackAttachmentValidationInput,
): FeedbackAttachmentValidationResult {
  if (!isFeedbackAttachmentMimeAllowed(input.mimeType)) {
    return {
      valid: false,
      errorCode: "unsupported_type",
      message: "Поддерживаются только изображения PNG, JPEG, WEBP или GIF.",
    };
  }

  if (input.sizeBytes > FEEDBACK_ATTACHMENT_MAX_SIZE_BYTES) {
    return {
      valid: false,
      errorCode: "too_large",
      message: `Файл слишком большой. Максимум ${FEEDBACK_ATTACHMENT_MAX_SIZE_MB} MB.`,
    };
  }

  return { valid: true };
}
