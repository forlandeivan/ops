# rospartner.ai.unica.ops

Операционный сервис платформы Unica (**сервис #19 `unica-ops`** целевой карты
`docs/platform-target-architecture-and-decomposition.md` монорепы): janitor
(retention/уборка PG/MinIO/Qdrant) — первый модуль; далее сюда въезжают
notify (SMTP), maintenance-mode и admin-analytics (волна P3).

## Статус: бутстрап (волна J2.2)

Кода здесь **ещё нет** — janitor работает из монорепы (`server/janitor/**`,
отдельный образ `unica/unica-janitor`, см. `docs/janitor-microservice-extraction-research.md`
монорепы). Перенос кода (J2.3) заблокирован развязкой доменного долга: три хелпера
(`chat-attachment-document-store`, `workspace-storage-service`, `usage/qdrant-reconcile`)
тянут `storage.ts` (~240 модулей каждый) и ждут узких фасадов/пакетов `@unica/*`.
Импорт-поверхность заморожена гейтом `verify:janitor-import-surface` в монорепе.

## Что уже зафиксировано

- **Контракт сервиса** — `docs/gateway-contract.md` (env-поверхность, runtime-RPC,
  health/metrics, владение таблицами). Контракт реализован монорепной стороной в J0/J1
  и переедет сюда вместе с кодом без изменений.
- **CI** — `.gitlab-ci.yml`, спящий до `OPS_CI_ENABLED=true` (образец: agent/workflow-репо).

## Деплой-модель (как у agent/workflow)

Сервис собирается по `build.context: ../rospartner.ai.unica.ops` из compose монорепы
(sibling-чекаут на деплой-хосте обязателен). Включение HTTP-шва run-now/preview —
токеном `UNICA_JANITOR_RUNTIME_TOKEN` (см. `.env.example` монорепы).
