import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CleanupPolicyDto } from "@shared/cleanup-policies";

/**
 * runPolicy: прерывание прогона при graceful shutdown → статус "partial" в журнале
 * (уже поддержан контрактом и UI), штатное завершение → "success".
 * policy-service и redis-lock мокаются: юнит без БД и Redis.
 */
const { recordRunMock } = vi.hoisted(() => ({
  recordRunMock: vi.fn(async (_entry: Record<string, unknown>) => undefined),
}));
vi.mock("../../server/janitor/janitor-policy-service", () => ({
  listResolvedPolicies: vi.fn(async () => []),
  recordRun: recordRunMock,
}));
vi.mock("../../server/janitor/schema-guard", () => ({
  findMissingColumns: vi.fn(async () => []),
  requiredColumnsForOperation: vi.fn(() => []),
}));
vi.mock("../../server/lib/redis-lock", () => ({
  tryAcquireLock: vi.fn(async (key: string) => ({ key, token: "test" })),
  releaseLock: vi.fn(async () => undefined),
}));

import { runPolicy, type JanitorStores } from "../../server/janitor/janitor-orchestrator";
import type { RetentionStore } from "../../server/janitor/tasks/pg-retention-task";

function makePolicy(): CleanupPolicyDto {
  return {
    resourceKey: "pg.assistant_executions",
    label: "Строки запусков LLM",
    description: "",
    category: "llm",
    action: "delete_rows",
    enabled: true,
    retentionDays: 30,
    batchSize: 10,
    sensitive: false,
    table: "assistant_executions",
    strippedColumns: [],
    cascadeNote: null,
    lastRun: null,
  };
}

function makeStores(pg: RetentionStore): JanitorStores {
  const unusedS3 = {
    countMatches: vi.fn(async () => 0),
    purgeBatch: vi.fn(async () => ({ deleted: 0, freedBytes: 0 })),
  };
  return {
    pg,
    s3: { chat_attachments: unusedS3, chat_feedback_attachments: unusedS3 },
    qdrant: {
      listDeletable: vi.fn(async () => []),
      deleteCollection: vi.fn(async () => false),
      reconcileUsage: vi.fn(async () => undefined),
    },
    feedbackAttachmentOrphans: {
      countOrphans: vi.fn(async () => 0),
      sweep: vi.fn(async () => ({ deleted: 0, freedBytes: 0 })),
    },
  };
}

beforeEach(() => {
  recordRunMock.mockClear();
});

describe("runPolicy + shouldAbort", () => {
  it("прерванный прогон пишется в журнал со статусом partial", async () => {
    let abort = false;
    const pg: RetentionStore = {
      countMatches: async () => 0,
      // Каждый батч «полный» → движок продолжал бы до maxBatches, если бы не abort.
      deleteBatch: async ({ batchSize }) => {
        abort = true;
        return batchSize;
      },
      stripBatch: async () => 0,
    };

    const outcome = await runPolicy(makePolicy(), makeStores(pg), undefined, {
      shouldAbort: () => abort,
    });

    expect(outcome.status).toBe("partial");
    expect(outcome.deleted).toBe(10);
    expect(recordRunMock).toHaveBeenCalledTimes(1);
    expect(recordRunMock.mock.calls[0][0]).toMatchObject({
      resourceKey: "pg.assistant_executions",
      status: "partial",
      deletedCount: 10,
    });
  });

  it("штатное завершение остаётся success", async () => {
    const pg: RetentionStore = {
      countMatches: async () => 0,
      deleteBatch: async () => 3, // меньше batchSize → кандидаты исчерпаны
      stripBatch: async () => 0,
    };

    const outcome = await runPolicy(makePolicy(), makeStores(pg), undefined, {
      shouldAbort: () => false,
    });

    expect(outcome.status).toBe("success");
    expect(outcome.deleted).toBe(3);
    expect(recordRunMock.mock.calls[0][0]).toMatchObject({ status: "success" });
  });
});
