import { describe, expect, it, vi } from "vitest";

import type { StorageOrphanReportDto } from "@shared/cleanup-policies";
import type { StorageKeyReference, StoragePathOwner } from "@shared/storage-ownership";
import { computeCutoff } from "../../server/janitor/tasks/pg-retention-task";
import {
  HashedMembershipSet,
  runStorageOrphanTask,
  type StorageObjectEntry,
  type StorageOrphanDeps,
  type StorageOrphanJob,
} from "../../server/janitor/tasks/storage-orphan-task";

const NOW = new Date("2026-09-11T00:00:00.000Z");
const OLD = new Date("2026-08-01T00:00:00.000Z");
const FRESH = new Date("2026-09-10T00:00:00.000Z");

interface FakeWorld {
  workspaces: Array<{ id: string; storageBucket?: string | null }>;
  buckets: Record<string, { createdAt?: Date | null; objects: StorageObjectEntry[] }>;
  /** "таблица.колонка" → ключи, на которые есть ссылка. */
  references?: Record<string, string[]>;
  /** "таблица.колонка" → id живых строк-владельцев. */
  owners?: Record<string, string[]>;
  pageSize?: number;
}

function object(key: string, lastModified = OLD, size = 100): StorageObjectEntry {
  return { key, size, lastModified };
}

function makeDeps(world: FakeWorld) {
  const enqueue = vi.fn(async (_job: StorageOrphanJob) => true);
  const loadReferencedKeys = vi.fn(
    async (reference: StorageKeyReference, _workspaceId: string) =>
      new Set(world.references?.[`${reference.table}.${reference.column}`] ?? []),
  );
  const loadOwnerIds = vi.fn(
    async (owner: StoragePathOwner, _workspaceId: string) =>
      new Set(world.owners?.[`${owner.table}.${owner.column}`] ?? []),
  );
  const pageSize = world.pageSize ?? 1000;
  const listObjectsPage = vi.fn(async (bucket: string, token: string | null) => {
    const entries = [...(world.buckets[bucket]?.objects ?? [])].sort((left, right) => left.key.localeCompare(right.key));
    const start = token ? Number(token) : 0;
    const end = start + pageSize;
    return { objects: entries.slice(start, end), nextToken: end < entries.length ? String(end) : null };
  });
  const deps: StorageOrphanDeps = {
    bucketPrefix: () => "ws-",
    defaultBucketName: (id) => `ws-${id}`,
    listLiveWorkspaces: async () => world.workspaces.map((workspace) => ({ id: workspace.id, storageBucket: workspace.storageBucket ?? null })),
    listBuckets: async () =>
      Object.entries(world.buckets).map(([name, bucket]) => ({ name, createdAt: bucket.createdAt === undefined ? OLD : bucket.createdAt })),
    listObjectsPage,
    loadReferencedKeys,
    loadOwnerIds,
    enqueue,
  };
  return { deps, enqueue, loadReferencedKeys, loadOwnerIds, listObjectsPage };
}

const enforce = { mode: "enforce" as const, retentionDays: 7, batchSize: 500, now: NOW };

function category(report: StorageOrphanReportDto, name: string) {
  return report.categories.find((entry) => entry.category === name);
}

function jobsOf(enqueue: ReturnType<typeof makeDeps>["enqueue"]): StorageOrphanJob[] {
  return enqueue.mock.calls.map(([job]) => job);
}

