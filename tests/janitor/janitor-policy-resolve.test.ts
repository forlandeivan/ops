import { describe, expect, it } from "vitest";

import { resolvePolicy } from "../../server/janitor/janitor-policy-service";
import type { JanitorTaskDefinition } from "../../server/janitor/janitor-task-registry";
import type { CleanupPolicyRow } from "@shared/schema";
import type { CleanupRunSummaryDto } from "@shared/cleanup-policies";

const task: JanitorTaskDefinition = {
  key: "pg.test",
  label: "Test",
  description: "desc",
  category: "llm",
  action: "strip_columns",
  table: "fake",
  timeColumn: "created_at",
  pkColumn: "id",
  strippedColumns: ["payload"],
  equalsFilter: null,
  defaultRetentionDays: 30,
  defaultEnabled: false,
  defaultBatchSize: 500,
  intervalMinutes: 360,
  sensitive: false,
  cascadeNote: null,
};

function override(partial: Partial<CleanupPolicyRow>): CleanupPolicyRow {
  return {
    resourceKey: task.key,
    enabled: false,
    retentionDays: null,
    batchSize: null,
    updatedByAdminId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...partial,
  };
}

describe("resolvePolicy", () => {
  it("falls back to registry defaults when no override exists", () => {
    const resolved = resolvePolicy(task, undefined, null);
    expect(resolved.enabled).toBe(false);
    expect(resolved.retentionDays).toBe(30);
    expect(resolved.batchSize).toBe(500);
    expect(resolved.strippedColumns).toEqual(["payload"]);
  });

  it("lets the DB override win over defaults", () => {
    const resolved = resolvePolicy(
      task,
      override({ enabled: true, retentionDays: 7, batchSize: 1000 }),
      null,
    );
    expect(resolved.enabled).toBe(true);
    expect(resolved.retentionDays).toBe(7);
    expect(resolved.batchSize).toBe(1000);
  });

  it("keeps a null retention/batch override as the registry default", () => {
    const resolved = resolvePolicy(task, override({ retentionDays: null, batchSize: null }), null);
    expect(resolved.retentionDays).toBe(30);
    expect(resolved.batchSize).toBe(500);
  });

  it("passes through the last run summary", () => {
    const lastRun: CleanupRunSummaryDto = {
      mode: "enforce",
      status: "success",
      matchedCount: 42,
      deletedCount: 42,
      freedBytes: 0,
      durationMs: 12,
      errorMessage: null,
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
    };
    const resolved = resolvePolicy(task, undefined, lastRun);
    expect(resolved.lastRun).toBe(lastRun);
  });
});
