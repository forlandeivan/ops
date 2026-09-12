import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CleanupPolicyDto } from "@shared/cleanup-policies";
import { getJanitorTask } from "../../server/janitor/janitor-task-registry";
import type { JanitorStores } from "../../server/janitor/janitor-orchestrator";
import type { StorageOrphanDeps } from "../../server/janitor/tasks/storage-orphan-task";

/**
 * Фоновые прогоны: сверка хранилища не укладывается в синхронный вызов из админки. Прогон
 * отвечает сразу, журнал получает строку running, по ходу — отчёт, в конце — итог.
 * policy-service и redis-lock мокаются: юнит без БД и Redis.
 */
const mocks = vi.hoisted(() => ({
  listResolvedPolicies: vi.fn(),
  recordRun: vi.fn(async (_entry: unknown) => undefined),
  recordRunStart: vi.fn(async (_entry: unknown) => "run-1"),
  recordRunProgress: vi.fn(async (_runId: string, _patch: unknown) => undefined),
  recordRunFinish: vi.fn(async (_runId: string, _entry: unknown) => undefined),
  failStaleRunningRuns: vi.fn(async (_params: unknown) => 0),
  tryAcquireLock: vi.fn(async (key: string, _ttl: number, _options?: unknown) => ({ key, token: "test" }) as { key: string; token: string } | null),
  releaseLock: vi.fn(async (_lock: unknown) => undefined),
  extendLock: vi.fn(async () => true),
}));
vi.mock("../../server/janitor/janitor-policy-service", () => ({
  listResolvedPolicies: mocks.listResolvedPolicies,
  recordRun: mocks.recordRun,
  recordRunStart: mocks.recordRunStart,
  recordRunProgress: mocks.recordRunProgress,
  recordRunFinish: mocks.recordRunFinish,
  failStaleRunningRuns: mocks.failStaleRunningRuns,
}));
vi.mock("../../server/lib/redis-lock", () => ({
  tryAcquireLock: mocks.tryAcquireLock,
  releaseLock: mocks.releaseLock,
  extendLock: mocks.extendLock,
}));

const KEY = "s3.storage.orphans";
const OLD = new Date("2026-08-01T00:00:00.000Z");
const NOW = new Date("2026-09-11T00:00:00.000Z");

async function loadOrchestrator() {
  // Состояние фоновых прогонов живёт в модуле: каждому тесту — свежий экземпляр.
  vi.resetModules();
  return import("../../server/janitor/janitor-orchestrator");
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function orphanPolicy(overrides: Partial<CleanupPolicyDto> = {}): CleanupPolicyDto {
  const task = getJanitorTask(KEY)!;
  return {
    resourceKey: task.key,
    label: task.label,
    description: task.description,
    category: task.category,
    action: task.action,
    enabled: true,
    retentionDays: 7,
    batchSize: 500,
    sensitive: task.sensitive,
    table: task.table,
    strippedColumns: task.strippedColumns,
    cascadeNote: task.cascadeNote,
    runsInBackground: true,
    lastRun: null,
    ...overrides,
  };
}

function makeStores(gate?: Promise<void>, overrides: Partial<StorageOrphanDeps> = {}) {
  const enqueue = vi.fn(async () => true);
  const storageOrphans: StorageOrphanDeps = {
    bucketPrefix: () => "ws-",
    defaultBucketName: (id) => `ws-${id}`,
    listLiveWorkspaces: async () => [{ id: "w1", storageBucket: null }],
    listBuckets: async () => {
      await gate;
      return [{ name: "ws-w1", createdAt: OLD }];
    },
    listObjectsPage: async () => ({
      objects: [{ key: "json-imports/old.json", size: 10, lastModified: OLD }],
      nextToken: null,
    }),
    loadReferencedKeys: async () => new Set<string>(),
    loadOwnerIds: async () => new Set<string>(),
    enqueue,
    ...overrides,
  };
  const unusedS3 = {
    countMatches: vi.fn(async () => 0),
    purgeBatch: vi.fn(async () => ({ deleted: 0, freedBytes: 0 })),
  };
  const stores: JanitorStores = {
    pg: { countMatches: vi.fn(async () => 0), deleteBatch: vi.fn(async () => 0), stripBatch: vi.fn(async () => 0) },
    s3: { chat_attachments: unusedS3 },
    qdrant: {
      listDeletable: vi.fn(async () => []),
      deleteCollection: vi.fn(async () => false),
      reconcileUsage: vi.fn(async () => undefined),
    },
    storageOrphans,
  };
  return { stores, enqueue };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listResolvedPolicies.mockResolvedValue([orphanPolicy()]);
  mocks.recordRunStart.mockResolvedValue("run-1");
  mocks.tryAcquireLock.mockImplementation(async (key: string) => ({ key, token: "test" }));
});

