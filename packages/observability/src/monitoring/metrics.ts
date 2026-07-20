/**
 * Prometheus Metrics Module
 * 
 * Provides application-wide metrics for monitoring performance,
 * request patterns, and system health.
 */

import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';

// Create a custom registry
export const register = new Registry();

// Add default Node.js metrics (CPU, memory, event loop, etc.)
collectDefaultMetrics({ register });

// ============================================================================
// HTTP Request Metrics
// ============================================================================

/**
 * Duration of HTTP requests in seconds
 */
export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'] as const,
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

/**
 * Total number of HTTP requests
 */
export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'] as const,
  registers: [register],
});

/**
 * Currently active HTTP connections
 */
export const httpActiveConnections = new Gauge({
  name: 'http_active_connections',
  help: 'Number of active HTTP connections',
  registers: [register],
});

// ============================================================================
// Database Metrics
// ============================================================================

/**
 * Снимок состояния PostgreSQL-слоя для ленивого collect() gauge-метрик.
 * Поставляется из server/instrumentation/db-metrics.ts (инверсия зависимостей:
 * metrics.ts не тянет pg.Pool, а получает провайдер — как у minio_pool_sockets).
 */
export interface DbStatsSnapshot {
  /** pool.totalCount — всего соединений в пуле (idle + active). */
  total: number;
  /** pool.idleCount — простаивающие соединения. */
  idle: number;
  /** total - idle — соединения, выданные потребителям. */
  active: number;
  /** pool.waitingCount — запросы, ждущие выдачи соединения. */
  waiting: number;
  /** SQL-запросы, выполняющиеся прямо сейчас (in-flight). */
  activeQueries: number;
  /** Соединения, висящие внутри открытой транзакции без активного запроса. */
  idleInTransaction: number;
}

let dbStatsProvider: (() => DbStatsSnapshot) | null = null;

/**
 * Регистрирует источник снимка состояния PG-слоя (вызывается из db-metrics при
 * инструментировании пула). Значения собираются ЛЕНИВО на каждый scrape.
 */
export function setDbStatsProvider(provider: (() => DbStatsSnapshot) | null): void {
  dbStatsProvider = provider;
}

/**
 * Длительность SQL-запросов в секундах (live: db-metrics оборачивает client.query).
 * Хвост до 30с покрывает запросы у потолка statement_timeout (инцидент FTS/BM25):
 *   histogram_quantile(0.99, sum(rate(db_query_duration_seconds_bucket[5m])) by (le, table))
 */
export const dbQueryDuration = new Histogram({
  name: 'db_query_duration_seconds',
  help: 'Duration of database queries in seconds',
  labelNames: ['operation', 'table'] as const,
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
  registers: [register],
});

/**
 * Всего SQL-запросов (live: db-metrics инкрементит в обёртке client.query).
 * Алёрт на рост доли ошибок слоя доступа:
 *   sum(rate(db_queries_total{status="error"}[5m])) / sum(rate(db_queries_total[5m])) > 0.05
 */
export const dbQueriesTotal = new Counter({
  name: 'db_queries_total',
  help: 'Total number of database queries',
  labelNames: ['operation', 'table', 'status'] as const, // status: success|error
  registers: [register],
});

/**
 * Занятость пула соединений PostgreSQL по состояниям (live: lazy collect из провайдера).
 * Алёрт на исчерпание пула (риск таймаута выдачи соединения):
 *   db_pool_connections{state="waiting"} > 0
 *   db_pool_connections{state="active"} / db_pool_connections{state="total"} > 0.8
 */
export const dbPoolConnections = new Gauge({
  name: 'db_pool_connections',
  help: 'Number of connections in the database pool',
  labelNames: ['state'] as const, // total | idle | active | waiting
  registers: [register],
  collect() {
    if (!dbStatsProvider) {
      return;
    }
    const s = dbStatsProvider();
    this.set({ state: 'total' }, s.total);
    this.set({ state: 'idle' }, s.idle);
    this.set({ state: 'active' }, s.active);
    this.set({ state: 'waiting' }, s.waiting);
  },
});

