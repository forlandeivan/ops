/**
 * Доля общего пула мест, которую одно рабочее пространство может занять, пока ждут другие.
 *
 * Общее правило очередей платформы (первая — индексация баз знаний, 19.11.2026): пространство с
 * массовой загрузкой не забирает все места, но если никто больше не ждёт, добирает свободные —
 * пул не простаивает. Значение задаётся в процентах, чтобы оставаться верным при смене размера пула.
 */
export const WORKSPACE_SHARE_PERCENT_OPTIONS = [25, 50, 75] as const;
export type WorkspaceSharePercent = (typeof WORKSPACE_SHARE_PERCENT_OPTIONS)[number];
export const DEFAULT_WORKSPACE_SHARE_PERCENT: WorkspaceSharePercent = 50;

/** Сколько мест пула занимает доля: округление вверх, минимум одно место. */
export function fairShareSlots(poolSize: number, sharePercent: number): number {
  const pool = Number.isFinite(poolSize) ? Math.max(1, Math.floor(poolSize)) : 1;
  const percent = Number.isFinite(sharePercent) ? Math.min(100, Math.max(1, sharePercent)) : DEFAULT_WORKSPACE_SHARE_PERCENT;
  return Math.max(1, Math.ceil((pool * percent) / 100));
}

/** Ближайшее допустимое значение доли (для перевода старого абсолютного потолка и неожиданных входов). */
export function nearestWorkspaceSharePercent(percent: number): WorkspaceSharePercent {
  if (!Number.isFinite(percent)) {
    return DEFAULT_WORKSPACE_SHARE_PERCENT;
  }
  let best: WorkspaceSharePercent = WORKSPACE_SHARE_PERCENT_OPTIONS[0];
  for (const option of WORKSPACE_SHARE_PERCENT_OPTIONS) {
    if (Math.abs(option - percent) < Math.abs(best - percent)) {
      best = option;
    }
  }
  return best;
}