describe("runStorageOrphanTask", () => {
  it("находит сирот по карте владения и не трогает живые, свежие, незнакомые и защищённые файлы", async () => {
    const gone = "chat-attachments/assistants/a/chats/c/attachments/att-gone/doc.pdf";
    const { deps, enqueue } = makeDeps({
      workspaces: [{ id: "w1" }],
      buckets: {
        "ws-w1": {
          objects: [
            object("chat-attachments/assistants/a/chats/c/attachments/att-live/doc.pdf"),
            object(gone, OLD, 300),
            object("kb-images/kb/doc/used.png"),
            object("kb-images/kb/doc/orphan.png", FRESH, 50),
            object("canonical/sha/parser.udoc.json.gz", OLD, 70),
            object("misc/file.bin", OLD, 10),
            object("json-imports/old.json", OLD, 20),
          ],
        },
      },
      references: { "knowledge_document_images.storage_key": ["kb-images/kb/doc/used.png"] },
      owners: { "chat_attachments.id": ["att-live"] },
    });

    const result = await runStorageOrphanTask(deps, { ...enforce, mode: "dry_run" });

    expect(enqueue).not.toHaveBeenCalled();
    expect(result.matched).toBe(2);
    expect(result.report.queued).toEqual({ objects: 0, bytes: 0, buckets: 0, jobs: 0 });
    expect(category(result.report, "chat_attachments")).toEqual({
      category: "chat_attachments",
      objects: 1,
      bytes: 300,
      maturedObjects: 1,
      maturedBytes: 300,
      samples: [gone],
    });
    expect(category(result.report, "knowledge_images")).toMatchObject({ objects: 1, bytes: 50, maturedObjects: 0 });
    expect(category(result.report, "legacy_imports")).toMatchObject({ objects: 1, maturedObjects: 1 });
    expect(category(result.report, "protected")).toMatchObject({ objects: 1, bytes: 70, maturedObjects: 0 });
    expect(category(result.report, "unrecognized")).toMatchObject({ objects: 1, maturedObjects: 0, samples: ["misc/file.bin"] });
    expect(result.report.progress).toEqual({ bucketsTotal: 1, bucketsScanned: 1, objectsScanned: 7 });
  });

  it("ставит найденное на удаление порциями и просит монолит перепроверить ключи", async () => {
    const keys = ["a", "b", "c", "d", "e"].map((name) => `json-imports/${name}.json`);
    const { deps, enqueue } = makeDeps({
      workspaces: [{ id: "w1" }],
      buckets: { "ws-w1": { objects: keys.map((key) => object(key)) } },
    });

    const result = await runStorageOrphanTask(deps, { ...enforce, batchSize: 2 });

    const jobs = jobsOf(enqueue);
    expect(jobs.map((job) => job.payload.keys)).toEqual([[keys[0], keys[1]], [keys[2], keys[3]], [keys[4]]]);
    expect(jobs[0]).toMatchObject({
      workspaceId: "w1",
      resourceType: "workspace_storage",
      resourceId: "w1",
      reason: "storage_orphans",
      payload: {
        kind: "storage_objects",
        bucket: "ws-w1",
        usageAccounting: true,
        orphanCheck: { modifiedBefore: computeCutoff(NOW, 7).toISOString() },
      },
    });
    expect(jobs[0].idempotencyKey).toMatch(/^storage-orphans:ws-w1:[0-9a-f]{32}$/);
    expect(new Set(jobs.map((job) => job.idempotencyKey)).size).toBe(3);
    expect(result.report.queued).toEqual({ objects: 5, bytes: 500, buckets: 0, jobs: 3 });
    expect(result).toMatchObject({ matched: 5, queuedObjects: 5, queuedBytes: 500, aborted: false });
  });

  it("повторная сверка тех же файлов даёт те же ключи заданий", async () => {
    const world: FakeWorld = {
      workspaces: [{ id: "w1" }],
      buckets: { "ws-w1": { objects: [object("json-imports/a.json"), object("json-imports/b.json")] } },
    };
    const first = makeDeps(world);
    const second = makeDeps(world);

    await runStorageOrphanTask(first.deps, enforce);
    await runStorageOrphanTask(second.deps, enforce);

    expect(jobsOf(second.enqueue).map((job) => job.idempotencyKey)).toEqual(
      jobsOf(first.enqueue).map((job) => job.idempotencyKey),
    );
  });

  it("не кладёт в одно задание больше 1000 ключей", async () => {
    const objects = Array.from({ length: 1001 }, (_, index) => object(`json-imports/${String(index).padStart(4, "0")}.json`));
    const { deps, enqueue } = makeDeps({ workspaces: [{ id: "w1" }], buckets: { "ws-w1": { objects } } });

    await runStorageOrphanTask(deps, { ...enforce, batchSize: 5000 });

    expect(jobsOf(enqueue).map((job) => (job.payload.keys as string[]).length)).toEqual([1000, 1]);
  });

  it("бакет удалённого пространства чистится целиком, только если в него давно не писали", async () => {
    const { deps, enqueue } = makeDeps({
      workspaces: [{ id: "w1" }],
      buckets: {
        "ws-w1": { objects: [] },
        "ws-dead": { objects: [object("chat-attachments/x.pdf", OLD, 1000), object("kb-images/y.png", OLD, 24)] },
        "ws-recent": { objects: [object("chat-attachments/z.pdf", OLD, 5), object("files/new.pdf", FRESH, 7)] },
        "ws-empty-old": { createdAt: OLD, objects: [] },
        "ws-empty-new": { createdAt: FRESH, objects: [] },
        "user-avatars": { objects: [object("avatar.png")] },
      },
    });

    const result = await runStorageOrphanTask(deps, enforce);

    expect(jobsOf(enqueue)).toEqual([
      {
        idempotencyKey: "storage-orphans-bucket:ws-dead",
        workspaceId: "dead",
        resourceType: "workspace",
        resourceId: "dead",
        reason: "storage_orphans",
        payload: { kind: "storage_prefix", bucket: "ws-dead", prefix: "", removeBucket: true },
      },
      {
        idempotencyKey: "storage-orphans-bucket:ws-empty-old",
        workspaceId: "empty-old",
        resourceType: "workspace",
        resourceId: "empty-old",
        reason: "storage_orphans",
        payload: { kind: "storage_prefix", bucket: "ws-empty-old", prefix: "", removeBucket: true },
      },
    ]);
    expect(category(result.report, "deleted_workspaces")).toEqual({
      category: "deleted_workspaces",
      objects: 4,
      bytes: 1036,
      maturedObjects: 2,
      maturedBytes: 1024,
      buckets: 4,
      maturedBuckets: 2,
      samples: ["ws-dead", "ws-empty-old"],
    });
    expect(result.report.queued).toEqual({ objects: 2, bytes: 1024, buckets: 2, jobs: 2 });
    expect(result.report.progress.bucketsTotal).toBe(5);
    expect(result.matched).toBe(2);
  });

  it("сверяет бакет живого пространства и с нестандартным именем", async () => {
    const { deps, enqueue } = makeDeps({
      workspaces: [{ id: "w1", storageBucket: "custom-w1" }],
      buckets: { "custom-w1": { objects: [object("json-imports/old.json")] } },
    });

    await runStorageOrphanTask(deps, enforce);

    expect(jobsOf(enqueue)[0]).toMatchObject({ workspaceId: "w1", payload: { bucket: "custom-w1" } });
  });

  it("пропускает бакет, в который пишут два пространства", async () => {
    const { deps, enqueue, listObjectsPage } = makeDeps({
      workspaces: [
        { id: "w1", storageBucket: "ws-test-bucket" },
        { id: "w2", storageBucket: "ws-test-bucket" },
      ],
      buckets: { "ws-test-bucket": { objects: [object("json-imports/old.json")] } },
    });

    const result = await runStorageOrphanTask(deps, enforce);

    expect(enqueue).not.toHaveBeenCalled();
    expect(listObjectsPage).not.toHaveBeenCalled();
    expect(result.report.errors).toEqual([{ bucket: "ws-test-bucket", message: expect.stringContaining("2 пространства") }]);
  });

  it("не считает удалённым бакет, в имени которого id живого пространства", async () => {
    const { deps, enqueue } = makeDeps({
      workspaces: [{ id: "abc", storageBucket: "custom-abc" }],
      buckets: { "ws-abc-old": { objects: [object("files/a.pdf")] } },
    });

    const result = await runStorageOrphanTask(deps, enforce);

    expect(enqueue).not.toHaveBeenCalled();
    expect(result.report.errors.map((entry) => entry.bucket)).toEqual(["ws-abc-old"]);
  });

  it("упирается в предел за прогон и отмечает это в отчёте", async () => {
    const keys = ["a", "b", "c", "d", "e"].map((name) => `json-imports/${name}.json`);
    const { deps, enqueue } = makeDeps({
      workspaces: [{ id: "w1" }],
      buckets: { "ws-w1": { objects: keys.map((key) => object(key)) } },
    });

    const result = await runStorageOrphanTask(deps, { ...enforce, batchSize: 2, maxQueuedObjects: 3 });

    expect(jobsOf(enqueue).map((job) => job.payload.keys)).toEqual([[keys[0], keys[1]], [keys[2]]]);
    expect(result.report.limitReached).toBe(true);
    expect(result.report.queued.objects).toBe(3);
    expect(result.matched).toBe(5);
  });

  it("останавливается между страницами при остановке процесса", async () => {
    const keys = ["a", "b", "c", "d", "e"].map((name) => `json-imports/${name}.json`);
    const { deps, enqueue, listObjectsPage } = makeDeps({
      workspaces: [{ id: "w1" }],
      buckets: { "ws-w1": { objects: keys.map((key) => object(key)) } },
      pageSize: 2,
    });

    const result = await runStorageOrphanTask(deps, {
      ...enforce,
      shouldAbort: () => listObjectsPage.mock.calls.length >= 1,
    });

    expect(result.aborted).toBe(true);
    expect(listObjectsPage).toHaveBeenCalledTimes(1);
    // найденное на первой странице всё равно уходит в очередь
    expect(jobsOf(enqueue).map((job) => job.payload.keys)).toEqual([[keys[0], keys[1]]]);
    expect(result.report.progress.bucketsScanned).toBe(0);
  });

  it("грузит ссылки только для встреченных папок и один раз на пространство", async () => {
    const { deps, loadReferencedKeys, loadOwnerIds } = makeDeps({
      workspaces: [{ id: "w1" }, { id: "w2" }],
      buckets: {
        "ws-w1": { objects: [object("json-imports/a.json"), object("canonical/x.gz")] },
        "ws-w2": { objects: [object("kb-images/a.png"), object("kb-images/b.png"), object("kb-images/c.png")] },
      },
      pageSize: 1,
    });

    await runStorageOrphanTask(deps, { ...enforce, mode: "dry_run" });

    expect(loadOwnerIds).not.toHaveBeenCalled();
    expect(loadReferencedKeys).toHaveBeenCalledTimes(1);
    expect(loadReferencedKeys).toHaveBeenCalledWith(
      expect.objectContaining({ table: "knowledge_document_images", column: "storage_key" }),
      "w2",
    );
  });

  it("ошибка листинга одного бакета не останавливает сверку остальных", async () => {
    const { deps, enqueue, listObjectsPage } = makeDeps({
      workspaces: [{ id: "w1" }, { id: "w2" }],
      buckets: {
        "ws-w1": { objects: [object("json-imports/a.json")] },
        "ws-w2": { objects: [object("json-imports/b.json")] },
      },
    });
    const listed = listObjectsPage.getMockImplementation()!;
    listObjectsPage.mockImplementation(async (bucket, token) => {
      if (bucket === "ws-w1") {
        throw new Error("boom");
      }
      return listed(bucket, token);
    });

    const result = await runStorageOrphanTask(deps, enforce);

    expect(result.report.errors).toEqual([{ bucket: "ws-w1", message: "Ошибка хранилища: boom" }]);
    expect(jobsOf(enqueue).map((job) => job.workspaceId)).toEqual(["w2"]);
    expect(result.report.progress.bucketsScanned).toBe(2);
  });

  it("таймаут хранилища описывает для администратора, а не текстом клиента S3", async () => {
    const { deps, listObjectsPage } = makeDeps({
      workspaces: [{ id: "w1" }],
      buckets: { "ws-w1": { objects: [object("json-imports/a.json")] } },
    });
    listObjectsPage.mockRejectedValueOnce(
      Object.assign(new Error("@smithy/node-http-handler - the request socket timed out after 60000 ms"), {
        name: "TimeoutError",
      }),
    );

    const result = await runStorageOrphanTask(deps, enforce);

    expect(result.report.errors).toEqual([
      { bucket: "ws-w1", message: "Хранилище не ответило вовремя, бакет проверит следующий прогон" },
    ]);
  });

  it("сообщает промежуточный отчёт по ходу проверки", async () => {
    const onProgress = vi.fn(async (_report: StorageOrphanReportDto, _matched: number) => undefined);
    const { deps } = makeDeps({
      workspaces: [{ id: "w1" }, { id: "w2" }],
      buckets: {
        "ws-w1": { objects: [object("json-imports/a.json")] },
        "ws-w2": { objects: [object("json-imports/b.json")] },
      },
    });

    await runStorageOrphanTask(deps, { ...enforce, mode: "dry_run", onProgress, progressIntervalMs: 0 });

    expect(onProgress.mock.calls.length).toBeGreaterThan(1);
    const [lastReport, lastMatched] = onProgress.mock.calls.at(-1)!;
    expect(lastReport.progress).toEqual({ bucketsTotal: 2, bucketsScanned: 2, objectsScanned: 2 });
    expect(lastMatched).toBe(2);
  });
});

describe("HashedMembershipSet", () => {
  it("узнаёт добавленные значения", () => {
    const set = new HashedMembershipSet();
    set.add("kb-images/a.png");
    set.add("kb-images/a.png");

    expect(set.has("kb-images/a.png")).toBe(true);
    expect(set.has("kb-images/b.png")).toBe(false);
    expect(set.size).toBe(1);
  });
});
