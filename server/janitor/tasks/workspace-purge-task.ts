import type { WorkspacePurgeRequest, WorkspacePurgeResult } from "../domain-gateway-client";

export interface WorkspacePurgeStore {
  purge(request: WorkspacePurgeRequest): Promise<WorkspacePurgeResult>;
}

/**
 * Политика «Пространства, поставленные на удаление». Список таблиц пространства и порядок их очистки
 * знает монолит (читает из каталога базы); этот исполнитель только повторяет ограниченный по времени
 * шаг, пока остаются пространства к удалению. Срок восстановления монолит берёт из даты, обещанной
 * владельцу при постановке на удаление, поэтому `retentionDays` сюда не передаётся.
 */
export async function runWorkspacePurgeTask(
  config: { mode: "dry_run" | "enforce"; batchSize: number },
  store: WorkspacePurgeStore | undefined,
  options: { maxBatchesPerRun: number; shouldAbort?: () => boolean; onProgress?: (purgedWorkspaces: number) => void },
) {
  if (!store) throw new Error("No workspace purge executor configured");
  if (!Number.isInteger(config.batchSize) || config.batchSize < 1 || options.maxBatchesPerRun < 1) throw new Error("Invalid workspace purge policy");
  const request = { limit: Math.min(config.batchSize, 100_000), dryRun: config.mode === "dry_run" };
  let purged = 0;
  let remaining = 0;
  for (let batch = 0; batch < options.maxBatchesPerRun; batch++) {
    if (options.shouldAbort?.()) return { matched: purged + remaining, deleted: purged, aborted: true, reason: "shutdown" };
    const result = await store.purge(request);
    if (!Number.isSafeInteger(result.purgedRows) || !Number.isSafeInteger(result.purgedWorkspaces) || !Number.isSafeInteger(result.remaining)
      || result.purgedRows < 0 || result.purgedWorkspaces < 0 || result.remaining < 0
      || (request.dryRun && (result.purgedRows !== 0 || result.purgedWorkspaces !== 0))) throw new Error("Invalid workspace purge result");
    // Dry-run ничего не удаляет: remaining — сколько пространств ждёт очистки.
    if (request.dryRun) return { matched: result.remaining, deleted: 0, aborted: false, reason: null };
    purged += result.purgedWorkspaces;
    remaining = result.remaining;
    if (result.purgedWorkspaces > 0) options.onProgress?.(result.purgedWorkspaces);
    if (result.remaining === 0) return { matched: purged, deleted: purged, aborted: false, reason: null };
    // Пространства остались, а шаг не удалил ни строки: очистка застряла, повторять бессмысленно.
    if (result.purgedRows === 0 && result.purgedWorkspaces === 0) throw new Error("Workspace purge made no progress");
  }
  return { matched: purged + remaining, deleted: purged, aborted: true, reason: "batch_limit" };
}
