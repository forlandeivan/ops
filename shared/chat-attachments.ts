export const MAX_FILES_PER_MESSAGE = 25;
export const MAX_FILE_SIZE_MB = 20;
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
export const MAX_TRANSCRIBABLE_MEDIA_FILE_SIZE_MB = 200;
export const MAX_TRANSCRIBABLE_MEDIA_FILE_SIZE_BYTES = MAX_TRANSCRIBABLE_MEDIA_FILE_SIZE_MB * 1024 * 1024;

// Aggregate cap for regular (image/document) attachments within one message.
// Media (audio/video) is bounded per-file by MAX_TRANSCRIBABLE_MEDIA_FILE_SIZE_*,
// not summed: media uploads independently per file with no per-message grouping.
export const MAX_REGULAR_ATTACHMENTS_TOTAL_MB = 20;
export const MAX_REGULAR_ATTACHMENTS_TOTAL_BYTES = MAX_REGULAR_ATTACHMENTS_TOTAL_MB * 1024 * 1024;

export type ChatAttachmentKind = "image" | "document" | "audio" | "video";

export const CHAT_IMAGE_EXTENSIONS = [
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".bmp",
  ".svg",
] as const;
export const CHAT_IMAGE_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/gif",
  "image/webp",
  "image/bmp",
  "image/svg+xml",
] as const;
export const CHAT_IMAGE_OCR_EXTENSIONS = [
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".bmp",
] as const;
export const CHAT_IMAGE_OCR_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/bmp",
] as const;

export const CHAT_SPREADSHEET_EXTENSIONS = [".xlsx"] as const;
export const CHAT_SPREADSHEET_MIME_TYPES = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
] as const;
export const CHAT_STRUCTURED_DATA_EXTENSIONS = [
  ".json",
  ".jsonl",
  ".geojson",
  ".csv",
  ".tsv",
  ".track",
] as const;
export const CHAT_STRUCTURED_DATA_MIME_TYPES = [
  "application/json",
  "application/ld+json",
  "application/geo+json",
  "application/jsonl",
  "application/x-jsonlines",
  "application/x-ndjson",
  "application/ndjson",
  "text/json",
  "text/csv",
  "text/tab-separated-values",
  "text/tsv",
] as const;
export const CHAT_DOCUMENT_EXTENSIONS = [
  ".pdf",
  ".docx",
  ".doc",
  ".rtf",
  ".txt",
  ...CHAT_SPREADSHEET_EXTENSIONS,
  ...CHAT_STRUCTURED_DATA_EXTENSIONS,
] as const;
export const CHAT_DOCUMENT_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/rtf",
  "text/rtf",
  "text/plain",
  ...CHAT_SPREADSHEET_MIME_TYPES,
  ...CHAT_STRUCTURED_DATA_MIME_TYPES,
] as const;

export const ASSISTANT_FILE_EXTENSIONS = CHAT_DOCUMENT_EXTENSIONS;
export const ASSISTANT_FILE_MIME_TYPES = CHAT_DOCUMENT_MIME_TYPES;

export const CHAT_AUDIO_EXTENSIONS = [
  ".mp3",
  ".wav",
  ".wave",
  ".wv",
  ".ogg",
  ".opus",
  ".flac",
  ".aac",
  ".m4a",
  ".wma",
  ".aif",
  ".aiff",
  ".amr",
  ".caf",
] as const;
export const CHAT_AUDIO_MIME_TYPES = [
  "audio/mp3",
  "audio/mpeg",
  "audio/wav",
  "audio/wave",
  "audio/x-wav",
  "audio/wavpack",
  "audio/x-wavpack",
  "audio/ogg",
  "audio/opus",
  "audio/flac",
  "audio/aac",
  "audio/x-aac",
  "audio/mp4",
  "audio/x-m4a",
  "audio/m4a",
  "audio/webm",
  "audio/x-ms-wma",
  "audio/wma",
  "audio/vnd.dlna.adts",
  "audio/aiff",
  "audio/x-aiff",
  "audio/amr",
  "audio/amr-wb",
  "audio/x-caf",
] as const;

export const CHAT_VIDEO_EXTENSIONS = [
  ".mp4",
  ".m4v",
  ".mov",
  ".mkv",
  ".webm",
  ".avi",
  ".flv",
  ".mxf",
  ".asf",
  ".wmv",
  ".ogv",
  ".3gp",
  ".3g2",
  ".ts",
  ".m2ts",
] as const;
export const CHAT_VIDEO_MIME_TYPES = [
  "video/mp4",
  "video/x-m4v",
  "video/quicktime",
  "video/x-matroska",
  "video/webm",
  "video/x-msvideo",
  "video/x-flv",
  "application/mxf",
  "video/mxf",
  "video/x-ms-asf",
  "video/x-ms-wmv",
  "video/ogg",
  "video/3gpp",
  "video/3gpp2",
  "video/mp2t",
] as const;

export type ChatAttachmentValidationInput = {
  name: string;
  mimeType?: string | null;
  sizeBytes: number;
};

export type ChatAttachmentValidationResult =
  | { valid: true; kind: ChatAttachmentKind }
  | { valid: false; errorCode: "too_large" | "unsupported_type"; message: string };