/**
 * Всего запросов, отменённых по statement_timeout (PG код 57014). Прямо закрывает
 * инцидент FTS/BM25-таймаута: BM25 падает на 57014 и роняет ответ ассистента.
 * Алёрт:
 *   sum(rate(db_statement_timeouts_total[5m])) by (source) > 0
 *   → растущий поток отменённых запросов (особенно source="fts").
 */
export const dbStatementTimeoutsTotal = new Counter({
  name: 'db_statement_timeouts_total',
  help: 'Total number of queries cancelled by statement_timeout (PG 57014)',
  labelNames: ['table', 'source'] as const, // source: fts | sql
  registers: [register],
});

/**
 * Время ожидания выдачи соединения из пула в секундах (live: обёртка pool.connect).
 * Рост хвоста = насыщение пула (запросы ждут свободного коннекта):
 *   histogram_quantile(0.95, sum(rate(db_pool_acquire_wait_seconds_bucket[5m])) by (le))
 */
export const dbPoolAcquireWaitSeconds = new Histogram({
  name: 'db_pool_acquire_wait_seconds',
  help: 'Time spent waiting to acquire a connection from the pool in seconds',
  labelNames: ['pool'] as const,
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [register],
});

/**
 * Висящие запросы/транзакции (live: lazy collect из провайдера). idle_in_transaction
 * держит соединение и блокировки после краша пода — ранний сигнал утечки коннектов:
 *   db_active_queries{state="idle_in_transaction"} > 0 на протяжении 5м
 */
export const dbActiveQueries = new Gauge({
  name: 'db_active_queries',
  help: 'Number of in-flight queries and idle-in-transaction connections',
  labelNames: ['state'] as const, // active | idle_in_transaction
  registers: [register],
  collect() {
    if (!dbStatsProvider) {
      return;
    }
    const s = dbStatsProvider();
    this.set({ state: 'active' }, s.activeQueries);
    this.set({ state: 'idle_in_transaction' }, s.idleInTransaction);
  },
});

// ============================================================================
// Storage Pool (MinIO) Metrics
// ============================================================================

type MinioPoolSnapshot = { active: number; free: number; queued: number; maxSockets: number };
let minioPoolStatsProvider: (() => MinioPoolSnapshot) | null = null;

/**
 * Регистрирует источник снимка занятости пула MinIO (вызывается из minio-client).
 * Инверсия зависимостей: metrics.ts не тянет тяжёлый S3-клиент, а получает провайдер.
 */
export function setMinioPoolStatsProvider(provider: () => MinioPoolSnapshot): void {
  minioPoolStatsProvider = provider;
}

/**
 * Занятость пула HTTP-соединений S3-клиента MinIO (P0.3). Значения собираются
 * ЛЕНИВО на каждый scrape через collect() — всегда актуальны, без отдельного таймера.
 * Алерт на исчерпание пула (риск 503 «Хранилище временно недоступно»):
 *   minio_pool_sockets{state="queued"} > 0
 *   minio_pool_sockets{state="active"} / minio_pool_sockets{state="max"} > 0.8
 */
export const minioPoolSockets = new Gauge({
  name: 'minio_pool_sockets',
  help: 'MinIO S3 client HTTP socket pool occupancy by state',
  labelNames: ['state'] as const, // active | free | queued | max
  registers: [register],
  collect() {
    if (!minioPoolStatsProvider) {
      return;
    }
    const s = minioPoolStatsProvider();
    this.set({ state: 'active' }, s.active);
    this.set({ state: 'free' }, s.free);
    this.set({ state: 'queued' }, s.queued);
    this.set({ state: 'max' }, s.maxSockets);
  },
});

// ============================================================================
// LLM Metrics
// ============================================================================

/**
 * LLM request duration in seconds
 */
export const llmRequestDuration = new Histogram({
  name: 'llm_request_duration_seconds',
  help: 'Duration of LLM API requests in seconds',
  labelNames: ['provider', 'model', 'status'] as const,
  buckets: [0.5, 1, 2.5, 5, 10, 30, 60, 120],
  registers: [register],
});

