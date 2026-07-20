// W2/S2 (docs/w2-workflow-packaging-plan.md): реализация переехала в @unica/blob-storage.
// Тонкий реэкспорт (strangler) — ~11 импортёров не трогаются.
export * from "@unica/blob-storage/minio-client";
