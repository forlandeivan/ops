import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CleanupPolicyDto } from "@shared/cleanup-policies";
import { getJanitorTask } from "../../server/janitor/janitor-task-registry";

/**
 * Диспетчеризация реконсиляции по содержимому хранилища (`storage: "s3_reconcile"`).
 *
 * У каждой такой политики свой стор и свой критерий сиротства, общего движка нет — адрес
 * исполнителя один, ключ политики. Реестр при этом опережает сервис: метаданные политик
 * ingest/, canonical/ и старых импортов (E13/E22) в монолите есть, исполнителей в ops ещё нет.
 * Раньше ветка `s3_reconcile` уводила ЛЮБУЮ такую политику в уборку скриншотов отзывов —
 * администратор, включивший «Осиротевшие объекты приёма», удалил бы вложения отзывов под
 * чужим ключом. Тест держит контракт: нет исполнителя — прогон падает и не трогает ничего.
 */
const { recordRunMock } = vi.hoisted(() => ({
  recordRunMock: vi.fn(async (_entry: Record<string, unknown>) => undefined),
}));
vi.mock("../../server/janitor/janitor-policy-service", () => ({
  listResolvedPolicies: vi.fn(async () => []),
  recordRun: recordRunMock,
}));
vi.mock("../../server/lib/redis-lock", () => ({
  tryAcquireLock: vi.fn(async (key: string) => ({ key, token: "test" })),
  releaseLock: vi.fn(async () => undefined),
}));

import { runPolicy, type JanitorStores } from "../../server/janitor/janitor-orchestrator";

function makePolicy(resourceKey: string): CleanupPolicyDto {
  const task = getJanitorTask(resourceKey);
  if (!task) {
    throw new Error(`тест ссылается на несуществующую политику ${resourceKey}`);
  }
  return {
    resourceKey: task.key,
    label: task.label,
    description: task.description,
    category: task.category,
    action: task.action,
    enabled: true,
    retentionDays: task.defaultRetentionDays,
    batchSize: task.defaultBatchSize,
    sensitive: task.sensitive,
    table: task.table,
    strippedColumns: task.strippedColumns,
    cascadeNote: task.cascadeNote,
    lastRun: null,
  };
}

function makeStores(): { stores: JanitorStores; sweep: ReturnType<typeof vi.fn> } {
  const sweep = vi.fn(async () => ({ deleted: 2, freedBytes: 512 }));
  const unusedS3 = {
    countMatches: vi.fn(async () => 0),
    purgeBatch: vi.fn(async () => ({ deleted: 0, freedBytes: 0 })),
  };
  return {
    sweep,
    stores: {
      pg: {
        countMatches: vi.fn(async () => 0),
        deleteBatch: vi.fn(async () => 0),
        stripBatch: vi.fn(async () => 0),
      },
      s3: { chat_attachments: unusedS3, chat_feedback_attachments: unusedS3 },
      qdrant: {
        listDeletable: vi.fn(async () => []),
        deleteCollection: vi.fn(async () => false),
        reconcileUsage: vi.fn(async () => undefined),
      },
      feedbackAttachmentOrphans: {
        countOrphans: vi.fn(async () => 0),
        sweep,
      },
    },
  };
}

beforeEach(() => {
  recordRunMock.mockClear();
});

describe("janitor: диспетчеризация s3_reconcile", () => {
  it("политика без исполнителя падает и ничего не удаляет", async () => {
    const { stores, sweep } = makeStores();

    const outcome = await runPolicy(makePolicy("s3.ingest.orphans"), stores);

    expect(outcome.status).toBe("failed");
    expect(outcome.deleted).toBe(0);
    expect(sweep).not.toHaveBeenCalled();
    expect(recordRunMock.mock.calls[0][0]).toMatchObject({
      resourceKey: "s3.ingest.orphans",
      status: "failed",
      deletedCount: 0,
    });
    expect(String(recordRunMock.mock.calls[0][0].errorMessage)).toContain(
      "no storage reconcile executor",
    );
  });

  it("все реконсиляции без исполнителя ведут себя одинаково", async () => {
    for (const key of ["s3.canonical.orphans", "s3.legacy_imports.orphans"]) {
      const { stores, sweep } = makeStores();
      const outcome = await runPolicy(makePolicy(key), stores);
      expect(outcome.status).toBe("failed");
      expect(sweep).not.toHaveBeenCalled();
    }
  });

  it("политика с исполнителем работает как прежде", async () => {
    const { stores, sweep } = makeStores();

    const outcome = await runPolicy(makePolicy("s3.chat_feedback_attachments.orphans"), stores);

    expect(outcome.status).toBe("success");
    expect(outcome.deleted).toBe(2);
    expect(outcome.freedBytes).toBe(512);
    expect(sweep).toHaveBeenCalledTimes(1);
  });
});
