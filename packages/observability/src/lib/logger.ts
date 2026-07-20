import { randomUUID } from 'crypto';
import type { Request, RequestHandler, Response } from 'express';
import pino from 'pino';
import pinoHttp from 'pino-http';
import { dirname, resolve } from 'path';
import { createWriteStream, mkdirSync } from 'fs';
import { Writable } from 'stream';
import pretty from 'pino-pretty';
import {
  resolveStatusErrorCode,
  resolveStructuredLogRequestId,
  resolveStructuredLogTraceId,
  resolveStructuredLogUserId,
  resolveStructuredLogWorkspaceId,
} from './structured-logging';
import {
  buildRequestLogContext,
  getRequestContext,
  runWithRequestContext,
  syncRequestContextFromRequest,
} from './request-context';
import { LocalRotatingFileStream } from './local-rotating-file-stream';

const isDevelopment = process.env.NODE_ENV !== 'production';
const logEnabled = process.env.LOG_ENABLED !== '0';
const logLevel = process.env.LOG_LEVEL?.trim() || 'info';
const explicitLogFilePath = process.env.LOG_FILE_PATH?.trim();
const appRole = process.env.APP_ROLE?.trim() || 'api';

const defaultLocalLogFilePath = process.env.DEV_LOG_FILE_PATH?.trim() || 'output/logs/app.local.jsonl';
const localLogMaxBytes = (() => {
  const raw = Number.parseInt(process.env.DEV_LOG_MAX_BYTES ?? '', 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 20 * 1024 * 1024;
})();
const localLogMaxFiles = (() => {
  const raw = Number.parseInt(process.env.DEV_LOG_MAX_FILES ?? '', 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 3;
})();
const apiRequestLogEnabled = (process.env.API_REQUEST_LOG_ENABLED ?? '1') !== '0';
const apiRequestWarnThresholdMs = (() => {
  const raw = Number.parseInt(process.env.API_REQUEST_SLOW_THRESHOLD_MS ?? '', 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 1_500;
})();

const REDACT_PATHS = [
  'authorization',
  'cookie',
  'password',
  'secret',
  'token',
  'apiKey',
  'accessToken',
  'refreshToken',
  'clientSecret',
  'headers.authorization',
  'headers.cookie',
  'req.headers.authorization',
  'req.headers.cookie',
  'request.headers.authorization',
  'request.headers.cookie',
  '*.authorization',
  '*.cookie',
  '*.password',
  '*.secret',
  '*.token',
  '*.apiKey',
  '*.accessToken',
  '*.refreshToken',
  '*.clientSecret',
  'body.password',
  'body.secret',
  'body.token',
  'body.prompt',
  'body.answer',
  'body.response',
  'body.document',
  '*.prompt',
  '*.answer',
  '*.response',
  '*.document',
];

const enableDevLogFile = isDevelopment && process.env.DEV_LOG === '1';
const logFilePath = explicitLogFilePath
  ? resolve(process.cwd(), explicitLogFilePath)
  : enableDevLogFile
    ? resolve(process.cwd(), defaultLocalLogFilePath)
    : undefined;

class MultiDestinationStream extends Writable {
  constructor(private readonly destinations: Writable[]) {
    super();
  }

  override _write(
    chunk: string | Buffer,
    encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    try {
      for (const destination of this.destinations) {
        destination.write(chunk, encoding);
      }
      callback();
    } catch (error) {
      callback(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

const fileStream = (() => {
  if (!logFilePath) {
    return undefined;
  }

  mkdirSync(dirname(logFilePath), { recursive: true });
  if (enableDevLogFile && !explicitLogFilePath) {
    return new LocalRotatingFileStream({
      filePath: logFilePath,
      maxBytes: localLogMaxBytes,
      maxFiles: localLogMaxFiles,
    });
  }

  return createWriteStream(logFilePath, { flags: 'a', encoding: 'utf8' });
})();

const prettyConsoleDestination = isDevelopment
  ? new Writable({
      write(chunk, _encoding, callback) {
        const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
        console.log('%s', text.replace(/\r?\n$/, '')); // eslint-disable-line no-console
        callback();
      },
    })
  : undefined;

const prettyStream = isDevelopment
  ? pretty({
      colorize: true,
      translateTime: 'HH:MM:ss.l',
      ignore: 'pid,hostname',
      singleLine: false,
      sync: true,
      destination: prettyConsoleDestination,
    })
  : undefined;

const destination = (() => {
  if (fileStream && prettyStream) {
    return new MultiDestinationStream([fileStream, prettyStream]);
  }

  if (fileStream) {
    return fileStream;
  }

  if (prettyStream) {
    return prettyStream;
  }

  return process.stdout;
})();

function normalizeLogPayload(payload: Record<string, unknown>) {
  const normalized = { ...payload };
  const requestContext = getRequestContext();
  const component = typeof normalized.component === 'string' ? normalized.component : null;
  const hasMissingValue = (value: unknown) =>
    value === undefined || value === null || (typeof value === 'string' && value.trim().length === 0);

  if (normalized.service === undefined) {
    normalized.service = component;
  }
  if (normalized.env === undefined) {
    normalized.env = process.env.NODE_ENV ?? 'local';
  }
  if (normalized.app_role === undefined) {
    normalized.app_role = requestContext?.app_role ?? appRole;
  }
  if (hasMissingValue(normalized.trace_id)) {
    normalized.trace_id =
      requestContext?.trace_id ??
      resolveStructuredLogTraceId(normalized) ??
      (typeof normalized.importTraceId === 'string' ? normalized.importTraceId : null);
  }
  if (hasMissingValue(normalized.request_id)) {
    normalized.request_id =
      requestContext?.request_id ??
      resolveStructuredLogRequestId(normalized);
  }
  if (hasMissingValue(normalized.user_id)) {
    normalized.user_id =
      requestContext?.user_id ??
      resolveStructuredLogUserId(normalized);
  }
  if (hasMissingValue(normalized.workspace_id)) {
    normalized.workspace_id =
      requestContext?.workspace_id ??
      resolveStructuredLogWorkspaceId(normalized);
  }

  return normalized;
}

function getHeader(req: { get?: (name: string) => string | undefined }, name: string): string | null {
  const value = req.get?.(name)?.trim();
  return value && value.length > 0 ? value : null;
}

function resolveRequestId(req: Request): string {
  const requestId = typeof req.id === 'string' && req.id.trim().length > 0 ? req.id.trim() : null;
  return requestId ?? randomUUID();
}

function resolveTraceId(req: Request): string {
  const traceId =
    (typeof req.traceId === 'string' && req.traceId.trim().length > 0 ? req.traceId.trim() : null) ??
    getHeader(req, 'x-trace-id') ??
    resolveStructuredLogTraceId(req);

  return traceId ?? resolveRequestId(req);
}

function resolveRequestUserId(req: Request): string | null {
  const user = req.user;
  if (!user || typeof user !== 'object' || !('id' in user)) {
    return null;
  }

  const userId = (user as { id?: unknown }).id;
  return typeof userId === 'string' && userId.trim().length > 0 ? userId : null;
}

function resolveRequestWorkspaceId(req: Request): string | null {
  return buildRequestLogContext(req).workspace_id;
}

function resolveRequestRoute(req: Request): string {
  const routePath = req.route && typeof req.route === 'object' && 'path' in req.route ? req.route.path : null;
  if (typeof routePath === 'string' && routePath.length > 0) {
    return `${req.baseUrl ?? ''}${routePath}`;
  }

  return req.path || req.originalUrl || req.url;
}

function shouldIgnoreHttpAccessLog(req: Request): boolean {
  const path = req.originalUrl || req.url || '';
  if (!path.startsWith('/api')) {
    return true;
  }

  return (
    path === '/api/health' ||
    path.startsWith('/api/health/') ||
    path === '/api/metrics' ||
    path.startsWith('/api/metrics/')
  );
}

function getResponseHeaderValue(res: Response, name: string): string | null {
  const rawValue = res.getHeader(name);
  if (typeof rawValue === 'string') {
    return rawValue.trim() || null;
  }
  if (Array.isArray(rawValue)) {
    const firstValue = rawValue.find((value) => typeof value === 'string' && value.trim().length > 0);
    return typeof firstValue === 'string' ? firstValue.trim() : null;
  }
  return null;
}

function isStreamingRequest(req: Request, res: Response): boolean {
  const routeOrPath = resolveRequestRoute(req) || req.originalUrl || req.url || '';
  const acceptHeader = getHeader(req, 'accept');
  const responseContentType = getResponseHeaderValue(res, 'content-type');

  return (
    /\/events(?:\/|$)/.test(routeOrPath) ||
    acceptHeader?.includes('text/event-stream') === true ||
    responseContentType?.includes('text/event-stream') === true
  );
}

function resolveHttpLevel(
  statusCode: number,
  durationMs: number,
): 'error' | 'warn' | 'debug' | null {
  if (statusCode >= 500) {
    return 'error';
  }

  if (durationMs >= apiRequestWarnThresholdMs) {
    return 'warn';
  }

  if (statusCode === 408 || statusCode === 409 || statusCode === 429) {
    return 'warn';
  }

  if (statusCode >= 400) {
    return 'debug';
  }

  return null;
}

function buildHttpAccessPayload(
  req: Request,
  res: Response,
  durationMs: number,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  const statusCode = res.statusCode;

  return {
    component: 'http',
    event_name: statusCode >= 400 ? 'http.request.failed' : 'http.request.completed',
    outcome: statusCode >= 400 ? 'failure' : 'success',
    request_id: resolveRequestId(req),
    trace_id: resolveTraceId(req),
    user_id: resolveRequestUserId(req),
    workspace_id: resolveRequestWorkspaceId(req),
    route: resolveRequestRoute(req),
    method: req.method,
    status_code: statusCode,
    duration_ms: durationMs,
    path: req.originalUrl || req.url,
    error_code: statusCode >= 400 ? resolveStatusErrorCode(statusCode) : undefined,
    ...extra,
  };
}

// Безопасный сериализатор Error для ключей `error`/`cause`. Pino применяет
// serializers только к ключу `err`, поэтому распространённый паттерн
// logger.error({ error }, ...) сериализовал Error в `{}` (message/stack у Error
// не enumerable) — и в инциденте 2026-06-03 причина сбоя воркера была не видна
// 7 часов. Здесь: Error → полная сериализация (type/message/stack/доп. поля),
// любое не-Error значение пробрасывается без изменений (структурные { error }
// не ломаем).
export const errorSerializer = (value: unknown): unknown =>
  value instanceof Error ? pino.stdSerializers.err(value) : value;

// Create base Pino logger
export const logger = pino({
  enabled: logEnabled,
  level: logLevel,
  redact: {
    paths: REDACT_PATHS,
    censor: '[Redacted]',
  },
  serializers: {
    req(value) {
      if (!value || typeof value !== 'object') {
        return value;
      }

      const req = value as Request;
      return {
        id: typeof req.id === 'string' ? req.id : null,
        trace_id: typeof req.traceId === 'string' ? req.traceId : null,
        method: req.method ?? null,
        url: req.originalUrl || req.url || null,
        remoteAddress: req.socket?.remoteAddress ?? null,
        userAgent: getHeader(req, 'user-agent'),
      };
    },
    res(value) {
      if (!value || typeof value !== 'object') {
        return value;
      }

      const res = value as Response;
      return {
        statusCode: res.statusCode ?? null,
        headersSent: res.headersSent ?? false,
      };
    },
    err: pino.stdSerializers.err,
    error: errorSerializer,
    cause: errorSerializer,
  },
  hooks: {
    logMethod(args, method) {
      if (
        args.length > 0 &&
        args[0] &&
        typeof args[0] === 'object' &&
        !Array.isArray(args[0]) &&
        !(args[0] instanceof Error)
      ) {
        args[0] = normalizeLogPayload(args[0] as Record<string, unknown>);
      }
      method.apply(this, args);
    },
  },
  ...(isDevelopment && prettyStream
    ? {}
    : {
        formatters: {
          level: (label) => ({ level: label.toUpperCase() }),
          bindings: () => ({}),
        },
        timestamp: pino.stdTimeFunctions.isoTime,
      }),
}, destination);

const rawHttpLogger = pinoHttp({
  logger,
  autoLogging: false,
  quietReqLogger: true,
  quietResLogger: true,
  customAttributeKeys: {
    reqId: 'request_id',
  },
  genReqId(req, res) {
    const requestIdHeader = req.headers['x-request-id'];
    const incomingRequestId = Array.isArray(requestIdHeader)
      ? requestIdHeader[0]?.trim()
      : typeof requestIdHeader === 'string'
        ? requestIdHeader.trim()
        : null;
    const existingId =
      (typeof req.id === 'string' && req.id.trim().length > 0 ? req.id.trim() : null) ??
      incomingRequestId;
    if (existingId) {
      res.setHeader('x-request-id', existingId);
      return existingId;
    }

    const generatedId = randomUUID();
    res.setHeader('x-request-id', generatedId);
    return generatedId;
  },
});

export const httpRequestLoggingMiddleware: RequestHandler = (req, res, next) => {
  rawHttpLogger(req, res, () => {
    const requestId = resolveRequestId(req);
    const traceId = getHeader(req, 'x-trace-id') ?? requestId;
    req.traceId = traceId;
    res.setHeader('x-trace-id', traceId);
    res.locals.requestId = requestId;
    res.locals.traceId = traceId;

    const startedAt = Date.now();
    let streamIssueLogged = false;

    const finalizeAccessLog = () => {
      syncRequestContextFromRequest(req);
      if (!apiRequestLogEnabled || shouldIgnoreHttpAccessLog(req)) {
        return;
      }

      const durationMs = Date.now() - startedAt;
      const level = resolveHttpLevel(res.statusCode, durationMs);
      if (!level) {
        return;
      }

      req.log?.[level](
        buildHttpAccessPayload(req, res, durationMs),
        '[http] request completed',
      );
    };

    const onRequestAborted = () => {
      if (streamIssueLogged || shouldIgnoreHttpAccessLog(req)) {
        return;
      }
      streamIssueLogged = true;
      syncRequestContextFromRequest(req);
      const isExpectedStreamClose = isStreamingRequest(req, res);
      const level = isExpectedStreamClose ? 'debug' : 'warn';
      req.log?.[level](
        {
          component: 'http',
          event_name: isExpectedStreamClose
            ? 'http.request.client_disconnect'
            : 'http.request.aborted',
          outcome: 'partial',
          request_id: requestId,
          trace_id: traceId,
          user_id: resolveRequestUserId(req),
          workspace_id: resolveRequestWorkspaceId(req),
          route: resolveRequestRoute(req),
          method: req.method,
          status_code: res.statusCode,
          duration_ms: Date.now() - startedAt,
        },
        isExpectedStreamClose
          ? '[http] streaming request closed by client'
          : '[http] request aborted by client',
      );
    };

    const onRequestError = (error: Error) => {
      if (streamIssueLogged || shouldIgnoreHttpAccessLog(req)) {
        return;
      }
      streamIssueLogged = true;
      syncRequestContextFromRequest(req);
      const isExpectedStreamClose = isStreamingRequest(req, res);
      const level = isExpectedStreamClose ? 'debug' : 'warn';
      req.log?.[level](
        {
          component: 'http',
          event_name: isExpectedStreamClose
            ? 'http.request.stream_client_error'
            : 'http.request.stream_error',
          outcome: 'partial',
          request_id: requestId,
          trace_id: traceId,
          user_id: resolveRequestUserId(req),
          workspace_id: resolveRequestWorkspaceId(req),
          route: resolveRequestRoute(req),
          method: req.method,
          status_code: res.statusCode,
          duration_ms: Date.now() - startedAt,
          err: error,
        },
        isExpectedStreamClose
          ? '[http] streaming request closed with client-side error'
          : '[http] request stream error',
      );
    };

    const onResponseError = (error: Error) => {
      if (streamIssueLogged || shouldIgnoreHttpAccessLog(req)) {
        return;
      }
      streamIssueLogged = true;
      syncRequestContextFromRequest(req);
      req.log?.error(
        {
          component: 'http',
          event_name: 'http.response.stream_error',
          outcome: 'failure',
          request_id: requestId,
          trace_id: traceId,
          user_id: resolveRequestUserId(req),
          workspace_id: resolveRequestWorkspaceId(req),
          route: resolveRequestRoute(req),
          method: req.method,
          status_code: res.statusCode,
          duration_ms: Date.now() - startedAt,
          err: error,
        },
        '[http] response stream error',
      );
    };

    runWithRequestContext(buildRequestLogContext(req), () => {
      req.once('aborted', onRequestAborted);
      req.once('error', onRequestError);
      res.once('error', onResponseError);
      res.once('finish', finalizeAccessLog);
      next();
    });
  });
};

// Create child loggers for different components
export const createLogger = (component: string) => logger.child({ component });

// Backward-compatible log function
export function log(message: string, source = 'express') {
  logger.info({ component: source }, message);
}

export type Logger = typeof logger;
export type ChildLogger = ReturnType<typeof createLogger>;
