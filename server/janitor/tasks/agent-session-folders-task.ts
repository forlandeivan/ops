import type { AgentSessionFoldersRequest, AgentSessionFoldersResult } from "../domain-gateway-client";

export interface AgentSessionFoldersStore {
  purge(request: AgentSessionFoldersRequest): Promise<AgentSessionFoldersResult>;
}

/** Files belong to the agent service; this executor never reads/deletes session rows. */
export async function runAgentSessionFoldersTask(
  config: { mode: "dry_run" | "enforce"; retentionDays: number; batchSize: number },
  store: AgentSessionFoldersStore | undefined,
  options: { maxBatchesPerRun: number; shouldAbort?: () => boolean; onProgress?: (purged: number) => void },
) {
  if (!store) throw new Error("No agent session folders executor configured");
  if (!Number.isInteger(config.retentionDays) || config.retentionDays < 1 || config.retentionDays > 3650
    || !Number.isInteger(config.batchSize) || config.batchSize < 1 || options.maxBatchesPerRun < 1) throw new Error("Invalid agent session folders policy");
  const request = { olderThanDays: config.retentionDays, limit: Math.min(config.batchSize, 5000), dryRun: config.mode === "dry_run" };
  let purged = 0;
  for (let batch = 0; batch < options.maxBatchesPerRun; batch++) {
    if (options.shouldAbort?.()) return { matched: purged, deleted: purged, aborted: true, reason: "shutdown" };
    const result = await store.purge(request);
    if (!Number.isSafeInteger(result.purged) || !Number.isSafeInteger(result.remaining) || result.purged < 0
      || result.purged > request.limit || result.remaining < 0 || (request.dryRun && result.purged !== 0)) throw new Error("Invalid agent session folders result");
    // Dry-run purges nothing: remaining is the full number of eligible folders, not a page.
    if (request.dryRun) return { matched: result.remaining, deleted: 0, aborted: false, reason: null };
    purged += result.purged;
    options.onProgress?.(result.purged);
    if (result.remaining === 0) return { matched: purged, deleted: purged, aborted: false, reason: null };
    if (result.purged === 0) throw new Error("Agent session folders purge made no progress");
  }
  return { matched: purged, deleted: purged, aborted: true, reason: "batch_limit" };
}
