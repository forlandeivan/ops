import { describe, expect, it, vi } from "vitest";
import { runWorkspacePurgeTask } from "../../server/janitor/tasks/workspace-purge-task";

const config = { mode: "enforce" as const, batchSize: 2000 };
describe("workspace purge executor", () => {
  it("repeats bounded steps until no workspace awaits purge and reports purged workspaces", async () => {
    const purge = vi.fn()
      .mockResolvedValueOnce({ purgedRows: 6000, purgedWorkspaces: 0, remaining: 2 })
      .mockResolvedValueOnce({ purgedRows: 900, purgedWorkspaces: 1, remaining: 1 })
      .mockResolvedValueOnce({ purgedRows: 10, purgedWorkspaces: 1, remaining: 0 });
    const progress = vi.fn();
    expect(await runWorkspacePurgeTask(config, { purge }, { maxBatchesPerRun: 10, onProgress: progress }))
      .toEqual({ matched: 2, deleted: 2, aborted: false, reason: null });
    expect(purge).toHaveBeenCalledTimes(3);
    expect(purge).toHaveBeenCalledWith({ limit: 2000, dryRun: false });
    expect(progress.mock.calls).toEqual([[1], [1]]);
  });
  it("previews how many workspaces await purge exactly once and deletes nothing", async () => {
    const purge = vi.fn(async () => ({ purgedRows: 0, purgedWorkspaces: 0, remaining: 7 }));
    expect(await runWorkspacePurgeTask({ ...config, mode: "dry_run" }, { purge }, { maxBatchesPerRun: 20 }))
      .toEqual({ matched: 7, deleted: 0, aborted: false, reason: null });
    expect(purge).toHaveBeenCalledTimes(1);
    expect(purge).toHaveBeenCalledWith({ limit: 2000, dryRun: true });
  });
  it("stops at batch budget or shutdown and still reports what is left", async () => {
    const purge = vi.fn(async () => ({ purgedRows: 2000, purgedWorkspaces: 0, remaining: 3 }));
    expect(await runWorkspacePurgeTask(config, { purge }, { maxBatchesPerRun: 2 }))
      .toEqual({ matched: 3, deleted: 0, aborted: true, reason: "batch_limit" });
    expect(purge).toHaveBeenCalledTimes(2);
    expect(await runWorkspacePurgeTask(config, { purge }, { maxBatchesPerRun: 5, shouldAbort: () => true }))
      .toMatchObject({ deleted: 0, aborted: true, reason: "shutdown" });
    expect(purge).toHaveBeenCalledTimes(2);
  });
  it("fails closed on missing executor, a stuck purge, malformed results and dry-run deletion", async () => {
    await expect(runWorkspacePurgeTask(config, undefined, { maxBatchesPerRun: 3 })).rejects.toThrow("No workspace purge");
    await expect(runWorkspacePurgeTask(config, { purge: async () => ({ purgedRows: 0, purgedWorkspaces: 0, remaining: 1 }) }, { maxBatchesPerRun: 3 }))
      .rejects.toThrow("no progress");
    for (const result of [{ purgedRows: -1, purgedWorkspaces: 0, remaining: 0 }, { purgedRows: 1, purgedWorkspaces: NaN, remaining: 0 }, { purgedRows: 1, purgedWorkspaces: 0, remaining: -1 }]) {
      await expect(runWorkspacePurgeTask(config, { purge: async () => result }, { maxBatchesPerRun: 3 })).rejects.toThrow("Invalid");
    }
    await expect(runWorkspacePurgeTask({ ...config, mode: "dry_run" }, { purge: async () => ({ purgedRows: 5, purgedWorkspaces: 0, remaining: 1 }) }, { maxBatchesPerRun: 3 }))
      .rejects.toThrow("Invalid");
    await expect(runWorkspacePurgeTask({ ...config, batchSize: 0 }, { purge: vi.fn() }, { maxBatchesPerRun: 3 })).rejects.toThrow("Invalid workspace purge policy");
  });
});
