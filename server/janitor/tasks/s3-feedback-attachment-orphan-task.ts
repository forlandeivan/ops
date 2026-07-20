import { and, eq, inArray } from "drizzle-orm";

import { db } from "../../db";
import { chatFeedbackAttachments } from "@shared/schema";
import { createLogger } from "../../lib/logger";
import type { CleanupMode } from "@shared/cleanup-policies";

import { computeCutoff, DEFAULT_MAX_BATCHES_PER_RUN } from "./pg-retention-task";

/**
 * Janitor-задача «storage-driven reconcile» для осиротевших скриншотов отзывов.
 * Источник правды — S3: сканируем объекты с префиксом `feedback-attachments/`
 * и удаляем те, у которых нет строки в `chat_feedback_attachments` (остаются после
 * каскадного удаления uploader-пользователя по `uploader_user_id` CASCADE).
 * Age-guard: объекты удаляются только если LastModified < cutoff (retentionDays).
 */

const logger = createLogger("janitor-s3-feedback-orphan");

export const FEEDBACK_ATTACHMENT_PREFIX = "feedback-attachments/";
const DB_BATCH = 500;

type WorkspaceRow = { id: string; storageBucket: string | null };
type S3Object = { key: string; lastModified: Date; size: number };
type OrphanEntry = { workspaceId: string; key: string; size: number };

function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
}

// ── Стор-интерфейс ────────────────────────────────────────────────────────────

export interface FeedbackAttachmentOrphanStore {
  countOrphans(cutoff: Date, cap: number): Promise<number>;
  sweep(
    cutoff: Date,
    limit: number,
    shouldAbort?: () => boolean,
  ): Promise<{ deleted: number; freedBytes: number; aborted?: boolean }>;
}

// ── Runner ────────────────────────────────────────────────────────────────────

export interface FeedbackAttachmentOrphanResolvedRetention {
  mode: CleanupMode;
  retentionDays: number;
  batchSize: number;
}

export interface FeedbackAttachmentOrphanOptions {
  now?: Date;
  maxBatchesPerRun?: number;
  dryRunCap?: number;
  /** Кооперативная остановка (graceful shutdown): true → прерваться перед следующим удалением. */
  shouldAbort?: () => boolean;
}

export interface FeedbackAttachmentOrphanResult {
  matched: number;
  deleted: number;
  freedBytes: number;
  batches: number;
  /** Прогон прерван shouldAbort до исчерпания кандидатов (хвост доберёт следующий тик). */
  aborted: boolean;
}

export async function runFeedbackAttachmentOrphanTask(
  resolved: FeedbackAttachmentOrphanResolvedRetention,
  store: FeedbackAttachmentOrphanStore,
  options: FeedbackAttachmentOrphanOptions = {},
): Promise<FeedbackAttachmentOrphanResult> {
  const now = options.now ?? new Date();
  const cutoff = computeCutoff(now, resolved.retentionDays);
  const maxBatches = options.maxBatchesPerRun ?? DEFAULT_MAX_BATCHES_PER_RUN;
  const limit = Math.max(1, maxBatches) * Math.max(1, resolved.batchSize);

  if (resolved.mode === "dry_run") {
    const cap = options.dryRunCap ?? limit;
    const matched = await store.countOrphans(cutoff, cap);
    return { matched, deleted: 0, freedBytes: 0, batches: 0, aborted: false };
  }

  const { deleted, freedBytes, aborted } = await store.sweep(cutoff, limit, options.shouldAbort);
  const batches = deleted > 0 ? Math.ceil(deleted / Math.max(1, resolved.batchSize)) : 0;
  return { matched: deleted, deleted, freedBytes, batches, aborted: aborted === true };
}

// ── Инъецируемые зависимости ─────────────────────────────────────────────────

