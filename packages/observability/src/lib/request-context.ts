import { AsyncLocalStorage } from 'node:async_hooks';
import type { Request } from 'express';

export type RequestLogContext = {
  request_id: string | null;
  trace_id: string | null;
  user_id: string | null;
  workspace_id: string | null;
  method: string | null;
  path: string | null;
  route: string | null;
  app_role: string | null;
};

const requestContextStorage = new AsyncLocalStorage<RequestLogContext>();

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function resolveWorkspaceId(req: Request): string | null {
  const headerValue = req.headers['x-workspace-id'];
  const headerWorkspaceId =
    typeof headerValue === 'string'
      ? normalizeOptionalString(headerValue)
      : Array.isArray(headerValue)
        ? normalizeOptionalString(headerValue[0])
        : null;

  return (
    normalizeOptionalString(req.workspaceId) ??
    normalizeOptionalString(req.workspaceContext?.workspaceId) ??
    headerWorkspaceId
  );
}

function resolveUserId(req: Request): string | null {
  const candidate = req.user;
  if (!candidate || typeof candidate !== 'object') {
    return null;
  }

  const userId = 'id' in candidate ? (candidate as { id?: unknown }).id : null;
  return normalizeOptionalString(userId);
}

function resolveRoute(req: Request): string | null {
  const routePath =
    req.route && typeof req.route === 'object' && 'path' in req.route
      ? req.route.path
      : null;

  if (typeof routePath === 'string') {
    const baseUrl = normalizeOptionalString(req.baseUrl);
    return normalizeOptionalString(baseUrl ? `${baseUrl}${routePath}` : routePath);
  }

  return null;
}

export function buildRequestLogContext(req: Request): RequestLogContext {
  return {
    request_id: normalizeOptionalString(req.id) ?? normalizeOptionalString(req.get('x-request-id')),
    trace_id: normalizeOptionalString(req.traceId) ?? normalizeOptionalString(req.get('x-trace-id')),
    user_id: resolveUserId(req),
    workspace_id: resolveWorkspaceId(req),
    method: normalizeOptionalString(req.method),
    path: normalizeOptionalString(req.originalUrl || req.url),
    route: resolveRoute(req),
    app_role: normalizeOptionalString(process.env.APP_ROLE ?? 'api'),
  };
}

export function runWithRequestContext<T>(
  context: RequestLogContext,
  callback: () => T,
): T {
  return requestContextStorage.run({ ...context }, callback);
}

export function getRequestContext(): RequestLogContext | null {
  const store = requestContextStorage.getStore();
  return store ? { ...store } : null;
}

export function mergeRequestContext(
  patch: Partial<RequestLogContext>,
): RequestLogContext | null {
  const store = requestContextStorage.getStore();
  if (!store) {
    return null;
  }

  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) {
      (store as Record<string, unknown>)[key] = value;
    }
  }

  return { ...store };
}

export function syncRequestContextFromRequest(req: Request): RequestLogContext | null {
  return mergeRequestContext(buildRequestLogContext(req));
}
