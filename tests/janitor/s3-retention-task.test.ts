import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

import {
  createChatFeedbackAttachmentS3Store,
  runS3RetentionTask,
  type S3CandidateFilter,
  type S3RetentionStore,
} from "../../server/janitor/tasks/s3-retention-task";

interface FakeObject {
  id: number;
  createdAt: Date;
  mime: string | null;
  messageId: string | null;
  sizeBytes: number;
  cleaned: boolean;
}

function matchesFilter(obj: FakeObject, filter: S3CandidateFilter): boolean {
  if (obj.cleaned) {
    return false;
  }
  if (filter.isNullColumn === "message_id" && obj.messageId !== null) {
    return false;
  }
  if (filter.mimePrefixes.length > 0) {
    const inGroup = filter.mimePrefixes.some((prefix) => obj.mime != null && obj.mime.startsWith(prefix));
    return filter.mimePrefixExclude ? !inGroup : inGroup;
  }
  return true;
}

function makeFakeStore(objects: FakeObject[]) {
  return {
    objects,
    async countMatches({ filter, cutoff, cap }) {
      const matched = objects.filter((obj) => obj.createdAt < cutoff && matchesFilter(obj, filter)).length;
      return Math.min(matched, cap);
    },
    async purgeBatch({ filter, cutoff, batchSize }) {
      const victims = objects
        .filter((obj) => obj.createdAt < cutoff && matchesFilter(obj, filter))
        .slice(0, batchSize);
      let freedBytes = 0;
      for (const victim of victims) {
        victim.cleaned = true;
        freedBytes += victim.sizeBytes;
      }
      return { deleted: victims.length, freedBytes };
    },
  } satisfies S3RetentionStore & { objects: FakeObject[] };
}

