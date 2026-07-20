import { eq, lte, notInArray } from "drizzle-orm";

import { db } from "../../db";
import { qdrantOrphanCandidates } from "@shared/schema";
import { createLogger } from "../../lib/logger";
import type { CleanupMode } from "@shared/cleanup-policies";

import { computeCutoff, DEFAULT_MAX_BATCHES_PER_RUN } from "./pg-retention-task";

/**
 * Исполнитель janitor-задачи «осиротевшие коллекции Qdrant». В отличие от pg/s3
 * задач, источник правды — НЕ строка БД с time-колонкой, а живой Qdrant: сканируем
 * `getCollections()` и сверяем с ожидаемым набором (всё, чем владеет Unica). То, что
 * есть в Qdrant, но не ожидается, — кандидат в сироты.
 *
 * Безопасность строится на grace-периоде через ledger `qdrant_orphan_candidates`:
 * коллекция удаляется, только если непрерывно числится сиротой дольше срока политики
 * (поле retentionDays). Это закрывает гонку создания↔регистрации коллекции и активные
 * арена-прогоны (их коллекции живут минуты ≪ grace). Топологию коллекций НЕ меняем,
 * векторы не перекладываем — только убираем мусор.
 */

const logger = createLogger("janitor-qdrant-gc");

// Управляемые семейства коллекций и детекция сирот живут в server/qdrant-collection-names
// (единый источник, лёгкий модуль); скан Qdrant и ожидаемый набор — в default-stores.ts
// (composition-root доменного долга). Здесь — только движок и ledger-хелперы (чистый db).

export interface QdrantOrphanListParams {
  /** Граница grace: кандидат удаляем, если first_seen_at <= cutoff. */
  cutoff: Date;
  /** Ограничение числа возвращаемых имён. */
  cap: number;
  /** true (enforce) — обновить ledger по текущему скану; false (dry_run) — не писать ledger. */
  record: boolean;
  /** Момент скана (для first_seen_at/last_seen_at). */
  now: Date;
}

/**
 * Стор-исполнитель (инъекция нужна для детерминированных тестов без живого Qdrant/БД).
 * `listDeletable` возвращает имена коллекций, готовых к удалению (сироты дольше grace).
 * `deleteCollection` удаляет коллекцию в Qdrant и подчищает реестр + строку ledger.
 * `reconcileUsage` пересчитывает usage-гейджи (qdrantCollectionsCount) после уборки.
 */
export interface QdrantOrphanStore {
  listDeletable(params: QdrantOrphanListParams): Promise<string[]>;
  deleteCollection(name: string): Promise<boolean>;
  reconcileUsage(): Promise<void>;
}

export interface QdrantOrphanResolvedRetention {
  mode: CleanupMode;
  /** grace-период в днях (UI-поле «Срок, дней»). */
  retentionDays: number;
  /** Максимум коллекций к удалению за прогон. */
  batchSize: number;
}

export interface QdrantOrphanOptions {
  now?: Date;
  maxBatchesPerRun?: number;
  dryRunCap?: number;
  pauseBetweenBatchesMs?: number;
  /** Кооперативная остановка (graceful shutdown): true → прерваться перед следующим удалением. */
  shouldAbort?: () => boolean;
}

