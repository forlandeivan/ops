import { describe, expect, it, vi } from "vitest";

import {
  createFeedbackAttachmentOrphanStore,
  runFeedbackAttachmentOrphanTask,
  type FeedbackAttachmentOrphanDeps,
} from "../../server/janitor/tasks/s3-feedback-attachment-orphan-task";

const NOW = new Date("2026-06-18T00:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

function ageDays(days: number): Date {
  return new Date(NOW.getTime() - days * DAY);
}

function makeDeps(overrides: Partial<FeedbackAttachmentOrphanDeps> = {}): FeedbackAttachmentOrphanDeps {
  return {
    listWorkspaces: vi.fn(async () => []),
    listS3Objects: vi.fn(async () => []),
    findKnownKeys: vi.fn(async () => new Set<string>()),
    deleteObject: vi.fn(async () => {}),
    // J2.3a: доменный нейминг бакета инъецируется (боевая сборка — default-stores.ts).
    defaultBucketName: vi.fn((workspaceId: string) => `workspace-${workspaceId}`),
    ...overrides,
  };
}

describe("s3 feedback attachment orphan task — dry_run", () => {
  it("counts aged orphans and does not call deleteObject", async () => {
    const deps = makeDeps({
      listWorkspaces: vi.fn(async () => [{ id: "ws1", storageBucket: "bucket-ws1" }]),
      listS3Objects: vi.fn(async () => [
        { key: "feedback-attachments/u/old-orphan.png", lastModified: ageDays(10), size: 1000 },
        { key: "feedback-attachments/u/young.png", lastModified: ageDays(1), size: 500 },
        { key: "feedback-attachments/u/known.png", lastModified: ageDays(10), size: 200 },
      ]),
      findKnownKeys: vi.fn(async () => new Set(["feedback-attachments/u/known.png"])),
    });

    const store = createFeedbackAttachmentOrphanStore(deps);
    const result = await runFeedbackAttachmentOrphanTask(
      { mode: "dry_run", retentionDays: 7, batchSize: 100 },
      store,
      { now: NOW },
    );

    // young не прошёл cutoff, known — есть в БД, old-orphan — единственный сирота
    expect(result.matched).toBe(1);
    expect(result.deleted).toBe(0);
    expect(result.freedBytes).toBe(0);
    expect(deps.deleteObject).not.toHaveBeenCalled();
  });

  it("returns zero when all aged objects are known in DB", async () => {
    const deps = makeDeps({
      listWorkspaces: vi.fn(async () => [{ id: "ws1", storageBucket: "bucket-ws1" }]),
      listS3Objects: vi.fn(async () => [
        { key: "feedback-attachments/u/ok.png", lastModified: ageDays(10), size: 500 },
      ]),
      findKnownKeys: vi.fn(async () => new Set(["feedback-attachments/u/ok.png"])),
    });

    const store = createFeedbackAttachmentOrphanStore(deps);
    const result = await runFeedbackAttachmentOrphanTask(
      { mode: "dry_run", retentionDays: 7, batchSize: 100 },
      store,
      { now: NOW },
    );

    expect(result.matched).toBe(0);
  });
});

describe("s3 feedback attachment orphan task — enforce", () => {
  it("deletes orphaned objects and returns correct stats", async () => {
    const deps = makeDeps({
      listWorkspaces: vi.fn(async () => [{ id: "ws1", storageBucket: "bucket-ws1" }]),
      listS3Objects: vi.fn(async () => [
        { key: "feedback-attachments/u/orphan1.png", lastModified: ageDays(10), size: 1000 },
        { key: "feedback-attachments/u/orphan2.png", lastModified: ageDays(8), size: 500 },
        { key: "feedback-attachments/u/linked.png", lastModified: ageDays(10), size: 200 },
      ]),
      findKnownKeys: vi.fn(async () => new Set(["feedback-attachments/u/linked.png"])),
    });

    const store = createFeedbackAttachmentOrphanStore(deps);
    const result = await runFeedbackAttachmentOrphanTask(
      { mode: "enforce", retentionDays: 7, batchSize: 100 },
      store,
      { now: NOW },
    );

    expect(result.deleted).toBe(2);
    expect(result.freedBytes).toBe(1500);
    expect(deps.deleteObject).toHaveBeenCalledTimes(2);
    expect(deps.deleteObject).toHaveBeenCalledWith("ws1", "feedback-attachments/u/orphan1.png");
    expect(deps.deleteObject).toHaveBeenCalledWith("ws1", "feedback-attachments/u/orphan2.png");
  });

  it("skips objects younger than cutoff even if they have no DB row", async () => {
    const deps = makeDeps({
      listWorkspaces: vi.fn(async () => [{ id: "ws1", storageBucket: "bucket-ws1" }]),
      listS3Objects: vi.fn(async () => [
        { key: "feedback-attachments/u/fresh.png", lastModified: ageDays(1), size: 999 },
      ]),
      findKnownKeys: vi.fn(async () => new Set()),
    });

    const store = createFeedbackAttachmentOrphanStore(deps);
    const result = await runFeedbackAttachmentOrphanTask(
      { mode: "enforce", retentionDays: 7, batchSize: 100 },
      store,
      { now: NOW },
    );

    expect(result.deleted).toBe(0);
    expect(deps.deleteObject).not.toHaveBeenCalled();
  });

  it("skips a workspace when S3 listing fails, processes remaining workspaces", async () => {
    const deps = makeDeps({
      listWorkspaces: vi.fn(async () => [
        { id: "ws-ok", storageBucket: "bucket-ok" },
        { id: "ws-fail", storageBucket: "bucket-failing" },
      ]),
      listS3Objects: vi.fn(async (bucket: string) => {
        if (bucket === "bucket-failing") throw new Error("connection refused");
        return [{ key: "feedback-attachments/u/orphan.png", lastModified: ageDays(10), size: 100 }];
      }),
      findKnownKeys: vi.fn(async () => new Set()),
    });

    const store = createFeedbackAttachmentOrphanStore(deps);
    const result = await runFeedbackAttachmentOrphanTask(
      { mode: "enforce", retentionDays: 7, batchSize: 100 },
      store,
      { now: NOW },
    );

    expect(result.deleted).toBe(1);
    expect(deps.deleteObject).toHaveBeenCalledWith("ws-ok", "feedback-attachments/u/orphan.png");
  });

  it("respects limit derived from maxBatchesPerRun * batchSize", async () => {
    const objects = Array.from({ length: 10 }, (_, i) => ({
      key: `feedback-attachments/u/orphan${i}.png`,
      lastModified: ageDays(10),
      size: 100,
    }));

    const deps = makeDeps({
      listWorkspaces: vi.fn(async () => [{ id: "ws1", storageBucket: "bucket-ws1" }]),
      listS3Objects: vi.fn(async () => objects),
      findKnownKeys: vi.fn(async () => new Set()),
    });

    const store = createFeedbackAttachmentOrphanStore(deps);
    const result = await runFeedbackAttachmentOrphanTask(
      { mode: "enforce", retentionDays: 7, batchSize: 3 },
      store,
      { now: NOW, maxBatchesPerRun: 1 },
    );

    expect(result.deleted).toBe(3);
    expect(deps.deleteObject).toHaveBeenCalledTimes(3);
  });

  it("continues past a single delete failure and counts only successful deletions", async () => {
    const deps = makeDeps({
      listWorkspaces: vi.fn(async () => [{ id: "ws1", storageBucket: "bucket-ws1" }]),
      listS3Objects: vi.fn(async () => [
        { key: "feedback-attachments/u/bad.png", lastModified: ageDays(10), size: 100 },
        { key: "feedback-attachments/u/good.png", lastModified: ageDays(10), size: 200 },
      ]),
      findKnownKeys: vi.fn(async () => new Set()),
      deleteObject: vi.fn(async (_workspaceId: string, key: string) => {
        if (key.includes("bad")) throw new Error("S3 delete failed");
      }),
    });

    const store = createFeedbackAttachmentOrphanStore(deps);
    const result = await runFeedbackAttachmentOrphanTask(
      { mode: "enforce", retentionDays: 7, batchSize: 100 },
      store,
      { now: NOW },
    );

    expect(deps.deleteObject).toHaveBeenCalledTimes(2);
    expect(result.deleted).toBe(1);
    expect(result.freedBytes).toBe(200);
  });

  it("uses generated bucket name when storageBucket is null", async () => {
    const deps = makeDeps({
      listWorkspaces: vi.fn(async () => [{ id: "ws-no-bucket", storageBucket: null }]),
      listS3Objects: vi.fn(async () => [
        { key: "feedback-attachments/u/orphan.png", lastModified: ageDays(10), size: 50 },
      ]),
      findKnownKeys: vi.fn(async () => new Set()),
    });

    const store = createFeedbackAttachmentOrphanStore(deps);
    await runFeedbackAttachmentOrphanTask(
      { mode: "enforce", retentionDays: 7, batchSize: 100 },
      store,
      { now: NOW },
    );

    // При NULL storage_bucket имя генерирует инъецированный defaultBucketName.
    expect(deps.defaultBucketName).toHaveBeenCalledWith("ws-no-bucket");
    const calledBucket = (deps.listS3Objects as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(typeof calledBucket).toBe("string");
    expect(calledBucket.length).toBeGreaterThan(0);
    expect(calledBucket).toContain("ws-no-bucket");
  });

  it("does nothing when no workspaces exist", async () => {
    const deps = makeDeps({ listWorkspaces: vi.fn(async () => []) });

    const store = createFeedbackAttachmentOrphanStore(deps);
    const result = await runFeedbackAttachmentOrphanTask(
      { mode: "enforce", retentionDays: 7, batchSize: 100 },
      store,
      { now: NOW },
    );

    expect(result.deleted).toBe(0);
    expect(deps.listS3Objects).not.toHaveBeenCalled();
  });
});
