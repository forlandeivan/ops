import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";

import { createPgRetentionStore } from "../../server/janitor/tasks/pg-retention-task";

function captureDatabase(rows: Array<Record<string, unknown>>) {
  const dialect = new PgDialect();
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  return {
    queries,
    database: {
      execute: vi.fn(async (query: unknown) => {
        queries.push(dialect.sqlToQuery(query as never));
        return { rows };
      }),
    },
  };
}

const cutoff = new Date("2026-08-01T00:00:00.000Z");

describe("cascade-safe PG retention", () => {
  it("chat preview блокирует lifecycle_status=NULL + status=processing как активную ASR", async () => {
    const capture = captureDatabase([{ count: 3 }]);
    const store = createPgRetentionStore(capture.database);

    await expect(store.countMatches({
      table: "chat_sessions",
      timeColumn: "deleted_at",
      cutoff,
      cap: 100,
    })).resolves.toBe(3);

    const query = capture.queries[0];
    const statement = query.sql.toLowerCase();
    expect(statement).toContain("asr_completion_jobs");
    expect(statement).toContain("completion.chat_id = root.id");
    expect(statement).toContain("asr_executions");
    expect(statement).toContain("execution.chat_id::text = root.id");
    expect(statement).toContain("coalesce(execution.lifecycle_status, execution.status, 'accepted')");
    expect(statement).toContain("not in ('completed', 'failed', 'cancelled', 'expired')");
    expect(statement).not.toContain("delete from");
  });

  it("chat purge атомарно enqueue-ит все snapshots перед cascade delete", async () => {
    const capture = captureDatabase([{ affected: 2 }]);
    const store = createPgRetentionStore(capture.database);

    await expect(store.deleteBatch({
      table: "chat_sessions",
      timeColumn: "deleted_at",
      pkColumn: "id",
      cutoff,
      batchSize: 50,
    })).resolves.toBe(2);

    expect(capture.database.execute).toHaveBeenCalledTimes(1);
    const query = capture.queries[0];
    const statement = query.sql.toLowerCase();
    expect(statement).toContain("with candidates as materialized");
    expect(statement).toContain("for update of root skip locked");
    expect(statement).toContain("join candidates on candidates.id = attachment.chat_id");
    expect(statement).toContain("left join files on files.id = attachment.file_id");
    expect(statement).toContain("insert into file_artifact_cleanup_jobs");
    expect(statement).toContain("'janitor:' || md5(concat_ws(chr(31)");
    expect(statement).toContain("external_uri");
    expect(statement).toContain("on conflict (idempotency_key) do update");
    expect(statement).toContain("file_artifact_cleanup_jobs.status = 'error'");
    expect(statement).toContain("file_artifact_cleanup_jobs.next_retry_at is null");
    const conflictClause = statement.slice(statement.indexOf("on conflict"));
    expect(conflictClause).not.toMatch(/attempts\s*=/i);
    expect(conflictClause).not.toMatch(/last_error\s*=/i);
    expect(statement).toContain("enqueue_barrier");
    expect(statement).toContain("delete from \"chat_sessions\" as root");
    expect(query.params).toContain("pg.chat_sessions");
    expect(query.params).toContain(300_000);
  });

  it("archived assistant purge покрывает каскад через все его chat_sessions", async () => {
    const capture = captureDatabase([{ affected: 1 }]);
    const store = createPgRetentionStore(capture.database);

    await expect(store.deleteBatch({
      table: "assistants",
      timeColumn: "updated_at",
      pkColumn: "id",
      cutoff,
      equalsFilter: { column: "status", value: "archived" },
      batchSize: 10,
    })).resolves.toBe(1);

    const query = capture.queries[0];
    const statement = query.sql.toLowerCase();
    expect(statement).toContain("completion.assistant_id = root.id");
    expect(statement).toContain("execution.assistant_id = root.id");
    expect(statement).toContain("join chat_sessions as session on session.id = attachment.chat_id");
    expect(statement).toContain("join candidates on candidates.id = session.assistant_id");
    expect(statement).toContain("delete from \"assistants\" as root");
    expect(query.params).toContain("archived");
    expect(query.params).toContain("pg.assistants.archived");
  });
});
