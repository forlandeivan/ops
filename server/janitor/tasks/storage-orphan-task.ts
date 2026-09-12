/**
 * Сверка хранилища с базой — политика «Файлы-сироты в хранилище» (`s3.storage.orphans`).
 *
 * Обходит все бакеты пространств и сравнивает объекты с картой владения
 * `shared/storage-ownership.ts`. Сирота — объект в папке из карты, на который не ссылается ни
 * одна строка базы. Бакет удалённого пространства — бакет с префиксом пространств, которым не
 * пользуется ни одно живое пространство. Незнакомые и защищённые папки попадают только в отчёт.
 *
 * Сервис сам ничего не удаляет: найденное ставится в очередь `file_artifact_cleanup_jobs`, а
 * исполнитель очереди вызывает шлюз монолита. Монолит перед удалением перепроверяет каждый ключ
 * (новая ссылка или свежая запись файла отменяют удаление), бакет удалённого пространства
 * чистится под предохранителем имени.
 */
import { createHash } from "node:crypto";

import { ListBucketsCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { sql, type SQL } from "drizzle-orm";

import { db } from "../../db";
import { createLogger } from "../../lib/logger";
import { minioClient } from "../../minio-client";
import type {
  CleanupMode,
  StorageOrphanCategoryStatsDto,
  StorageOrphanReportCategory,
  StorageOrphanReportDto,
} from "@shared/cleanup-policies";
import {
  resolveStoragePrefixOwnership,
  storageOrphanCategories,
  type StorageKeyReference,
  type StoragePathOwner,
  type StoragePrefixOwnership,
} from "@shared/storage-ownership";
import { workspaceBucketName, workspaceBucketPrefix } from "@shared/storage-naming";

import { computeCutoff } from "./pg-retention-task";

const logger = createLogger("janitor-storage-orphans");

/** Предел ключей в одном задании удаления — столько принимает шлюз монолита. */
export const STORAGE_ORPHAN_MAX_JOB_KEYS = 1000;
/** Сколько файлов прогон ставит на удаление; остальное доберёт следующий прогон. */
export const DEFAULT_MAX_QUEUED_OBJECTS = 200_000;
export const STORAGE_ORPHANS_REASON = "storage_orphans";

const SAMPLE_LIMIT = 5;
const ERROR_LIMIT = 20;
const DEFAULT_PROGRESS_INTERVAL_MS = 5_000;
const REFERENCE_PAGE_SIZE = 10_000;

// ── Контракт зависимостей ─────────────────────────────────────────────────────

export interface StorageObjectEntry {
  key: string;
  size: number;
  lastModified: Date;
}

export interface StorageObjectPage {
  objects: StorageObjectEntry[];
  nextToken: string | null;
}

export interface StorageBucketEntry {
  name: string;
  createdAt: Date | null;
}

export interface LiveWorkspace {
  id: string;
  storageBucket: string | null;
}

/** Множество ключей или id. Боевой загрузчик хранит хеши, чтобы большие пространства не съедали память. */
export interface MembershipSet {
  has(value: string): boolean;
}

export interface StorageOrphanJob {
  idempotencyKey: string;
  workspaceId: string;
  resourceType: string;
  resourceId: string;
  reason: string;
  payload: Record<string, unknown> & { kind: "storage_objects" | "storage_prefix" };
}

export interface StorageOrphanDeps {
  bucketPrefix: () => string;
  defaultBucketName: (workspaceId: string) => string;
  listLiveWorkspaces: () => Promise<LiveWorkspace[]>;
  listBuckets: () => Promise<StorageBucketEntry[]>;
  listObjectsPage: (bucket: string, continuationToken: string | null) => Promise<StorageObjectPage>;
  loadReferencedKeys: (reference: StorageKeyReference, workspaceId: string) => Promise<MembershipSet>;
  loadOwnerIds: (owner: StoragePathOwner, workspaceId: string) => Promise<MembershipSet>;
  enqueue: (job: StorageOrphanJob) => Promise<boolean>;
}

export interface StorageOrphanRunOptions {
  /** dry_run — только отчёт; enforce — отчёт и постановка найденного на удаление. */
  mode: CleanupMode;
  /** Срок политики: файл моложе срока сиротой не считается, даже если ссылки на него нет. */
  retentionDays: number;
  /** Ключей в одном задании удаления; больше 1000 не бывает. */
  batchSize: number;
  now?: Date;
  maxQueuedObjects?: number;
  shouldAbort?: () => boolean;
  /** Промежуточный отчёт, не чаще progressIntervalMs. */
  onProgress?: (report: StorageOrphanReportDto, matched: number) => Promise<void>;
  progressIntervalMs?: number;
}

export interface StorageOrphanRunResult {
  report: StorageOrphanReportDto;
  /** Сирот старше срока — файлы, которые подлежат удалению, включая бакеты удалённых пространств. */
  matched: number;
  queuedObjects: number;
  queuedBytes: number;
  aborted: boolean;
}

// ── Отчёт ─────────────────────────────────────────────────────────────────────

const REPORT_ORDER: readonly StorageOrphanReportCategory[] = [
  ...storageOrphanCategories,
  "deleted_workspaces",
  "unrecognized",
  "protected",
];

interface CategoryAccumulator {
  objects: number;
  bytes: number;
  maturedObjects: number;
  maturedBytes: number;
  buckets: number;
  maturedBuckets: number;
  maturedSamples: string[];
  youngSamples: string[];
}

class ReportBuilder {
  readonly progress = { bucketsTotal: 0, bucketsScanned: 0, objectsScanned: 0 };
  readonly queued = { objects: 0, bytes: 0, buckets: 0, jobs: 0 };
  limitReached = false;
  private readonly categories = new Map<StorageOrphanReportCategory, CategoryAccumulator>();
  private readonly errors: Array<{ bucket: string; message: string }> = [];

  constructor(private readonly retentionDays: number) {}

  add(
    category: StorageOrphanReportCategory,
    objects: number,
    bytes: number,
    matured: boolean,
    sample: string,
    buckets = 0,
  ): void {
    let entry = this.categories.get(category);
    if (!entry) {
      entry = {
        objects: 0,
        bytes: 0,
        maturedObjects: 0,
        maturedBytes: 0,
        buckets: 0,
        maturedBuckets: 0,
        maturedSamples: [],
        youngSamples: [],
      };
      this.categories.set(category, entry);
    }
    entry.objects += objects;
    entry.bytes += bytes;
    entry.buckets += buckets;
    const samples = matured ? entry.maturedSamples : entry.youngSamples;
    if (matured) {
      entry.maturedObjects += objects;
      entry.maturedBytes += bytes;
      entry.maturedBuckets += buckets;
    }
    if (samples.length < SAMPLE_LIMIT) {
      samples.push(sample);
    }
  }

  error(bucket: string, message: string): void {
    if (this.errors.length < ERROR_LIMIT) {
      this.errors.push({ bucket, message: message.slice(0, 300) });
    }
  }

  build(): StorageOrphanReportDto {
    const categories: StorageOrphanCategoryStatsDto[] = [];
    for (const category of REPORT_ORDER) {
      const entry = this.categories.get(category);
      if (!entry) {
        continue;
      }
      categories.push({
        category,
        objects: entry.objects,
        bytes: entry.bytes,
        maturedObjects: entry.maturedObjects,
        maturedBytes: entry.maturedBytes,
        ...(category === "deleted_workspaces" ? { buckets: entry.buckets, maturedBuckets: entry.maturedBuckets } : {}),
        samples: entry.maturedSamples.length > 0 ? [...entry.maturedSamples] : [...entry.youngSamples],
      });
    }
    return {
      kind: "storage_orphans",
      version: 1,
      retentionDays: this.retentionDays,
      progress: { ...this.progress },
      categories,
      queued: { ...this.queued },
      limitReached: this.limitReached,
      errors: [...this.errors],
    };
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Причина пропуска бакета для отчёта в админке — без технических подробностей клиента S3. */
function describeBucketError(error: unknown): string {
  const name = (error as { name?: unknown } | null)?.name;
  const message = errorMessage(error);
  if (name === "TimeoutError" || /timed out|timeout/i.test(message)) {
    return "Хранилище не ответило вовремя, бакет проверит следующий прогон";
  }
  if (name === "NoSuchBucket") {
    return "Бакет исчез во время проверки";
  }
  if (name === "AccessDenied") {
    return "Нет доступа к бакету";
  }
  return `Ошибка хранилища: ${message}`;
}

function objectsJob(bucket: string, workspaceId: string, chunk: StorageObjectEntry[], cutoff: Date): StorageOrphanJob {
  const keys = chunk.map((object) => object.key);
  const digest = createHash("md5").update(keys.join("\n")).digest("hex");
  return {
    idempotencyKey: `storage-orphans:${bucket}:${digest}`,
    workspaceId,
    resourceType: "workspace_storage",
    resourceId: workspaceId,
    reason: STORAGE_ORPHANS_REASON,
    payload: {
      kind: "storage_objects",
      bucket,
      keys,
      usageAccounting: true,
      orphanCheck: { modifiedBefore: cutoff.toISOString() },
    },
  };
}

function bucketPurgeJob(bucket: string, workspaceId: string): StorageOrphanJob {
  return {
    idempotencyKey: `storage-orphans-bucket:${bucket}`,
    workspaceId,
    resourceType: "workspace",
    resourceId: workspaceId,
    reason: STORAGE_ORPHANS_REASON,
    payload: { kind: "storage_prefix", bucket, prefix: "", removeBucket: true },
  };
}

// ── Прогон ────────────────────────────────────────────────────────────────────

export async function runStorageOrphanTask(
  deps: StorageOrphanDeps,
  options: StorageOrphanRunOptions,
): Promise<StorageOrphanRunResult> {
  const now = options.now ?? new Date();
  const cutoff = computeCutoff(now, options.retentionDays);
  const enforce = options.mode === "enforce";
  const batchSize = Math.min(STORAGE_ORPHAN_MAX_JOB_KEYS, Math.max(1, Math.floor(options.batchSize)));
  const maxQueued = options.maxQueuedObjects ?? DEFAULT_MAX_QUEUED_OBJECTS;
  const progressIntervalMs = options.progressIntervalMs ?? DEFAULT_PROGRESS_INTERVAL_MS;
  const shouldAbort = () => options.shouldAbort?.() === true;
  const report = new ReportBuilder(options.retentionDays);
  const prefix = deps.bucketPrefix();
  let matched = 0;
  let aborted = false;
  let lastProgressAt = Date.now();

  const emitProgress = async (force = false) => {
    if (!options.onProgress || (!force && Date.now() - lastProgressAt < progressIntervalMs)) {
      return;
    }
    lastProgressAt = Date.now();
    try {
      await options.onProgress(report.build(), matched);
    } catch (error) {
      logger.warn({ err: errorMessage(error) }, "[janitor-storage-orphans] progress update failed");
    }
  };

  const workspaces = await deps.listLiveWorkspaces();
  const ownersByBucket = new Map<string, string[]>();
  for (const workspace of workspaces) {
    const bucket = workspace.storageBucket?.trim() || deps.defaultBucketName(workspace.id);
    ownersByBucket.set(bucket, [...(ownersByBucket.get(bucket) ?? []), workspace.id]);
  }
  const liveNormalizedIds = workspaces
    .map((workspace) => deps.defaultBucketName(workspace.id).slice(prefix.length))
    .filter((id) => id.length > 0);

  // Чужие бакеты не трогаются: только бакеты с префиксом пространств и бакеты живых пространств.
  const buckets = (await deps.listBuckets())
    .filter((bucket) => bucket.name.startsWith(prefix) || ownersByBucket.has(bucket.name))
    .sort((left, right) => left.name.localeCompare(right.name));
  report.progress.bucketsTotal = buckets.length;

  // Ссылки грузятся лениво: только для папок, которые встретились в бакете.
  const compiledPatterns = new Map<string, RegExp>();
  const patternOf = (owner: StoragePathOwner) => {
    let pattern = compiledPatterns.get(owner.pattern);
    if (!pattern) {
      pattern = new RegExp(owner.pattern);
      compiledPatterns.set(owner.pattern, pattern);
    }
    return pattern;
  };

  async function scanWorkspaceBucket(bucket: string, workspaceId: string): Promise<boolean> {
    const references = new Map<string, MembershipSet>();
    const owners = new Map<string, MembershipSet>();
    const referenceKey = (reference: StorageKeyReference) => `${reference.table}.${reference.column}`;
    const ownerKey = (owner: StoragePathOwner) => `${owner.table}.${owner.column}`;

    const ensureLoaded = async (rule: StoragePrefixOwnership) => {
      for (const reference of rule.references) {
        if (!references.has(referenceKey(reference))) {
          references.set(referenceKey(reference), await deps.loadReferencedKeys(reference, workspaceId));
        }
      }
      for (const owner of rule.pathOwners) {
        if (!owners.has(ownerKey(owner))) {
          owners.set(ownerKey(owner), await deps.loadOwnerIds(owner, workspaceId));
        }
      }
    };

    const isOwned = (rule: StoragePrefixOwnership, key: string): boolean => {
      for (const reference of rule.references) {
        if (references.get(referenceKey(reference))?.has(key)) {
          return true;
        }
      }
      for (const owner of rule.pathOwners) {
        const id = patternOf(owner).exec(key)?.[1];
        if (id && owners.get(ownerKey(owner))?.has(id)) {
          return true;
        }
      }
      return false;
    };

    const pending: StorageObjectEntry[] = [];
    const flush = async (all: boolean) => {
      while (pending.length >= batchSize || (all && pending.length > 0)) {
        const chunk = pending.splice(0, batchSize);
        await deps.enqueue(objectsJob(bucket, workspaceId, chunk, cutoff));
        report.queued.jobs += 1;
        report.queued.objects += chunk.length;
        report.queued.bytes += chunk.reduce((sum, object) => sum + object.size, 0);
      }
    };

    let token: string | null = null;
    try {
      do {
        if (shouldAbort()) {
          return true;
        }
        const page = await deps.listObjectsPage(bucket, token);
        const rules = new Map<StorageObjectEntry, StoragePrefixOwnership | null>();
        for (const object of page.objects) {
          const rule = resolveStoragePrefixOwnership(object.key);
          rules.set(object, rule);
          if (rule?.mode === "reconcile") {
            await ensureLoaded(rule);
          }
        }
        for (const object of page.objects) {
          report.progress.objectsScanned += 1;
          const rule = rules.get(object) ?? null;
          if (!rule) {
            report.add("unrecognized", 1, object.size, false, object.key);
            continue;
          }
          if (rule.mode === "protected" || rule.category === null) {
            report.add("protected", 1, object.size, false, object.key);
            continue;
          }
          if (rule.mode === "reconcile" && isOwned(rule, object.key)) {
            continue;
          }
          const matured = object.lastModified.getTime() < cutoff.getTime();
          report.add(rule.category, 1, object.size, matured, object.key);
          if (!matured) {
            continue;
          }
          matched += 1;
          if (!enforce) {
            continue;
          }
          if (report.queued.objects + pending.length >= maxQueued) {
            report.limitReached = true;
            continue;
          }
          pending.push(object);
        }
        await flush(false);
        token = page.nextToken;
        await emitProgress();
      } while (token);
      return false;
    } finally {
      await flush(true);
    }
  }

  async function scanDeletedWorkspaceBucket(bucket: StorageBucketEntry): Promise<boolean> {
    let objects = 0;
    let bytes = 0;
    let newest = 0;
    let token: string | null = null;
    do {
      if (shouldAbort()) {
        return true;
      }
      const page = await deps.listObjectsPage(bucket.name, token);
      for (const object of page.objects) {
        objects += 1;
        bytes += object.size;
        newest = Math.max(newest, object.lastModified.getTime());
      }
      report.progress.objectsScanned += page.objects.length;
      token = page.nextToken;
      await emitProgress();
    } while (token);

    // В бакет давно ничего не писали: пустой — по дате создания, непустой — по самому свежему файлу.
    const matured =
      objects === 0
        ? bucket.createdAt !== null && bucket.createdAt.getTime() < cutoff.getTime()
        : newest < cutoff.getTime();
    report.add("deleted_workspaces", objects, bytes, matured, bucket.name, 1);
    if (!matured) {
      return false;
    }
    matched += objects;
    if (enforce) {
      await deps.enqueue(bucketPurgeJob(bucket.name, bucket.name.slice(prefix.length)));
      report.queued.jobs += 1;
      report.queued.buckets += 1;
      report.queued.objects += objects;
      report.queued.bytes += bytes;
    }
    return false;
  }

  for (const bucket of buckets) {
    if (shouldAbort()) {
      aborted = true;
      break;
    }
    const owners = ownersByBucket.get(bucket.name) ?? [];
    try {
      if (owners.length > 1) {
        report.error(bucket.name, `Бакет используют ${owners.length} пространства, проверка пропущена`);
      } else if (owners.length === 1) {
        aborted = await scanWorkspaceBucket(bucket.name, owners[0]);
      } else if (liveNormalizedIds.some((id) => bucket.name.includes(id))) {
        report.error(bucket.name, "Имя бакета содержит id живого пространства, но пространство пишет в другой бакет");
      } else {
        aborted = await scanDeletedWorkspaceBucket(bucket);
      }
    } catch (error) {
      report.error(bucket.name, describeBucketError(error));
      logger.warn(
        { event_name: "janitor.storage_orphans.bucket_failed", bucket: bucket.name, err: errorMessage(error) },
        "[janitor-storage-orphans] bucket scan failed, moving on",
      );
    }
    if (aborted) {
      break;
    }
    report.progress.bucketsScanned += 1;
    await emitProgress();
  }

  await emitProgress(true);
  const final = report.build();
  logger.info(
    {
      event_name: "janitor.storage_orphans.run",
      mode: options.mode,
      buckets: final.progress.bucketsScanned,
      objects: final.progress.objectsScanned,
      matched,
      queued_objects: final.queued.objects,
      queued_buckets: final.queued.buckets,
      limit_reached: final.limitReached,
      errors: final.errors.length,
      aborted,
    },
    "[janitor-storage-orphans] storage reconcile finished",
  );
  return {
    report: final,
    matched,
    queuedObjects: final.queued.objects,
    queuedBytes: final.queued.bytes,
    aborted,
  };
}

// ── Боевые зависимости ────────────────────────────────────────────────────────

/** 53-битный хеш строки (cyrb53). Совпадение хешей лишь оставит сироту, живой файл оно не удалит. */
function hash53(value: string): number {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

export class HashedMembershipSet implements MembershipSet {
  private readonly hashes = new Set<number>();

  add(value: string): void {
    this.hashes.add(hash53(value));
  }

  has(value: string): boolean {
    return this.hashes.has(hash53(value));
  }

  get size(): number {
    return this.hashes.size;
  }
}

function rowsOf(result: unknown): Array<Record<string, unknown>> {
  const rows = (result as { rows?: unknown } | null | undefined)?.rows;
  return Array.isArray(rows) ? (rows as Array<Record<string, unknown>>) : [];
}

function referenceScope(reference: StorageKeyReference, workspaceId: string): SQL {
  if (reference.workspaceColumn) {
    return sql`AND ref.${sql.identifier(reference.workspaceColumn)} = ${workspaceId}`;
  }
  if (reference.workspaceVia) {
    const via = reference.workspaceVia;
    return sql`AND EXISTS (
      SELECT 1 FROM ${sql.identifier(via.table)} via
      WHERE via.id = ref.${sql.identifier(via.localColumn)}
        AND via.${sql.identifier(via.workspaceColumn)} = ${workspaceId}
    )`;
  }
  return sql``;
}

/**
 * Значения колонки постранично по id: страница живёт в памяти только до хеширования, поэтому
 * пространство с миллионом картинок не держит миллион строк сразу.
 */
async function loadHashedColumn(table: string, column: string, scope: SQL): Promise<MembershipSet> {
  const values = new HashedMembershipSet();
  const valueColumn = sql.identifier(column);
  let lastId: string | null = null;
  for (;;) {
    const after: SQL = lastId === null ? sql`` : sql`AND ref.id > ${lastId}`;
    const rows = rowsOf(
      await db.execute(sql`
        SELECT ref.id::text AS id, ref.${valueColumn}::text AS value
        FROM ${sql.identifier(table)} ref
        WHERE ref.${valueColumn} IS NOT NULL
          ${scope}
          ${after}
        ORDER BY ref.id
        LIMIT ${REFERENCE_PAGE_SIZE}
      `),
    );
    for (const row of rows) {
      if (typeof row.value === "string" && row.value.length > 0) {
        values.add(row.value);
      }
    }
    if (rows.length < REFERENCE_PAGE_SIZE) {
      return values;
    }
    lastId = String(rows[rows.length - 1].id);
  }
}

export function createStorageOrphanDeps(enqueue: (job: StorageOrphanJob) => Promise<boolean>): StorageOrphanDeps {
  return {
    bucketPrefix: workspaceBucketPrefix,
    defaultBucketName: workspaceBucketName,
    listLiveWorkspaces: async () =>
      rowsOf(await db.execute(sql`SELECT id, storage_bucket FROM workspaces`)).map((row) => ({
        id: String(row.id),
        storageBucket: typeof row.storage_bucket === "string" ? row.storage_bucket : null,
      })),
    listBuckets: async () => {
      const response = await minioClient.send(new ListBucketsCommand({}));
      return (response.Buckets ?? [])
        .filter((bucket): bucket is typeof bucket & { Name: string } => typeof bucket.Name === "string")
        .map((bucket) => ({ name: bucket.Name, createdAt: bucket.CreationDate ?? null }));
    },
    listObjectsPage: async (bucket, continuationToken) => {
      const response = await minioClient.send(
        new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: continuationToken ?? undefined, MaxKeys: 1000 }),
      );
      const objects: StorageObjectEntry[] = [];
      for (const item of response.Contents ?? []) {
        if (item.Key && item.LastModified) {
          objects.push({ key: item.Key, size: item.Size ?? 0, lastModified: item.LastModified });
        }
      }
      return { objects, nextToken: response.IsTruncated ? (response.NextContinuationToken ?? null) : null };
    },
    loadReferencedKeys: (reference, workspaceId) =>
      loadHashedColumn(reference.table, reference.column, referenceScope(reference, workspaceId)),
    loadOwnerIds: (owner, workspaceId) =>
      loadHashedColumn(
        owner.table,
        owner.column,
        owner.workspaceColumn ? sql`AND ref.${sql.identifier(owner.workspaceColumn)} = ${workspaceId}` : sql``,
      ),
    enqueue,
  };
}
