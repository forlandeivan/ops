# rospartner.ai.unica.ops

Операционный сервис платформы Unica (**сервис #19 `unica-ops`** целевой карты
`docs/platform-target-architecture-and-decomposition.md` монорепы): janitor
(retention/уборка PG/MinIO/Qdrant) — первый модуль; далее сюда въезжают
notify (SMTP), maintenance-mode и admin-analytics (волна P3).

## Статус: код janitor перенесён (волна J2.3c)

Сервис собирается и запускается standalone: `tsc` чист, `vitest` 86/86,
esbuild-бандл ~590 КБ (0 внешних `@unica/*` — инлайнятся из исходников).
Полный контур доказан локально: preview/run-now по RPC, health/readiness/metrics,
доменный callback уходит в монолит.

## Состав

```
server/
  janitor-runtime-entry.ts   точка входа: readiness БД → health-сервер → RPC → оркестратор
  janitor/                   реестр политик, оркестратор, policy-service, движки задач,
                             health-сервер, runtime-RPC, клиент callback-gateway,
                             default-stores (ops-вариант: доменные операции ТОЛЬКО по gateway)
  db.ts cache/ lib/ monitoring/ config/ qdrant*.ts minio-client.ts   тонкая инфра (реэкспорты @unica/*)
packages/                    @unica/*: observability, postgres-client, cache, runtime-utils,
                             instrumentation, blob-storage
shared/                      ВЕРБАТИМ-зеркало контрактов монолита (SoT — монорепа)
tests/janitor/               86 юнит-тестов (движки, реестр, health, RPC, gateway-клиент)
```

## Границы сервиса

- **Сам исполняет:** 24 PG-задачи retention, скан осиротевших объектов S3,
  скан/удаление коллекций Qdrant, grace-ledger, журнал прогонов, распределённые локи.
- **Через callback-gateway монолита** (`/api/internal/janitor`, см. `docs/gateway-contract.md` §3.1):
  удаление вложения чата с производными, удаление workspace-файла с метерингом,
  reconcile Qdrant-usage. Владелец доменной логики — монолит, копий здесь нет.
- **Не делает:** миграции БД (их применяет монолит), доменные чтения вне своих задач.

## Запуск

```bash
npm ci
npm run dev     # tsx watch, читает .env
npm run build   # esbuild → dist/janitor-runtime-entry.js
npm start
```

Обязательные env: `APP_ROLE=janitor`, `DATABASE_URL`, `UNICA_JANITOR_GATEWAY_URL` +
`UNICA_JANITOR_GATEWAY_TOKEN` (без них сторы падают на старте — доменные операции
исполнять нечем). Полный перечень — `docs/gateway-contract.md` §2.

Порты: `5003` health/readiness/metrics, `5004` runtime-RPC (preview/run-now из админки).

## Синхронизация контрактов

`shared/**` — копия монорепы, источник истины там. Дрифт стережёт гейт
`npm run verify:ops-schema-mirror` в контуре `verify:required` монорепы
(schema.ts, cleanup-policies.ts, storage-naming.ts). Правки контрактов — синхронными PR.

## Деплой

Собирается из compose монорепы по `build.context: ../rospartner.ai.unica.ops`
(sibling-чекаут на деплой-хосте обязателен) либо своим CI (`.gitlab-ci.yml`,
спит до `OPS_CI_ENABLED=true`).