// Каждый тест заново загружает граф модулей оркестратора: под нагрузкой это дольше 5 с по умолчанию.
describe("фоновые прогоны уборки", { timeout: 30_000 }, () => {
  it("ручной запуск отвечает сразу, итог и отчёт пишет в журнал", async () => {
    const orchestrator = await loadOrchestrator();
    const gate = deferred();
    const { stores, enqueue } = makeStores(gate.promise);

    const outcome = await orchestrator.runPolicyNow(KEY, stores, "admin-1");

    expect(outcome).toEqual({ status: "running", matched: 0, deleted: 0, freedBytes: 0 });
    expect(mocks.recordRunStart).toHaveBeenCalledWith(
      expect.objectContaining({ resourceKey: KEY, mode: "enforce", triggeredBy: "manual", triggeredByAdminId: "admin-1" }),
    );
    expect(mocks.recordRunFinish).not.toHaveBeenCalled();

    gate.resolve();
    await orchestrator.waitForBackgroundRuns();

    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(mocks.recordRunFinish).toHaveBeenCalledWith(
      "run-1",
      expect.objectContaining({
        status: "success",
        matchedCount: 1,
        deletedCount: 1,
        freedBytes: 10,
        errorMessage: null,
        report: expect.objectContaining({ kind: "storage_orphans" }),
      }),
    );
    expect(mocks.releaseLock).toHaveBeenCalled();
  });

  it("не запускает второй прогон, пока идёт первый", async () => {
    const orchestrator = await loadOrchestrator();
    const gate = deferred();
    const { stores } = makeStores(gate.promise);

    await orchestrator.runPolicyNow(KEY, stores, "admin-1");
    const again = await orchestrator.runPolicyNow(KEY, stores, "admin-1");
    const preview = await orchestrator.previewPolicy(KEY, stores, "admin-1");

    expect(again).toMatchObject({ status: "skipped_locked", reason: "already_running" });
    expect(preview).toEqual({ matched: 0, started: false, reason: "already_running" });
    expect(mocks.recordRunStart).toHaveBeenCalledTimes(1);

    gate.resolve();
    await orchestrator.waitForBackgroundRuns();
  });

  it("предпросмотр — фоновая проверка без удаления", async () => {
    const orchestrator = await loadOrchestrator();
    const { stores, enqueue } = makeStores();

    const preview = await orchestrator.previewPolicy(KEY, stores, "admin-1");
    await orchestrator.waitForBackgroundRuns();

    expect(preview).toEqual({ matched: 0, started: true });
    expect(enqueue).not.toHaveBeenCalled();
    expect(mocks.recordRunStart).toHaveBeenCalledWith(expect.objectContaining({ mode: "dry_run", triggeredByAdminId: "admin-1" }));
    expect(mocks.recordRunFinish).toHaveBeenCalledWith(
      "run-1",
      expect.objectContaining({ status: "success", matchedCount: 1, deletedCount: 0, freedBytes: 0 }),
    );
  });

  it("не стартует, если политику держит другой экземпляр уборщика", async () => {
    const orchestrator = await loadOrchestrator();
    mocks.tryAcquireLock.mockResolvedValueOnce(null);
    const { stores } = makeStores();

    const preview = await orchestrator.previewPolicy(KEY, stores, null);

    expect(preview).toEqual({ matched: 0, started: false, reason: "locked" });
    expect(mocks.recordRunStart).not.toHaveBeenCalled();
  });

  it("перед стартом закрывает оборванные прогоны этой политики", async () => {
    const orchestrator = await loadOrchestrator();
    const { stores } = makeStores();

    await orchestrator.runPolicyNow(KEY, stores, null);
    await orchestrator.waitForBackgroundRuns();

    expect(mocks.failStaleRunningRuns).toHaveBeenCalledWith(expect.objectContaining({ resourceKey: KEY }));
    expect(mocks.failStaleRunningRuns.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.recordRunStart.mock.invocationCallOrder[0],
    );
  });

  it("плановый проход запускает фоновую политику и не ждёт её", async () => {
    const orchestrator = await loadOrchestrator();
    const gate = deferred();
    const { stores } = makeStores(gate.promise);

    await orchestrator.runDuePoliciesOnce(stores, NOW);

    expect(mocks.recordRunStart).toHaveBeenCalledWith(expect.objectContaining({ triggeredBy: "auto", mode: "enforce" }));
    expect(mocks.recordRunFinish).not.toHaveBeenCalled();
    expect(mocks.recordRun).not.toHaveBeenCalled();

    gate.resolve();
    await orchestrator.waitForBackgroundRuns();
    expect(mocks.recordRunFinish).toHaveBeenCalledTimes(1);
  });

  it("плановый проход закрывает строку «идёт», если лок политики свободен", async () => {
    const orchestrator = await loadOrchestrator();
    mocks.listResolvedPolicies.mockResolvedValue([orphanPolicy({ enabled: false })]);
    const { stores } = makeStores();

    await orchestrator.runDuePoliciesOnce(stores, NOW);

    expect(mocks.failStaleRunningRuns).toHaveBeenCalledWith(expect.objectContaining({ resourceKey: KEY }));
    expect(mocks.recordRunStart).not.toHaveBeenCalled();
  });

  it("не трогает строку «идёт», пока лок держит другой экземпляр", async () => {
    const orchestrator = await loadOrchestrator();
    mocks.listResolvedPolicies.mockResolvedValue([orphanPolicy({ enabled: false })]);
    mocks.tryAcquireLock.mockResolvedValue(null);
    const { stores } = makeStores();

    await orchestrator.runDuePoliciesOnce(stores, NOW);

    expect(mocks.failStaleRunningRuns).not.toHaveBeenCalled();
  });

  it("падение исполнителя пишется в журнал как failed, лок освобождается", async () => {
    const orchestrator = await loadOrchestrator();
    const { stores } = makeStores(undefined, {
      listLiveWorkspaces: async () => {
        throw new Error("db is down");
      },
    });

    await orchestrator.runPolicyNow(KEY, stores, null);
    await orchestrator.waitForBackgroundRuns();

    expect(mocks.recordRunFinish).toHaveBeenCalledWith(
      "run-1",
      expect.objectContaining({ status: "failed", errorMessage: "db is down" }),
    );
    expect(mocks.releaseLock).toHaveBeenCalled();
  });

  it("остановка процесса прерывает прогон и не даёт начать новый", async () => {
    const orchestrator = await loadOrchestrator();
    const gate = deferred();
    const { stores, enqueue } = makeStores(gate.promise);

    await orchestrator.runPolicyNow(KEY, stores, null);
    const stopping = orchestrator.stopBackgroundRuns();
    gate.resolve();
    await stopping;

    expect(enqueue).not.toHaveBeenCalled();
    expect(mocks.recordRunFinish).toHaveBeenCalledWith("run-1", expect.objectContaining({ status: "partial" }));
    await expect(orchestrator.runPolicyNow(KEY, stores, null)).resolves.toMatchObject({
      status: "skipped_locked",
      reason: "locked",
    });
  });
});
