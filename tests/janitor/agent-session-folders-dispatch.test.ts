import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CleanupPolicyDto } from "@shared/cleanup-policies";
const refs = vi.hoisted(() => ({ record: vi.fn(async () => undefined), policies: vi.fn() }));
vi.mock("../../server/janitor/janitor-policy-service", () => ({ listResolvedPolicies: refs.policies, recordRun: refs.record }));
vi.mock("../../server/lib/redis-lock", () => ({ tryAcquireLock: vi.fn(async (key: string) => ({ key, token: "test" })), releaseLock: vi.fn(async () => undefined), extendLock: vi.fn(async () => true) }));
vi.mock("../../server/janitor/schema-guard", () => ({ findMissingColumns: vi.fn(async () => []), requiredColumnsForOperation: vi.fn(() => []) }));
vi.mock("../../server/janitor/default-stores", () => ({ defaultStores: vi.fn() }));
import { runPolicy, previewPolicy, type JanitorStores } from "../../server/janitor/janitor-orchestrator";

const policy: CleanupPolicyDto = { resourceKey: "agent.session_folders", label: "Folders", description: "", category: "agent", action: "delete_object", enabled: true, retentionDays: 7, batchSize: 3, sensitive: false, table: "agent_sessions", strippedColumns: [], cascadeNote: null, lastRun: null };
function stores(purge?: ReturnType<typeof vi.fn>) {
  const pg = { countMatches: vi.fn(async () => 0), deleteBatch: vi.fn(async () => 0), stripBatch: vi.fn(async () => 0) };
  return { pg, agentSessionFolders: purge ? { purge } : undefined } as unknown as JanitorStores;
}
beforeEach(() => { refs.record.mockClear(); refs.policies.mockResolvedValue([policy]); });
describe("agent session folders dispatch", () => {
  it("uses only the owner gateway for enforce and preview", async () => {
    const purge = vi.fn().mockResolvedValueOnce({ purged: 3, remaining: 2 }).mockResolvedValueOnce({ purged: 2, remaining: 0 }).mockResolvedValueOnce({ purged: 0, remaining: 1200 });
    const target = stores(purge);
    expect(await runPolicy(policy, target)).toMatchObject({ status: "success", matched: 5, deleted: 5 });
    expect(await previewPolicy(policy.resourceKey, target)).toEqual({ matched: 1200 });
    expect(purge.mock.calls[2]).toEqual([{ olderThanDays: 7, limit: 3, dryRun: true }]);
    for (const method of Object.values(target.pg)) expect(method).not.toHaveBeenCalled();
  });
  it("refuses missing owner executor instead of falling back to PG", async () => {
    const target = stores();
    expect(await runPolicy(policy, target)).toMatchObject({ status: "failed", deleted: 0 });
    await expect(previewPolicy(policy.resourceKey, target)).rejects.toThrow("No agent");
    for (const method of Object.values(target.pg)) expect(method).not.toHaveBeenCalled();
  });
  it("records actual progress if a subsequent gateway batch fails", async () => {
    const purge = vi.fn().mockResolvedValueOnce({ purged: 3, remaining: 2 }).mockRejectedValueOnce(new Error("gateway down"));
    expect(await runPolicy(policy, stores(purge))).toMatchObject({ status: "failed", deleted: 3 });
    expect(refs.record).toHaveBeenCalledWith(expect.objectContaining({ status: "failed", deletedCount: 3, matchedCount: 3 }));
  });
});