export function getAttachmentExtension(name: string): string {
  const lastDot = name.lastIndexOf(".");
  if (lastDot < 0) {
    return "";
  }
  return name.slice(lastDot).toLowerCase();
}

function includesIgnoreCase(items: readonly string[], value: string): boolean {
  const needle = value.toLowerCase();
  return items.some((item) => item.toLowerCase() === needle);
}

export function isTranscribableChatAttachmentKind(
  kind: ChatAttachmentKind | null | undefined,
): kind is "audio" | "video" {
  return kind === "audio" || kind === "video";
}

export function isRegularChatAttachmentKind(
  kind: ChatAttachmentKind | null | undefined,
): kind is "image" | "document" {
  return kind === "image" || kind === "document";
}

export function getChatAttachmentMaxSizeBytes(kind: ChatAttachmentKind): number {
  return isTranscribableChatAttachmentKind(kind)
    ? MAX_TRANSCRIBABLE_MEDIA_FILE_SIZE_BYTES
    : MAX_FILE_SIZE_BYTES;
}

export function getChatAttachmentMaxSizeMb(kind: ChatAttachmentKind): number {
  return isTranscribableChatAttachmentKind(kind)
    ? MAX_TRANSCRIBABLE_MEDIA_FILE_SIZE_MB
    : MAX_FILE_SIZE_MB;
}

export function resolveChatAttachmentKind(input: {
  name: string;
  mimeType?: string | null;
}): ChatAttachmentKind | null {
  const ext = getAttachmentExtension(input.name);
  const mimeType = (input.mimeType ?? "").toLowerCase();

  if (ext && includesIgnoreCase(CHAT_IMAGE_EXTENSIONS, ext)) {
    return "image";
  }
  if (mimeType && includesIgnoreCase(CHAT_IMAGE_MIME_TYPES, mimeType)) {
    return "image";
  }

  if (ext && includesIgnoreCase(CHAT_DOCUMENT_EXTENSIONS, ext)) {
    return "document";
  }
  if (mimeType && includesIgnoreCase(CHAT_DOCUMENT_MIME_TYPES, mimeType)) {
    return "document";
  }

  if (mimeType && includesIgnoreCase(CHAT_AUDIO_MIME_TYPES, mimeType)) {
    return "audio";
  }
  if (mimeType && includesIgnoreCase(CHAT_VIDEO_MIME_TYPES, mimeType)) {
    return "video";
  }
  if (ext && includesIgnoreCase(CHAT_AUDIO_EXTENSIONS, ext)) {
    return "audio";
  }
  if (ext && includesIgnoreCase(CHAT_VIDEO_EXTENSIONS, ext)) {
    return "video";
  }

  return null;
}

export function isChatImageOcrEligible(input: {
  name: string;
  mimeType?: string | null;
}): boolean {
  const ext = getAttachmentExtension(input.name);
  const mimeType = (input.mimeType ?? "").toLowerCase();

  if (ext && includesIgnoreCase(CHAT_IMAGE_OCR_EXTENSIONS, ext)) {
    return true;
  }
  if (mimeType && includesIgnoreCase(CHAT_IMAGE_OCR_MIME_TYPES, mimeType)) {
    return true;
  }

  return false;
}

export function isChatPdfAttachment(input: {
  name: string;
  mimeType?: string | null;
}): boolean {
  const ext = getAttachmentExtension(input.name);
  const mimeType = (input.mimeType ?? "").toLowerCase();

  return ext === ".pdf" || mimeType === "application/pdf";
}

export function isSpreadsheetAttachment(input: {
  name: string;
  mimeType?: string | null;
}): boolean {
  const ext = getAttachmentExtension(input.name);
  const mimeType = (input.mimeType ?? "").toLowerCase();

  if (ext && includesIgnoreCase(CHAT_SPREADSHEET_EXTENSIONS, ext)) {
    return true;
  }
  if (mimeType && includesIgnoreCase(CHAT_SPREADSHEET_MIME_TYPES, mimeType)) {
    return true;
  }

  return false;
}

export function isStructuredDataAttachment(input: {
  name: string;
  mimeType?: string | null;
}): boolean {
  const ext = getAttachmentExtension(input.name);
  const mimeType = (input.mimeType ?? "").toLowerCase();

  if (ext && includesIgnoreCase(CHAT_STRUCTURED_DATA_EXTENSIONS, ext)) {
    return true;
  }
  if (mimeType && includesIgnoreCase(CHAT_STRUCTURED_DATA_MIME_TYPES, mimeType)) {
    return true;
  }

  return false;
}

export function validateChatAttachment(input: ChatAttachmentValidationInput): ChatAttachmentValidationResult {
  const kind = resolveChatAttachmentKind({
    name: input.name,
    mimeType: input.mimeType ?? null,
  });
  if (!kind) {
    return {
      valid: false,
      errorCode: "unsupported_type",
      message: "Тип файла не поддерживается.",
    };
  }

  const maxSizeBytes = getChatAttachmentMaxSizeBytes(kind);
  if (input.sizeBytes > maxSizeBytes) {
    return {
      valid: false,
      errorCode: "too_large",
      message: `Файл слишком большой. Максимум ${getChatAttachmentMaxSizeMb(kind)} MB.`,
    };
  }

  return {
    valid: true,
    kind,
  };
}