export interface FeedbackAttachmentOrphanDeps {
  listWorkspaces: () => Promise<WorkspaceRow[]>;
  listS3Objects: (bucket: string) => Promise<S3Object[]>;
  findKnownKeys: (workspaceId: string, keys: string[]) => Promise<Set<string>>;
  deleteObject: (workspaceId: string, key: string) => Promise<void>;
  /** Имя бакета workspace при NULL в `workspaces.storage_bucket` (доменный нейминг). */
  defaultBucketName: (workspaceId: string) => string;
}

/** Известные БД ключи среди кандидатов (чистый db-код — остаётся в движке). */
export async function findKnownKeysInDb(workspaceId: string, keys: string[]): Promise<Set<string>> {
  const known = new Set<string>();
  for (const batch of chunk(keys, DB_BATCH)) {
    const rows = await db
      .select({ storageKey: chatFeedbackAttachments.storageKey })
      .from(chatFeedbackAttachments)
      .where(
        and(eq(chatFeedbackAttachments.workspaceId, workspaceId), inArray(chatFeedbackAttachments.storageKey, batch)),
      );
    for (const row of rows) {
      if (row.storageKey) known.add(row.storageKey);
    }
  }
  return known;
}

// ── Внутренний скан ───────────────────────────────────────────────────────────

async function scanOrphans(
  deps: FeedbackAttachmentOrphanDeps,
  cutoff: Date,
  limit: number,
): Promise<OrphanEntry[]> {
  const allWorkspaces = await deps.listWorkspaces();
  const orphans: OrphanEntry[] = [];

  for (const ws of allWorkspaces) {
    if (orphans.length >= limit) break;

    const bucket = ws.storageBucket ?? deps.defaultBucketName(ws.id);
    let s3Objects: S3Object[];
    try {
      s3Objects = await deps.listS3Objects(bucket);
    } catch (error) {
      logger.warn(
        {
          event_name: "janitor.s3_feedback_orphan.scan",
          outcome: "partial",
          workspaceId: ws.id,
          error_message: error instanceof Error ? error.message : String(error),
        },
        "[janitor-s3-feedback-orphan] failed to list S3 objects for workspace; skipping",
      );
      continue;
    }

    const aged = s3Objects.filter((o) => o.lastModified < cutoff);
    if (aged.length === 0) continue;

    const knownKeys = await deps.findKnownKeys(
      ws.id,
      aged.map((o) => o.key),
    );

    for (const obj of aged) {
      if (!knownKeys.has(obj.key)) {
        orphans.push({ workspaceId: ws.id, key: obj.key, size: obj.size });
        if (orphans.length >= limit) break;
      }
    }
  }

  return orphans;
}

// ── Стор-фабрика ─────────────────────────────────────────────────────────────

/** Боевую сборку deps см. server/janitor/default-stores.ts (composition-root долга). */
export function createFeedbackAttachmentOrphanStore(
  deps: FeedbackAttachmentOrphanDeps,
): FeedbackAttachmentOrphanStore {
  return {
    async countOrphans(cutoff, cap) {
      const orphans = await scanOrphans(deps, cutoff, cap);
      return orphans.length;
    },

    async sweep(cutoff, limit, shouldAbort) {
      const orphans = await scanOrphans(deps, cutoff, limit);
      let deleted = 0;
      let freedBytes = 0;
      let aborted = false;

      for (const { workspaceId, key, size } of orphans) {
        if (shouldAbort?.()) {
          aborted = true;
          break;
        }
        try {
          await deps.deleteObject(workspaceId, key);
          deleted += 1;
          freedBytes += size;
        } catch (error) {
          logger.warn(
            {
              event_name: "janitor.s3_feedback_orphan.delete",
              outcome: "partial",
              workspaceId,
              key,
              error_message: error instanceof Error ? error.message : String(error),
            },
            "[janitor-s3-feedback-orphan] failed to delete orphaned object; skipping",
          );
        }
      }

      return { deleted, freedBytes, aborted };
    },
  };
}
