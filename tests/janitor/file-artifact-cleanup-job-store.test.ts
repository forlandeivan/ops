import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";

import {
  createFileArtifactCleanupJobStore,
  scheduledCleanupIdempotencyKey,
} from "../../server/janitor/file-artifact-cleanup-job-store";

describe("file artifact cleanup job store", () => {
  it("claim атомарно использует SKIP LOCKED и возвращает snapshot", async () => {
    const dialect = new PgDialect();
    let querySql = "";
    const database = {
      execute: vi.fn(async (query: unknown) => {
        querySql = dialect.sqlToQuery(query as never).sql;
        return {
          rows: [{
            id: "00000000-0000-0000-0000-000000000001",
            idempotency_key: "manual:att-1",
            workspace_id: "ws-1",
            resource_type: "chat_attachment",
            resource_id: "att-1",
            reason: "manual_chat_delete",
            payload_version: 1,
            payload: { attachmentId: "att-1", externalUri: "/ws-1/asr/a.mp3" },
            status: "processing",
            attempts: 0,
            worker_id: "worker-1",
            lease_expires_at: "2026-08-11T00:01:00Z",
            next_retry_at: null,
            last_error: null,
          }],
        };
      }),
    };
    const store = createFileArtifactCleanupJobStore(database);

    const claimed = await store.claim("worker-1", 60_000);

    expect(querySql).toMatch(/for update skip locked/i);
    expect(querySql).toMatch(/status = 'processing'/i);
    expect(querySql).toMatch(/lease_expires_at < now\(\)/i);
    expect(claimed).toMatchObject({
      id: "00000000-0000-0000-0000-000000000001",
      payload: { externalUri: "/ws-1/asr/a.mp3" },
    });
  });

  it("active-ASR guard считает lifecycle_status=NULL + status=processing активным", async () => {
    const dialect = new PgDialect();
    let querySql = "";
    const database = {
      execute: vi.fn(async (query: unknown) => {
        querySql = dialect.sqlToQuery(query as never).sql;
        return { rows: [{ active: true }] };
      }),
    };
    const store = createFileArtifactCleanupJobStore(database);
    const active = await store.hasActiveAsr({
      id: "00000000-0000-0000-0000-000000000001",
      idempotencyKey: "k",
      workspaceId: "ws-1",
      resourceType: "chat_attachment",
      resourceId: "att-1",
      reason: "retention",
      payloadVersion: 1,
      payload: { attachmentId: "att-1", fileId: "file-1", externalUri: "/ws-1/asr/a.mp3" },
      status: "processing",
      attempts: 0,
      workerId: "worker-1",
      leaseExpiresAt: null,
      nextRetryAt: null,
      lastError: null,
    });

    expect(active).toBe(true);
    expect(querySql).toContain("asr_completion_jobs");
    expect(querySql).toContain("external_file_uri");
    expect(querySql).toContain("asr_executions");
    expect(querySql).toContain("COALESCE(execution.lifecycle_status, execution.status, 'accepted')");
    expect(querySql).toContain("NOT IN ('completed', 'failed', 'cancelled', 'expired')");
  });

  it("owner mutations отклоняют просроченный lease", async () => {
    const dialect = new PgDialect();
    const statements: string[] = [];
    const database = {
      execute: vi.fn(async (query: unknown) => {
        statements.push(dialect.sqlToQuery(query as never).sql);
        return { rows: [] };
      }),
    };
    const store = createFileArtifactCleanupJobStore(database);

    await expect(store.heartbeat("00000000-0000-0000-0000-000000000001", "worker-1", 60_000)).resolves.toBe(false);
    await expect(store.deferForActiveAsr("00000000-0000-0000-0000-000000000001", "worker-1", new Date())).resolves.toBe(false);
    await expect(store.release("00000000-0000-0000-0000-000000000001", "worker-1")).resolves.toBe(false);
    await expect(store.complete("00000000-0000-0000-0000-000000000001", "worker-1")).resolves.toBe(false);
    await expect(store.fail("00000000-0000-0000-0000-000000000001", "worker-1", {
      attempts: 1,
      nextRetryAt: null,
      error: "expired",
    })).resolves.toBe(false);

    expect(statements).toHaveLength(5);
    for (const statement of statements) expect(statement).toMatch(/lease_expires_at > now\(\)/i);
  });

  it("новый enqueue redrive-ит только terminal error с cooldown, сохраняя attempts и last_error", async () => {
    const dialect = new PgDialect();
    let querySql = "";
    let queryParams: unknown[] = [];
    const database = {
      execute: vi.fn(async (query: unknown) => {
        const compiled = dialect.sqlToQuery(query as never);
        querySql = compiled.sql;
        queryParams = compiled.params;
        return { rows: [{ id: "00000000-0000-0000-0000-000000000001" }] };
      }),
    };
    const store = createFileArtifactCleanupJobStore(database);

    await expect(store.enqueue({
      workspaceId: "ws-1",
      resourceType: "chat_attachment",
      resourceId: "att-1",
      reason: "s3.chat_attachments.audio_video",
      payload: { attachmentId: "att-1", storageKey: "chat/a.mp3", externalUri: "/ws-1/asr/a.mp3" },
    })).resolves.toBe(true);

    const conflictClause = querySql.slice(querySql.indexOf("ON CONFLICT"));
    expect(conflictClause).toContain("DO UPDATE");
    expect(conflictClause).toContain("file_artifact_cleanup_jobs.status = 'error'");
    expect(conflictClause).toContain("file_artifact_cleanup_jobs.next_retry_at IS NULL");
    expect(conflictClause).toContain("next_retry_at = NOW()");
    expect(conflictClause).not.toMatch(/attempts\s*=/i);
    expect(conflictClause).not.toMatch(/last_error\s*=/i);
    expect(queryParams).toContain(300_000);
  });

  it("stats разделяет retryable error и terminal dead", async () => {
    const dialect = new PgDialect();
    let querySql = "";
    const database = {
      execute: vi.fn(async (query: unknown) => {
        querySql = dialect.sqlToQuery(query as never).sql;
        return { rows: [{ pending: 1, processing: 2, error: 3, dead: 4, oldest_ready_age_seconds: 5 }] };
      }),
    };

    await expect(createFileArtifactCleanupJobStore(database).stats()).resolves.toEqual({
      pending: 1,
      processing: 2,
      error: 3,
      dead: 4,
      oldestReadyAgeSeconds: 5,
    });
    expect(querySql).toContain("status = 'error' AND next_retry_at IS NOT NULL");
    expect(querySql).toContain("status = 'error' AND next_retry_at IS NULL");
  });

  it("idempotency key зависит от обеих копий артефакта и стабилен", () => {
    const input = {
      workspaceId: "ws-1",
      resourceType: "chat_attachment",
      resourceId: "att-1",
      reason: "s3.chat_attachments.audio_video",
      payload: { storageKey: "chat/a.mp3", externalUri: "/ws-1/asr/a.mp3", documentVersion: 1 },
    };
    const first = scheduledCleanupIdempotencyKey(input);
    expect(first).toMatch(/^janitor:[a-f0-9]{32}$/);
    expect(scheduledCleanupIdempotencyKey({ ...input, reason: "another policy" })).toBe(first);
    expect(scheduledCleanupIdempotencyKey({
      ...input,
      payload: { ...input.payload, externalUri: "/ws-1/asr/b.mp3" },
    })).not.toBe(first);
  });
});
