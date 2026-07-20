// W2/S2 (docs/w2-workflow-packaging-plan.md): реализация переехала в @unica/cache.
// Тонкий реэкспорт (strangler) — импортёры `./cache`/`../cache` не трогаются. default =
// getCache() сохранён отдельным реэкспортом (`export *` его не переносит).
export * from "@unica/cache";
export { default } from "@unica/cache";
