// W2/S1 (docs/w2-workflow-packaging-plan.md): реализация переехала в @unica/observability.
// Тонкий реэкспорт (strangler) — ~14 импортёров `../monitoring/metrics` не трогаются. Один
// инстанс prom-Registry в бандле; инверсия setDbStatsProvider (instrumentation/db-metrics)
// продолжает бить в тот же реестр (проверяется verify:singleton-count).
export * from "@unica/observability/monitoring/metrics";
