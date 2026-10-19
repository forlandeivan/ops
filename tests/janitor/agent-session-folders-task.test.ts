import { describe, expect, it, vi } from "vitest";

import { runAgentSessionFoldersTask, type AgentSessionFoldersStore } from "../../server/janitor/tasks/agent-session-folders-task";
import { getJanitorTask } from "../../server/janitor/janitor-task-registry";

// Политика «Рабочие папки сессий агента» (SEC-08.2): папки удаляет сервис агента через монолит, janitor зовёт пачками.
function storeWith(results: Array<{ purged: number; remaining: number }>) {
  const purge = vi.fn<AgentSessionFoldersStore["purge"]>();
  for (const result of results) {
    purge.mockResolvedValueOnce(result);
  }
  return { store: { purge }, purge };
}

describe("agent.session_folders", () => {
  it("предпросмотр только считает: сервис зовут с dryRun", async () => {
    const { store, purge } = storeWith([{ purged: 0, remaining: 42 }]);

    const result = await runAgentSessionFoldersTask(
      { mode: "dry_run", retentionDays: 7, batchSize: 500 },
      store,
      { maxBatchesPerRun: 10 },
    );

    expect(result).toEqual({ matched: 42, deleted: 0, aborted: false });
    expect(purge).toHaveBeenCalledWith({ olderThanDays: 7, limit: 500, dryRun: true });
  });

  it("удаляет пачками, пока просроченных не останется", async () => {
    const { store, purge } = storeWith([
      { purged: 500, remaining: 700 },
      { purged: 500, remaining: 200 },
      { purged: 200, remaining: 0 },
    ]);

    const result = await runAgentSessionFoldersTask(
      { mode: "enforce", retentionDays: 7, batchSize: 500 },
      store,
      { maxBatchesPerRun: 10 },
    );

    expect(result).toEqual({ matched: 1200, deleted: 1200, aborted: false });
    expect(purge).toHaveBeenCalledTimes(3);
    expect(purge).toHaveBeenLastCalledWith({ olderThanDays: 7, limit: 500, dryRun: false });
  });

  it("не крутится вхолостую, если сервис ничего не удалил", async () => {
    const { store, purge } = storeWith([{ purged: 0, remaining: 3 }]);

    const result = await runAgentSessionFoldersTask(
      { mode: "enforce", retentionDays: 7, batchSize: 500 },
      store,
      { maxBatchesPerRun: 10 },
    );

    expect(result).toEqual({ matched: 3, deleted: 0, aborted: false });
    expect(purge).toHaveBeenCalledTimes(1);
  });

  it("останавливается по просьбе прогона", async () => {
    const { store, purge } = storeWith([{ purged: 500, remaining: 500 }]);
    let calls = 0;

    const result = await runAgentSessionFoldersTask(
      { mode: "enforce", retentionDays: 7, batchSize: 500 },
      store,
      { maxBatchesPerRun: 10, shouldAbort: () => calls++ > 0 },
    );

    expect(result.aborted).toBe(true);
    expect(purge).toHaveBeenCalledTimes(1);
  });

  it("в реестре: включена, 7 дней, не дольше ленты сессий", () => {
    const folders = getJanitorTask("agent.session_folders");
    const feed = getJanitorTask("pg.agent_sessions");

    expect(folders).toMatchObject({ storage: "agent_session_folders", defaultEnabled: true, defaultRetentionDays: 7 });
    expect(folders?.retentionNotLongerThan).toBe("pg.agent_sessions");
    expect(feed).toMatchObject({ action: "delete_rows", table: "agent_sessions", timeColumn: "finished_at" });
    expect(feed).toMatchObject({ defaultEnabled: true, defaultRetentionDays: 14 });
  });
});
