import { createHash } from "node:crypto";

import { sql } from "drizzle-orm";

import { db } from "../db";

export const FILE_ARTIFACT_CLEANUP_PAYLOAD_VERSION = 1 as const;
/** Защита от hot loop: новый enqueue оживляет terminal job не раньше чем через 5 минут. */
export const FILE_ARTIFACT_CLEANUP_REDRIVE_DELAY_MS = 5 * 60 * 1000;

export interface FileArtifactCleanupSnapshot {
  attachmentId?: string | null;
  chatId?: string | null;
  fileId?: string | null;
  filename?: string | null;
  mimeType?: string | null;
  storageKey?: string | null;
  documentVersion?: number | null;
  derivedManifestObjectKey?: string | null;
  previewObjectKey?: string | null;
  externalUri?: string | null;
}

export interface FileArtifactCleanupJobRecord {
  id: string;
  idempotencyKey: string;
  workspaceId: string;
  resourceType: string;
  resourceId: string;
  reason: string;
  payloadVersion: number;
  payload: FileArtifactCleanupSnapshot;
  status: "pending" | "processing" | "success" | "error";
  attempts: number;
  workerId: string | null;
  leaseExpiresAt: Date | null;
  nextRetryAt: Date | null;
  lastError: string | null;
}

export interface ScheduledFileArtifactCleanupInput {
  workspaceId: string;
  resourceType: string;
  resourceId: string;
  reason: string;
  payload: FileArtifactCleanupSnapshot;
}

export interface FileArtifactCleanupQueueStats {
  pending: number;
  processing: number;
  /** Ошибки с запланированной повторной попыткой. */
  error: number;
  /** Terminal ошибки без автоматической повторной попытки. */
  dead: number;
  oldestReadyAgeSeconds: number;
}

type QueryExecutor = { execute(query: unknown): Promise<unknown> };

function rowsOf(result: unknown): Array<Record<string, unknown>> {
  return (result as { rows?: Array<Record<string, unknown>> }).rows ?? [];
}

