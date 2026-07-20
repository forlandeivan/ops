// W2/S4-семейство (docs/w2-workflow-packaging-plan.md): чистый детерминированный трансформ грундинга
// источников агента. Вынесен из server/agent-runtime/source-grounding.ts в @unica/runtime-utils, чтобы
// workflow-runtime мог биндить его ЛОКАЛЬНО (sync-контракт порта WorkflowGateway.agent —
// buildAgentSourceGroundingContext; WD4.2c-3). Замыкание тянет только соседний deterministic-grounding-flag
// (тот же пакет) — 0 импортов server/**/@shared, граница пакета чиста. Функции source-grounding.ts,
// зависящие от agent-capability-catalog (resolveMandatorySourceGroundingGroups и др.), остаются в монолите.
import { isDeterministicGroundingEnabled } from "./deterministic-grounding-flag";

export type AgentSourceFamily = "attachments" | "chat_tabs" | "knowledge";

export type AgentSourceGroundingContract = {
  requiresGrounding: boolean;
  requiredSourceFamilies: AgentSourceFamily[];
  availableSourceFamilies: AgentSourceFamily[];
  comparisonRequested: boolean;
  inlineSourceBodiesAvailable: boolean;
  // Волна 2 (prefetch БЗ): Node детерминированно собрал ПОЛНЫЕ тела документов привязанной базы
  // знаний в context.inlineKnowledgeDocuments. Флаг значит «собрано на Node», а не «выжило в промпте» —
  // страховочный бюджет-гейт реплики может дропнуть тела уже на Python-стороне.
  inlineKnowledgeDocumentsAvailable: boolean;
  sourceInventorySummary: string[];
};

// Итог prefetch привязанной БЗ (см. server/agent-runtime/knowledge-prefetch.ts). Тип структурный и
// намеренно минимальный, чтобы source-grounding не импортировал knowledge-prefetch (иначе цикл:
// knowledge-prefetch переиспользует KNOWLEDGE_REFERENCE_PATTERNS отсюда).
export type AgentSourceGroundingKnowledgePrefetch = {
  status: "inlined" | "toc_only" | "skipped";
  baseIds: string[];
  documents: ReadonlyArray<unknown>;
  inventory: ReadonlyArray<unknown>;
};

export type AgentSourceInventory = {
  attachments: Array<{
    id: string;
    filename: string;
    kind: string;
    hasInlineText: boolean;
    hasTruncatedInlineText: boolean;
    // Задача 6.1: вложение можно прочитать зрением (скан/картинка) через documents.ocr_attachment —
    // картинка ЛИБО документ без извлечённого текста (вероятный скан без текстового слоя).
    canOcr: boolean;
  }>;
  chatTabs: Array<{
    tabId: string;
    title: string;
    sourceType: "transcript" | "canvas_document";
    tabType: "original" | "canvas_document";
    transcriptId: string | null;
  }>;
  knowledgeRefs: string[];
};

type AttachmentLike = {
  id?: unknown;
  filename?: unknown;
  kind?: unknown;
  extractedText?: unknown;
  extractedTextLength?: unknown;
  isTruncated?: unknown;
};

type ChatTabLike = {
  title?: unknown;
  sourceType?: unknown;
  tabType?: unknown;
  tabId?: unknown;
  transcriptId?: unknown;
};

// Экспорт: единый источник истины для распознавания ссылок на БЗ. Переиспользуется prefetch-ом
// (knowledge-prefetch.ts → collectKnowledgeBaseIdRefs), чтобы форматы ссылок не разъехались.
export const KNOWLEDGE_REFERENCE_PATTERNS = [
  /\/knowledge\/[^\s)]+/gi,
  /\/api\/knowledge\/bases\/[^\s)]+/gi,
] as const;

// Экспорт: нормализация текста (lowercase + ё→е). Общий с оставшимися в монолите функциями
// (looksLikeExplicitFileArtifactRequest / resolveMandatorySourceGroundingGroups) — единый источник.
export function normalizeText(value: string): string {
  return value.toLowerCase().replace(/ё/g, "е");
}

function toNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function collectKnowledgeRefs(...texts: string[]): string[] {
  const refs = new Set<string>();
  for (const text of texts) {
    if (!text) {
      continue;
    }
    for (const pattern of KNOWLEDGE_REFERENCE_PATTERNS) {
      const globalPattern = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
      for (const match of text.matchAll(globalPattern)) {
        const value = match[0]?.trim();
        if (value) {
          refs.add(value);
        }
      }
    }
  }
  return Array.from(refs).slice(0, 8);
}

function looksLikeKnowledgeRequest(text: string): boolean {
  if (!text) {
    return false;
  }
  return /\b(база знаний|бз|knowledge(?:\s+base)?|kb)\b/i.test(text)
    || collectKnowledgeRefs(text).length > 0;
}

function looksLikeCompareOrVerifyRequest(text: string): boolean {
  if (!text) {
    return false;
  }
  return /(сравн|сопостав|разниц|отличи|проверь|проверк|валидац|вериф|соответств|учитыва|conflict|consisten|compare|diff|verify)/i.test(text);
}

function normalizeAttachmentInventory(value: unknown): AgentSourceInventory["attachments"] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is AttachmentLike => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    .map((item) => {
      const id = toNonEmptyString(item.id) ?? "";
      const filename = toNonEmptyString(item.filename) ?? "";
      if (!id || !filename) {
        return null;
      }
      const hasExtractedBody =
        typeof item.extractedText === "string" && item.extractedText.trim().length > 0
        || (typeof item.extractedTextLength === "number" && item.extractedTextLength > 0);
      const hasTruncatedInlineText = hasExtractedBody && item.isTruncated === true;
      const kind = toNonEmptyString(item.kind) ?? "document";
      // Кандидат на OCR-чтение зрением: картинка ЛИБО документ без извлечённого текстового слоя (скан).
      const canOcr = kind === "image" || (kind === "document" && !hasExtractedBody);
      return {
        id,
        filename,
        kind,
        hasInlineText: hasExtractedBody && !hasTruncatedInlineText,
        hasTruncatedInlineText,
        canOcr,
      };
    })
    .filter((item): item is AgentSourceInventory["attachments"][number] => Boolean(item));
}

function normalizeChatTabInventory(value: unknown): AgentSourceInventory["chatTabs"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }
  const items = Array.isArray((value as { items?: unknown[] }).items) ? (value as { items: unknown[] }).items : [];
  return items
    .filter((item): item is ChatTabLike => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    .map((item) => {
      const title = toNonEmptyString(item.title) ?? "";
      const tabId = toNonEmptyString(item.tabId) ?? "";
      const sourceType = item.sourceType === "transcript" ? "transcript" : "canvas_document";
      const tabType = item.tabType === "original" ? "original" : "canvas_document";
      if (!title || !tabId) {
        return null;
      }
      return {
        title,
        tabId,
        sourceType,
        tabType,
        transcriptId: toNonEmptyString(item.transcriptId),
      };
    })
    .filter((item): item is AgentSourceInventory["chatTabs"][number] => Boolean(item));
}

