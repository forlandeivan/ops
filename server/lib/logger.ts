// W2/S1 (docs/w2-workflow-packaging-plan.md): реализация переехала в @unica/observability.
// Тонкий реэкспорт (strangler) — 236 импортёров `../lib/logger` не трогаются. Одна реализация
// в пакете => один инстанс pino-логгера в бандле (проверяется verify:singleton-count).
export * from "@unica/observability/lib/logger";
