export const REASONING_PROGRESS_MAX_ITEMS = 8;
export const REASONING_PROGRESS_FRAGMENT_MAX_CHARS = 200;
export const REASONING_STREAM_FALLBACK_TARGET_CHARS = 96;
export const REASONING_RAW_TEXT_MAX_CHARS = 32_000;

export const reasoningSystemStages = ["thinking", "retrieving", "answering", "done"] as const;

export type ReasoningSystemStage = (typeof reasoningSystemStages)[number];
export type ReasoningProgressItemStatus = "active" | "completed";

export type ReasoningProgressItem = {
  id: string;
  kind: "status" | "reasoning";
  status: ReasoningProgressItemStatus;
  stage?: ReasoningSystemStage;
  text?: string;
};

export type ReasoningProgressEvent =
  | { type: "status"; stage: ReasoningSystemStage }
  | { type: "reasoning"; text: string };

export type ReasoningProgressSnapshot = {
  text: string;
  items: ReasoningProgressItem[];
  truncated: boolean;
};

const SENTENCE_END_RE = /[.!?…][\]})»”"']*$/u;

export function isReasoningSystemStage(value: unknown): value is ReasoningSystemStage {
  return typeof value === "string" && (reasoningSystemStages as readonly string[]).includes(value);
}

export function normalizeReasoningFragment(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function splitLongFragment(value: string): string[] {
  const normalized = normalizeReasoningFragment(value);
  if (normalized.length <= REASONING_PROGRESS_FRAGMENT_MAX_CHARS) {
    return normalized ? [normalized] : [];
  }

  const chunks: string[] = [];
  let remaining = normalized;
  while (remaining.length > REASONING_PROGRESS_FRAGMENT_MAX_CHARS) {
    const candidate = remaining.slice(0, REASONING_PROGRESS_FRAGMENT_MAX_CHARS + 1);
    const lastSpace = candidate.lastIndexOf(" ");
    const boundary = lastSpace >= Math.floor(REASONING_PROGRESS_FRAGMENT_MAX_CHARS * 0.6)
      ? lastSpace
      : REASONING_PROGRESS_FRAGMENT_MAX_CHARS;
    chunks.push(remaining.slice(0, boundary).trim());
    remaining = remaining.slice(boundary).trimStart();
  }
  if (remaining) {
    chunks.push(remaining);
  }
  return chunks;
}

export function splitReasoningText(value: string): string[] {
  const paragraphs = value.replace(/\r\n?/gu, "\n").split(/\n\s*\n/gu);
  const fragments: string[] = [];

  for (const paragraph of paragraphs) {
    const normalized = normalizeReasoningFragment(paragraph);
    if (!normalized) continue;

    const sentences = normalized.match(/[^.!?…]+(?:[.!?…]+[\]})»”"']*)?|[.!?…]+/gu) ?? [normalized];
    for (const sentence of sentences) {
      const cleaned = normalizeReasoningFragment(sentence);
      if (!cleaned) continue;
      if (SENTENCE_END_RE.test(cleaned)) {
        fragments.push(cleaned);
      } else {
        fragments.push(...splitLongFragment(cleaned));
      }
    }
  }

  return fragments;
}

function splitBufferedStreamingTail(value: string): string[] {
  const chunks: string[] = [];
  let remaining = normalizeReasoningFragment(value);
  const minimumWordBoundary = Math.floor(REASONING_STREAM_FALLBACK_TARGET_CHARS * 0.6);

  while (remaining.length >= REASONING_STREAM_FALLBACK_TARGET_CHARS) {
    const candidate = remaining.slice(0, REASONING_STREAM_FALLBACK_TARGET_CHARS + 1);
    const lastSpace = candidate.lastIndexOf(" ");
    if (lastSpace < minimumWordBoundary) break;
    const boundary = lastSpace;
    const chunk = remaining.slice(0, boundary).trim();
    if (chunk) chunks.push(chunk);
    remaining = remaining.slice(boundary).trimStart();
  }

  return chunks;
}

function splitStreamingReasoningText(value: string): string[] {
  const normalizedLines = value.replace(/\r\n?/gu, "\n").split("\n");
  const fragments: string[] = [];

  for (const [lineIndex, line] of normalizedLines.entries()) {
    const lineFragments = splitReasoningText(line);
    const isClosedLine = lineIndex < normalizedLines.length - 1;
    if (isClosedLine) {
      fragments.push(...lineFragments);
      continue;
    }

    const trailingFragments: string[] = [];
    for (const fragment of lineFragments) {
      if (trailingFragments.length > 0 || !SENTENCE_END_RE.test(fragment)) {
        trailingFragments.push(fragment);
      } else {
        fragments.push(fragment);
      }
    }
    fragments.push(...splitBufferedStreamingTail(trailingFragments.join(" ")));
  }

  return fragments;
}

function truncateRawText(value: string): { text: string; truncated: boolean } {
  const normalized = value.replace(/\r\n?/gu, "\n").trim();
  return {
    text: normalized.slice(0, REASONING_RAW_TEXT_MAX_CHARS),
    truncated: normalized.length > REASONING_RAW_TEXT_MAX_CHARS,
  };
}

function capReasoningEvents(events: readonly ReasoningProgressEvent[]): ReasoningProgressEvent[] {
  let remaining = REASONING_RAW_TEXT_MAX_CHARS;
  const result: ReasoningProgressEvent[] = [];

  for (const event of events) {
    if (event.type === "status") {
      result.push(event);
      continue;
    }
    if (remaining <= 0 || !event.text) continue;
    const text = event.text.slice(0, remaining);
    remaining -= text.length;
    if (text) result.push({ type: "reasoning", text });
  }

  return result;
}

function replaceReasoningEvents(
  events: readonly ReasoningProgressEvent[],
  rawText: string,
): ReasoningProgressEvent[] {
  const statuses = events.filter((event): event is Extract<ReasoningProgressEvent, { type: "status" }> => event.type === "status");
  const doneIndex = statuses.findIndex((event) => event.stage === "done");
  const insertionIndex = doneIndex < 0 ? statuses.length : doneIndex;
  return [
    ...statuses.slice(0, insertionIndex),
    ...(rawText ? [{ type: "reasoning" as const, text: rawText }] : []),
    ...statuses.slice(insertionIndex),
  ];
}

export function buildReasoningProgressSnapshot({
  text,
  events = [],
  streaming = false,
}: {
  text?: string | null;
  events?: readonly ReasoningProgressEvent[];
  streaming?: boolean;
}): ReasoningProgressSnapshot {
  const eventRawText = events
    .filter((event): event is Extract<ReasoningProgressEvent, { type: "reasoning" }> => event.type === "reasoning")
    .map((event) => event.text)
    .join("");
  const raw = truncateRawText(typeof text === "string" ? text : eventRawText);
  const cappedEventRawText = truncateRawText(eventRawText).text;
  const sourceEvents = capReasoningEvents(
    raw.text !== cappedEventRawText ? replaceReasoningEvents(events, raw.text) : events,
  );

  const items: ReasoningProgressItem[] = [];
  const seenFragments = new Set<string>();
  let reasoningBuffer = "";
  let itemIndex = 0;

  const completeActiveItems = () => {
    items.forEach((item) => {
      if (item.status === "active") item.status = "completed";
    });
  };
  const flushReasoningBuffer = (active: boolean) => {
    const fragments = streaming
      ? splitStreamingReasoningText(reasoningBuffer)
      : splitReasoningText(reasoningBuffer);
    reasoningBuffer = "";
    if (fragments.length > 0) completeActiveItems();
    for (const [fragmentIndex, fragment] of fragments.entries()) {
      if (seenFragments.has(fragment)) continue;
      seenFragments.add(fragment);
      items.push({
        id: `reasoning-${itemIndex++}`,
        kind: "reasoning",
        status: active && fragmentIndex === fragments.length - 1 ? "active" : "completed",
        text: fragment,
      });
    }
  };

  for (const event of sourceEvents) {
    if (event.type === "reasoning") {
      reasoningBuffer += event.text;
      continue;
    }

    flushReasoningBuffer(false);
    completeActiveItems();
    if (items.some((item) => item.kind === "status" && item.stage === event.stage)) continue;
    items.push({
      id: `status-${event.stage}`,
      kind: "status",
      stage: event.stage,
      status: event.stage === "done" ? "completed" : "active",
    });
  }

  flushReasoningBuffer(streaming);
  if (!streaming) completeActiveItems();
  if (streaming && items.length > 0 && items.every((item) => item.status !== "active")) {
    const lastItem = items.at(-1);
    if (lastItem?.stage !== "done") lastItem!.status = "active";
  }

  return {
    text: raw.text,
    items: items.slice(-REASONING_PROGRESS_MAX_ITEMS),
    truncated: raw.truncated,
  };
}
