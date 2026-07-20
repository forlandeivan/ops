/**
 * Composition-root боевых сторов janitor — ОPS-вариант (после выноса, J2.3c).
 *
 * Отличие от монорепного предка: доменных импортов НЕТ вовсе. Операции, владелец
 * которых монолит (удаление вложения чата с производными, удаление workspace-файла
 * с метерингом, reconcile Qdrant-usage), исполняются ТОЛЬКО через callback-gateway
 * `/api/internal/janitor` — см. docs/gateway-contract.md §3.1. Всё остальное
 * (PG-retention, скан S3-сирот, скан/удаление коллекций Qdrant, ledger) janitor
 * делает сам по общим БД/MinIO/Qdrant.
 */
import { eq } from "drizzle-orm";
import { ListObjectsV2Command } from "@aws-sdk/client-s3";

import { db } from "../db";
import { cacheKeys, getCache } from "../cache";
import { createLogger } from "../lib/logger";
import { minioClient } from "../minio-client";
import { getQdrantClient, QdrantConfigurationError } from "../qdrant";
import {
  buildAssistantFileCollectionName,
  computeOrphans,
  isManagedCollectionName,
} from "../qdrant-collection-names";
import {
  chatAttachments,
  embeddingProviders,
  workspaces,
  workspaceVectorCollections,
} from "@shared/schema";
import { workspaceBucketName } from "@shared/storage-naming";

import {
  createHttpJanitorDomainGateway,
  gatewayToken,
  gatewayUrl,
  type JanitorDomainGateway,
} from "./domain-gateway-client";
import { createPgRetentionStore, type RetentionStore } from "./tasks/pg-retention-task";
import {
  createChatAttachmentS3Store,
  createChatFeedbackAttachmentS3Store,
  type S3RetentionStore,
} from "./tasks/s3-retention-task";
import {
  createQdrantOrphanStore,
  listLedgerMaturedOrphans,
  recordCandidates,
  removeLedgerRow,
  type QdrantOrphanStore,
} from "./tasks/qdrant-orphan-gc-task";
import {
  createFeedbackAttachmentOrphanStore,
  FEEDBACK_ATTACHMENT_PREFIX,
  findKnownKeysInDb,
  type FeedbackAttachmentOrphanStore,
} from "./tasks/s3-feedback-attachment-orphan-task";

const logger = createLogger("janitor-default-stores");

export interface JanitorStores {
  pg: RetentionStore;
  s3: Record<string, S3RetentionStore>;
  qdrant: QdrantOrphanStore;
  feedbackAttachmentOrphans: FeedbackAttachmentOrphanStore;
}

/**
 * Gateway обязателен: без него доменные операции исполнить нечем (владелец — монолит).
 * Fail-fast на старте сторов лучше, чем падение посреди enforce-прогона.
 */
function requireDomainGateway(): JanitorDomainGateway {
  const url = gatewayUrl();
  if (!url) {
    throw new Error(
      "UNICA_JANITOR_GATEWAY_URL is required: доменные операции уборки исполняет монолит-владелец (/api/internal/janitor)",
    );
  }
  if (!gatewayToken()) {
    throw new Error(
      "UNICA_JANITOR_GATEWAY_TOKEN (или UNICA_JANITOR_RUNTIME_TOKEN) is required для вызова callback-gateway",
    );
  }
  return createHttpJanitorDomainGateway(url);
}

/** Обнуление адресов вложения после удаления объектов (своя таблица-владелец чата — читаем/пишем по общей БД). */
async function markChatAttachmentCleaned(attachmentId: string): Promise<void> {
  await db
    .update(chatAttachments)
    .set({ storageKey: "", previewObjectKey: null, derivedManifestObjectKey: null })
    .where(eq(chatAttachments.id, attachmentId));
}

/** Снятие регистрации коллекции + инвалидация кэша резолва «коллекция → workspace». */
async function removeCollectionRegistry(collectionName: string): Promise<void> {
  await db
    .delete(workspaceVectorCollections)
    .where(eq(workspaceVectorCollections.collectionName, collectionName));
  try {
    await getCache().del(cacheKeys.collectionWorkspace(collectionName));
  } catch {
    // Кэш — best-effort: протухшая запись доживёт до TTL, уборке не мешает.
  }
}

