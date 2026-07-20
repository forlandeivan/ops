import { afterEach, describe, expect, it } from "vitest";

import { startJanitorHealthServer, type JanitorHealthState } from "../../server/janitor/health-server";
import { janitorRunsTotal } from "../../server/monitoring/janitor-metrics";

function makeState(partial: Partial<JanitorHealthState> = {}): JanitorHealthState {
  return {
    startedAt: "2026-07-17T00:00:00.000Z",
    databaseReady: false,
    orchestratorStarted: false,
    enabled: true,
    tickMinutes: 15,
    ...partial,
  };
}

describe("janitor health server", () => {
  let close: (() => Promise<void>) | null = null;

  afterEach(async () => {
    await close?.();
    close = null;
  });

  it("liveness отвечает 200 сразу, readiness — 503 до готовности БД", async () => {
    let state = makeState();
    const server = await startJanitorHealthServer({ port: 0, getState: () => state });
    close = server.close;

    const live = await fetch(`http://127.0.0.1:${server.port}/healthz`);
    expect(live.status).toBe(200);
    await expect(live.json()).resolves.toMatchObject({ status: "ok", role: "janitor" });

    const notReady = await fetch(`http://127.0.0.1:${server.port}/health/ready`);
    expect(notReady.status).toBe(503);

    state = makeState({ databaseReady: true, orchestratorStarted: true });
    const ready = await fetch(`http://127.0.0.1:${server.port}/health/ready`);
    expect(ready.status).toBe(200);
    await expect(ready.json()).resolves.toMatchObject({ ready: true });
  });

  it("при JANITOR_ENABLED=false под готов после БД даже без оркестратора", async () => {
    const state = makeState({ databaseReady: true, orchestratorStarted: false, enabled: false });
    const server = await startJanitorHealthServer({ port: 0, getState: () => state });
    close = server.close;

    const ready = await fetch(`http://127.0.0.1:${server.port}/ready`);
    expect(ready.status).toBe(200);
  });

  it("отдаёт Prometheus-метрики janitor на /metrics", async () => {
    janitorRunsTotal.inc({ policy: "pg.assistant_executions", status: "success", trigger: "auto" });

    const server = await startJanitorHealthServer({ port: 0, getState: () => makeState() });
    close = server.close;

    const res = await fetch(`http://127.0.0.1:${server.port}/metrics`);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("janitor_runs_total");
  });

  it("неизвестный путь — 404", async () => {
    const server = await startJanitorHealthServer({ port: 0, getState: () => makeState() });
    close = server.close;

    const res = await fetch(`http://127.0.0.1:${server.port}/nope`);
    expect(res.status).toBe(404);
  });
});
