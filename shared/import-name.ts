const FILE_EXTENSION_PATTERN = /\.[^./\\]+$/u;
const NAME_SEPARATOR_PATTERN = /[_-]+/gu;
const WHITESPACE_PATTERN = /\s+/gu;
const GENERIC_URL_SEGMENTS = new Set(["index", "default", "home", "readme"]);

function capitalizeFirst(value: string): string {
  if (!value) {
    return value;
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}

function collapseWhitespace(value: string): string {
  return value.replace(NAME_SEPARATOR_PATTERN, " ").replace(WHITESPACE_PATTERN, " ").trim();
}

function safeDecodeUriComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function getLastPathSegment(value: string): string {
  const normalized = value.trim().replace(/\\+/gu, "/");
  const segments = normalized.split("/").filter(Boolean);
  return segments[segments.length - 1] ?? normalized;
}

function normalizeImportedNameFromFilename(filename: string, fallback: string): string {
  const fileName = getLastPathSegment(filename);
  const baseName = fileName.replace(FILE_EXTENSION_PATTERN, "");
  const cleaned = collapseWhitespace(baseName);

  if (!cleaned) {
    return fallback;
  }

  return capitalizeFirst(cleaned);
}

export function normalizeDocumentTitleFromFilename(filename: string): string {
  return normalizeImportedNameFromFilename(filename, "Новый документ");
}

export function normalizeKnowledgeBaseNameFromFilename(filename: string): string {
  return normalizeImportedNameFromFilename(filename, "Новая база знаний");
}

export function normalizeKnowledgeBaseNameFromUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return "Новая база знаний";
  }

  try {
    const url = new URL(trimmed);
    const host = url.hostname.replace(/^www\./iu, "").trim();
    const pathSegments = url.pathname
      .split("/")
      .map((segment) => safeDecodeUriComponent(segment).trim())
      .filter(Boolean);
    const lastSegment = pathSegments[pathSegments.length - 1] ?? "";
    const previousSegment = pathSegments[pathSegments.length - 2] ?? "";
    const normalizedSegment = lastSegment
      ? normalizeImportedNameFromFilename(lastSegment, "")
      : "";
    const segmentLower = normalizedSegment.toLowerCase();
    const preferredSegment =
      GENERIC_URL_SEGMENTS.has(segmentLower) && previousSegment
        ? normalizeImportedNameFromFilename(previousSegment, "")
        : normalizedSegment;

    if (host && preferredSegment) {
      return `${host} ${preferredSegment}`;
    }

    if (host) {
      return host;
    }
  } catch {
    // Fall through to filename-like normalization for malformed URLs.
  }

  return normalizeKnowledgeBaseNameFromFilename(trimmed);
}
