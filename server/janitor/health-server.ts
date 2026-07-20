/**
 * HTTP-сервер здоровья janitor-процесса (k8s liveness/readiness + Prometheus scrape).
 *
 * Голый node:http без Express — не расширяет бандл и поверхность janitor.
 * Эндпоинты: `/healthz` (+`/health`) — liveness; `/health/ready` (+`/ready`) — readiness
 * (готовность БД и запуск оркестратора); `/metrics` — Prometheus-реестр процесса.
 */
import http from "http";

import { register } from "../monitoring/metrics";

export interface JanitorHealthState {
  startedAt: string;
  /** БД доступна и таблицы политик существуют (миграции применены). */
  databaseReady: boolean;
  /** Оркестратор запущен (false до готовности БД или при JANITOR_ENABLED=false). */
  orchestratorStarted: boolean;
  /** Значение гейта JANITOR_ENABLED на старте процесса. */
  enabled: boolean;
  tickMinutes: number;
}

export async function startJanitorHealthServer(params: {
  port: number;
  host?: string;
  getState: () => JanitorHealthState;
}): Promise<{ port: number; close: () => Promise<void> }> {
  const host = params.host ?? "0.0.0.0";

  const server = http.createServer((req, res) => {
    const url = (req.url ?? "/").split("?")[0];
    const state = params.getState();

    if (url === "/healthz" || url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ status: "ok", role: "janitor", ...state }));
      return;
    }

    if (url === "/health/ready" || url === "/ready") {
      // При выключенном оркестраторе (JANITOR_ENABLED=false) под считается готовым,
      // как только БД доступна: деплой не должен флапать из-за осознанно выключенной уборки.
      const ready = state.databaseReady && (state.orchestratorStarted || !state.enabled);
      res.writeHead(ready ? 200 : 503, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ status: ready ? "ready" : "starting", ready, role: "janitor", ...state }));
      return;
    }

    if (url === "/metrics") {
      void register
        .metrics()
        .then((body) => {
          res.writeHead(200, { "Content-Type": register.contentType });
          res.end(body);
        })
        .catch((error: unknown) => {
          res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
          res.end(`metrics collection failed: ${error instanceof Error ? error.message : String(error)}`);
        });
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ status: "not_found" }));
  });

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