export interface QdrantOrphanResult {
  matched: number;
  deleted: number;
  freedBytes: number;
  batches: number;
  /** Прогон прерван shouldAbort до исчерпания кандидатов (хвост доберёт следующий тик). */
  aborted: boolean;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Прогон GC-задачи. dry_run — только считает кандидатов, готовых к удалению, ничего не
 * трогает (ledger не пишет). enforce — обновляет ledger по текущему скану, удаляет
 * созревшие сироты до maxBatchesPerRun*batchSize и в конце пересчитывает usage-гейдж.
 */
export async function runQdrantOrphanGcTask(
  resolved: QdrantOrphanResolvedRetention,
  store: QdrantOrphanStore,
  options: QdrantOrphanOptions = {},
): Promise<QdrantOrphanResult> {
  const now = options.now ?? new Date();
  const cutoff = computeCutoff(now, resolved.retentionDays);
  const maxBatches = options.maxBatchesPerRun ?? DEFAULT_MAX_BATCHES_PER_RUN;
  const limit = Math.max(1, maxBatches) * Math.max(1, resolved.batchSize);

  if (resolved.mode === "dry_run") {
    const cap = options.dryRunCap ?? limit;
    const deletable = await store.listDeletable({ cutoff, cap, record: false, now });
    return { matched: deletable.length, deleted: 0, freedBytes: 0, batches: 0, aborted: false };
  }

  const deletable = await store.listDeletable({ cutoff, cap: limit, record: true, now });
  let deleted = 0;
  let batches = 0;
  let aborted = false;
  for (let i = 0; i < deletable.length; i += 1) {
    if (options.shouldAbort?.()) {
      aborted = true;
      break;
    }
    const ok = await store.deleteCollection(deletable[i]);
    if (ok) {
      deleted += 1;
    }
    if (resolved.batchSize > 0 && (i + 1) % resolved.batchSize === 0) {
      batches += 1;
      if (options.pauseBetweenBatchesMs && options.pauseBetweenBatchesMs > 0) {
        await delay(options.pauseBetweenBatchesMs);
      }
    }
  }
  if (deletable.length > 0 && deletable.length % Math.max(1, resolved.batchSize) !== 0) {
    batches += 1;
  }

  // Оживление reconcile: после уборки (и в любом enforce-прогоне) пересчитываем usage-гейдж,
  // чтобы qdrantCollectionsCount перестал дрейфовать. Best-effort — не валим прогон.
  try {
    await store.reconcileUsage();
  } catch (error) {
    logger.warn(
      {
        event_name: "janitor.qdrant_gc.reconcile",
        outcome: "partial",
        error_message: error instanceof Error ? error.message : String(error),
      },
      "[janitor-qdrant-gc] failed to reconcile qdrant usage after cleanup",
    );
  }

  return { matched: deletable.length, deleted, freedBytes: 0, batches, aborted };
}

// ── Ledger-хелперы (чистый db-код; доменный скан Qdrant — в default-stores.ts) ──

/** Обновить ledger по текущему скану: завести новые, обновить last_seen, выкинуть переставших быть сиротой. */
export async function recordCandidates(orphans: string[], now: Date): Promise<void> {
  await db.transaction(async (tx: typeof db) => {
    if (orphans.length > 0) {
      await tx
        .insert(qdrantOrphanCandidates)
        .values(orphans.map((name) => ({ collectionName: name, firstSeenAt: now, lastSeenAt: now })))
        .onConflictDoUpdate({
          target: qdrantOrphanCandidates.collectionName,
          set: { lastSeenAt: now },
        });
      await tx
        .delete(qdrantOrphanCandidates)
        .where(notInArray(qdrantOrphanCandidates.collectionName, orphans));
    } else {
      await tx.delete(qdrantOrphanCandidates);
    }
  });
}

/** Имена кандидатов из ledger, чей first_seen_at <= cutoff (созрели по grace). */
export async function listLedgerMaturedOrphans(cutoff: Date, cap: number): Promise<Set<string>> {
  const rows = await db
    .select({ name: qdrantOrphanCandidates.collectionName })
    .from(qdrantOrphanCandidates)
    .where(lte(qdrantOrphanCandidates.firstSeenAt, cutoff))
    .orderBy(qdrantOrphanCandidates.firstSeenAt)
    .limit(cap);
  return new Set(rows.map((row) => row.name));
}

/** Удалить строку ledger (идемпотентно: отсутствие строки не ошибка). */
export async function removeLedgerRow(collectionName: string): Promise<void> {
  await db.delete(qdrantOrphanCandidates).where(eq(qdrantOrphanCandidates.collectionName, collectionName));
}

export interface QdrantOrphanStoreDeps {
  computeCurrentOrphans: () => Promise<string[]>;
  recordCandidates: (orphans: string[], now: Date) => Promise<void>;
  listMaturedOrphans: (cutoff: Date, cap: number) => Promise<Set<string>>;
  deleteQdrantCollection: (name: string) => Promise<void>;
  removeRegistry: (name: string) => Promise<void>;
  removeLedgerRow: (name: string) => Promise<void>;
  reconcileUsage: () => Promise<void>;
}

function isQdrantNotFound(error: unknown): boolean {
  const status = (error as { status?: number; response?: { status?: number } })?.status
    ?? (error as { response?: { status?: number } })?.response?.status
    ?? null;
  if (status === 404) {
    return true;
  }
  const message = error instanceof Error ? error.message : String(error);
  return /not found|does not exist|404/i.test(message);
}

/** Боевую сборку deps см. server/janitor/default-stores.ts (composition-root долга). */
export function createQdrantOrphanStore(deps: QdrantOrphanStoreDeps): QdrantOrphanStore {
  return {
    async listDeletable({ cutoff, cap, record, now }) {
      const orphans = await deps.computeCurrentOrphans();
      if (record) {
        await deps.recordCandidates(orphans, now);
      }
      if (orphans.length === 0) {
        return [];
      }
      const matured = await deps.listMaturedOrphans(cutoff, cap);
      const deletable: string[] = [];
      for (const name of orphans) {
        if (matured.has(name)) {
          deletable.push(name);
          if (deletable.length >= cap) {
            break;
          }
        }
      }
      return deletable;
    },

    async deleteCollection(name) {
      try {
        await deps.deleteQdrantCollection(name);
      } catch (error) {
        if (!isQdrantNotFound(error)) {
          logger.warn(
            {
              event_name: "janitor.qdrant_gc.delete",
              outcome: "partial",
              collection_name: name,
              error_message: error instanceof Error ? error.message : String(error),
            },
            "[janitor-qdrant-gc] failed to delete orphaned collection",
          );
          return false;
        }
        // 404 — коллекция уже отсутствует, продолжаем уборку реестра/ledger.
      }
      try {
        await deps.removeRegistry(name);
      } catch {
        // Реестр мог не содержать строки (сирота без владельца) — это норма.
      }
      try {
        await deps.removeLedgerRow(name);
      } catch {
        // Идемпотентно: отсутствие строки ledger не ошибка.
      }
      return true;
    },

    async reconcileUsage() {
      await deps.reconcileUsage();
    },
  };
}
