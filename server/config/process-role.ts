const appProcessRoles = ["api", "janitor", "worker"] as const;

export type AppProcessRole = (typeof appProcessRoles)[number];

const WORKER_ROLE_PREFIX = "worker:";

function normalizeRole(value: string | undefined): AppProcessRole {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "janitor") {
    return "janitor";
  }
  // W0/A2: воркер-роль — либо APP_ROLE=worker (+ WORKER_ROLES=csv), либо
  // shorthand APP_ROLE=worker:<csv> (например worker:asr,agent).
  if (normalized === "worker" || normalized?.startsWith(WORKER_ROLE_PREFIX)) {
    return "worker";
  }
  return "api";
}

export function getAppProcessRole(): AppProcessRole {
  return normalizeRole(process.env.APP_ROLE ?? process.env.APP_PROCESS_ROLE);
}

export function isApiProcessRole(): boolean {
  return getAppProcessRole() === "api";
}

export function isJanitorProcessRole(): boolean {
  return getAppProcessRole() === "janitor";
}

export function isWorkerProcessRole(): boolean {
  return getAppProcessRole() === "worker";
}

/**
 * Сырые токены групп воркеров для worker-процесса (W0/A2). Источник — либо
 * colon-суффикс `APP_ROLE=worker:<csv>`, либо переменная `WORKER_ROLES=<csv>`
 * (для on-prem-композита нескольких групп в одном контейнере). Семантику токенов
 * (валидность групп, `*` = все) интерпретирует worker-registry — здесь только парсинг,
 * чтобы config-модуль не зависел от каталога воркеров.
 *
 * Возвращает нормализованный (trim/lowercase, без пустых) список; `[]` = группы не
 * заданы (registry трактует как «все» для композитного worker-процесса).
 */
export function getConfiguredWorkerRoleTokens(): string[] {
  const rawRole = (process.env.APP_ROLE ?? process.env.APP_PROCESS_ROLE ?? "").trim().toLowerCase();
  const spec = rawRole.startsWith(WORKER_ROLE_PREFIX)
    ? rawRole.slice(WORKER_ROLE_PREFIX.length)
    : (process.env.WORKER_ROLES ?? "").trim().toLowerCase();

  const seen = new Set<string>();
  const tokens: string[] = [];
  for (const part of spec.split(",")) {
    const token = part.trim();
    if (token && !seen.has(token)) {
      seen.add(token);
      tokens.push(token);
    }
  }
  return tokens;
}
