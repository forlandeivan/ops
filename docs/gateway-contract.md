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
- `POST /v1/cleanup-policies/:key/preview` — body `{actorId?: string}`; dry-run; `200 {matched}`.
  Фоновая политика (`backgroundRun` в реестре, сейчас только `s3.storage.orphans`) запускает
  проверку и отвечает сразу: `200 {matched, started, reason?}`. `matched` — число из последнего
  прогона; `started=false` с `reason` ∈ already_running|locked — проверка уже идёт здесь или в
  другом экземпляре. Отчёт и итог пишутся в `cleanup_run_log`, `actorId` — инициатор в журнале.
- `POST /v1/cleanup-policies/:key/run-now` — body `{actorId?: string}`; синхронно до конца
  прогона; `200 {status, matched, deleted, freedBytes}` (`status` ∈ success|partial|failed|
  skipped_locked|skipped_disabled). Фоновая политика отвечает сразу `status: running`, при занятом
  локе — `skipped_locked` с `reason`.
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
  `{version:1, jobId, workerId}`. `workspaceId` и snapshot артефакта не передаются как
  authority: монолит загружает каноническую job из общей `file_artifact_cleanup_jobs` по
  `jobId` и проверяет текущего lease-владельца по `workerId`. Вид работы задаёт
  `payload.kind`; исполнитель ops его не интерпретирует.
  - Без `kind` — snapshot вложения чата. Монолит идемпотентно удаляет канонические и
    производные MinIO-объекты и Files-копию, после чего очищает ссылки. Необязательное поле
    `bucket` — имя бакета на момент постановки: если строки пространства уже нет, удаление идёт
    по нему или по конвенции `ws-<id>`, без учёта квоты.
  - `storage_objects` — `{bucket, keys (до 1000), usageAccounting, orphanCheck?}`: перечисленные
    объекты — картинки `kb-images/` и оригиналы удалённых документов базы знаний, файлы-сироты из
    сверки хранилища. У сирот `orphanCheck: {modifiedBefore}`: монолит перед удалением заново
    проверяет каждый ключ по карте владения `shared/storage-ownership.ts` и по времени записи
    объекта. Ключ, на который снова ссылается строка, и файл новее среза остаются; бакет, в
    который пишут несколько пространств, не трогается. Ответ `{ok, deleted, skipped, kept}`.
  - `storage_prefix` — `{bucket, prefix, removeBucket, round}`: порционная очистка бакета
    удалённого пространства. Незаконченная порция ставит продолжение новой job
    `<idempotency_key>:r<N>` и отвечает `2xx`, опустевший бакет удаляется. Живое пространство
    даёт `409 FILE_ARTIFACT_CLEANUP_WORKSPACE_ALIVE`; бакет без id пространства в имени или
    бакет, на который ссылается живое пространство, — `409 FILE_ARTIFACT_CLEANUP_BUCKET_GUARD`.
    Обе ошибки `retryable:false`.

  `2xx` — успех; `409 FILE_ARTIFACT_CLEANUP_ACTIVE_ASR` — отложить без attempts;
  остальные ошибки содержат `code` и `retryable`.
- `POST /workspace-files/delete` — body `{workspaceId, storageKey}`; удаляет workspace-файл
  с метерингом байтов (prefix-гард и usage-гейдж внутри владельца). `200 {ok:true}`.
- `POST /qdrant-usage/reconcile` — body `{}`; пересчёт qdrantCollectionsCount по всем
  пространствам. `200 {ok:true, reconciled:N}`.
- Ошибки: нет токена → `503 JANITOR_GATEWAY_NOT_CONFIGURED`; неверный → `401
  JANITOR_GATEWAY_UNAUTHORIZED`; невалидное тело → `400 JANITOR_GATEWAY_BAD_REQUEST`.

Всё остальное (PG-задачи, сверка хранилища с базой, Qdrant-скан/удаление коллекций,
ledger, журнал, локи) janitor исполняет сам по общей БД/MinIO/Qdrant — gateway не нужен.
Удаление найденных сверкой файлов идёт через очередь и `POST /v1/file-artifacts/cleanup`.

## 4. Семантика исполнения

- Плановый тик каждые `JANITOR_TICK_MINUTES`; проходы не наслаиваются (skip при бегущем).
- Прогон политики — под Redis-локом `janitor:<resourceKey>` (`SET NX PX`); в production
  без Redis прогон скипается (`skipped_locked`, fail-closed).
