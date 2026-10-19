/**
 * Политика «Рабочие папки сессий агента» (agent.session_folders, SEC-08.2).
 *
 * Папки сессий лежат на томе, подключённом только к сервису агента, поэтому удаляет их сервис агента. Janitor
 * вызывает его через монолит (callback-gateway): `POST /agent-session-folders/purge` пачками, пока сервис не скажет,
 * что просроченных папок не осталось. Строки сессий и ленту эта политика не трогает — их удаляет «Лента сессий
 * агента» (pg.agent_sessions).
 */

export interface AgentSessionFoldersStore {
  purge(request: {
    olderThanDays: number;
    limit: number;
    dryRun: boolean;
  }): Promise<{ purged: number; remaining: number }>;
}

export interface AgentSessionFoldersRunOptions {
  mode: "dry_run" | "enforce";
  retentionDays: number;
  batchSize: number;
}

export interface AgentSessionFoldersRunContext {
  maxBatchesPerRun: number;
  shouldAbort?: () => boolean;
}

export interface AgentSessionFoldersRunResult {
  matched: number;
  deleted: number;
  aborted: boolean;
}

export async function runAgentSessionFoldersTask(
  options: AgentSessionFoldersRunOptions,
  store: AgentSessionFoldersStore,
  context: AgentSessionFoldersRunContext,
): Promise<AgentSessionFoldersRunResult> {
  const request = { olderThanDays: options.retentionDays, limit: options.batchSize };
  if (options.mode === "dry_run") {
    const preview = await store.purge({ ...request, dryRun: true });
    return { matched: preview.remaining, deleted: 0, aborted: false };
  }
  let deleted = 0;
  let remaining = 0;
  for (let batch = 0; batch < context.maxBatchesPerRun; batch += 1) {
    if (context.shouldAbort?.()) {
      return { matched: deleted + remaining, deleted, aborted: true };
    }
    const result = await store.purge({ ...request, dryRun: false });
    deleted += result.purged;
    remaining = result.remaining;
    // Сервис ничего не удалил (ошибки диска он пропускает и пишет в лог) — повтор в этом прогоне не поможет.
    if (remaining === 0 || result.purged === 0) {
      break;
    }
  }
  return { matched: deleted + remaining, deleted, aborted: false };
}
