/**
 * Общий лимит ожидания для операций импорта в базу знаний.
 * Используется и в клиентских HTTP-запросах, и в серверных import pipeline.
 */
export const KNOWLEDGE_IMPORT_TIMEOUT_MS = 30 * 60_000;