- Graceful shutdown: SIGTERM → прерывание между батчами (`shouldAbort`), статус `partial`
  в журнале, релиз лока, дожидание текущего прохода; хвост добирает следующий тик.
- Журнал прогонов — `cleanup_run_log` (`triggered_by` auto|manual, `freed_bytes`).
- `file_artifact_cleanup_jobs` захватывается атомарно через `FOR UPDATE SKIP LOCKED`.
  Истёкший lease reclaim-ится другим pod; долгий gateway-вызов держит lease heartbeat-ом.
  Cleanup gateway получает только `{version, jobId, workerId}` и разрешает workspace,
  resource и artifact snapshot из этой канонической строки очереди.
- Ручные удаления, S3-политики и физический purge `pg.chat_sessions`/
  `pg.assistants.archived` создают один и тот же versioned snapshot до исчезновения
  исходных строк. Для двух PG-политик enqueue snapshots и каскадный DELETE выполняются
  одним data-modifying CTE; активная ASR исключает chat/assistant из батча.
  Политика `s3.chat_attachments.audio_video` выключена по умолчанию.
- Удаление пространства, пользователя, документа или базы знаний в монолите ставит в той же
  транзакции ещё и `storage_prefix` (бакет удалённого пространства) и `storage_objects`
  (картинки и оригиналы документов). Для ops это обычные jobs очереди.
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
- Фоновый прогон (`backgroundRun`): строка журнала со статусом `running` пишется в начале,
  отчёт обновляется по ходу (`recordRunProgress`), итог — в конце. Лок `janitor:<resourceKey>`
  берётся на 10 минут и продлевается каждые 3 минуты, поэтому после падения процесса политика
  освобождается за один TTL. Строку `running` без живого прогона закрывает статусом `failed`
  следующий тик, если лок политики свободен, или следующий старт этой политики. SIGTERM
  прерывает фоновый прогон, итог пишется как `partial`; новые фоновые прогоны процесс уже не
  стартует. Плановый проход фоновую политику только запускает и не ждёт.
- Сверка хранилища (`s3.storage.orphans`) обходит бакеты с префиксом `WORKSPACE_BUCKET_PREFIX` и
  бакеты живых пространств. Объект сверяется с картой владения `shared/storage-ownership.ts`:
  ссылки грузятся постранично по id и хранятся хешами, только для встретившихся папок. Найденное
  ставится в очередь заданиями `storage_objects` с `orphanCheck` (ключ идемпотентности
  `storage-orphans:<bucket>:<md5 ключей>`) и `storage_prefix` для бакета удалённого пространства
  (`storage-orphans-bucket:<bucket>`). Повторная постановка оживляет завершившееся задание. Бакет
  удалённого пространства чистится, только если в него ничего не писали дольше срока политики.
  Бакет, в который пишут несколько пространств, и бакет, в имени которого id живого пространства,
  пропускаются с записью в отчёт. За прогон ставится не больше 200 000 файлов.

## 5. Владение данными

Таблицы сервиса (создаются миграциями МОНОРЕПЫ до волны P5; изменения — синхронные PR):
`cleanup_policies` (override-ы политик), `cleanup_run_log` (журнал),
`cleanup_policy_audit_log` (аудит правок), `qdrant_orphan_candidates` (grace-ledger GC).
`file_artifact_cleanup_jobs` — общая durable-очередь удаления файловых артефактов;
producer-ы живут в монолите и retention-движке ops, consumer — постоянный worker ops.

Каталог задач (35 шт.: 27 pg / 6 s3 / 1 s3_reconcile / 1 qdrant) — декларативный реестр
в коде; консистентность со схемой стережёт контракт-тест
`tests/janitor/janitor-registry-schema-contract.test.ts` в CI монорепы.

## 6. Долг переезда (J2.3)

До переноса кода требуется развязать замороженный доменный долг (гейт
`verify:janitor-import-surface` монорепы): лёгкие — `minio-client`, `qdrant`,
`qdrant-collection-names` (пакетируются как есть); тяжёлые — `storage.ts` (2 метода →
локальный SQL/фасад), `chat-attachment-document-store`, `workspace-storage-service`,
`usage/qdrant-reconcile` (узкие фасады или пакеты `@unica/*`, гейт P2).
