// W2/S3 (docs/w2-workflow-packaging-plan.md): реализация переехала в @unica/postgres-client.
// Тонкий реэкспорт (strangler) — 125 импортёров `./db`/`../db` не трогаются. Один инстанс
// pg/Neon Pool + drizzle на процесс-бандл (verify:singleton-count). Env грузится первым
// импортом пакета (@unica/runtime-utils/load-env) до создания пула — порядок сохранён.
export * from "@unica/postgres-client";
