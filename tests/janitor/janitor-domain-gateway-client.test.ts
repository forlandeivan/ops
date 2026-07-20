import http from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createHttpJanitorDomainGateway,
  JanitorDomainGatewayError,
} from "../../server/janitor/domain-gateway-client";

/** HTTP-клиент callback-gateway: заголовки, тела, маппинг ошибок. Чистый юнит на стаб-сервере. */
describe("janitor domain-gateway client", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  async function withStub(
    handler: (req: http.IncomingMessage, body: string, res: http.ServerResponse) => void,
    run: (base: string, requests: Array<{ url: string; auth?: string; body: string }>) => Promise<void>,
  ) {
    const requests: Array<{ url: string; auth?: string; body: string }> = [];
    const server = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        requests.push({ url: req.url ?? "", auth: req.headers.authorization, body });
        handler(req, body, res);
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    const base = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
    try {
      await run(base, requests);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    }
  }

  it("шлёт Bearer и корректные тела на все три операции", async () => {
    vi.stubEnv("UNICA_JANITOR_GATEWAY_TOKEN", "gw-secret");
    await withStub(
      (_req, _body, res) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      },
      async (base, requests) => {
        const gateway = createHttpJanitorDomainGateway(base);
        await gateway.deleteWorkspaceFile("ws-1", "feedback-attachments/u/a.png");
        await gateway.reconcileQdrantUsage();

        expect(requests).toHaveLength(2);
        expect(requests[0].url).toBe("/workspace-files/delete");
        expect(requests[0].auth).toBe("Bearer gw-secret");
        expect(JSON.parse(requests[0].body)).toEqual({
          workspaceId: "ws-1",
          storageKey: "feedback-attachments/u/a.png",
        });
        expect(requests[1].url).toBe("/qdrant-usage/reconcile");
      },
    );
  });

  it("HTTP-ошибка мапится в JanitorDomainGatewayError со статусом и кодом", async () => {
    vi.stubEnv("UNICA_JANITOR_GATEWAY_TOKEN", "gw-secret");
    await withStub(
      (_req, _body, res) => {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ message: "Unauthorized", code: "JANITOR_GATEWAY_UNAUTHORIZED" }));
      },
      async (base) => {
        const gateway = createHttpJanitorDomainGateway(base);
        await expect(gateway.reconcileQdrantUsage()).rejects.toMatchObject({
          name: "JanitorDomainGatewayError",
          status: 401,
          code: "JANITOR_GATEWAY_UNAUTHORIZED",
        });
      },
    );
  });

  it("недоступный монолит → 503 JANITOR_GATEWAY_UNAVAILABLE", async () => {
    vi.stubEnv("UNICA_JANITOR_GATEWAY_TOKEN", "gw-secret");
    const gateway = createHttpJanitorDomainGateway("http://127.0.0.1:1");
    const error = await gateway
      .deleteWorkspaceFile("ws-1", "k")
      .then(() => null)
      .catch((err: unknown) => err);
    expect(error).toBeInstanceOf(JanitorDomainGatewayError);
    expect((error as JanitorDomainGatewayError).status).toBe(503);
  });
});
