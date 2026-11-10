import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";

import { createPgRetentionStore } from "../../server/janitor/tasks/pg-retention-task";

const cutoff = new Date("2026-11-01T00:00:00Z");

function capture() {
  const dialect = new PgDialect();
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  const store = createPgRetentionStore({ execute: vi.fn(async (query) => {
    queries.push(dialect.sqlToQuery(query));
    return { rows: [{ count: 2, affected: 2 }] };
  }) });
  return { queries, store };
}

describe("chat replay retention SQL safety", () => {
  it("queue preview and deletion require terminal status and finished_at even with stale registry metadata", async () => {
    const { store, queries } = capture();
    await expect(store.countMatches({ table: "chat_queued_messages", timeColumn: "updated_at", cutoff, cap: 20 })).resolves.toBe(2);
    await expect(store.deleteBatch({ table: "chat_queued_messages", timeColumn: "created_at", pkColumn: "id", cutoff, batchSize: 10 })).resolves.toBe(2);
    for (const query of queries) {
      expect(query.sql).toContain("root.status IN ('dispatched', 'canceled') AND root.finished_at <");
      expect(query.sql).not.toMatch(/root\.(created_at|updated_at)/);
      expect(query.params).toContain(cutoff);
    }
    expect(queries[1].sql).toContain("FOR UPDATE OF root SKIP LOCKED");
    // The delete itself repeats the status guard instead of trusting candidate identity alone.
    expect(queries[1].sql.match(/root.status IN/g)).toHaveLength(2);
  });

  it("receipts use composite identity, preserve active dependencies and age abandoned leases separately", async () => {
    const { store, queries } = capture();
    await store.countMatches({ table: "chat_turn_receipts", timeColumn: "finished_at", cutoff, cap: 20 });
    await store.deleteBatch({ table: "chat_turn_receipts", timeColumn: "finished_at", pkColumn: "operation_id", cutoff, batchSize: 10 });
    for (const query of queries) {
      expect(query.sql).toContain("root.finished = TRUE AND root.finished_at <");
      expect(query.sql).toContain("root.finished = FALSE AND root.finished_at IS NULL AND root.lease_until <");
      expect(query.sql).toContain("queued.chat_id = root.chat_id");
      expect(query.sql).toContain("queued.status IN ('queued', 'dispatching', 'failed')");
      expect(query.sql).toContain("queued.after_operation_id = root.operation_id OR queued.id = root.operation_id");
    }
    expect(queries[1].sql).toContain("root.chat_id = picked.chat_id AND root.operation_id = picked.operation_id");
    expect(queries[1].sql).not.toContain("root.id");
  });
});
