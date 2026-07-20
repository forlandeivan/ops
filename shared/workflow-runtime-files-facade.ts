/**
 * @shared-фасад файловых операций workflow-runtime (W2/S8 Tier-2,
 * docs/w2-workflow-packaging-plan.md §5). Сигнатуры workspace-хранилища и извлечения
 * текста, которые ядро зовёт через `WorkflowGateway.files` — без type-импорта
 * `../workspace-storage-service` / `../text-extraction`.
 *
 * Параметры скопированы точно; возвраты ослаблены до полей, которые читает ядро
 * (`contentType`/`bytes`/`warnings` отброшены). `fileBuffer` сужен до `Buffer` (ядро
 * передаёт только Buffer; реальный `Buffer | Readable` шире → wire-присваивание проходит).
 * `PageBoundary` уже вынесен в `@shared/workflow-runtime-config-types`.
 *
 * WD4.2 спец-транспорт (§7.2): целевая HTTP-форма — data/control-plane разрез.
 * `extractWorkspaceFileText` — collapse чтения+извлечения (узел document_sources): раннер
 * шлёт только storageKey (pointer), монолит читает из MinIO и извлекает ЛОКАЛЬНО, крупные
 * байты не покидают монолит (иначе PDF слотов round-trip'ился бы через шов, contra §7.2).
 * `readWorkspaceFileBuffer` остаётся для docx_render-шаблона (раннеру нужны байты для рендера —
 * HTTP-форма = presigned GET). `extractTextFromBuffer`/`extractPdfWithPageOffsets` — теперь
 * форвард-пойнтер домена unica-docproc (ядро зовёт их только через `extractWorkspaceFileText`).
 */

import type { PageBoundary } from "@shared/workflow-runtime-config-types";

/** Файлы: workspace-хранилище и извлечение текста (MinIO — §7.2 карты / контракт). */
export type WorkflowGatewayFilesPort = {
  uploadWorkspaceFile(
    workspaceId: string,
    relativePath: string,
    fileBuffer: Buffer,
    mimeType?: string,
    explicitSizeBytes?: number | null,
  ): Promise<{ key: string }>;
  readWorkspaceFileBuffer(params: {
    workspaceId: string;
    storageKey: string;
    userId?: string | null;
  }): Promise<{ buffer: Buffer }>;
  /**
   * Collapse read→extract узла document_sources в один вызов по storageKey. In-process =
   * readWorkspaceFileBuffer + (isPdf ? extractPdfWithPageOffsets : extractTextFromBuffer);
   * HTTP = единый control-plane callback (монолит читает из MinIO + извлекает локально,
   * байты не идут через шов). `pageBoundaries` заполнен только для PDF, иначе null.
   */
  extractWorkspaceFileText(params: {
    workspaceId: string;
    storageKey: string;
    filename: string;
    mimeType?: string | null;
    preserveNewlines?: boolean;
    userId?: string | null;
  }): Promise<{ text: string; pageBoundaries: PageBoundary[] | null }>;
  extractTextFromBuffer(params: {
    buffer: Buffer;
    filename: string;
    mimeType?: string | null;
    preserveNewlines?: boolean;
    userId?: string | null;
    traceId?: string | null;
    requestId?: string | null;
  }): Promise<{ text: string }>;
  extractPdfWithPageOffsets(buffer: Buffer): Promise<{
    text: string;
    pageBoundaries: PageBoundary[];
  }>;
};