/** Имена всех коллекций в Qdrant. [] если Qdrant не настроен. */
async function listAllQdrantCollections(): Promise<string[]> {
  let client: ReturnType<typeof getQdrantClient>;
  try {
    client = getQdrantClient();
  } catch (error) {
    if (error instanceof QdrantConfigurationError) {
      logger.warn(
        { event_name: "janitor.qdrant_gc.scan", outcome: "partial" },
        "[janitor-default-stores] Qdrant не настроен, пропускаем скан коллекций",
      );
      return [];
    }
    throw error;
  }

  const response = (await client.getCollections()) as { collections?: Array<{ name?: unknown }> };
  const collections = Array.isArray(response?.collections) ? response.collections : [];
  return collections
    .map((entry) => (typeof entry?.name === "string" ? entry.name.trim() : ""))
    .filter((name) => name.length > 0);
}

/**
 * Ожидаемый (владеемый) набор имён коллекций: реестр `workspace_vector_collections`
 * ∪ qdrantConfig.collectionName провайдеров (кроме 'auto') ∪ синтез assistant-file имён
 * (их нет в реестре; без синтеза живые коллекции сочли бы сиротами).
 */
async function listExpectedCollectionNames(): Promise<Set<string>> {
  const expected = new Set<string>();

  const registryRows = await db
    .select({ collectionName: workspaceVectorCollections.collectionName })
    .from(workspaceVectorCollections);
  for (const row of registryRows) {
    const normalized = row.collectionName?.trim();
    if (normalized) {
      expected.add(normalized);
    }
  }

  const providerRows = await db
    .select({
      id: embeddingProviders.id,
      workspaceId: embeddingProviders.workspaceId,
      qdrantConfig: embeddingProviders.qdrantConfig,
    })
    .from(embeddingProviders);
  for (const { id, workspaceId, qdrantConfig } of providerRows) {
    const candidate =
      qdrantConfig && typeof qdrantConfig === "object"
        ? (qdrantConfig as Record<string, unknown>).collectionName
        : undefined;
    if (typeof candidate === "string") {
      const normalized = candidate.trim();
      if (normalized.length > 0 && normalized.toLowerCase() !== "auto") {
        expected.add(normalized);
      }
    }
    if (id && workspaceId) {
      expected.add(buildAssistantFileCollectionName(workspaceId, id));
    }
  }

  return expected;
}

/** Текущие сироты: управляемые коллекции Qdrant, которых нет в ожидаемом наборе. */
async function computeCurrentOrphans(): Promise<string[]> {
  const existing = await listAllQdrantCollections();
  if (!existing.some(isManagedCollectionName)) {
    return [];
  }
  const expected = await listExpectedCollectionNames();
  return computeOrphans(existing, expected);
}

/** Полный список S3-объектов с префиксом фидбек-вложений (пагинация по токену). */
async function listFeedbackS3Objects(
  bucket: string,
): Promise<Array<{ key: string; lastModified: Date; size: number }>> {
  const objects: Array<{ key: string; lastModified: Date; size: number }> = [];
  let token: string | undefined;
  do {
    const response = await minioClient.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: FEEDBACK_ATTACHMENT_PREFIX,
        ContinuationToken: token,
      }),
    );
    for (const item of response.Contents ?? []) {
      if (item.Key && item.LastModified) {
        objects.push({ key: item.Key, lastModified: item.LastModified, size: item.Size ?? 0 });
      }
    }
    token = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (token);
  return objects;
}

export function defaultStores(): JanitorStores {
  const gateway = requireDomainGateway();
  return {
    pg: createPgRetentionStore(),
    s3: {
      chat_attachments: createChatAttachmentS3Store(undefined, {
        deleteArtifacts: (workspaceId, attachment) =>
          gateway.purgeChatAttachmentArtifacts(workspaceId, attachment),
        markCleaned: markChatAttachmentCleaned,
      }),
      chat_feedback_attachments: createChatFeedbackAttachmentS3Store(undefined, {
        deleteObject: (workspaceId, storageKey) => gateway.deleteWorkspaceFile(workspaceId, storageKey),
      }),
    },
    qdrant: createQdrantOrphanStore({
      computeCurrentOrphans,
      recordCandidates,
      listMaturedOrphans: listLedgerMaturedOrphans,
      deleteQdrantCollection: async (name) => {
        const client = getQdrantClient();
        await client.deleteCollection(name);
      },
      removeRegistry: removeCollectionRegistry,
      removeLedgerRow,
      reconcileUsage: () => gateway.reconcileQdrantUsage(),
    }),
    feedbackAttachmentOrphans: createFeedbackAttachmentOrphanStore({
      listWorkspaces: () =>
        db.select({ id: workspaces.id, storageBucket: workspaces.storageBucket }).from(workspaces),
      listS3Objects: listFeedbackS3Objects,
      findKnownKeys: findKnownKeysInDb,
      deleteObject: (workspaceId, storageKey) => gateway.deleteWorkspaceFile(workspaceId, storageKey),
      defaultBucketName: workspaceBucketName,
    }),
  };
}
