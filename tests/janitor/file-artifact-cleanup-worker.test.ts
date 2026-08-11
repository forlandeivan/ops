import { afterEach, describe, expect, it, vi } from "vitest";

import {
  processFileArtifactCleanupJob,
} from "../../server/janitor/file-artifact-cleanup-worker";
import { JanitorDomainGatewayError, type JanitorDomainGateway } from "../../server/janitor/domain-gateway-client";
import type {
  FileArtifactCleanupJobRecord,
  FileArtifactCleanupJobStore,
} from "../../server/janitor/file-artifact-cleanup-job-store";

function job(overrides: Partial<FileArtifactCleanupJobRecord> = {}): FileArtifactCleanupJobRecord {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    idempotencyKey: "manual:att-1",
    workspaceId: "ws-1",
    resourceType: "chat_attachment",
    resourceId: "att-1",
    reason: "manual_chat_delete",
    payloadVersion: 1,
    payload: { attachmentId: "att-1", fileId: "file-1", storageKey: "chat/a.mp3", externalUri: "asr/a.mp3" },
    status: "processing",
    attempts: 0,
    workerId: "worker-1",
    leaseExpiresAt: new Date("2026-08-11T00:01:00Z"),
    nextRetryAt: null,
    lastError: null,
    ...overrides,
  };
}

function store(activeAsr = false): FileArtifactCleanupJobStore {
  return {
    claim: vi.fn(),
    heartbeat: vi.fn(async () => true),
    hasActiveAsr: vi.fn(async () => activeAsr),
    deferForActiveAsr: vi.fn(async () => true),
    release: vi.fn(async () => true),
    complete: vi.fn(async () => true),
    fail: vi.fn(async () => true),
    enqueue: vi.fn(async () => true),
    stats: vi.fn(async () => ({ pending: 0, processing: 0, error: 0, dead: 0, oldestReadyAgeSeconds: 0 })),
  };
}

function gateway(cleanup = vi.fn(async () => {})): JanitorDomainGateway {
  return {
    cleanupFileArtifacts: cleanup,
    purgeChatAttachmentArtifacts: vi.fn(),
    deleteWorkspaceFile: vi.fn(),
    reconcileQdrantUsage: vi.fn(),
  };
}

const common = {
  workerId: "worker-1",
  leaseMs: 60_000,
  activeAsrRetryMs: 30_000,
  baseBackoffMs: 1_000,
  maxBackoffMs: 60_000,
  maxAttempts: 3,
  random: () => 0.5,
  now: () => new Date("2026-08-11T00:00:00Z"),
};

afterEach(() => {
  vi.useRealTimers();
});

describe("file artifact cleanup worker", () => {
  it("завершает job только после успешного versioned gateway", async () => {
    const fakeStore = store();
    const cleanup = vi.fn(async () => {});
    const outcome = await processFileArtifactCleanupJob({
      ...common,
      job: job(),
      store: fakeStore,
      gateway: gateway(cleanup),
    });

    expect(outcome).toBe("success");
    expect(cleanup).toHaveBeenCalledWith(expect.objectContaining({
      version: 1,
      jobId: "00000000-0000-0000-0000-000000000001",
      artifact: expect.objectContaining({ externalUri: "asr/a.mp3" }),
    }), undefined);
    expect(fakeStore.complete).toHaveBeenCalledWith(job().id, "worker-1");
  });

  it("продлевает lease heartbeat-ом во время долгого gateway-вызова", async () => {
    vi.useFakeTimers();
    const fakeStore = store();
    let resolveCleanup!: () => void;
    const cleanup = vi.fn(() => new Promise<void>((resolve) => { resolveCleanup = resolve; }));
    const processing = processFileArtifactCleanupJob({
      ...common,
      job: job(),
      store: fakeStore,
      gateway: gateway(cleanup),
    });

    await vi.advanceTimersByTimeAsync(20_000);
    expect(fakeStore.heartbeat).toHaveBeenCalledWith(job().id, "worker-1", 60_000);

    resolveCleanup();
    await expect(processing).resolves.toBe("success");
  });

  it("активная ASR откладывает job без увеличения attempts и без gateway", async () => {
    const fakeStore = store(true);
    const cleanup = vi.fn(async () => {});
    const outcome = await processFileArtifactCleanupJob({
      ...common,
      job: job({ attempts: 2 }),
      store: fakeStore,
      gateway: gateway(cleanup),
    });

    expect(outcome).toBe("deferred_active_asr");
    expect(cleanup).not.toHaveBeenCalled();
    expect(fakeStore.fail).not.toHaveBeenCalled();
    expect(fakeStore.deferForActiveAsr).toHaveBeenCalledWith(
      job().id,
      "worker-1",
      new Date("2026-08-11T00:00:30Z"),
    );
  });

  it("409 active-ASR от монолита также откладывает job без attempts", async () => {
    const fakeStore = store(false);
    const cleanup = vi.fn(async () => {
      throw new JanitorDomainGatewayError(
        "ASR is active",
        409,
        "FILE_ARTIFACT_CLEANUP_ACTIVE_ASR",
        true,
      );
    });
    const outcome = await processFileArtifactCleanupJob({
      ...common,
      job: job({ attempts: 1 }),
      store: fakeStore,
      gateway: gateway(cleanup),
    });

    expect(outcome).toBe("deferred_active_asr");
    expect(fakeStore.fail).not.toHaveBeenCalled();
  });

  it("временный сбой получает exponential backoff и увеличивает attempts", async () => {
    const fakeStore = store();
    const cleanup = vi.fn(async () => {
      throw new JanitorDomainGatewayError("unavailable", 503, "GATEWAY_UNAVAILABLE", true);
    });
    const outcome = await processFileArtifactCleanupJob({
      ...common,
      job: job({ attempts: 1 }),
      store: fakeStore,
      gateway: gateway(cleanup),
    });

    expect(outcome).toBe("retry");
    expect(fakeStore.fail).toHaveBeenCalledWith(job().id, "worker-1", {
      attempts: 2,
      nextRetryAt: new Date("2026-08-11T00:00:02Z"),
      error: "JanitorDomainGatewayError: unavailable",
    });
  });

  it("неповторяемая ошибка переводит job в terminal error", async () => {
    const fakeStore = store();
    const cleanup = vi.fn(async () => {
      throw new JanitorDomainGatewayError("bad snapshot", 400, "BAD_REQUEST", false);
    });
    const outcome = await processFileArtifactCleanupJob({
      ...common,
      job: job(),
      store: fakeStore,
      gateway: gateway(cleanup),
    });

    expect(outcome).toBe("dead");
    expect(fakeStore.fail).toHaveBeenCalledWith(job().id, "worker-1", expect.objectContaining({
      attempts: 1,
      nextRetryAt: null,
    }));
  });
});
