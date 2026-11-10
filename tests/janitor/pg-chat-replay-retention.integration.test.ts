import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { createPgRetentionStore } from "../../server/janitor/tasks/pg-retention-task";
import { createChatAttachmentS3Store } from "../../server/janitor/tasks/s3-retention-task";
import { createFileArtifactCleanupJobStore, scheduledCleanupIdempotencyKey, type FileArtifactCleanupJobRecord } from "../../server/janitor/file-artifact-cleanup-job-store";

// Opt in explicitly. All tables are connection-local TEMP tables, and the transaction rolls back.
const connectionString = process.env.JANITOR_PG_RETENTION_TEST_DATABASE_URL;

describe.skipIf(!connectionString)("chat replay retention PostgreSQL integration", () => {
  it("retains active queue dependencies and attachments while deleting only expired replay state", async () => {
    const client = new Client({ connectionString });
    await client.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL search_path = pg_temp");
      await client.query(`
        CREATE TEMP TABLE chat_queued_messages (
          id uuid PRIMARY KEY, chat_id text NOT NULL, workspace_id text NOT NULL DEFAULT 'ws',
          status text NOT NULL, input jsonb NOT NULL DEFAULT '{}', after_operation_id uuid,
          finished_at timestamptz
        );
        CREATE TEMP TABLE chat_turn_receipts (
          chat_id text NOT NULL, operation_id uuid NOT NULL, finished boolean NOT NULL,
          finished_at timestamptz, lease_until timestamptz NOT NULL,
          PRIMARY KEY (chat_id, operation_id)
        );
        CREATE TEMP TABLE chat_sessions (id text PRIMARY KEY, deleted_at timestamptz);
        INSERT INTO chat_sessions VALUES ('chat', NULL);
        CREATE TEMP TABLE chat_attachments (
          id text PRIMARY KEY, workspace_id text NOT NULL DEFAULT 'ws',
          chat_id text NOT NULL DEFAULT 'chat' REFERENCES chat_sessions(id) ON DELETE CASCADE,
          file_id text, filename text DEFAULT 'a.txt', mime_type text DEFAULT 'text/plain',
          storage_key text NOT NULL DEFAULT 'attachments/a', document_version int DEFAULT 1,
          derived_manifest_object_key text, preview_object_key text, size_bytes bigint DEFAULT 1,
          created_at timestamptz NOT NULL, message_id text
        );
        CREATE TEMP TABLE files (id text PRIMARY KEY, external_uri text);
        CREATE TEMP TABLE asr_completion_jobs (status text, file_id text, external_file_uri text, chat_id text);
        CREATE TEMP TABLE asr_executions (lifecycle_status text, status text, file_id text, attachment_id text, external_file_uri text, chat_id text);
        CREATE TEMP TABLE file_artifact_cleanup_jobs (
          id uuid DEFAULT gen_random_uuid(), idempotency_key text UNIQUE,
          workspace_id text, resource_type text, resource_id text, reason text, payload_version int,
          payload jsonb, status text, attempts int, created_at timestamptz, updated_at timestamptz,
          worker_id text, lease_expires_at timestamptz, next_retry_at timestamptz
        );
      `);
      const old = new Date("2026-10-01T00:00:00Z");
      const cutoff = new Date("2026-11-01T00:00:00Z");
      const recent = new Date("2026-11-09T00:00:00Z");
      const dialect = new PgDialect();
      const database = { execute: async (query: unknown) => {
        const compiled = dialect.sqlToQuery(query as SQL);
        return client.query(compiled.sql, compiled.params);
      } };
      const store = createPgRetentionStore(database);
      const receipt = async (operation: string, finished = true, at: Date | null = old, lease = old, chat = "chat") => {
        await client.query("INSERT INTO chat_turn_receipts VALUES ($1,$2,$3,$4,$5)", [chat, operation, finished, at, lease]);
      };
      const queue = async (status: string, options: { after?: string; id?: string; at?: Date | null; attachment?: string; workspace?: string } = {}) => {
        const id = options.id ?? randomUUID();
        await client.query("INSERT INTO chat_queued_messages (id,chat_id,workspace_id,status,input,after_operation_id,finished_at) VALUES ($1,'chat',$2,$3,$4,$5,$6)",
          [id, options.workspace ?? "ws", status, JSON.stringify({ attachmentIds: options.attachment ? [options.attachment] : [] }), options.after ?? null, options.at === undefined ? old : options.at]);
        return id;
      };

      const removable = randomUUID();
      const abandoned = randomUUID();
      await receipt(removable);
      await receipt(abandoned, false, null);
      await receipt(randomUUID(), false, null, recent);
      await receipt(randomUUID(), true, recent);
      await receipt(randomUUID(), true, null); // Historical unknown completion time is retained.
      await receipt(randomUUID(), false, old); // Inconsistent state is retained conservatively.
      let sameOperationOtherChat = "";
      for (const status of ["queued", "dispatching", "failed"]) {
        const operation = randomUUID();
        await receipt(operation);
        await queue(status, { after: operation, attachment: `protected-${status}` });
        if (status === "queued") {
          sameOperationOtherChat = operation;
          await receipt(operation, true, old, old, "other-chat");
        }
      }
      const ownId = randomUUID();
      await receipt(ownId);
      await queue("failed", { id: ownId });
      const abandonedReferenced = randomUUID();
      await receipt(abandonedReferenced, false, null);
      await queue("queued", { after: abandonedReferenced });
      await queue("dispatched");
      await queue("canceled");
      await queue("canceled", { at: recent });
      await queue("dispatched", { at: null });

      await expect(store.countMatches({ table: "chat_turn_receipts", timeColumn: "finished_at", cutoff, cap: 100 })).resolves.toBe(3);
      await expect(store.deleteBatch({ table: "chat_turn_receipts", timeColumn: "finished_at", pkColumn: "operation_id", cutoff, batchSize: 2 })).resolves.toBe(2);
      await expect(store.deleteBatch({ table: "chat_turn_receipts", timeColumn: "finished_at", pkColumn: "operation_id", cutoff, batchSize: 2 })).resolves.toBe(1);
      const remaining = (await client.query("SELECT chat_id, operation_id FROM chat_turn_receipts")).rows;
      expect(remaining.some(row => row.operation_id === removable || row.operation_id === abandoned)).toBe(false);
      expect(remaining.some(row => row.operation_id === sameOperationOtherChat && row.chat_id === "chat")).toBe(true);
      expect(remaining.some(row => row.operation_id === sameOperationOtherChat && row.chat_id === "other-chat")).toBe(false);
      expect(remaining.some(row => row.operation_id === ownId)).toBe(true);
      expect(remaining.some(row => row.operation_id === abandonedReferenced)).toBe(true);

      await expect(store.countMatches({ table: "chat_queued_messages", timeColumn: "finished_at", cutoff, cap: 100 })).resolves.toBe(2);
      await expect(store.deleteBatch({ table: "chat_queued_messages", timeColumn: "finished_at", pkColumn: "id", cutoff, batchSize: 100 })).resolves.toBe(2);
      expect((await client.query("SELECT count(*)::int AS count FROM chat_queued_messages WHERE status IN ('queued','dispatching','failed')")).rows[0].count).toBe(5);

      for (const id of ["protected-queued", "protected-dispatching", "protected-failed", "free", "other-workspace"]) {
        await client.query("INSERT INTO chat_attachments (id,created_at) VALUES ($1,$2)", [id, old]);
      }
      await queue("queued", { attachment: "other-workspace", workspace: "different-ws" });
      const s3Store = createChatAttachmentS3Store(database);
      const filter = { timeColumn: "created_at", mimePrefixes: [], mimePrefixExclude: false, isNullColumn: "message_id", policyKey: "s3.chat_attachments.drafts" };
      await expect(s3Store.countMatches({ filter, cutoff, cap: 100 })).resolves.toBe(2);
      await expect(s3Store.purgeBatch({ filter, cutoff, batchSize: 100 })).resolves.toEqual({ deleted: 2, freedBytes: 2 });
      expect((await client.query("SELECT resource_id FROM file_artifact_cleanup_jobs ORDER BY resource_id")).rows.map(row => row.resource_id)).toEqual(["free", "other-workspace"]);

      // The queue may acquire an attachment after janitor has already enqueued its snapshot.
      await queue("queued", { attachment: "free" });
      const cleanupStore = createFileArtifactCleanupJobStore(database);
      const snapshot = { workspaceId: "ws", reason: "s3.chat_attachments.drafts", payload: { attachmentId: "free" } } as FileArtifactCleanupJobRecord;
      await expect(cleanupStore.hasActiveAsr(snapshot)).resolves.toBe(true);
      await expect(cleanupStore.hasActiveAsr({ ...snapshot, reason: "manual_chat_delete" })).resolves.toBe(false);

      // Gateway retires a stale draft snapshot after message binding without deleting its file.
      await client.query("UPDATE chat_attachments SET message_id = 'bound-message' WHERE id = 'other-workspace'");
      await client.query("UPDATE file_artifact_cleanup_jobs SET status = 'success' WHERE resource_id = 'other-workspace'");
      await expect(s3Store.countMatches({ filter, cutoff, cap: 100 })).resolves.toBe(0);
      const ordinaryFilter = { ...filter, isNullColumn: null, policyKey: "s3.chat_attachments.other" };
      await expect(s3Store.countMatches({ filter: ordinaryFilter, cutoff, cap: 100 })).resolves.toBe(1);
      await expect(s3Store.purgeBatch({ filter: ordinaryFilter, cutoff, batchSize: 100 })).resolves.toEqual({ deleted: 1, freedBytes: 1 });
      const policies = (await client.query("SELECT reason, idempotency_key FROM file_artifact_cleanup_jobs WHERE resource_id = 'other-workspace' ORDER BY reason")).rows;
      expect(policies.map(row => row.reason)).toEqual(["s3.chat_attachments.drafts", "s3.chat_attachments.other"]);
      expect(new Set(policies.map(row => row.idempotency_key)).size).toBe(2);

      // Pre-upgrade Janitor/cascade keys suppress overlapping selection while active, but a
      // successfully retired legacy draft cannot suppress another policy forever.
      await client.query("INSERT INTO chat_attachments (id,created_at,message_id) VALUES ('legacy',$1,'bound-message')", [old]);
      const legacyPayload = { attachmentId: "legacy", storageKey: "attachments/a", documentVersion: 1 };
      const legacyKey = scheduledCleanupIdempotencyKey({ workspaceId: "ws", resourceType: "chat_attachment", resourceId: "legacy", reason: "s3.chat_attachments.drafts", payload: legacyPayload });
      await client.query("INSERT INTO file_artifact_cleanup_jobs (idempotency_key,workspace_id,resource_type,resource_id,reason,payload,status,created_at) VALUES ($1,'ws','chat_attachment','legacy','s3.chat_attachments.drafts',$2,'pending',$3)", [legacyKey, JSON.stringify(legacyPayload), old]);
      for (const [status, retryAt] of [["pending", null], ["processing", null], ["error", recent]]) {
        await client.query("UPDATE file_artifact_cleanup_jobs SET status=$1,next_retry_at=$2 WHERE idempotency_key=$3", [status, retryAt, legacyKey]);
        await expect(s3Store.countMatches({ filter: ordinaryFilter, cutoff, cap: 100 })).resolves.toBe(0);
        await expect(s3Store.purgeBatch({ filter: ordinaryFilter, cutoff, batchSize: 100 })).resolves.toEqual({ deleted: 0, freedBytes: 0 });
      }
      for (const status of ["success", "error"]) {
        await client.query("UPDATE file_artifact_cleanup_jobs SET status=$1,next_retry_at=NULL WHERE idempotency_key=$2", [status, legacyKey]);
        await expect(s3Store.countMatches({ filter: ordinaryFilter, cutoff, cap: 100 })).resolves.toBe(1);
      }
      await client.query("UPDATE file_artifact_cleanup_jobs SET status='success' WHERE idempotency_key=$1", [legacyKey]);
      await expect(s3Store.purgeBatch({ filter: ordinaryFilter, cutoff, batchSize: 100 })).resolves.toEqual({ deleted: 1, freedBytes: 1 });

      // An active policy-scoped draft may retire without deleting a bound/missing
      // row. Explicit cascade must still save its own mandatory cleanup snapshot.
      await client.query("INSERT INTO chat_sessions VALUES ('cascade-chat',$1)", [old]);
      await client.query("INSERT INTO chat_attachments (id,chat_id,created_at) VALUES ('cascade-attachment','cascade-chat',$1)", [old]);
      await expect(s3Store.purgeBatch({ filter, cutoff, batchSize: 100 })).resolves.toEqual({ deleted: 1, freedBytes: 1 });
      await client.query("UPDATE file_artifact_cleanup_jobs SET status='processing',lease_expires_at=$1 WHERE resource_id='cascade-attachment'", [recent]);
      await expect(store.deleteBatch({ table: "chat_sessions", timeColumn: "deleted_at", pkColumn: "id", cutoff, batchSize: 100 })).resolves.toBe(1);
      expect((await client.query("SELECT count(*)::int AS count FROM chat_attachments WHERE id='cascade-attachment'")).rows[0].count).toBe(0);
      expect((await client.query("SELECT reason FROM file_artifact_cleanup_jobs WHERE resource_id='cascade-attachment' ORDER BY reason")).rows.map(row => row.reason)).toEqual(["pg.chat_sessions", "s3.chat_attachments.drafts"]);
    } finally {
      await client.query("ROLLBACK");
      await client.end();
    }
  }, 20_000);
});
