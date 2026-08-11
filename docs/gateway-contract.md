# unica-ops (janitor): контракт сервиса — DRAFT

Статус: **контракт реализован в монорепе (волны J0/J1, 2026-07-17)** и зафиксирован
здесь под переезд кода (J2.3). Изменения контракта — только синхронными PR в оба репо.

## 1. Роль и границы

Janitor — исполнитель retention-политик над общими хранилищами платформы (PG/MinIO/Qdrant).
Пока БД общая (до волны P5), janitor читает таблицы retention напрямую. Доменные
удаления выполняет монолит через callback-gateway; Files API из ops не вызывается.
Durable-очередь ручной и плановой очистки описана в §4.

## 2. Env-поверхность

| Переменная | Дефолт | Назначение |
| --- | --- | --- |
| `APP_ROLE` | — | обязательно `janitor` (гейт входа) |
| `DATABASE_URL` | — | PG (обяз.); в compose параметризуется `JANITOR_DATABASE_URL` |
| `REDIS_URL` | — | распределённый лок прогонов (fail-closed в production) |
| `QDRANT_URL` / `QDRANT_API_KEY` | — | GC осиротевших коллекций |
| `MINIO_ENDPOINT` / `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` | — | S3-задачи; в compose параметризуются `JANITOR_MINIO_*` |
| `JANITOR_ENABLED` | `true` | гейт только планового оркестратора; durable cleanup worker работает всегда |
| `JANITOR_TICK_MINUTES` | `15` | период тика |
| `JANITOR_LOCK_TTL_MS` | `600000` | TTL лока политики |
| `JANITOR_LOCK_ALLOW_NOOP` | prod:`false` | `true` = разрешить no-op-лок без Redis (dev) |
| `JANITOR_MAX_BATCHES_PER_RUN` | `50` | кап батчей одного прогона |
| `JANITOR_BATCH_PAUSE_MS` | `0` | пауза между батчами |
| `JANITOR_HEALTH_PORT` | `5003` | health/readiness/metrics (`0` = off) |
| `JANITOR_RUNTIME_PORT` | `5004` | runtime-RPC (`0` = off) |
| `UNICA_JANITOR_RUNTIME_TOKEN` | — | bearer RPC; не задан → RPC отвечает 503 |
| `JANITOR_SHUTDOWN_TIMEOUT_MS` | `25000` | форс-таймаут graceful shutdown |
| `FILE_ARTIFACT_CLEANUP_CONCURRENCY` | `2` | параллельные исполнители durable-очереди |
| `FILE_ARTIFACT_CLEANUP_POLL_MS` | `2000` | пауза при пустой очереди |
| `FILE_ARTIFACT_CLEANUP_LEASE_MS` | `90000` | lease job; продлевается heartbeat каждые 1/3 TTL |
| `FILE_ARTIFACT_CLEANUP_ACTIVE_ASR_RETRY_MS` | `30000` | отсрочка при активной ASR без расхода attempts |
| `FILE_ARTIFACT_CLEANUP_BACKOFF_BASE_MS` | `5000` | база exponential backoff |
| `FILE_ARTIFACT_CLEANUP_BACKOFF_MAX_MS` | `3600000` | максимум backoff |
| `FILE_ARTIFACT_CLEANUP_MAX_ATTEMPTS` | `12` | максимум неуспешных gateway-попыток |
| `FILE_ARTIFACT_CLEANUP_STATS_REFRESH_MS` | `15000` | период обновления queue gauges |

## 3. HTTP-поверхность

### Health (`JANITOR_HEALTH_PORT`, без аутентификации — для k8s probes / Prometheus)

- `GET /healthz` (алиас `/health`) — liveness; `200` всегда при живом процессе.
- `GET /health/ready` (алиас `/ready`) — readiness: `200`, когда БД доступна,
  таблицы `cleanup_policies` и `file_artifact_cleanup_jobs` применены и durable cleanup
  worker запущен. Плановый оркестратор также должен быть запущен, кроме случая
  `JANITOR_ENABLED=false`. Иначе `503 {status:"starting"}`.