const NOW = new Date("2026-05-01T00:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

function ageDays(days: number): Date {
  return new Date(NOW.getTime() - days * DAY);
}

const audioVideoFilter: S3CandidateFilter = {
  timeColumn: "created_at",
  mimePrefixes: ["audio/", "video/"],
  mimePrefixExclude: false,
  isNullColumn: null,
};

const otherFilter: S3CandidateFilter = {
  timeColumn: "created_at",
  mimePrefixes: ["audio/", "video/"],
  mimePrefixExclude: true,
  isNullColumn: null,
};

const draftsFilter: S3CandidateFilter = {
  timeColumn: "created_at",
  mimePrefixes: [],
  mimePrefixExclude: false,
  isNullColumn: "message_id",
};

describe("runS3RetentionTask dry_run", () => {
  it("counts candidates without deleting anything", async () => {
    const objects: FakeObject[] = [
      { id: 1, createdAt: ageDays(40), mime: "audio/mpeg", messageId: "m1", sizeBytes: 1000, cleaned: false },
      { id: 2, createdAt: ageDays(5), mime: "audio/mpeg", messageId: "m1", sizeBytes: 1000, cleaned: false },
      { id: 3, createdAt: ageDays(40), mime: "application/pdf", messageId: "m1", sizeBytes: 500, cleaned: false },
    ];
    const store = makeFakeStore(objects);

    const result = await runS3RetentionTask(
      audioVideoFilter,
      { mode: "dry_run", retentionDays: 30, batchSize: 10 },
      store,
      { now: NOW },
    );

    expect(result.matched).toBe(1); // only the old audio
    expect(result.deleted).toBe(0);
    expect(result.freedBytes).toBe(0);
    expect(store.objects.every((obj) => !obj.cleaned)).toBe(true);
  });
});

describe("runS3RetentionTask enforce — audio/video filter", () => {
  it("deletes only old audio/video and sums freed bytes, keeps the rest", async () => {
    const objects: FakeObject[] = [
      { id: 1, createdAt: ageDays(40), mime: "audio/mpeg", messageId: "m", sizeBytes: 1000, cleaned: false },
      { id: 2, createdAt: ageDays(40), mime: "video/mp4", messageId: "m", sizeBytes: 2000, cleaned: false },
      { id: 3, createdAt: ageDays(40), mime: "application/pdf", messageId: "m", sizeBytes: 500, cleaned: false },
      { id: 4, createdAt: ageDays(5), mime: "audio/mpeg", messageId: "m", sizeBytes: 4000, cleaned: false },
    ];
    const store = makeFakeStore(objects);

    const result = await runS3RetentionTask(
      audioVideoFilter,
      { mode: "enforce", retentionDays: 30, batchSize: 10 },
      store,
      { now: NOW },
    );

    expect(result.deleted).toBe(2);
    expect(result.freedBytes).toBe(3000);
    expect(store.objects.find((obj) => obj.id === 3)?.cleaned).toBe(false); // pdf untouched
    expect(store.objects.find((obj) => obj.id === 4)?.cleaned).toBe(false); // fresh untouched
  });
});

describe("runS3RetentionTask enforce — other filter (exclude audio/video)", () => {
  it("deletes non-media incl. NULL mime, skips audio/video", async () => {
    const objects: FakeObject[] = [
      { id: 1, createdAt: ageDays(40), mime: "application/pdf", messageId: "m", sizeBytes: 100, cleaned: false },
      { id: 2, createdAt: ageDays(40), mime: null, messageId: "m", sizeBytes: 200, cleaned: false },
      { id: 3, createdAt: ageDays(40), mime: "audio/mpeg", messageId: "m", sizeBytes: 9999, cleaned: false },
      { id: 4, createdAt: ageDays(40), mime: "image/png", messageId: "m", sizeBytes: 300, cleaned: false },
    ];
    const store = makeFakeStore(objects);

    const result = await runS3RetentionTask(
      otherFilter,
      { mode: "enforce", retentionDays: 30, batchSize: 10 },
      store,
      { now: NOW },
    );

    expect(result.deleted).toBe(3); // pdf + null + png
    expect(result.freedBytes).toBe(600);
    expect(store.objects.find((obj) => obj.id === 3)?.cleaned).toBe(false); // audio kept
  });
});

describe("runS3RetentionTask enforce — drafts filter (message_id IS NULL)", () => {
  it("deletes only attachments not bound to a message", async () => {
    const objects: FakeObject[] = [
      { id: 1, createdAt: ageDays(40), mime: "text/plain", messageId: null, sizeBytes: 10, cleaned: false },
      { id: 2, createdAt: ageDays(40), mime: "text/plain", messageId: "sent", sizeBytes: 10, cleaned: false },
    ];
    const store = makeFakeStore(objects);

    const result = await runS3RetentionTask(
      draftsFilter,
      { mode: "enforce", retentionDays: 1, batchSize: 10 },
      store,
      { now: NOW },
    );

    expect(result.deleted).toBe(1);
    expect(store.objects.find((obj) => obj.id === 2)?.cleaned).toBe(false); // sent kept
  });
});

describe("runS3RetentionTask enforce — batching", () => {
  it("respects maxBatchesPerRun cap", async () => {
    const objects: FakeObject[] = Array.from({ length: 100 }, (_, index) => ({
      id: index + 1,
      createdAt: ageDays(40),
      mime: "application/pdf",
      messageId: "m",
      sizeBytes: 1,
      cleaned: false,
    }));
    const store = makeFakeStore(objects);

    const result = await runS3RetentionTask(
      otherFilter,
      { mode: "enforce", retentionDays: 30, batchSize: 10 },
      store,
      { now: NOW, maxBatchesPerRun: 3 },
    );

    expect(result.deleted).toBe(30);
    expect(result.batches).toBe(3);
    expect(store.objects.filter((obj) => obj.cleaned)).toHaveLength(30);
  });

  it("stops early when a batch is not full", async () => {
    const objects: FakeObject[] = Array.from({ length: 14 }, (_, index) => ({
      id: index + 1,
      createdAt: ageDays(40),
      mime: "application/pdf",
      messageId: "m",
      sizeBytes: 1,
      cleaned: false,
    }));
    const store = makeFakeStore(objects);

    const result = await runS3RetentionTask(
      otherFilter,
      { mode: "enforce", retentionDays: 30, batchSize: 10 },
      store,
      { now: NOW },
    );

    expect(result.deleted).toBe(14);
    expect(result.batches).toBe(2); // 10 + 4
  });
});

describe("createChatFeedbackAttachmentS3Store purgeBatch", () => {
  const draftsFilter: S3CandidateFilter = {
    timeColumn: "created_at",
    mimePrefixes: [],
    mimePrefixExclude: false,
    isNullColumn: "feedback_id",
  };

  it("удаляет объект и обнуляет storage_key пустой строкой (колонка NOT NULL, не NULL)", async () => {
    const dialect = new PgDialect();
    const executed: string[] = [];
    const deleteObject = vi.fn(async () => {});
    let call = 0;
    const database = {
      execute: vi.fn(async (query: unknown) => {
        executed.push(dialect.sqlToQuery(query as never).sql);
        call += 1;
        // Первый execute в purgeBatch — SELECT кандидатов, дальше — UPDATE на каждую строку.
        if (call === 1) {
          return {
            rows: [
              {
                id: "att-1",
                workspace_id: "ws-1",
                storage_key: "feedback-attachments/user-1/key.png",
                size_bytes: 1234,
              },
            ],
          };
        }
        return {};
      }),
    };

    const store = createChatFeedbackAttachmentS3Store(database as never, { deleteObject });

    const result = await store.purgeBatch({
      filter: draftsFilter,
      cutoff: new Date("2026-05-01T00:00:00.000Z"),
      batchSize: 10,
    });

    expect(result).toEqual({ deleted: 1, freedBytes: 1234 });
    expect(deleteObject).toHaveBeenCalledWith("ws-1", "feedback-attachments/user-1/key.png");

    const updateSql = executed.find((q) => /update/i.test(q));
    expect(updateSql).toBeDefined();
    // Регрессия аудита: UPDATE ... SET storage_key = NULL падал на NOT NULL каждым тиком.
    expect(updateSql).toContain("storage_key = ''");
    expect(updateSql).not.toMatch(/storage_key\s*=\s*null/i);
  });
});
