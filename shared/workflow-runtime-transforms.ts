/**
 * @shared чистые синхронные трансформы, общие для монолита и вынесенного workflow-рантайма (WD4.2c,
 * gateway-contract.md v1 §«Направление 2»). Не имеют доменных/I-O зависимостей — только @shared-типы;
 * поэтому биндятся ЛОКАЛЬНО по обе стороны HTTP-шва (сетевой round-trip для sync-контракта невозможен).
 * Монолит реэкспортирует их из прежних мест (strangler); wire обеих ролей зовёт напрямую.
 */

import type {
  ResolvedAgentOverloadConfig,
  ResolvedAgentResilienceConfig,
} from "@shared/workflow-runtime-config-types";

/** server/agent-runtime/agent-overload-config.ts — per-реплика override лимитов ёмкости рантайма агента. */
export function buildRuntimeCapacityOverride(
  cfg: ResolvedAgentOverloadConfig,
): { maxConcurrentRuns?: number; maxConcurrentCodeExec?: number; retryAfterSec: number } {
  return {
    ...(cfg.maxConcurrentRuns != null ? { maxConcurrentRuns: cfg.maxConcurrentRuns } : {}),
    ...(cfg.maxConcurrentCodeExec != null ? { maxConcurrentCodeExec: cfg.maxConcurrentCodeExec } : {}),
    retryAfterSec: cfg.capacityRetryAfterSec,
  };
}

/** server/agent-runtime/agent-resilience-config.ts — override бюджетов устойчивости прогона агента. */
export function buildRuntimeResilienceOverride(cfg: ResolvedAgentResilienceConfig): {
  guardRetryMaxPerRun: number;
  guardRetryMinRemainingSec: number;
  deadlineSafetyMarginSec: number;
  roundMinRemainingSec: number;
  retryEchoMaxChars: number;
} {
  return {
    guardRetryMaxPerRun: cfg.guardRetryMaxPerRun,
    guardRetryMinRemainingSec: cfg.guardRetryMinRemainingSec,
    deadlineSafetyMarginSec: cfg.deadlineSafetyMarginSec,
    roundMinRemainingSec: cfg.roundMinRemainingSec,
    retryEchoMaxChars: cfg.retryEchoMaxChars,
  };
}

// Дубль малого чистого парсера ссылок БЗ (в монолите остаётся своя копия для collectKnowledgeBaseIdRefs;
// расхождение маловероятно — формат ссылки /knowledge/<id> стабилен).
const CANONICAL_UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function extractBaseIdFromKnowledgeRef(ref: string): string | null {
  const markerIndex = ref.toLowerCase().lastIndexOf("/knowledge/");
  if (markerIndex < 0) {
    return null;
  }
  const segments = ref
    .slice(markerIndex + "/knowledge/".length)
    .replace(/[.,;:!?'"»\]]+$/u, "")
    .split("/")
    .filter((segment) => segment.length > 0);
  const rawSegment = segments[0]?.toLowerCase() === "bases" ? segments[1] : segments[0];
  if (!rawSegment) {
    return null;
  }
  let decoded = rawSegment;
  try {
    decoded = decodeURIComponent(rawSegment);
  } catch {
    // Битые percent-последовательности оставляем как есть — ниже отфильтрует ACL/БД.
  }
  const uuidMatch = decoded.match(CANONICAL_UUID_PATTERN);
  const candidate = (uuidMatch ? uuidMatch[0].toLowerCase() : decoded).trim();
  return candidate.length > 0 ? candidate : null;
}

/** server/agent-runtime/knowledge-prefetch.ts — baseId из структурных context-ref'ов (тип knowledge_base). */
export function collectKnowledgeBaseIdsFromContextRefs(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const ref = item as { type?: unknown; id?: unknown; href?: unknown };
    if (ref.type !== "knowledge_base") {
      continue;
    }
    const direct = typeof ref.id === "string" ? ref.id.trim() : "";
    const fromHref =
      !direct && typeof ref.href === "string" ? extractBaseIdFromKnowledgeRef(ref.href) ?? "" : "";
    const baseId = direct || fromHref;
    if (!baseId || seen.has(baseId.toLowerCase())) {
      continue;
    }
    seen.add(baseId.toLowerCase());
    ordered.push(baseId);
  }
  return ordered;
}