- `GET /metrics` — Prometheus: `janitor_runs_total{policy,status,trigger}`,
  `janitor_deleted_items_total{policy}`, `janitor_freed_bytes_total{policy}`,
  `janitor_run_duration_seconds{policy}`, `janitor_last_success_timestamp_seconds{policy}`,
  `file_artifact_cleanup_jobs_total{outcome}`, `file_artifact_cleanup_job_duration_seconds`,
  `file_artifact_cleanup_queue_jobs{status}` (`error` — ожидает retry, `dead` — terminal
  без автоматического retry), `file_artifact_cleanup_oldest_ready_age_seconds`
  + default Node-метрики.

### Runtime-RPC (`JANITOR_RUNTIME_PORT`, bearer `UNICA_JANITOR_RUNTIME_TOKEN`, timingSafeEqual)

- `GET /v1/health` — без токена; `{status, tokenConfigured}`.
- `POST /v1/cleanup-policies/:key/preview` — dry-run; `200 {matched}`.
- `POST /v1/cleanup-policies/:key/run-now` — body `{actorId?: string}`; синхронно до конца
  прогона; `200 {status, matched, deleted, freedBytes}` (`status` ∈ success|partial|failed|
  skipped_locked|skipped_disabled).
- Ошибки: токен не задан → `503 JANITOR_RUNTIME_TOKEN_NOT_CONFIGURED`; неверный →
  `401 JANITOR_RUNTIME_UNAUTHORIZED`; неизвестный ключ → `404 CLEANUP_POLICY_ERROR`.

Клиент монолита: `server/janitor-runtime-client.ts` — свитч `UNICA_JANITOR_RUNTIME_URL`;
HTTP-режим включается только при заданном токене (URL без токена → in-process + warn);
таймаут `UNICA_JANITOR_RUNTIME_TIMEOUT_MS` (дефолт 600000).

## 3.1. Callback-gateway доменных операций (direction-2: janitor → монолит, J2.3b)

Доменные операции уборки, владелец которых — монолит (копия в ops дрейфовала бы):
janitor зовёт их по HTTP `UNICA_JANITOR_GATEWAY_URL` (= `http://unica:5000/api/internal/janitor`),
bearer `UNICA_JANITOR_GATEWAY_TOKEN` (fallback `UNICA_JANITOR_RUNTIME_TOKEN` — один секрет
на оба шва), таймаут `UNICA_JANITOR_GATEWAY_TIMEOUT_MS` (дефолт 300000).
URL или токен пуст → ops завершается с понятной ошибкой: доменную операцию исполнить нечем.

- `GET /health` — без токена; `{status, tokenConfigured}`.
- `POST /chat-attachments/purge-artifacts` — body `{workspaceId, attachment: {id, chatId,
  filename, mimeType, storageKey, documentVersion, derivedManifestObjectKey, previewObjectKey}}`;
  удаляет объект и все производные (превью/манифест/шарды). `200 {ok:true}`.
- `POST /v1/file-artifacts/cleanup` — единая версия для durable-очереди. Body
  `{version:1, jobId, workspaceId, resourceType, resourceId, reason, artifact:{attachmentId,
  chatId, fileId, filename, mimeType, storageKey, documentVersion,
  derivedManifestObjectKey, previewObjectKey, externalUri}}`. Монолит идемпотентно удаляет
  канонические и производные MinIO-объекты и Files-копию, после чего очищает ссылки.
  `2xx` — успех; `409 FILE_ARTIFACT_CLEANUP_ACTIVE_ASR` — отложить без attempts;
  остальные ошибки содержат `code` и `retryable`.
- `POST /workspace-files/delete` — body `{workspaceId, storageKey}`; удаляет workspace-файл
  с метерингом байтов (prefix-гард и usage-гейдж внутри владельца). `200 {ok:true}`.
- `POST /qdrant-usage/reconcile` — body `{}`; пересчёт qdrantCollectionsCount по всем
  пространствам. `200 {ok:true, reconciled:N}`.
