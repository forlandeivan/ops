import { describe, expect, it, vi } from "vitest";

import { computeOrphans, isManagedCollectionName } from "../../server/qdrant-collection-names";
import {
  createQdrantOrphanStore,
  runQdrantOrphanGcTask,
  type QdrantOrphanStore,
  type QdrantOrphanStoreDeps,
} from "../../server/janitor/tasks/qdrant-orphan-gc-task";

const NOW = new Date("2026-06-16T12:00:00.000Z");
const GRACE_DAYS = 3;
const CUTOFF = new Date(NOW.getTime() - GRACE_DAYS * 24 * 60 * 60 * 1000);

function makeDeps(overrides: Partial<QdrantOrphanStoreDeps> = {}): QdrantOrphanStoreDeps {
  return {
    computeCurrentOrphans: vi.fn(async () => []),
    recordCandidates: vi.fn(async () => {}),
    listMaturedOrphans: vi.fn(async () => new Set<string>()),
    deleteQdrantCollection: vi.fn(async () => {}),
    removeRegistry: vi.fn(async () => {}),
    removeLedgerRow: vi.fn(async () => {}),
    reconcileUsage: vi.fn(async () => {}),
    ...overrides,
  };
}

describe("qdrant orphan detection (computeOrphans / isManagedCollectionName)", () => {
  it("recognizes only managed collection prefixes", () => {
    expect(isManagedCollectionName("kb_base_ws_space")).toBe(true);
    expect(isManagedCollectionName("kb_arena_base_space_run1")).toBe(true);
    expect(isManagedCollectionName("ws_space__proj_assistant_files__coll_gigachat")).toBe(true);
    expect(isManagedCollectionName("totally_manual_collection")).toBe(false);
    expect(isManagedCollectionName("legacy-kb-without-prefix")).toBe(false);
  });

  it("treats live (expected) collections as NOT orphaned, including synthesized assistant-file ones", () => {
    const existing = [
      "kb_dead_ws_space", // сирота (нет в expected)
      "ws_space__proj_assistant_files__coll_gigachat", // живая (синтез assistant-file)
      "kb_arena_base_space_run1", // сирота-арена
      "custom_manual_collection", // вне allowlist → игнор
    ];
    const expected = new Set(["ws_space__proj_assistant_files__coll_gigachat"]);
    expect(computeOrphans(existing, expected)).toEqual(["kb_dead_ws_space", "kb_arena_base_space_run1"]);
  });

  it("returns nothing when every managed collection is expected", () => {
    const existing = ["kb_a_ws_b", "ws_b__proj_assistant_files__coll_x"];
    const expected = new Set(existing);
    expect(computeOrphans(existing, expected)).toEqual([]);
  });

  it("подхватывает опустевшую Strategy B KB-коллекцию после снятия регистрации (hand-off из reset/delete)", () => {
    // После сброса/удаления БЗ опустевшая workspace-коллекция снимается с регистрации
    // (removeCollectionWorkspace) → её больше нет в expected → janitor считает её сиротой.
    const staleKbCollection = "ws_space__proj_kb__coll_babca3bb_d1024";
    const existing = [
      staleKbCollection, // опустела и снята с регистрации → сирота
      "ws_space__proj_kb__coll_5763e5b0_d4096", // живая (текущий провайдер)
    ];
    const expected = new Set(["ws_space__proj_kb__coll_5763e5b0_d4096"]);
    expect(computeOrphans(existing, expected)).toEqual([staleKbCollection]);
  });
});

