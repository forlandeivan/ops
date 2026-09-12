import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CleanupPolicyDto } from "@shared/cleanup-policies";
import type { StorageOrphanDeps } from "../../server/janitor/tasks/storage-orphan-task";

/**
 * Диспетчеризация реконсиляции по содержимому хранилища (`storage: "s3_reconcile"`).
 *
 * Адрес исполнителя — ключ политики. Однажды ветка `s3_reconcile` уводила любую такую политику в
 * уборку скриншотов отзывов: администратор, включивший чужую сверку, удалил бы файлы под чужим
 * ключом. Тест держит контракт: нет исполнителя — прогон падает и ничего не ставит в очередь.
 */
const { recordRunMock } = vi.hoisted(() => ({
  recordRunMock: vi.fn(async (_entry: Record<string, unknown>) => undefined),
}));
vi.mock("../../server/janitor/janitor-policy-service", () => ({
  listResolvedPolicies: vi.fn(async () => []),
  recordRun: recordRunMock,
}));
vi.mock("../../server/lib/redis-lock", () => ({
  tryAcquireLock: vi.fn(async (key: string) => ({ key, token: "test" })),
  releaseLock: vi.fn(async () => undefined),
  extendLock: vi.fn(async () => true),
}));
// Сверка без исполнителя: копия единой сверки под другим ключом.
vi.mock("../../server/janitor/janitor-task-registry", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../server/janitor/janitor-task-registry")>();
  return {
    ...actual,
    getJanitorTask: (key: string) =>
      key === "s3.unknown.orphans"
        ? { ...actual.getJanitorTask("s3.storage.orphans")!, key, backgroundRun: false }
        : actual.getJanitorTask(key),
  };
});

import { getJanitorTask } from "../../server/janitor/janitor-task-registry";
import { runPolicy, type JanitorStores } from "../../server/janitor/janitor-orchestrator";

const OLD = new Date("2026-08-01T00:00:00.000Z");

function makePolicy(resourceKey: string): CleanupPolicyDto {
  const task = getJanitorTask(resourceKey);
  if (!task) {
    throw new Error(`тест ссылается на несуществующую политику ${resourceKey}`);
  }
  return {
    resourceKey: task.key,
    label: task.label,
    description: task.description,
    category: task.category,
    action: task.action,
    enabled: true,
    retentionDays: task.defaultRetentionDays,
    batchSize: task.defaultBatchSize,
    sensitive: task.sensitive,
    table: task.table,
    strippedColumns: task.strippedColumns,
    cascadeNote: task.cascadeNote,
    lastRun: null,
  };
}

function makeStores(): { stores: JanitorStores; enqueue: ReturnType<typeof vi.fn> } {
  const enqueue = vi.fn(async () => true);
  const storageOrphans: StorageOrphanDeps = {
    bucketPrefix: () => "ws-",
    defaultBucketName: (id) => `ws-${id}`,
    listLiveWorkspaces: async () => [{ id: "w1", storageBucket: null }],
    listBuckets: async () => [{ name: "ws-w1", createdAt: OLD }],
    listObjectsPage: async () => ({
      objects: [{ key: "json-imports/old.json", size: 512, lastModified: OLD }],
      nextToken: null,
    }),
    loadReferencedKeys: async () => new Set<string>(),
    loadOwnerIds: async () => new Set<string>(),
    enqueue,
  };
  const unusedS3 = {
    countMatches: vi.fn(async () => 0),
    purgeBatch: vi.fn(async () => ({ deleted: 0, freedBytes: 0 })),
  };
  return {
    enqueue,
    stores: {
      pg: {
        countMatches: vi.fn(async () => 0),
        deleteBatch: vi.fn(async () => 0),
        stripBatch: vi.fn(async () => 0),
      },
      s3: { chat_attachments: unusedS3, chat_feedback_attachments: unusedS3 },
      qdrant: {
        listDeletable: vi.fn(async () => []),
        deleteCollection: vi.fn(async () => false),
        reconcileUsage: vi.fn(async () => undefined),
      },
      storageOrphans,
    },
  };
}

beforeEach(() => {
  recordRunMock.mockClear();
});

describe("janitor: диспетчеризация s3_reconcile", () => {
  it("политика без исполнителя падает и ничего не ставит в очередь", async () => {
    const { stores, enqueue } = makeStores();

    const outcome = await runPolicy(makePolicy("s3.unknown.orphans"), stores);

    expect(outcome.status).toBe("failed");
    expect(outcome.deleted).toBe(0);
    expect(enqueue).not.toHaveBeenCalled();
    expect(recordRunMock.mock.calls[0][0]).toMatchObject({
      resourceKey: "s3.unknown.orphans",
      status: "failed",
      deletedCount: 0,
    });
    expect(String(recordRunMock.mock.calls[0][0].errorMessage)).toContain("no storage reconcile executor");
  });

  it("сверка хранилища уходит в свой исполнитель и пишет отчёт в журнал", async () => {
    const { stores, enqueue } = makeStores();

    const outcome = await runPolicy(makePolicy("s3.storage.orphans"), stores);

    expect(outcome).toMatchObject({ status: "success", matched: 1, deleted: 1, freedBytes: 512 });
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(recordRunMock.mock.calls[0][0]).toMatchObject({
      resourceKey: "s3.storage.orphans",
      status: "success",
      report: { kind: "storage_orphans", queued: { objects: 1, bytes: 512, buckets: 0, jobs: 1 } },
    });
  });
});