- Ошибки: нет токена → `503 JANITOR_GATEWAY_NOT_CONFIGURED`; неверный → `401
  JANITOR_GATEWAY_UNAUTHORIZED`; невалидное тело → `400 JANITOR_GATEWAY_BAD_REQUEST`.

Всё остальное (24 PG-задачи, S3-скан фидбек-сирот, Qdrant-скан/удаление коллекций,
ledger, журнал, локи) janitor исполняет сам по общей БД/MinIO/Qdrant — gateway не нужен.

## 4. Семантика исполнения

- Плановый тик каждые `JANITOR_TICK_MINUTES`; проходы не наслаиваются (skip при бегущем).
- Прогон политики — под Redis-локом `janitor:<resourceKey>` (`SET NX PX`); в production
  без Redis прогон скипается (`skipped_locked`, fail-closed).
- Graceful shutdown: SIGTERM → прерывание между батчами (`shouldAbort`), статус `partial`
  в журнале, релиз лока, дожидание текущего прохода; хвост добирает следующий тик.
- Журнал прогонов — `cleanup_run_log` (`triggered_by` auto|manual, `freed_bytes`).
- `file_artifact_cleanup_jobs` захватывается атомарно через `FOR UPDATE SKIP LOCKED`.
  Истёкший lease reclaim-ится другим pod; долгий gateway-вызов держит lease heartbeat-ом.
- Ручные удаления, S3-политики и физический purge `pg.chat_sessions`/
  `pg.assistants.archived` создают один и тот же versioned snapshot до исчезновения
  исходных строк. Для двух PG-политик enqueue snapshots и каскадный DELETE выполняются
  одним data-modifying CTE; активная ASR исключает chat/assistant из батча.
  Политика `s3.chat_attachments.audio_video` выключена по умолчанию.
- Перед enqueue и непосредственно перед gateway проверяется активная ASR по `fileId`,
  `attachmentId` и `externalUri`. Для execution эффективный статус вычисляется как
  `COALESCE(lifecycle_status, status, 'accepted')`, поэтому legacy-строка с пустым
  lifecycle и `status=processing` также блокирует удаление. Активная ASR только
  переносит `next_retry_at` и не меняет attempts.
- Временные ошибки получают exponential backoff; неповторяемая ошибка или исчерпание
  попыток оставляет terminal `error` с `next_retry_at = NULL` и `last_error`.
- Новый policy enqueue для того же snapshot явно redrive-ит terminal job: переводит
  её в `pending` с cooldown 5 минут, сохраняя накопленные `attempts` и `last_error`.
  Pending/processing/retry jobs конфликтный enqueue не меняет, поэтому hot loop нет.
  S3-кандидат подавляется только уже живой job; terminal job разрешено requeue-ить.
- `JANITOR_ENABLED=false` останавливает только плановые политики: очередь ручных удалений
  продолжает обрабатываться.

## 5. Владение данными

Таблицы сервиса (создаются миграциями МОНОРЕПЫ до волны P5; изменения — синхронные PR):
`cleanup_policies` (override-ы политик), `cleanup_run_log` (журнал),
`cleanup_policy_audit_log` (аудит правок), `qdrant_orphan_candidates` (grace-ledger GC).
`file_artifact_cleanup_jobs` — общая durable-очередь удаления файловых артефактов;
producer-ы живут в монолите и retention-движке ops, consumer — постоянный worker ops.

Каталог задач (30 шт.: 24 pg / 4 s3 / 1 s3_reconcile / 1 qdrant) — декларативный реестр
в коде; консистентность со схемой стережёт контракт-тест
`tests/janitor/janitor-registry-schema-contract.test.ts` в CI монорепы.

## 6. Долг переезда (J2.3)

До переноса кода требуется развязать замороженный доменный долг (гейт
`verify:janitor-import-surface` монорепы): лёгкие — `minio-client`, `qdrant`,
`qdrant-collection-names` (пакетируются как есть); тяжёлые — `storage.ts` (2 метода →
локальный SQL/фасад), `chat-attachment-document-store`, `workspace-storage-service`,
`usage/qdrant-reconcile` (узкие фасады или пакеты `@unica/*`, гейт P2).