describe("qdrant orphan store (grace via ledger)", () => {
  it("records candidates but does NOT delete an orphan before grace elapses (enforce path)", async () => {
    const deps = makeDeps({
      computeCurrentOrphans: vi.fn(async () => ["kb_fresh_ws_space"]),
      listMaturedOrphans: vi.fn(async () => new Set<string>()), // ledger: ещё не созрел
    });
    const store = createQdrantOrphanStore(deps);

    const deletable = await store.listDeletable({ cutoff: CUTOFF, cap: 100, record: true, now: NOW });

    expect(deletable).toEqual([]);
    expect(deps.recordCandidates).toHaveBeenCalledWith(["kb_fresh_ws_space"], NOW);
  });

  it("returns an orphan as deletable once it is older than grace", async () => {
    const deps = makeDeps({
      computeCurrentOrphans: vi.fn(async () => ["kb_old_ws_space"]),
      listMaturedOrphans: vi.fn(async () => new Set(["kb_old_ws_space"])),
    });
    const store = createQdrantOrphanStore(deps);

    const deletable = await store.listDeletable({ cutoff: CUTOFF, cap: 100, record: true, now: NOW });

    expect(deletable).toEqual(["kb_old_ws_space"]);
  });

  it("dry_run preview does NOT write the ledger (record=false)", async () => {
    const deps = makeDeps({
      computeCurrentOrphans: vi.fn(async () => ["kb_old_ws_space"]),
      listMaturedOrphans: vi.fn(async () => new Set(["kb_old_ws_space"])),
    });
    const store = createQdrantOrphanStore(deps);

    const deletable = await store.listDeletable({ cutoff: CUTOFF, cap: 100, record: false, now: NOW });

    expect(deletable).toEqual(["kb_old_ws_space"]);
    expect(deps.recordCandidates).not.toHaveBeenCalled();
  });

  it("caps the number of returned deletable collections", async () => {
    const orphans = ["kb_1_ws_s", "kb_2_ws_s", "kb_3_ws_s"];
    const deps = makeDeps({
      computeCurrentOrphans: vi.fn(async () => orphans),
      listMaturedOrphans: vi.fn(async () => new Set(orphans)),
    });
    const store = createQdrantOrphanStore(deps);

    const deletable = await store.listDeletable({ cutoff: CUTOFF, cap: 2, record: true, now: NOW });
    expect(deletable).toHaveLength(2);
  });

  it("deleteCollection removes the qdrant collection, registry mapping and ledger row", async () => {
    const deps = makeDeps();
    const store = createQdrantOrphanStore(deps);

    const ok = await store.deleteCollection("kb_old_ws_space");

    expect(ok).toBe(true);
    expect(deps.deleteQdrantCollection).toHaveBeenCalledWith("kb_old_ws_space");
    expect(deps.removeRegistry).toHaveBeenCalledWith("kb_old_ws_space");
    expect(deps.removeLedgerRow).toHaveBeenCalledWith("kb_old_ws_space");
  });

  it("treats a 404 from Qdrant as already-gone and still cleans up registry/ledger", async () => {
    const deps = makeDeps({
      deleteQdrantCollection: vi.fn(async () => {
        throw Object.assign(new Error("Not found"), { status: 404 });
      }),
    });
    const store = createQdrantOrphanStore(deps);

    const ok = await store.deleteCollection("kb_gone_ws_space");

    expect(ok).toBe(true);
    expect(deps.removeRegistry).toHaveBeenCalledWith("kb_gone_ws_space");
    expect(deps.removeLedgerRow).toHaveBeenCalledWith("kb_gone_ws_space");
  });

  it("reports failure (and skips cleanup) on a non-404 Qdrant error", async () => {
    const deps = makeDeps({
      deleteQdrantCollection: vi.fn(async () => {
        throw new Error("connection refused");
      }),
    });
    const store = createQdrantOrphanStore(deps);

    const ok = await store.deleteCollection("kb_x_ws_space");

    expect(ok).toBe(false);
    expect(deps.removeRegistry).not.toHaveBeenCalled();
    expect(deps.removeLedgerRow).not.toHaveBeenCalled();
  });
});

describe("runQdrantOrphanGcTask", () => {
  function fakeStore(deletable: string[]): QdrantOrphanStore & {
    listDeletable: ReturnType<typeof vi.fn>;
    deleteCollection: ReturnType<typeof vi.fn>;
    reconcileUsage: ReturnType<typeof vi.fn>;
  } {
    return {
      listDeletable: vi.fn(async () => deletable),
      deleteCollection: vi.fn(async () => true),
      reconcileUsage: vi.fn(async () => {}),
    };
  }

  it("dry_run counts deletable without deleting and without recording", async () => {
    const store = fakeStore(["kb_a_ws_s", "kb_b_ws_s"]);

    const result = await runQdrantOrphanGcTask(
      { mode: "dry_run", retentionDays: GRACE_DAYS, batchSize: 25 },
      store,
      { now: NOW },
    );

    expect(result).toMatchObject({ matched: 2, deleted: 0 });
    expect(store.listDeletable).toHaveBeenCalledWith(
      expect.objectContaining({ record: false }),
    );
    expect(store.deleteCollection).not.toHaveBeenCalled();
    expect(store.reconcileUsage).not.toHaveBeenCalled();
  });

  it("enforce deletes matured orphans, records the ledger, and reconciles usage", async () => {
    const store = fakeStore(["kb_a_ws_s", "kb_b_ws_s"]);

    const result = await runQdrantOrphanGcTask(
      { mode: "enforce", retentionDays: GRACE_DAYS, batchSize: 25 },
      store,
      { now: NOW },
    );

    expect(result).toMatchObject({ matched: 2, deleted: 2, freedBytes: 0 });
    expect(store.listDeletable).toHaveBeenCalledWith(expect.objectContaining({ record: true }));
    expect(store.deleteCollection).toHaveBeenCalledTimes(2);
    expect(store.reconcileUsage).toHaveBeenCalledTimes(1);
  });

  it("counts only successful deletions", async () => {
    const store = fakeStore(["kb_a_ws_s", "kb_b_ws_s"]);
    store.deleteCollection.mockImplementationOnce(async () => true).mockImplementationOnce(async () => false);

    const result = await runQdrantOrphanGcTask(
      { mode: "enforce", retentionDays: GRACE_DAYS, batchSize: 25 },
      store,
      { now: NOW },
    );

    expect(result.deleted).toBe(1);
    expect(result.matched).toBe(2);
  });

  it("does not fail the run if reconcile throws", async () => {
    const store = fakeStore(["kb_a_ws_s"]);
    store.reconcileUsage.mockRejectedValueOnce(new Error("reconcile boom"));

    await expect(
      runQdrantOrphanGcTask({ mode: "enforce", retentionDays: GRACE_DAYS, batchSize: 25 }, store, { now: NOW }),
    ).resolves.toMatchObject({ deleted: 1 });
  });
});
