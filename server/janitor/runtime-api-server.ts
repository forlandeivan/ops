/**
 * Runtime-RPC janitor-процесса (direction-1, волна J1): исполнение `preview` и
 * `run-now` по HTTP, чтобы админ-операции не требовали janitor-кода в api-процессе.
 *
 * Голый node:http (без Express). Аутентификация — статический bearer
 * `UNICA_JANITOR_RUNTIME_TOKEN` через timingSafeEqual (образец агент-gateway:
 * токен не задан → 503, неверный → 401).
 */
import crypto from "crypto";
import http from "http";

import { createLogger } from "../lib/logger";
import { CleanupPolicyError, getResolvedPolicy } from "./janitor-policy-service";
import { previewPolicy, runPolicyNow, type RunPolicyOutcome } from "./janitor-orchestrator";

const logger = createLogger("janitor-runtime-api");

const MAX_BODY_BYTES = 64 * 1024;
const ROUTE_RE = /^\/v1\/cleanup-policies\/([^/]+)\/(preview|run-now)$/;

/** Инъекция исполнителей для юнит-тестов; боевые дефолты — оркестратор и policy-service. */
export interface JanitorRuntimeApiDeps {
  getResolvedPolicy: (key: string) => Promise<unknown>;
  previewPolicy: (key: string) => Promise<{ matched: number }>;
  runPolicyNow: (key: string, actorId: string | null) => Promise<RunPolicyOutcome>;
}

function defaultDeps(): JanitorRuntimeApiDeps {
  return {
    getResolvedPolicy: (key) => getResolvedPolicy(key),
    previewPolicy: (key) => previewPolicy(key),
    runPolicyNow: (key, actorId) => runPolicyNow(key, undefined, actorId),
  };
}

function expectedToken(): string | null {
  const token = process.env.UNICA_JANITOR_RUNTIME_TOKEN?.trim();
  return token && token.length > 0 ? token : null;
}

function timingSafeEqualStr(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) {
    return false;
  }
  return crypto.timingSafeEqual(left, right);
}

function extractToken(req: http.IncomingMessage): string | null {
  const header = req.headers.authorization;
  if (typeof header === "string" && header.startsWith("Bearer ")) {
    const token = header.slice("Bearer ".length).trim();
    return token.length > 0 ? token : null;
  }
  const fallback = req.headers["x-janitor-runtime-token"];
  if (typeof fallback === "string") {
    const token = fallback.trim();
    return token.length > 0 ? token : null;
  }
  return null;
}

async function readJsonBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.length;
    if (total > MAX_BODY_BYTES) {
      throw new Error("request body too large");
    }
    chunks.push(buf);
  }
  if (total === 0) {
    return {};
  }
  const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : {};
}

function sendJson(res: http.ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

export async function startJanitorRuntimeApiServer(params: {
  port: number;
  host?: string;
  deps?: JanitorRuntimeApiDeps;
}): Promise<{ port: number; close: () => Promise<void> }> {
  const host = params.host ?? "0.0.0.0";
  const deps = params.deps ?? defaultDeps();

  const server = http.createServer((req, res) => {
    void handleRequest(req, res, deps).catch((error: unknown) => {
      logger.error(
        { err: error instanceof Error ? error.message : String(error) },
        "[janitor-runtime-api] request failed",
      );
      if (!res.headersSent) {
        sendJson(res, 500, { message: "janitor runtime request failed", code: "JANITOR_RUNTIME_INTERNAL" });
      }
    });
  });

  async function handleRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    handlers: JanitorRuntimeApiDeps,
  ): Promise<void> {
    const url = (req.url ?? "/").split("?")[0];

    if (req.method === "GET" && url === "/v1/health") {
      sendJson(res, 200, {
        status: "ok",
        role: "janitor",
        tokenConfigured: Boolean(expectedToken()),
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const match = req.method === "POST" ? ROUTE_RE.exec(url) : null;
    if (!match) {
      sendJson(res, 404, { message: "not found", code: "JANITOR_RUNTIME_NOT_FOUND" });
      return;
    }

    const expected = expectedToken();
    if (!expected) {
      sendJson(res, 503, {
        message: "Janitor runtime token is not configured",
        code: "JANITOR_RUNTIME_TOKEN_NOT_CONFIGURED",
      });
      return;
    }
    const actual = extractToken(req);
    if (!actual || !timingSafeEqualStr(actual, expected)) {
      sendJson(res, 401, {
        message: "Unauthorized janitor runtime request",
        code: "JANITOR_RUNTIME_UNAUTHORIZED",
      });
      return;
    }

    const key = decodeURIComponent(match[1]);
    const action = match[2];

    try {
      // Валидация ключа тем же слоем, что и в админ-роуте: неизвестная политика → 404.
      await handlers.getResolvedPolicy(key);

      if (action === "preview") {
        const result = await handlers.previewPolicy(key);
        sendJson(res, 200, result);
        return;
      }

      const body = await readJsonBody(req);
      const actorId = typeof body.actorId === "string" && body.actorId.trim().length > 0 ? body.actorId : null;
      const result = await handlers.runPolicyNow(key, actorId);
      sendJson(res, 200, result);
    } catch (error) {
      if (error instanceof CleanupPolicyError) {
        sendJson(res, error.status, { message: error.message, code: "CLEANUP_POLICY_ERROR" });
        return;
      }
      throw error;
    }
  }

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(params.port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address();
  const port =
    address && typeof address === "object" && typeof address.port === "number"
      ? address.port
      : params.port;

  return {
    port,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      }),
  };
}