function nullableDate(value: unknown): Date | null {
  if (value == null) return null;
  const parsed = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function numberOf(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseJob(row: Record<string, unknown>): FileArtifactCleanupJobRecord {
  const payload = row.payload;
  return {
    id: String(row.id),
    idempotencyKey: String(row.idempotency_key),
    workspaceId: String(row.workspace_id),
    resourceType: String(row.resource_type),
    resourceId: String(row.resource_id),
    reason: String(row.reason),
    payloadVersion: numberOf(row.payload_version),
    payload: payload && typeof payload === "object" ? payload as FileArtifactCleanupSnapshot : {},
    status: String(row.status) as FileArtifactCleanupJobRecord["status"],
    attempts: numberOf(row.attempts),
    workerId: row.worker_id == null ? null : String(row.worker_id),
    leaseExpiresAt: nullableDate(row.lease_expires_at),
    nextRetryAt: nullableDate(row.next_retry_at),
    lastError: row.last_error == null ? null : String(row.last_error),
  };
}

export function scheduledCleanupIdempotencyKey(input: ScheduledFileArtifactCleanupInput): string {
  // Формат намеренно повторяется в atomic SQL каскадных PG-политик. chr(31)
  // не встречается в пользовательских путях и исключает неоднозначность склейки.
  const identity = [
    input.workspaceId,
    input.resourceType,
    input.resourceId,
    input.payload.storageKey ?? "",
    input.payload.externalUri ?? "",
    input.payload.documentVersion == null ? "" : String(input.payload.documentVersion),
  ].join("\u001f");
  return `janitor:${createHash("md5").update(identity).digest("hex")}`;
}

export interface FileArtifactCleanupJobStore {
  claim(workerId: string, leaseMs: number): Promise<FileArtifactCleanupJobRecord | null>;
  heartbeat(jobId: string, workerId: string, leaseMs: number): Promise<boolean>;
  hasActiveAsr(job: FileArtifactCleanupJobRecord): Promise<boolean>;
  deferForActiveAsr(jobId: string, workerId: string, nextRetryAt: Date): Promise<boolean>;
  release(jobId: string, workerId: string): Promise<boolean>;
  complete(jobId: string, workerId: string): Promise<boolean>;
  fail(
    jobId: string,
    workerId: string,
    params: { attempts: number; nextRetryAt: Date | null; error: string },
  ): Promise<boolean>;
  enqueue(input: ScheduledFileArtifactCleanupInput): Promise<boolean>;
  stats(): Promise<FileArtifactCleanupQueueStats>;
}

export function createFileArtifactCleanupJobStore(
  database: QueryExecutor = db as unknown as QueryExecutor,
): FileArtifactCleanupJobStore {
  return {
    async claim(workerId, leaseMs) {
      const result = await database.execute(sql`
        WITH candidate AS (
          SELECT id
          FROM file_artifact_cleanup_jobs
          WHERE (
            (status = 'pending' AND (next_retry_at IS NULL OR next_retry_at <= NOW()))
            OR (status = 'error' AND next_retry_at IS NOT NULL AND next_retry_at <= NOW())
            OR (status = 'processing' AND lease_expires_at < NOW())
          )
          ORDER BY created_at, id
          FOR UPDATE SKIP LOCKED
          LIMIT 1
        )
        UPDATE file_artifact_cleanup_jobs AS jobs
        SET status = 'processing',
            worker_id = ${workerId},
            lease_expires_at = NOW() + (${leaseMs} * INTERVAL '1 millisecond'),
            updated_at = NOW()
        FROM candidate
        WHERE jobs.id = candidate.id
        RETURNING jobs.*
      `);
      const row = rowsOf(result)[0];
      return row ? parseJob(row) : null;
    },

    async heartbeat(jobId, workerId, leaseMs) {
      const result = await database.execute(sql`
        UPDATE file_artifact_cleanup_jobs
        SET lease_expires_at = NOW() + (${leaseMs} * INTERVAL '1 millisecond'),
            updated_at = NOW()
        WHERE id = ${jobId}::uuid AND status = 'processing' AND worker_id = ${workerId}
          AND lease_expires_at > NOW()
        RETURNING id
      `);
      return rowsOf(result).length === 1;
    },

    async hasActiveAsr(job) {
      const fileId = job.payload.fileId?.trim() || null;
      const attachmentId = job.payload.attachmentId?.trim() || null;
      const externalUri = job.payload.externalUri?.trim() || null;
      if (!fileId && !attachmentId && !externalUri) {
        return false;
      }
      const result = await database.execute(sql`
        SELECT EXISTS (
          SELECT 1
          FROM asr_completion_jobs AS completion
          WHERE completion.status NOT IN ('success', 'error', 'cancelled')
            AND (
              (${fileId}::text IS NOT NULL AND completion.file_id::text = ${fileId})
              OR (${externalUri}::text IS NOT NULL AND completion.external_file_uri = ${externalUri})
            )
          UNION ALL
          SELECT 1
          FROM asr_executions AS execution
          WHERE COALESCE(execution.lifecycle_status, execution.status, 'accepted')
              NOT IN ('completed', 'failed', 'cancelled', 'expired')
            AND (
              (${fileId}::text IS NOT NULL AND execution.file_id::text = ${fileId})
              OR (${attachmentId}::text IS NOT NULL AND execution.attachment_id::text = ${attachmentId})
              OR (${externalUri}::text IS NOT NULL AND execution.external_file_uri = ${externalUri})
            )
          LIMIT 1
        ) AS active
      `);
      return rowsOf(result)[0]?.active === true;
    },

    async deferForActiveAsr(jobId, workerId, nextRetryAt) {
      const result = await database.execute(sql`
        UPDATE file_artifact_cleanup_jobs
        SET status = 'pending', worker_id = NULL, lease_expires_at = NULL,
            next_retry_at = ${nextRetryAt}, last_error = NULL, updated_at = NOW()
        WHERE id = ${jobId}::uuid AND status = 'processing' AND worker_id = ${workerId}
          AND lease_expires_at > NOW()
        RETURNING id
      `);
      return rowsOf(result).length === 1;
    },

    async release(jobId, workerId) {
      const result = await database.execute(sql`
        UPDATE file_artifact_cleanup_jobs
        SET status = 'pending', worker_id = NULL, lease_expires_at = NULL,
            next_retry_at = NOW(), updated_at = NOW()
        WHERE id = ${jobId}::uuid AND status = 'processing' AND worker_id = ${workerId}
          AND lease_expires_at > NOW()
        RETURNING id
      `);
      return rowsOf(result).length === 1;
    },

    async complete(jobId, workerId) {
      const result = await database.execute(sql`
        UPDATE file_artifact_cleanup_jobs
        SET status = 'success', worker_id = NULL, lease_expires_at = NULL,
            next_retry_at = NULL, last_error = NULL, updated_at = NOW()
        WHERE id = ${jobId}::uuid AND status = 'processing' AND worker_id = ${workerId}
          AND lease_expires_at > NOW()
        RETURNING id
      `);
      return rowsOf(result).length === 1;
    },

    async fail(jobId, workerId, params) {
      const result = await database.execute(sql`
        UPDATE file_artifact_cleanup_jobs
        SET status = 'error', attempts = ${params.attempts}, worker_id = NULL,
            lease_expires_at = NULL, next_retry_at = ${params.nextRetryAt},
            last_error = ${params.error.slice(0, 4000)}, updated_at = NOW()
        WHERE id = ${jobId}::uuid AND status = 'processing' AND worker_id = ${workerId}
          AND lease_expires_at > NOW()
        RETURNING id
      `);
      return rowsOf(result).length === 1;
    },

    async enqueue(input) {
      const idempotencyKey = scheduledCleanupIdempotencyKey(input);
      const result = await database.execute(sql`
        INSERT INTO file_artifact_cleanup_jobs (
          idempotency_key, workspace_id, resource_type, resource_id, reason,
          payload_version, payload, status, attempts, created_at, updated_at
        ) VALUES (
          ${idempotencyKey}, ${input.workspaceId}, ${input.resourceType}, ${input.resourceId}, ${input.reason},
          ${FILE_ARTIFACT_CLEANUP_PAYLOAD_VERSION}, ${JSON.stringify(input.payload)}::jsonb,
          'pending', 0, NOW(), NOW()
        )
        ON CONFLICT (idempotency_key) DO UPDATE
        SET status = 'pending',
            worker_id = NULL,
            lease_expires_at = NULL,
            next_retry_at = NOW() + (${FILE_ARTIFACT_CLEANUP_REDRIVE_DELAY_MS} * INTERVAL '1 millisecond'),
            updated_at = NOW()
        WHERE file_artifact_cleanup_jobs.status = 'error'
          AND file_artifact_cleanup_jobs.next_retry_at IS NULL
        RETURNING id
      `);
      return rowsOf(result).length === 1;
    },

    async stats() {
      const result = await database.execute(sql`
        SELECT
          COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
          COUNT(*) FILTER (WHERE status = 'processing')::int AS processing,
          COUNT(*) FILTER (WHERE status = 'error' AND next_retry_at IS NOT NULL)::int AS error,
          COUNT(*) FILTER (WHERE status = 'error' AND next_retry_at IS NULL)::int AS dead,
          COALESCE(EXTRACT(EPOCH FROM (NOW() - MIN(created_at) FILTER (
            WHERE (status = 'pending' AND (next_retry_at IS NULL OR next_retry_at <= NOW()))
               OR (status = 'error' AND next_retry_at IS NOT NULL AND next_retry_at <= NOW())
               OR (status = 'processing' AND lease_expires_at < NOW())
          ))), 0)::float8 AS oldest_ready_age_seconds
        FROM file_artifact_cleanup_jobs
      `);
      const row = rowsOf(result)[0] ?? {};
      return {
        pending: numberOf(row.pending),
        processing: numberOf(row.processing),
        error: numberOf(row.error),
        dead: numberOf(row.dead),
        oldestReadyAgeSeconds: numberOf(row.oldest_ready_age_seconds),
      };
    },
  };
}
