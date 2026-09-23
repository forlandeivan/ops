# Инструкции для агентов — ops-сервис Уники

Операционный сервис платформы Уника (`unica-ops`): janitor — retention и уборка PostgreSQL, MinIO и Qdrant;
дальше сюда переезжают notify, maintenance-mode и admin-analytics. Node + TypeScript.

- Зеркальные файлы — `shared/schema.ts`, `shared/cleanup-policies.ts`, `shared/storage-naming.ts`,
  `server/janitor/janitor-task-registry.ts`, `server/janitor/janitor-policy-service.ts` — источник правды в
  монорепе `../rospartner.ai.unica`: правь там и переноси сюда тем же патчем (гейт `verify:ops-schema-mirror`
  в монорепе).
- Миграции БД сервис не делает — их применяет монолит. Доменные операции — только через callback-gateway
  монолита (`docs/gateway-contract.md`, раздел 3.1).
- Проверки: `npm run check` (tsc) и `npm test` (vitest).

## Итог задачи

Что изменено и какие проверки прошли.
