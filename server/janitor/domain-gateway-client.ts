/**
 * HTTP-клиент callback-gateway janitor (direction-2 «janitor → монолит», J2.3b).
 *
 * Доменные операции уборки, владелец которых — монолит: удаление вложения чата
 * с производными, удаление workspace-файла с метерингом, reconcile Qdrant-usage.
 * Чистый модуль (fetch + логгер, БЕЗ доменных импортов): при переносе janitor в
 * unica-ops едет как есть. Выбор ветки HTTP/in-process делает default-stores.
 */
import { createLogger } from "../lib/logger";

const logger = createLogger("janitor-domain-gateway");

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000; // reconcile обходит все workspace и может быть долгим

/** Ссылка на вложение для purge производных (JSON-DTO контракта gateway). */
export interface GatewayChatAttachmentRef {
  id: string;
  chatId: string;
  filename: string;
  mimeType: string | null;
  storageKey: string;
  documentVersion: number;
  derivedManifestObjectKey: string | null;
  previewObjectKey: string | null;
}

/** Доменные операции уборки, исполняемые владельцем (монолитом). */
export interface JanitorDomainGateway {
  purgeChatAttachmentArtifacts(workspaceId: string, attachment: GatewayChatAttachmentRef): Promise<void>;
  deleteWorkspaceFile(workspaceId: string, storageKey: string): Promise<void>;
  reconcileQdrantUsage(): Promise<void>;
}

export class JanitorDomainGatewayError extends Error {
  status: number;
  code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = "JanitorDomainGatewayError";
    this.status = status;
    this.code = code;
  }
}

export function gatewayUrl(): string | null {
  const raw = process.env.UNICA_JANITOR_GATEWAY_URL?.trim();
  if (!raw) {
    return null;
  }
  return raw.replace(/\/+$/, "");
}

export function gatewayToken(): string | null {
  const raw = process.env.UNICA_JANITOR_GATEWAY_TOKEN?.trim();
  if (raw && raw.length > 0) {
    return raw;
  }
  const fallback = process.env.UNICA_JANITOR_RUNTIME_TOKEN?.trim();
  return fallback && fallback.length > 0 ? fallback : null;
}

function timeoutMs(): number {
  const raw = process.env.UNICA_JANITOR_GATEWAY_TIMEOUT_MS;
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_TIMEOUT_MS;
}

async function callGateway(baseUrl: string, path: string, body: Record<string, unknown>): Promise<void> {
  const token = gatewayToken();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs());

  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    const timedOut = controller.signal.aborted;
    logger.error(
      { path, err: error instanceof Error ? error.message : String(error), timedOut },
      "[janitor-domain-gateway] gateway call failed",
    );
    throw new JanitorDomainGatewayError(
      timedOut ? "Janitor gateway call timed out" : "Janitor gateway is unavailable",
      timedOut ? 504 : 503,
      timedOut ? "JANITOR_GATEWAY_TIMEOUT" : "JANITOR_GATEWAY_UNAVAILABLE",
    );
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    const message = typeof payload.message === "string" ? payload.message : `janitor gateway HTTP ${response.status}`;
    const code = typeof payload.code === "string" ? payload.code : "JANITOR_GATEWAY_ERROR";
    throw new JanitorDomainGatewayError(message, response.status, code);
  }
}

/** HTTP-реализация gateway; boundary-URL валидируется вызывающим (default-stores). */
export function createHttpJanitorDomainGateway(baseUrl: string): JanitorDomainGateway {
  return {
    purgeChatAttachmentArtifacts: (workspaceId, attachment) =>
      callGateway(baseUrl, "/chat-attachments/purge-artifacts", { workspaceId, attachment }),
    deleteWorkspaceFile: (workspaceId, storageKey) =>
      callGateway(baseUrl, "/workspace-files/delete", { workspaceId, storageKey }),
    reconcileQdrantUsage: () => callGateway(baseUrl, "/qdrant-usage/reconcile", {}),
  };
}
