export type DocumentVectorizationCollectionBase = {
  id?: string | null;
  name?: string | null;
} | null | undefined;

export type DocumentVectorizationCollectionProvider = {
  id: string;
  name?: string | null;
};

export function sanitizeQdrantCollectionNameSegment(source: string): string {
  const normalized = source.replace(/[^a-zA-Z0-9_-]/g, "").toLowerCase();
  return normalized.length > 0 ? normalized.slice(0, 60) : "default";
}

export function buildKnowledgeBaseCollectionName(baseId: string, workspaceId: string): string {
  return `kb_${sanitizeQdrantCollectionNameSegment(baseId)}_ws_${sanitizeQdrantCollectionNameSegment(workspaceId)}`;
}

/**
 * Detects Qdrant collections that store knowledge base vectors and therefore must
 * always be queried/deleted with a server-side tenant isolation filter:
 * - legacy per-KB collections `kb_<base>_ws_<ws>` (and `kb_arena_...`);
 * - Strategy B per-workspace collections `ws_<ws>__proj_kb__coll_<provider>_d<dim>`.
 *
 * NB: the older heuristic `includes("__kb__")` did NOT match the Strategy B name
 * (`...__proj_kb__coll_...`), which silently disabled KB isolation on B collections.
 * Deliberately excludes non-KB workspace collections (e.g. `__proj_assistant_files__`).
 */
export function isKnowledgeBaseCollectionName(collectionName: string): boolean {
  const normalized = collectionName.trim().toLowerCase();
  return normalized.startsWith("kb_") || normalized.includes("__proj_kb__");
}

export function buildKnowledgeBaseWorkspaceCollectionName(
  workspaceId: string,
  providerId: string,
  vectorSize: number,
): string {
  if (!Number.isFinite(vectorSize) || vectorSize <= 0) {
    throw new Error("Qdrant KB workspace collection vectorSize must be a positive number");
  }

  return buildWorkspaceScopedCollectionName(
    workspaceId,
    "kb",
    `${providerId}_d${Math.trunc(vectorSize)}`,
  );
}

export function buildWorkspaceScopedCollectionName(
  workspaceId: string,
  projectId: string,
  collectionId: string,
): string {
  const workspaceSlug = sanitizeQdrantCollectionNameSegment(workspaceId);
  const projectSlug = sanitizeQdrantCollectionNameSegment(projectId);
  const collectionSlug = sanitizeQdrantCollectionNameSegment(collectionId);
  return `ws_${workspaceSlug}__proj_${projectSlug}__coll_${collectionSlug}`;
}

export function buildAssistantFileCollectionName(
  workspaceId: string,
  providerId: string | null | undefined,
): string {
  return buildWorkspaceScopedCollectionName(workspaceId, "assistant_files", providerId || "assistant_files");
}

export function buildKnowledgeArenaCollectionName(
  baseId: string,
  workspaceId: string,
  runId: string,
): string {
  return `kb_arena_${sanitizeQdrantCollectionNameSegment(baseId)}_${sanitizeQdrantCollectionNameSegment(workspaceId)}_${sanitizeQdrantCollectionNameSegment(runId)}`;
}

export function buildDocumentVectorizationCollectionName(
  base: DocumentVectorizationCollectionBase,
  provider: DocumentVectorizationCollectionProvider,
  workspaceId: string,
): string {
  if (base?.id) {
    return `kb-${base.id}`;
  }
  return `ws-${workspaceId}-emb-${provider.id}`;
}

/**
 * Префиксы коллекций, которыми владеет Unica. Только их рассматривают GC и admin-инвентарь
 * как кандидатов в сироты — имена вне этих семейств (созданные вручную/внешними системами)
 * сиротами не считаются и никогда не помечаются к удалению. `kb_arena_*` покрывается `kb_`.
 * См. конструкторы имён выше: buildKnowledgeBaseCollectionName / buildWorkspaceScopedCollectionName /
 * buildAssistantFileCollectionName / buildKnowledgeArenaCollectionName.
 */
export const MANAGED_COLLECTION_PREFIXES = ["kb_", "ws_"] as const;

export function isManagedCollectionName(name: string): boolean {
  return MANAGED_COLLECTION_PREFIXES.some((prefix) => name.startsWith(prefix));
}

/**
 * Чистое ядро детекции сирот: из имён коллекций Qdrant оставляем только управляемые
 * (по префиксу) и отсутствующие в ожидаемом (владеемом) наборе. Коллекции вне наших
 * семейств имён игнорируются, живые (в expected) — не сироты.
 */
export function computeOrphans(existing: string[], expected: Set<string>): string[] {
  return existing
    .map((name) => name.trim())
    .filter((name) => name.length > 0 && isManagedCollectionName(name) && !expected.has(name));
}