/**
 * Total LLM tokens processed
 */
export const llmTokensTotal = new Counter({
  name: 'llm_tokens_total',
  help: 'Total number of LLM tokens processed',
  labelNames: ['provider', 'model', 'type'] as const, // type: input|output
  registers: [register],
});

/**
 * Total LLM requests.
 * status: success|http_4xx|http_429|http_5xx|timeout|aborted.
 * Эмитится из центрального слоя вызова провайдеров (server/llm-client.ts) через
 * server/monitoring/llm-metrics.ts. Алёрт на деградацию провайдера:
 *   sum(rate(llm_requests_total{status!="success"}[5m])) by (provider)
 *     / sum(rate(llm_requests_total[5m])) by (provider) > 0.2
 */
export const llmRequestsTotal = new Counter({
  name: 'llm_requests_total',
  help: 'Total number of LLM requests',
  labelNames: ['provider', 'model', 'status'] as const,
  registers: [register],
});

/**
 * Полная недоступность LLM-провайдера (нет пригодного HTTP-ответа): сейчас такие
 * события неотличимы от серии 5xx. Отдельный счётчик делает их различимыми.
 * reason: conn_refused|dns|timeout|breaker_open.
 *   - conn_refused — соединение отвергнуто/сброшено (ECONNREFUSED/ECONNRESET);
 *   - dns — имя не разрешилось (ENOTFOUND/EAI_AGAIN);
 *   - timeout — провайдер не ответил в отведённое время (без HTTP-ответа);
 *   - breaker_open — отказ предохранителя (задел: LLM circuit breaker пока не введён).
 * Истинные серверные 5xx = llm_requests_total{status="http_5xx"} − llm_provider_unavailable_total.
 */
export const llmProviderUnavailableTotal = new Counter({
  name: 'llm_provider_unavailable_total',
  help: 'Total number of LLM provider full-unavailability events (no usable HTTP response)',
  labelNames: ['provider', 'reason'] as const, // reason: conn_refused|dns|timeout|breaker_open
  registers: [register],
});

/**
 * Повторы LLM-запроса после транзиентной ошибки (на флапающем провайдере ретраи
 * маскируют деградацию — отдельный счётчик делает её видимой).
 * reason: http_429|http_503|http_5xx|timeout|network.
 *   высокий rate при низком error-rate llm_requests_total = провайдер «дрожит».
 */
export const llmRetriesTotal = new Counter({
  name: 'llm_retries_total',
  help: 'Total number of LLM request retries after a transient failure',
  labelNames: ['provider', 'model', 'reason'] as const, // reason: http_429|http_503|http_5xx|timeout|network
  registers: [register],
});

/**
 * Tool-call с битым/обрезанным JSON аргументов (серверная/Node-сторона).
 * Аналогичный Python-брейкер agent_max_invalid_tool_arg_calls покрывается отдельной
 * задачей по экспортёру agent-runtime. route — точка парсинга (напр. action_hybrid_tool_input).
 */
export const llmToolCallInvalidJsonTotal = new Counter({
  name: 'llm_tool_call_invalid_json_total',
  help: 'Total number of LLM tool-call responses with invalid/truncated JSON arguments (Node side)',
  labelNames: ['provider', 'model', 'route'] as const,
  registers: [register],
});

// ============================================================================
// Embedding Metrics
// ============================================================================

/**
 * Embedding request duration in seconds
 */
