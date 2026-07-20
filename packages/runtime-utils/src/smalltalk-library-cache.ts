import { getCache } from "@unica/cache";

export const GLOBAL_SMALLTALK_LIBRARY_CACHE_KEY = "workflow:smalltalk:global-library:v1";

export type SmalltalkPhraseIndex = {
  phrases: string[];
  normalizedToOriginal: Record<string, string>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeSmalltalkText(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .trim()
    .toLowerCase()
    .replace(/[\s\u00A0]+/g, " ")
    .replace(/[.!?,;:…]+$/g, "")
    .trim();
}

export function parseSmalltalkPhraseLibrary(value: unknown): string[] {
  if (typeof value !== "string") {
    return [];
  }

  return Array.from(
    new Set(
      value
        .split(/[\r\n]+/)
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0),
    ),
  );
}

export function buildSmalltalkPhraseIndex(phrases: string[]): SmalltalkPhraseIndex {
  const normalizedToOriginal: Record<string, string> = {};
  const deduplicatedPhrases: string[] = [];

  for (const phrase of phrases) {
    const normalizedPhrase = normalizeSmalltalkText(phrase);
    if (!normalizedPhrase || normalizedToOriginal[normalizedPhrase]) {
      continue;
    }

    normalizedToOriginal[normalizedPhrase] = phrase;
    deduplicatedPhrases.push(phrase);
  }

  return {
    phrases: deduplicatedPhrases,
    normalizedToOriginal,
  };
}

function isSmalltalkPhraseIndex(value: unknown): value is SmalltalkPhraseIndex {
  if (!isRecord(value) || !Array.isArray(value.phrases) || !isRecord(value.normalizedToOriginal)) {
    return false;
  }

  return value.phrases.every((entry) => typeof entry === "string") &&
    Object.values(value.normalizedToOriginal).every((entry) => typeof entry === "string");
}

export async function getCachedGlobalSmalltalkPhraseIndex(): Promise<SmalltalkPhraseIndex | null> {
  const cached = await getCache().get<unknown>(GLOBAL_SMALLTALK_LIBRARY_CACHE_KEY);
  if (!isSmalltalkPhraseIndex(cached)) {
    return null;
  }
  return cached;
}

export async function setCachedGlobalSmalltalkPhraseIndexFromValue(value: unknown): Promise<SmalltalkPhraseIndex> {
  const index = buildSmalltalkPhraseIndex(parseSmalltalkPhraseLibrary(value));
  await getCache().set(GLOBAL_SMALLTALK_LIBRARY_CACHE_KEY, index);
  return index;
}
