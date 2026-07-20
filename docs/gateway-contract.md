# unica-ops (janitor): контракт сервиса — DRAFT

Статус: **контракт реализован в монорепе (волны J0/J1, 2026-07-17)** и зафиксирован
здесь под переезд кода (J2.3). Изменения контракта — только синхронными PR в оба репо.

## 1. Роль и границы

Janitor — исполнитель retention-политик над общими хранилищами платформы (PG/MinIO/Qdrant).
Пока БД общая (до волны P5), janitor читает и удаляет в чужих таблицах напрямую;
владение данными сервиса — только таблицы §5. Входящих доменных API нет; исходящих
HTTP-вызовов в другие сервисы нет.

## 2. Env-поверхность

| Переменная | Дефолт | Назначение |
| --- | --- | --- |
| `APP_ROLE` | — | обязательно `janitor` (гейт входа) |
| `DATABASE_URL` | — | PG (обяз.); в compose параметризуется `JANITOR_DATABASE_URL` |
| `REDIS_URL` | — | распределённый лок прогонов (fail-closed в production) |
| `QDRANT_URL` / `QDRANT_API_KEY` | — | GC осиротевших коллекций |
| `MINIO_ENDPOINT` / `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` | — | S3-задачи; в compose параметризуются `JANITOR_MINIO_*` |
| `JANITOR_ENABLED` | `true` | гейт планового оркестратора |
| `JANITOR_TICK_MINUTES` | `15` | период тика |
| `JANITOR_LOCK_TTL_MS` | `600000` | TTL лока политики |
| `JANITOR_LOCK_ALLOW_NOOP` | prod:`false` | `true` = разрешить no-op-лок без Redis (dev) |
| `JANITOR_MAX_BATCHES_PER_RUN` | `50` | кап батчей одного прогона |
| `JANITOR_BATCH_PAUSE_MS` | `0` | пауза между батчами |
| `JANITOR_HEALTH_PORT` | `5003` | health/readiness/metrics (`0` = off) |
| `JANITOR_RUNTIME_PORT` | `5004` | runtime-RPC (`0` = off) |
| `UNICA_JANITOR_RUNTIME_TOKEN` | — | bearer RPC; не задан → RPC отвечает 503 |
| `JANITOR_SHUTDOWN_TIMEOUT_MS` | `25000` | форс-таймаут graceful shutdown |

## 3. HTTP-поверхность

### Health (`JANITOR_HEALTH_PORT`, без аутентификации — для k8s probes / Prometheus)

- `GET /healthz` (алиас `/health`) — liveness; `200` всегда при живом процессе.
- `GET /health/ready` (алиас `/ready`) — readiness: `200` когда БД доступна
  (`to_regclass('cleanup_policies')`) и оркестратор запущен; при `JANITOR_ENABLED=false`
  готов после БД. Иначе `503 {status:"starting"}`.
- `GET /metrics` — Prometheus: `janitor_runs_total{policy,status,trigger}`,
  `janitor_deleted_items_total{policy}`, `janitor_freed_bytes_total{policy}`,
  `janitor_run_duration_seconds{policy}`, `janitor_last_success_timestamp_seconds{policy}`
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
URL ПУСТ → in-process (переходный режим монорепы, ветку выбирает default-stores).

- `GET /health` — без токена; `{status, tokenConfigured}`.
- `POST /chat-attachments/purge-artifacts` — body `{workspaceId, attachment: {id, chatId,
  filename, mimeType, storageKey, documentVersion, derivedManifestObjectKey, previewObjectKey}}`;
  удаляет объект и все производные (превью/манифест/шарды). `200 {ok:true}`.
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

## 5. Владение данными

Таблицы сервиса (создаются миграциями МОНОРЕПЫ до волны P5; изменения — синхронные PR):
`cleanup_policies` (override-ы политик), `cleanup_run_log` (журнал),
`cleanup_policy_audit_log` (аудит правок), `qdrant_orphan_candidates` (grace-ledger GC).

Каталог задач (30 шт.: 24 pg / 4 s3 / 1 s3_reconcile / 1 qdrant) — декларативный реестр
в коде; консистентность со схемой стережёт контракт-тест
`tests/janitor/janitor-registry-schema-contract.test.ts` в CI монорепы.

## 6. Долг переезда (J2.3)

До переноса кода требуется развязать замороженный доменный долг (гейт
`verify:janitor-import-surface` монорепы): лёгкие — `minio-client`, `qdrant`,
`qdrant-collection-names` (пакетируются как есть); тяжёлые — `storage.ts` (2 метода →
локальный SQL/фасад), `chat-attachment-document-store`, `workspace-storage-service`,
`usage/qdrant-reconcile` (узкие фасады или пакеты `@unica/*`, гейт P2).