export const embeddingRequestDuration = new Histogram({
  name: 'embedding_request_duration_seconds',
  help: 'Duration of embedding API requests in seconds',
  labelNames: ['provider', 'status'] as const,
  buckets: [0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

/**
 * Total embedding requests (label status: success|error).
 * Заполняется в assistant-file-embeddings. Алёрт на тихую деградацию RAG
 * (инцидент 2026-06-10: провайдер Unica-Embedding-8B стабильно отдавал 400):
 *   sum(rate(embedding_requests_total{status="error"}[5m])) by (provider)
 *     / sum(rate(embedding_requests_total[5m])) by (provider) > 0.2
 *   → провайдер эмбеддингов валит >20% запросов в течение 5 минут.
 */
export const embeddingRequestsTotal = new Counter({
  name: 'embedding_requests_total',
  help: 'Total number of embedding requests',
  labelNames: ['provider', 'status'] as const,
  registers: [register],
});

// ============================================================================
// Vector Store (Qdrant) Metrics
// ============================================================================

/**
 * Vector search duration in seconds
 */
export const vectorSearchDuration = new Histogram({
  name: 'vector_search_duration_seconds',
  help: 'Duration of vector search operations in seconds',
  labelNames: ['collection', 'type'] as const, // type: search|upsert|delete
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
  registers: [register],
});

/**
 * Total vector operations
 */
export const vectorOperationsTotal = new Counter({
  name: 'vector_operations_total',
  help: 'Total number of vector store operations',
  labelNames: ['collection', 'type', 'status'] as const,
  registers: [register],
});

// ============================================================================
// Knowledge Base Metrics
// ============================================================================

/**
 * Knowledge base indexing jobs
 */
export const indexingJobsTotal = new Counter({
  name: 'kb_indexing_jobs_total',
  help: 'Total number of knowledge base indexing jobs',
  labelNames: ['status'] as const, // status: started|completed|failed
  registers: [register],
});

/**
 * Documents indexed per knowledge base
 */
export const documentsIndexed = new Gauge({
  name: 'kb_documents_indexed',
  help: 'Number of documents indexed in knowledge bases',
  labelNames: ['knowledge_base_id'] as const,
  registers: [register],
});

/**
 * Archive import jobs by final status
 */
export const archiveImportJobsTotal = new Counter({
  name: 'kb_archive_import_jobs_total',
  help: 'Total number of archive import jobs',
  labelNames: ['status', 'format'] as const, // status: started|completed|completed_with_errors|failed|canceled|recovered|rejected
  registers: [register],
});

/**
 * Archive import job duration in seconds
 */
export const archiveImportDurationSeconds = new Histogram({
  name: 'kb_archive_import_duration_seconds',
  help: 'Duration of archive import jobs in seconds',
  labelNames: ['status', 'format'] as const,
  buckets: [1, 3, 5, 10, 30, 60, 120, 300, 600, 1800],
  registers: [register],
});

/**
 * Number of files per archive import job
 */
export const archiveImportFilesPerJob = new Histogram({
  name: 'kb_archive_import_files_per_job',
  help: 'Number of files processed per archive import job',
  labelNames: ['format'] as const,
  buckets: [1, 5, 10, 25, 50, 100, 250, 500, 1000, 5000, 10000],
  registers: [register],
});

/**
 * Total archive-import retries
 */
export const archiveImportRetriesTotal = new Counter({
  name: 'kb_archive_import_retries_total',
  help: 'Total number of archive import retries',
  labelNames: ['reason'] as const, // reason: worker_retry|manual_retry
  registers: [register],
});

/**
 * Archive import item phase duration in seconds.
 */
export const archiveImportItemPhaseDurationSeconds = new Histogram({
  name: 'kb_archive_import_item_phase_duration_seconds',
  help: 'Duration of archive import item phases in seconds',
  labelNames: ['phase', 'format'] as const, // phase: unpack|convert|db|enrich|total
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60, 120],
  registers: [register],
});

/**
 * Total number of archive import item timeouts.
 */
export const archiveImportItemTimeoutsTotal = new Counter({
  name: 'kb_archive_import_item_timeouts_total',
  help: 'Total number of archive import item timeouts',
  labelNames: ['reason', 'format'] as const, // reason: item_processing_timeout|enrichment_timeout
  registers: [register],
});

/**
 * Total number of recovered stalled archive import items.
 */
export const archiveImportStallRecoveriesTotal = new Counter({
  name: 'kb_archive_import_stall_recoveries_total',
  help: 'Total number of stalled archive import items recovered by watchdog',
  labelNames: ['action', 'format'] as const, // action: failed|pending
  registers: [register],
});

/**
 * Total Excel v2 API requests.
 */
export const kbExcelV2RequestsTotal = new Counter({
  name: 'kb_excel_v2_requests_total',
  help: 'Total number of Excel v2 API requests',
  labelNames: ['route', 'status_code', 'error_class'] as const,
  registers: [register],
});

/**
 * Excel v2 API request duration in seconds.
 */
export const kbExcelV2RequestDurationSeconds = new Histogram({
  name: 'kb_excel_v2_request_duration_seconds',
  help: 'Duration of Excel v2 API requests in seconds',
  labelNames: ['route', 'status_code'] as const,
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

/**
 * Excel v2 API response payload size in bytes.
 */
export const kbExcelV2ResponsePayloadBytes = new Histogram({
  name: 'kb_excel_v2_response_payload_bytes',
  help: 'Response payload size for Excel v2 API endpoints in bytes',
  labelNames: ['route', 'status_code'] as const,
  buckets: [512, 1024, 2048, 4096, 8192, 16384, 32768, 65536, 131072, 262144, 524288, 1048576],
  registers: [register],
});

/**
 * Structured Excel indexing duration in seconds.
 */
export const kbExcelIndexingDurationSeconds = new Histogram({
  name: 'kb_excel_indexing_duration_seconds',
  help: 'Duration of structured Excel indexing chunk generation in seconds',
  labelNames: ['status'] as const,
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60, 120],
  registers: [register],
});

/**
 * Total rows processed by structured Excel indexing.
 */
export const kbExcelIndexingRowsTotal = new Counter({
  name: 'kb_excel_indexing_rows_total',
  help: 'Total number of Excel rows processed by structured indexing',
  labelNames: ['status'] as const,
  registers: [register],
});

/**
 * Total chunks generated by structured Excel indexing.
 */
export const kbExcelIndexingChunksTotal = new Counter({
  name: 'kb_excel_indexing_chunks_total',
  help: 'Total number of chunks generated by structured Excel indexing',
  labelNames: ['status'] as const,
  registers: [register],
});

/**
 * Knowledge upload sessions created.
 */
export const knowledgeUploadSessionsCreatedTotal = new Counter({
  name: "kb_upload_sessions_created_total",
  help: "Total number of knowledge upload sessions created",
  labelNames: ["source_kind"] as const,
  registers: [register],
});

/**
 * Knowledge upload session items registered.
 */
export const knowledgeUploadItemsRegisteredTotal = new Counter({
  name: "kb_upload_items_registered_total",
  help: "Total number of knowledge upload session items registered",
  labelNames: ["import_kind"] as const,
  registers: [register],
});

/**
 * Uploaded parts total.
 */
export const knowledgeUploadPartsUploadedTotal = new Counter({
  name: "kb_upload_parts_uploaded_total",
  help: "Total number of uploaded knowledge upload parts",
  labelNames: ["result"] as const,
  registers: [register],
});

/**
 * Part retries total.
 */
export const knowledgeUploadPartRetriesTotal = new Counter({
  name: "kb_upload_part_retries_total",
  help: "Total number of retried knowledge upload parts",
  labelNames: ["reason"] as const,
  registers: [register],
});

/**
 * Session resume count.
 */
export const knowledgeUploadResumeCountTotal = new Counter({
  name: "kb_upload_resume_count_total",
  help: "Total number of resumed knowledge upload items",
  labelNames: ["source"] as const,
  registers: [register],
});

/**
 * Reload restore count.
 */
export const knowledgeUploadReloadRestoresTotal = new Counter({
  name: "kb_upload_reload_restores_total",
  help: "Total number of upload queue restores after reload",
  labelNames: ["result"] as const,
  registers: [register],
});

/**
 * IndexedDB/storage quota failures.
 */
export const knowledgeUploadQuotaFailuresTotal = new Counter({
  name: "kb_upload_quota_failures_total",
  help: "Total number of client-side upload quota failures",
  labelNames: ["reason"] as const,
  registers: [register],
});

/**
 * Session duration in seconds.
 */
export const knowledgeUploadSessionDurationSeconds = new Histogram({
  name: "kb_upload_session_duration_seconds",
  help: "Duration of knowledge upload sessions in seconds",
  labelNames: ["status", "source_kind"] as const,
  buckets: [1, 3, 5, 10, 30, 60, 120, 300, 600, 1800, 3600],
  registers: [register],
});

/**
 * Item upload duration in seconds.
 */
export const knowledgeUploadItemUploadDurationSeconds = new Histogram({
  name: "kb_upload_item_upload_duration_seconds",
  help: "Duration of knowledge upload item transport in seconds",
  labelNames: ["status", "import_kind"] as const,
  buckets: [0.1, 0.5, 1, 3, 5, 10, 30, 60, 120, 300, 600],
  registers: [register],
});

/**
 * Item processing duration in seconds.
 */
export const knowledgeUploadItemProcessingDurationSeconds = new Histogram({
  name: "kb_upload_item_processing_duration_seconds",
  help: "Duration of knowledge upload item processing in seconds",
  labelNames: ["status", "import_kind"] as const,
  buckets: [0.1, 0.5, 1, 3, 5, 10, 30, 60, 120, 300, 600, 1800],
  registers: [register],
});

// ============================================================================
// RAG Multi-Query Metrics
// ============================================================================

/**
 * Total number of RAG requests split by mode and final status.
 */
export const ragMultiQueryRequestsTotal = new Counter({
  name: 'rag_multi_query_requests_total',
  help: 'Total number of RAG requests by mode',
  labelNames: ['status', 'mode'] as const, // status: success|error, mode: single|multi
  registers: [register],
});

/**
 * Total number of processed chunks in multi-query mode.
 */
export const ragMultiQueryChunksTotal = new Counter({
  name: 'rag_multi_query_chunks_total',
  help: 'Total number of chunks processed in multi-query mode',
  labelNames: ['status'] as const, // status: success|failed
  registers: [register],
});

/**
 * Duration of multi-query phases in seconds.
 */
export const ragMultiQueryDurationSeconds = new Histogram({
  name: 'rag_multi_query_duration_seconds',
  help: 'Duration of multi-query phases in seconds',
  labelNames: ['phase'] as const, // phase: query_analysis|embedding|search|rrf|retrieval|total
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
  registers: [register],
});

/**
 * Number of chunks per multi-query request.
 */
export const ragMultiQueryChunksCount = new Histogram({
  name: 'rag_multi_query_chunks_count',
  help: 'Number of chunks per multi-query request',
  buckets: [1, 2, 3, 4, 5, 8, 10, 20, 50, 100],
  registers: [register],
});

/**
 * Chunk success rate for multi-query execution.
 */
export const ragMultiQueryChunksSuccessRate = new Gauge({
  name: 'rag_multi_query_chunks_success_rate',
  help: 'Success rate of chunks in multi-query execution',
  registers: [register],
});

/**
 * Number of chunk appearances for fused RRF documents.
 */
export const ragRrfDocumentAppearances = new Histogram({
  name: 'rag_rrf_document_appearances',
  help: 'How many chunk result lists each RRF document appears in',
  buckets: [1, 2, 3, 4, 5, 8, 10, 20, 50, 100],
  registers: [register],
});

// ============================================================================
// Chat Metrics
// ============================================================================

/**
 * Total chat messages
 */
export const chatMessagesTotal = new Counter({
  name: 'chat_messages_total',
  help: 'Total number of chat messages',
  labelNames: ['role', 'workspace_id'] as const,
  registers: [register],
});

/**
 * Active chat sessions
 */
export const activeChatSessions = new Gauge({
  name: 'chat_active_sessions',
  help: 'Number of active chat sessions',
  registers: [register],
});

// ============================================================================
// Authentication Metrics
// ============================================================================

/**
 * Authentication attempts
 */
export const authAttemptsTotal = new Counter({
  name: 'auth_attempts_total',
  help: 'Total number of authentication attempts',
  labelNames: ['method', 'status'] as const, // method: local|google|yandex, status: success|failure
  registers: [register],
});

// ============================================================================
// WebSocket Metrics
// ============================================================================

/**
 * Active WebSocket connections
 */
export const wsActiveConnections = new Gauge({
  name: 'ws_active_connections',
  help: 'Number of active WebSocket connections',
  registers: [register],
});

/**
 * Total WebSocket messages
 */
export const wsMessagesTotal = new Counter({
  name: 'ws_messages_total',
  help: 'Total number of WebSocket messages',
  labelNames: ['type', 'direction'] as const, // direction: in|out
  registers: [register],
});

// ============================================================================
// Workflow Metrics
// ============================================================================

/**
 * Workflow RBAC / admin access denials.
 */
export const workflowAccessDeniedTotal = new Counter({
  name: 'workflow_access_denied_total',
  help: 'Total number of denied workflow access attempts',
  labelNames: ['scope', 'reason'] as const, // scope: workspace|admin, reason: permission|auth|feature_disabled
  registers: [register],
});

/**
 * Workflow draft revision conflicts.
 */
export const workflowRevisionConflictsTotal = new Counter({
  name: 'workflow_revision_conflicts_total',
  help: 'Total number of workflow draft revision conflicts',
  labelNames: ['scope'] as const, // scope: workspace|global
  registers: [register],
});

/**
 * LangGraph preview requests for workflow definitions.
 */
export const workflowLangGraphPreviewRequestsTotal = new Counter({
  name: 'workflow_langgraph_preview_requests_total',
  help: 'Total number of LangGraph preview requests for workflows',
  labelNames: ['scope', 'status'] as const, // scope: admin, status: success|error
  registers: [register],
});

/**
 * LangGraph support classifications produced by the preview compiler.
 */
export const workflowLangGraphSupportClassificationsTotal = new Counter({
  name: 'workflow_langgraph_support_classifications_total',
  help: 'Total number of workflow nodes classified for LangGraph readiness',
  labelNames: ['kind', 'support_level'] as const,
  registers: [register],
});

/**
 * LangGraph preview feature-flag denials.
 */
export const workflowLangGraphFeatureDeniedTotal = new Counter({
  name: 'workflow_langgraph_feature_denied_total',
  help: 'Total number of denied LangGraph preview requests due to feature flag',
  labelNames: ['scope'] as const,
  registers: [register],
});

/**
 * Claims of workflow runtime runs by background workers.
 */
export const workflowRuntimeRunClaimsTotal = new Counter({
  name: 'workflow_runtime_run_claims_total',
  help: 'Total number of workflow runtime run claims by workers',
  labelNames: ['previous_status', 'reclaimed'] as const,
  registers: [register],
});

/**
 * Lost workflow runtime leases.
 */
export const workflowRuntimeLeaseLossesTotal = new Counter({
  name: 'workflow_runtime_lease_losses_total',
  help: 'Total number of lost workflow runtime leases',
  labelNames: ['phase'] as const,
  registers: [register],
});

// ============================================================================
// Error Metrics
// ============================================================================

/**
 * Application errors
 */
export const errorsTotal = new Counter({
  name: 'app_errors_total',
  help: 'Total number of application errors',
  labelNames: ['type', 'module'] as const,
  registers: [register],
});

// ============================================================================
// Business Metrics
// ============================================================================

/**
 * Credits consumed
 */
export const creditsConsumed = new Counter({
  name: 'credits_consumed_total',
  help: 'Total credits consumed',
  labelNames: ['workspace_id', 'operation_type'] as const,
  registers: [register],
});

/**
 * Active workspaces
 */
export const activeWorkspaces = new Gauge({
  name: 'active_workspaces',
  help: 'Number of active workspaces',
  registers: [register],
});

/**
 * Active users
 */
export const activeUsers = new Gauge({
  name: 'active_users',
  help: 'Number of active users',
  registers: [register],
});
