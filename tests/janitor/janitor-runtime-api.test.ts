import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CleanupPolicyError } from "../../server/janitor/janitor-policy-service";
import {
  startJanitorRuntimeApiServer,
  type JanitorHealthState,
  type JanitorRuntimeApiDeps,
} from "../../server/janitor/runtime-api-server";

const TOKEN = "test-janitor-token";

function makeDeps(overrides: Partial<JanitorRuntimeApiDeps> = {}): JanitorRuntimeApiDeps {
  return {
    getResolvedPolicy: vi.fn(async () => ({})),
    previewPolicy: vi.fn(async () => ({ matched: 7 })),
    runPolicyNow: vi.fn(async () => ({ status: "success" as const, matched: 5, deleted: 5, freedBytes: 0 })),
    ...overrides,
  };
}

describe("janitor runtime API", () => {
  let close: (() => Promise<void>) | null = null;

  beforeEach(() => {
    vi.stubEnv("UNICA_JANITOR_RUNTIME_TOKEN", TOKEN);
  });

  afterEach(async () => {
    await close?.();
    close = null;
    vi.unstubAllEnvs();
  });

  async function startServer(deps: JanitorRuntimeApiDeps, state: Partial<JanitorHealthState> = {}) {
    const server = await startJanitorRuntimeApiServer({
      port: 0,
      deps,
      getState: () => ({
        startedAt: "2026-07-17T00:00:00.000Z",
        databaseReady: true,
        orchestratorStarted: true,
        cleanupWorkerStarted: true,
        enabled: true,
        tickMinutes: 15,
        ...state,
      }),
    });
    close = server.close;
    return `http://127.0.0.1:${server.port}`;
  }

  it("health/live отвечает без токена и не раскрывает, настроен ли токен", async () => {
    const base = await startServer(makeDeps());
    const res = await fetch(`${base}/health/live`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ status: "ok" });
    expect(body).not.toHaveProperty("tokenConfigured");
  });

  it("до запуска исполнителей RPC отвечает 503, исполнители не вызываются", async () => {
    const deps = makeDeps();
    const base = await startServer(deps, { databaseReady: false, cleanupWorkerStarted: false });
    const res = await fetch(`${base}/v1/cleanup-policies/pg.test/preview`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toMatchObject({ code: "JANITOR_RUNTIME_STARTING" });
    expect(deps.previewPolicy).not.toHaveBeenCalled();
  });

  it("rpcEnabled=false (JANITOR_RUNTIME_PORT=0) выключает RPC, пробы остаются", async () => {
    const server = await startJanitorRuntimeApiServer({
      port: 0,
      rpcEnabled: false,
      deps: makeDeps(),
      getState: () => ({
        startedAt: "2026-07-17T00:00:00.000Z",
        databaseReady: true,
        orchestratorStarted: true,
        cleanupWorkerStarted: true,
        enabled: true,
        tickMinutes: 15,
      }),
    });
    close = server.close;
    const base = `http://127.0.0.1:${server.port}`;
    const rpc = await fetch(`${base}/v1/cleanup-policies/pg.test/preview`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    expect(rpc.status).toBe(404);
    expect((await fetch(`${base}/health/ready`)).status).toBe(200);
  });

  it("без сконфигурированного токена RPC отвечает 503", async () => {
    vi.stubEnv("UNICA_JANITOR_RUNTIME_TOKEN", "");
    const base = await startServer(makeDeps());
    const res = await fetch(`${base}/v1/cleanup-policies/pg.test/preview`, { method: "POST" });
    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toMatchObject({ code: "JANITOR_RUNTIME_TOKEN_NOT_CONFIGURED" });
  });

  it("неверный bearer → 401, исполнители не вызываются", async () => {
    const deps = makeDeps();
    const base = await startServer(deps);
    const res = await fetch(`${base}/v1/cleanup-policies/pg.test/preview`, {
      method: "POST",
      headers: { Authorization: "Bearer wrong" },
    });
    expect(res.status).toBe(401);
    expect(deps.previewPolicy).not.toHaveBeenCalled();
  });

  it("preview с валидным токеном возвращает matched", async () => {
    const deps = makeDeps();
    const base = await startServer(deps);
    const res = await fetch(`${base}/v1/cleanup-policies/pg.test/preview`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ matched: 7 });
    expect(deps.getResolvedPolicy).toHaveBeenCalledWith("pg.test");
  });

  it("run-now прокидывает actorId из тела", async () => {
    const deps = makeDeps();
    const base = await startServer(deps);
    const res = await fetch(`${base}/v1/cleanup-policies/pg.test/run-now`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ actorId: "admin-1" }),
    });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ status: "success", deleted: 5 });
    expect(deps.runPolicyNow).toHaveBeenCalledWith("pg.test", "admin-1");
  });

  it("неизвестная политика → статус CleanupPolicyError (404)", async () => {
    const deps = makeDeps({
      getResolvedPolicy: vi.fn(async () => {
        throw new CleanupPolicyError("Политика не найдена", 404);
      }),
    });
    const base = await startServer(deps);
    const res = await fetch(`${base}/v1/cleanup-policies/nope/run-now`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({ code: "CLEANUP_POLICY_ERROR" });
  });

  it("неизвестный маршрут → 404", async () => {
    const base = await startServer(makeDeps());
    const res = await fetch(`${base}/v1/other`, { method: "POST" });
    expect(res.status).toBe(404);
  });
});
