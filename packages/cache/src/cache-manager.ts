/**
 * Cache Provider Interface
 * 
 * Phase 4.1: Внедрение кэширования (in-memory + Redis опционально)
 * 
 * Unified abstraction for caching that supports both in-memory and Redis backends.
 * Automatically selects the appropriate implementation based on REDIS_URL.
 */

export interface CacheProvider {
  /**
   * Get value from cache by key
   * @param key - Cache key
   * @returns Cached value or null if not found/expired
   */
  get<T>(key: string): Promise<T | null>;

  /**
   * Set value in cache with optional TTL
   * @param key - Cache key
   * @param value - Value to cache (must be serializable)
   * @param ttl - Time to live in milliseconds (optional, defaults to provider default)
   */
  set(key: string, value: unknown, ttl?: number): Promise<void>;

  /**
   * Delete value from cache by key
   * @param key - Cache key
   */
  del(key: string): Promise<void>;

  /** Delete all values whose unprefixed key starts with the provided prefix. */
  delByPrefix?(prefix: string): Promise<void>;

  /**
   * Clear all cached values
   */
  clear(): Promise<void>;

  /**
   * Get cache provider name (for monitoring/logging)
   */
  readonly name: string;
}

/**
 * Cache key builders for common data types
 */
export const cacheKeys = {
  workspaceSettings: (workspaceId: string) => `ws:${workspaceId}:settings`,
  userWorkspaces: (userId: string) => `user:${userId}:workspaces`,
  llmProviders: (workspaceId?: string) => workspaceId ? `llm:providers:ws:${workspaceId}` : `llm:providers:global`,
  modelsCatalog: (opts?: { type?: string; providerId?: string | null; providerType?: string | null }) => {
    const parts = ['models:catalog'];
    if (opts?.type) parts.push(`type:${opts.type}`);
    if (opts?.providerId) parts.push(`pid:${opts.providerId}`);
    if (opts?.providerType) parts.push(`pt:${opts.providerType}`);
    return parts.join(':');
  },
  assistant: (workspaceId: string, assistantId: string) => `assistant:${workspaceId}:${assistantId}`,
  tariffPlanWithLimits: (planId: string) => `tariff:plan:${planId}:with-limits`,
  workspaceTariffPlanId: (workspaceId: string) => `ws:${workspaceId}:tariff-plan-id`,
  corsHostnames: () => `cors:hostnames`,
  maintenanceModeSettings: () => "maintenance:settings",
  workspaceBucketVerified: (workspaceId: string) => `ws:${workspaceId}:bucket-verified`,
  userAvatarBucketVerified: () => `user-avatar:bucket-verified`,
  collectionWorkspace: (collectionName: string) => `collection-workspace:${collectionName}`,
  // OPT-RAG-CTX-CACHE-KEYS / DEDUP-RAG-CONTEXT-CACHE-MEM (тема 02, Волна 1):
  // кэш результатов ретривала на диалог (L1 in-memory + L2 Redis через getCache).
  // Ключ — по chatId (UUID глобально уникален, кросс-workspace коллизий нет); workspaceId
  // хранится внутри значения. Индекс чатов на workspace нужен для cross-instance
  // инвалидации при удалении/правке БЗ (clearKnowledgeBaseContextCache не может
  // сканировать ключи Redis — поддерживаем явный список chatId).
  ragRetrievalContext: (chatId: string) => `rag:ctx:${chatId}`,
  ragRetrievalContextIndex: (workspaceId: string) => `rag:ctx-idx:${workspaceId}`,
  // OPT-RAG-CONFIG-WRITE-ON-READ (Волна 1): редко меняющиеся глобальные конфиг-синглтоны.
  // Авторитет согласованности — явная инвалидация в местах записи (update/activate/setActive*);
  // TTL — только страховочный backstop. Ключи общие для всех инстансов через Redis.
  ragGlobalSettings: () => `rag:global-settings`,
  activeSearchProfile: () => `rag:search-profile:active`,
  activeIndexingProfile: () => `rag:indexing-profile:active`,
  // Точечные lookups горячего пути резолва LLM (списки провайдеров/каталог моделей кэшируются
  // отдельно — llmProviders/modelsCatalog). Каталог моделей версионируется namespace-токеном,
  // т.к. ключ lookup'а зависит от произвольной строки-ссылки (см. model-service).
  llmProvider: (id: string) => `llm:provider:${id}`,
  unicaChatConfig: () => `llm:unica-chat-config`,
  modelsCacheNamespace: () => `models:lookup:ns`,
  modelByRef: (namespace: string | number, ref: string, opts?: { expectedType?: string; providerId?: string | null; requireActive?: boolean }) => {
    const parts = [`models:lookup:${namespace}`, `ref:${ref}`];
    if (opts?.expectedType) parts.push(`t:${opts.expectedType}`);
    if (opts?.providerId) parts.push(`p:${opts.providerId}`);
    if (opts?.requireActive === false) parts.push(`ia:0`);
    return parts.join(":");
  },
  // Реестр глобальных переменных (L2.1): кэш ТОЛЬКО для UI/каталога редактора — рантайм-резолв
  // typed_template читает БД напрямую (workflow-рантайм — отдельный процесс; без Redis
  // per-process MemoryCache делает del-инвалидацию недостижимой, а стейл в рендере документа
  // недопустим). Ключ значений строго per-workspace (изоляция — negative-тест).
  globalVariableDefinitions: (workspaceId?: string | null) =>
    workspaceId ? `gvar:defs:ws:${workspaceId}` : `gvar:defs`,
  workspaceGlobalVariables: (workspaceId: string) => `gvar:ws:${workspaceId}`,
  // W0/B2: cross-instance кэш состояния ASR-операций (L1 in-memory Map + L2 Redis).
  // Ключ по operationId (`unica_<taskId>`, глобально уникален). Значение — сериализованный
  // entry (Date→ISO). PG execution-log остаётся глубоким источником восстановления.
  asrOperation: (operationId: string) => `asr:op:${operationId}`,
  // W0/B3: cross-instance кэш OAuth access-токенов провайдеров LLM/эмбеддингов (L1 Map + L2 Redis).
  // `hash` = sha256 от cacheKey (в cacheKey входит секретный authorizationKey → в имя Redis-ключа
  // кладём ТОЛЬКО хеш, чтобы секрет не светился в KEYS/MONITOR/логах). Значение { token, expiresAt }
  // живёт под TTL = времени жизни токена.
  llmOAuthToken: (hash: string) => `llm:oauth-token:${hash}`,
  // Справочники (reference sets, docs/reference-sets-design.md): авторитет — явная
  // инвалидация при утверждении версии; TTL — страховка. Указатель мал и меняется
  // разы в год; payload версии иммутабелен (кэшируется по versionId «навсегда» — TTL
  // лишь ограничивает память). Инстанс-скоуп: ключ без workspaceId.
  referenceSetActivePointer: (setKey: string) => `refset:active:${setKey}`,
  referenceSetVersionPayload: (versionId: string) => `refset:version:${versionId}`,
  // Промпты (docs/prompt-library-strategy.md): кэшируются СПИСКИ КАНДИДАТОВ стартовых
  // подсказок, а не финальная выборка — ротация 4 слотов делается на каждый запрос поверх
  // кэша. Два ключа: глобальный (instance+system, один на инстанс) и per-workspace;
  // мутация workspace-промптов инвалидирует только свой ключ, админ-мутация — глобальный.
  startPromptsGlobal: () => `prompts:start:global`,
  startPromptsWorkspace: (workspaceId: string) => `prompts:start:ws:${workspaceId}`,
} as const;
