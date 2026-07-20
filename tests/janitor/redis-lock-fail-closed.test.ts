import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Режимы лока при недоступном Redis (REDIS_URL не задан):
 * дефолт — fail-open (no-op-лок, прежнее поведение остальных потребителей),
 * failClosed — лок считается НЕ взятым (janitor-профиль).
 * resetModules нужен: модуль кэширует клиент по первому обращению.
 */
describe("redis-lock: поведение без Redis", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function importFreshLock() {
    vi.resetModules();
    vi.stubEnv("REDIS_URL", "");
    return import("../../server/lib/redis-lock");
  }

  it("по умолчанию fail-open: лок считается взятым", async () => {
    const { tryAcquireLock } = await importFreshLock();
    const lock = await tryAcquireLock("janitor:test", 1000);
    expect(lock).not.toBeNull();
    expect(lock?.key).toBe("janitor:test");
  });

  it("failClosed: лок НЕ взят, вызывающий должен скипнуть прогон", async () => {
    const { tryAcquireLock } = await importFreshLock();
    const lock = await tryAcquireLock("janitor:test", 1000, { failClosed: true });
    expect(lock).toBeNull();
  });

  it("releaseLock без Redis — no-op без ошибок", async () => {
    const { tryAcquireLock, releaseLock } = await importFreshLock();
    const lock = await tryAcquireLock("janitor:test", 1000);
    await expect(releaseLock(lock!)).resolves.toBeUndefined();
  });
});
