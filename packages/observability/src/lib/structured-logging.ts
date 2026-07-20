import { getRequestContext } from "./request-context";

export type StructuredErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "RESOURCE_NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "DEPENDENCY_TIMEOUT"
  | "DEPENDENCY_UNAVAILABLE"
  | "DB_TIMEOUT"
  | "DB_CONSTRAINT_VIOLATION"
  | "INTERNAL_ERROR";

export type FailureOutcome = "failure" | "partial";

export type StructuredLogIdentity = {
  trace_id?: string | null;
  request_id?: string | null;
  user_id?: string | null;
  user_hash?: string | null;
};

function toOptionalLogString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

function getNestedValue(source: unknown, path: string[]): unknown {
  let current = source;

  for (const segment of path) {
    if (!current || typeof current !== "object") {
      return undefined;
    }

    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}

function resolveCandidateValue(sources: unknown[], candidatePaths: string[][]): string | null {
  for (const source of sources) {
    for (const path of candidatePaths) {
      const value = path.length === 0 ? source : getNestedValue(source, path);
      const resolved = toOptionalLogString(value);
      if (resolved) {
        return resolved;
      }
    }
  }

  return null;
}

function appendRequestContextSource(sources: unknown[]): unknown[] {
  const requestContext = getRequestContext();
  return requestContext ? sources.concat(requestContext) : sources;
}

export function resolveStructuredLogUserId(...sources: unknown[]): string | null {
  return resolveCandidateValue(appendRequestContextSource(sources), [
    [],
    ["userId"],
    ["user_id"],
    ["createdByUserId"],
    ["created_by_user_id"],
    ["requestedByUserId"],
    ["requested_by_user_id"],
    ["updatedByAdminId"],
    ["updated_by_admin_id"],
    ["authorUserId"],
    ["ownerUserId"],
    ["actor", "userId"],
    ["actor", "user_id"],
    ["user", "id"],
    ["req", "user", "id"],
    ["request", "user", "id"],
    ["session", "userId"],
    ["session", "user", "id"],
    ["auth", "userId"],
    ["auth", "user_id"],
    ["context", "userId"],
    ["context", "user_id"],
  ]);
}

export function resolveStructuredLogRequestId(...sources: unknown[]): string | null {
  return resolveCandidateValue(appendRequestContextSource(sources), [
    [],
    ["id"],
    ["requestId"],
    ["request_id"],
    ["req", "id"],
    ["request", "id"],
    ["req", "headers", "x-request-id"],
    ["request", "headers", "x-request-id"],
  ]);
}

export function resolveStructuredLogTraceId(...sources: unknown[]): string | null {
  return resolveCandidateValue(appendRequestContextSource(sources), [
    [],
    ["traceId"],
    ["trace_id"],
    ["req", "headers", "x-trace-id"],
    ["request", "headers", "x-trace-id"],
  ]);
}

export function resolveStructuredLogIdentity(...sources: unknown[]): StructuredLogIdentity {
  return {
    trace_id: resolveStructuredLogTraceId(...sources),
    request_id: resolveStructuredLogRequestId(...sources),
    user_id: resolveStructuredLogUserId(...sources),
  };
}

export function resolveStructuredLogWorkspaceId(...sources: unknown[]): string | null {
  return resolveCandidateValue(appendRequestContextSource(sources), [
    [],
    ["workspaceId"],
    ["workspace_id"],
    ["workspaceContext", "workspaceId"],
    ["context", "workspaceId"],
    ["req", "workspaceId"],
    ["req", "workspaceContext", "workspaceId"],
    ["request", "workspaceId"],
    ["request", "workspaceContext", "workspaceId"],
  ]);
}

export function createStructuredLoggingHelpers(service: string) {
  const env = process.env.NODE_ENV ?? "local";

  function getBaseLogContext(identity: StructuredLogIdentity = {}) {
    const resolvedIdentity = resolveStructuredLogIdentity(identity);
    return {
      service,
      env,
      trace_id: resolvedIdentity.trace_id,
      request_id: resolvedIdentity.request_id,
      user_id: resolvedIdentity.user_id,
      user_hash: identity.user_hash ?? null,
    };
  }

  function getFailureLogContext<T extends Record<string, unknown>>(
    eventName: string,
    errorCode: StructuredErrorCode,
    context: T & StructuredLogIdentity,
    outcome: FailureOutcome = "failure",
  ) {
    const { trace_id, request_id, user_id, user_hash, ...rest } = context;
    return {
      ...getBaseLogContext({ trace_id, request_id, user_id, user_hash }),
      event_name: eventName,
      outcome,
      error_code: errorCode,
      ...rest,
    };
  }

  function getErrorLogDetails(error: unknown) {
    if (error instanceof Error) {
      return {
        error_name: error.name,
        error_message: error.message,
        err: error,
      };
    }

    return {
      error_name: "UnknownError",
      error_message: String(error),
      thrown_value_type: typeof error,
    };
  }

  return {
    getBaseLogContext,
    getFailureLogContext,
    getErrorLogDetails,
  };
}

export function resolveStatusErrorCode(
  status?: number,
  fallback: StructuredErrorCode = "INTERNAL_ERROR",
): StructuredErrorCode {
  switch (status) {
    case 400:
    case 422:
      return "VALIDATION_ERROR";
    case 401:
      return "UNAUTHORIZED";
    case 403:
      return "FORBIDDEN";
    case 404:
      return "RESOURCE_NOT_FOUND";
    case 409:
      return "CONFLICT";
    case 429:
      return "RATE_LIMITED";
    case 408:
    case 504:
      return "DEPENDENCY_TIMEOUT";
    case 503:
      return "DEPENDENCY_UNAVAILABLE";
    default:
      return fallback;
  }
}
