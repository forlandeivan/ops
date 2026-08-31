import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";

import { createPgRetentionStore, runRetentionTask } from "../../server/janitor/tasks/pg-retention-task";
import { getJanitorTask, operationsOf, type JanitorOperation } from "../../server/janitor/janitor-task-registry";

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

/** Как captureDatabase, но каждый стейтмент получает свой результат из очереди. */
function sequencedDatabase(rowPerStatement: Array<Record<string, unknown>>) {
  const dialect = new PgDialect();
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  const pending = [...rowPerStatement];
  return {
    queries,
    database: {
      execute: vi.fn(async (query: unknown) => {
        queries.push(dialect.sqlToQuery(query as never));
        const row = pending.shift();
        if (!row) {
          throw new Error("sequencedDatabase: лишний стейтмент сверх подготовленной очереди");
        }
        return { rows: [row] };
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
    // Политика чатов не двухфазная: нет условия «не осталось детей».
    expect(statement).not.toContain("child.assistant_id");
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
    // Фаза B двухфазного purge: ассистент удаляется только когда чатов не осталось.
    expect(statement).toContain("not exists (");
    expect(statement).toContain("select 1 from chat_sessions as child");
    expect(statement).toContain("child.assistant_id = root.id");
    expect(query.params).toContain("archived");
    expect(query.params).toContain("pg.assistants.archived");
  });
});

const assistantsOp: JanitorOperation = {
  table: "assistants",
  timeColumn: "updated_at",
  pkColumn: "id",
  action: "delete_rows",
  strippedColumns: [],
  equalsFilter: { column: "status", value: "archived" },
  drainChildrenFirst: true,
};

const chatSessionsOp: JanitorOperation = {
  table: "chat_sessions",
  timeColumn: "deleted_at",
  pkColumn: "id",
  action: "delete_rows",
  strippedColumns: [],
  equalsFilter: null,
};

const NOW = new Date("2026-08-31T00:00:00.000Z");
const RESOLVED = { action: "delete_rows", mode: "enforce", retentionDays: 30, batchSize: 2 } as const;

const isDrainStatement = (statement: string) =>
  statement.includes("delete from chat_sessions as chat");
const isAssistantDeleteStatement = (statement: string) =>
  statement.includes('delete from "assistants" as root');

describe("двухфазный purge архивных ассистентов: дренажный стейтмент (фаза A)", () => {
  it("удаляет порцию чатов кандидатов с enqueue snapshots, без условия deleted_at", async () => {
    const capture = captureDatabase([{ affected: 2 }]);
    const store = createPgRetentionStore(capture.database);

    await expect(store.drainChildrenBatch!({
      table: "assistants",
      timeColumn: "updated_at",
      pkColumn: "id",
      cutoff,
      equalsFilter: { column: "status", value: "archived" },
      batchSize: 50,
    })).resolves.toBe(2);

    expect(capture.database.execute).toHaveBeenCalledTimes(1);
    const query = capture.queries[0];
    const statement = query.sql.toLowerCase();
    // Кандидаты — чаты архивных ассистентов; batchSize считается в чатах.
    expect(statement).toContain("with candidates as materialized");
    expect(statement).toContain("from chat_sessions as chat");
    expect(statement).toContain("join assistants as root on root.id = chat.assistant_id");
    expect(statement).toContain('root."updated_at"');
    expect(statement).toContain('root."status"');
    // Дренируются ВСЕ чаты кандидата — soft-delete чата не требуется.
    expect(statement).not.toContain("deleted_at");
    // Ассистент с активной ASR не трогается вовсе: guard стоит уже на дренажe.
    expect(statement).toContain("completion.assistant_id = root.id");
    expect(statement).toContain("execution.assistant_id = root.id");
    expect(statement).toContain("coalesce(execution.lifecycle_status, execution.status, 'accepted')");
    expect(statement).toContain("for update of chat, root skip locked");
    // Snapshots вложений дренируемых чатов идут в durable-очередь тем же механизмом.
    expect(statement).toContain("join candidates on candidates.id = attachment.chat_id");
    expect(statement).toContain("left join files on files.id = attachment.file_id");
    expect(statement).toContain("insert into file_artifact_cleanup_jobs");
    expect(statement).toContain("'janitor:' || md5(concat_ws(chr(31)");
    expect(statement).toContain("on conflict (idempotency_key) do update");
    expect(statement).toContain("enqueue_barrier");
    expect(statement).toContain("delete from chat_sessions as chat");
    expect(statement).not.toContain('delete from "assistants"');
    expect(query.params).toContain("archived");
    expect(query.params).toContain("pg.assistants.archived");
    expect(query.params).toContain(50);
  });

  it("отклоняет таблицы, для которых дренаж не поддержан", async () => {
    const capture = captureDatabase([{ affected: 0 }]);
    const store = createPgRetentionStore(capture.database);

    await expect(store.drainChildrenBatch!({
      table: "chat_sessions",
      timeColumn: "deleted_at",
      pkColumn: "id",
      cutoff,
      batchSize: 10,
    })).rejects.toThrow(/только assistants/);
    expect(capture.database.execute).not.toHaveBeenCalled();
  });
});

describe("двухфазный purge архивных ассистентов: цикл прогона", () => {
  it("дренаж идёт порциями, ассистент удаляется после исчерпания чатов", async () => {
    // 2+2+1 чата дренажа (последняя порция неполная → переключение), затем фаза B: 1 ассистент.
    const capture = sequencedDatabase([
      { affected: 2 },
      { affected: 2 },
      { affected: 1 },
      { affected: 1 },
    ]);
    const store = createPgRetentionStore(capture.database);

    const result = await runRetentionTask(assistantsOp, RESOLVED, store, { now: NOW });

    expect(result).toEqual({ matched: 1, deleted: 1, batches: 4, drainedChildren: 5, aborted: false });
    const statements = capture.queries.map((query) => query.sql.toLowerCase());
    expect(statements).toHaveLength(4);
    expect(statements.slice(0, 3).every(isDrainStatement)).toBe(true);
    expect(isAssistantDeleteStatement(statements[3])).toBe(true);
  });

  it("maxBatchesPerRun ограничивает и дренажные стейтменты", async () => {
    const capture = sequencedDatabase([{ affected: 2 }, { affected: 2 }]);
    const store = createPgRetentionStore(capture.database);

    const result = await runRetentionTask(assistantsOp, RESOLVED, store, {
      now: NOW,
      maxBatchesPerRun: 2,
    });

    expect(result).toEqual({ matched: 0, deleted: 0, batches: 2, drainedChildren: 4, aborted: false });
    expect(capture.queries.map((query) => query.sql.toLowerCase()).every(isDrainStatement)).toBe(true);
  });

  it("abort посреди дренажа прерывает прогон, следующий прогон продолжает с дренажа", async () => {
    const capture = sequencedDatabase([{ affected: 2 }, { affected: 1 }, { affected: 1 }]);
    const store = createPgRetentionStore(capture.database);

    // Сигнал остановки приходит после первого дренажного стейтмента.
    const aborted = await runRetentionTask(assistantsOp, RESOLVED, store, {
      now: NOW,
      shouldAbort: () => capture.database.execute.mock.calls.length >= 1,
    });
    expect(aborted).toEqual({ matched: 0, deleted: 0, batches: 1, drainedChildren: 2, aborted: true });
    expect(capture.queries).toHaveLength(1);
    expect(isDrainStatement(capture.queries[0].sql.toLowerCase())).toBe(true);

    // Следующий тик: состояние консистентно, дренаж продолжается и доводит до фазы B.
    const resumed = await runRetentionTask(assistantsOp, RESOLVED, store, { now: NOW });
    expect(resumed).toEqual({ matched: 1, deleted: 1, batches: 2, drainedChildren: 1, aborted: false });
    const statements = capture.queries.map((query) => query.sql.toLowerCase());
    expect(statements).toHaveLength(3);
    expect(isDrainStatement(statements[1])).toBe(true);
    expect(isAssistantDeleteStatement(statements[2])).toBe(true);
  });

  it("политика чатов работает без дренажа, как раньше", async () => {
    const capture = sequencedDatabase([{ affected: 1 }]);
    const store = createPgRetentionStore(capture.database);

    const result = await runRetentionTask(chatSessionsOp, RESOLVED, store, { now: NOW });

    expect(result).toEqual({ matched: 1, deleted: 1, batches: 1, drainedChildren: 0, aborted: false });
    const statement = capture.queries[0].sql.toLowerCase();
    expect(statement).toContain('delete from "chat_sessions" as root');
    expect(statement).toContain('"deleted_at"');
    expect(statement).not.toContain("join assistants as root");
  });

  it("реестр включает двухфазный purge только для pg.assistants.archived", () => {
    const archived = getJanitorTask("pg.assistants.archived");
    expect(archived?.drainChildrenFirst).toBe(true);
    expect(operationsOf(archived!)[0].drainChildrenFirst).toBe(true);
    expect(getJanitorTask("pg.chat_sessions")?.drainChildrenFirst).toBeUndefined();
  });
});
