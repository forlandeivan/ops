import { describe, expect, it, vi } from "vitest";
import { runAgentSessionFoldersTask } from "../../server/janitor/tasks/agent-session-folders-task";

const config = { mode: "enforce" as const, retentionDays: 7, batchSize: 3 };
describe("agent session folders executor", () => {
  it("drains bounded batches without offset and preserves actual progress", async () => {
    const purge = vi.fn().mockResolvedValueOnce({ purged: 3, remaining: 2 }).mockResolvedValueOnce({ purged: 2, remaining: 0 });
    const progress = vi.fn();
    expect(await runAgentSessionFoldersTask(config, { purge }, { maxBatchesPerRun: 3, onProgress: progress }))
      .toEqual({ matched: 5, deleted: 5, aborted: false, reason: null });
    expect(purge.mock.calls).toEqual([[{ olderThanDays: 7, limit: 3, dryRun: false }], [{ olderThanDays: 7, limit: 3, dryRun: false }]]);
    expect(progress.mock.calls).toEqual([[3], [2]]);
  });
  it("previews the full eligible count exactly once and deletes nothing", async () => {
    const purge = vi.fn(async () => ({ purged: 0, remaining: 1200 }));
    expect(await runAgentSessionFoldersTask({ ...config, mode: "dry_run" }, { purge }, { maxBatchesPerRun: 20 }))
      .toMatchObject({ matched: 1200, deleted: 0, aborted: false });
    expect(purge).toHaveBeenCalledTimes(1);
    expect(purge).toHaveBeenCalledWith({ olderThanDays: 7, limit: 3, dryRun: true });
  });
  it("stops at batch budget or shutdown without another destructive call", async () => {
    const purge = vi.fn(async () => ({ purged: 3, remaining: 6 }));
    expect(await runAgentSessionFoldersTask(config, { purge }, { maxBatchesPerRun: 1 })).toMatchObject({ deleted: 3, aborted: true, reason: "batch_limit" });
    expect(await runAgentSessionFoldersTask(config, { purge }, { maxBatchesPerRun: 5, shouldAbort: () => true })).toMatchObject({ deleted: 0, reason: "shutdown" });
    expect(purge).toHaveBeenCalledTimes(1);
  });
  it("honors shutdown between batches", async () => {
    let stop = false;
    const purge = vi.fn(async () => { stop = true; return { purged: 3, remaining: 6 }; });
    expect(await runAgentSessionFoldersTask(config, { purge }, { maxBatchesPerRun: 5, shouldAbort: () => stop })).toMatchObject({ deleted: 3, reason: "shutdown" });
    expect(purge).toHaveBeenCalledTimes(1);
  });
  it("fails closed on missing executor, no progress, malformed results and unexpected dry-run deletion", async () => {
    await expect(runAgentSessionFoldersTask(config, undefined, { maxBatchesPerRun: 3 })).rejects.toThrow("No agent");
    await expect(runAgentSessionFoldersTask(config, { purge: async () => ({ purged: 0, remaining: 1 }) }, { maxBatchesPerRun: 3 })).rejects.toThrow("no progress");
    for (const result of [{ purged: -1, remaining: 0 }, { purged: 4, remaining: 0 }, { purged: 1, remaining: NaN }]) {
      await expect(runAgentSessionFoldersTask(config, { purge: async () => result }, { maxBatchesPerRun: 3 })).rejects.toThrow("Invalid");
    }
    await expect(runAgentSessionFoldersTask({ ...config, mode: "dry_run" }, { purge: async () => ({ purged: 1, remaining: 0 }) }, { maxBatchesPerRun: 3 })).rejects.toThrow("Invalid");
  });
});