export function buildAgentSourceGroundingContext(params: {
  requestText: string;
  recentChatMessages: Array<{ role: string; content: string }>;
  requestPrefersChatTabsOverAttachments: boolean;
  requestMentionsTranscriptOrTab: boolean;
  attachments: unknown;
  chatTabContext: unknown;
  transcriptText: string | null;
  // Волна 2 (prefetch БЗ): итог детерминированного prefetch привязанной базы знаний. status !== "skipped"
  // означает непустой доступный скоуп БЗ — knowledge становится доступным семейством источников даже
  // без текстовых ссылок/интента в запросе (факт привязки БЗ — не эвристика).
  knowledgePrefetch?: AgentSourceGroundingKnowledgePrefetch | null;
}): {
  contract: AgentSourceGroundingContract;
  inventory: AgentSourceInventory;
} {
  const attachments = normalizeAttachmentInventory(params.attachments);
  const chatTabs = normalizeChatTabInventory(params.chatTabContext);
  const recentText = params.recentChatMessages.map((message) => message.content).join("\n");
  const combinedText = [params.requestText, recentText].filter(Boolean).join("\n");
  const normalizedText = normalizeText(combinedText);
  const knowledgeRefs = collectKnowledgeRefs(params.requestText, recentText);

  const knowledgePrefetch = params.knowledgePrefetch ?? null;
  const knowledgePrefetchHasScope = Boolean(knowledgePrefetch && knowledgePrefetch.status !== "skipped");
  const knowledgeIntentInText = looksLikeKnowledgeRequest(normalizedText);

  const availableSourceFamilies = new Set<AgentSourceFamily>();
  if (attachments.length > 0) {
    availableSourceFamilies.add("attachments");
  }
  if (chatTabs.length > 0) {
    availableSourceFamilies.add("chat_tabs");
  }
  if (knowledgeRefs.length > 0 || knowledgeIntentInText || knowledgePrefetchHasScope) {
    availableSourceFamilies.add("knowledge");
  }

  // Жёсткая привязка к источнику — детерминированный guard (НЕ роутинг). Под рубильником: при выключении
  // requiredSourceFamilies остаётся ПУСТЫМ → requiresGrounding=false → грундинг становится советом
  // (availableSourceFamilies/inventory ниже сохраняются, модель видит источники, но не обязана), а
  // обязательные группы и retry-гейт сами обнуляются (оба ключуются по requiresGrounding).
  const requiredSourceFamilies = new Set<AgentSourceFamily>();
  if (isDeterministicGroundingEnabled()) {
    if (params.requestPrefersChatTabsOverAttachments && chatTabs.length > 0) {
      requiredSourceFamilies.add("chat_tabs");
    } else if (attachments.length > 0) {
      requiredSourceFamilies.add("attachments");
    } else if (params.requestMentionsTranscriptOrTab && chatTabs.length > 0) {
      requiredSourceFamilies.add("chat_tabs");
    }
    if (knowledgeRefs.length > 0 || knowledgeIntentInText) {
      requiredSourceFamilies.add("knowledge");
    }
  }

  const comparisonRequested = looksLikeCompareOrVerifyRequest(normalizedText);
  const inlineSourceBodiesAvailable = Boolean(
    (typeof params.transcriptText === "string" && params.transcriptText.trim().length > 0)
    || attachments.some((attachment) => attachment.hasInlineText),
  );
  const hasTruncatedInlineSourceBodies = attachments.some((attachment) => attachment.hasTruncatedInlineText);
  // «Собрано на Node»: полные тела документов БЗ действительно едут в context.inlineKnowledgeDocuments.
  const inlineKnowledgeDocumentsAvailable = Boolean(
    knowledgePrefetch && knowledgePrefetch.status === "inlined" && knowledgePrefetch.documents.length > 0,
  );

  const sourceInventorySummary: string[] = [];
  if (attachments.length > 0) {
    sourceInventorySummary.push(`attachments=${attachments.length}`);
  }
  if (chatTabs.length > 0) {
    sourceInventorySummary.push(`chat_tabs=${chatTabs.length}`);
  }
  if (knowledgeRefs.length > 0) {
    sourceInventorySummary.push(`knowledge_refs=${knowledgeRefs.length}`);
  } else if (knowledgeIntentInText) {
    sourceInventorySummary.push("knowledge_refs=intent");
  }
  if (knowledgePrefetch && (knowledgePrefetch.status === "inlined" || knowledgePrefetch.status === "toc_only")) {
    sourceInventorySummary.push(`knowledge_docs=${knowledgePrefetch.inventory.length}/${knowledgePrefetch.status}`);
  }
  if (inlineSourceBodiesAvailable) {
    sourceInventorySummary.push("inline_source_bodies=available");
  }
  if (hasTruncatedInlineSourceBodies) {
    sourceInventorySummary.push("inline_source_bodies=truncated");
  }

  return {
    contract: {
      requiresGrounding: requiredSourceFamilies.size > 0,
      requiredSourceFamilies: Array.from(requiredSourceFamilies),
      availableSourceFamilies: Array.from(availableSourceFamilies),
      comparisonRequested,
      inlineSourceBodiesAvailable,
      inlineKnowledgeDocumentsAvailable,
      sourceInventorySummary,
    },
    inventory: {
      attachments: attachments.slice(0, 8),
      chatTabs: chatTabs.slice(0, 8),
      knowledgeRefs,
    },
  };
}
