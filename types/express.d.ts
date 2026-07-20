import type { PublicUser } from "@shared/schema";
import type { Logger as PinoLogger } from "pino";

// Ambient-расширения express, которые читает @unica/observability (в монолите жили в
// types/express.d.ts + server/auth.ts). Здесь — минимальный набор для пакета логирования/контекста;
// доменные сеттеры (auth middleware, полный WorkspaceRequestContext) в этот сервис не едут.
declare global {
  namespace Express {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface User extends PublicUser {}
    interface Request {
      id?: string;
      traceId?: string;
      log?: PinoLogger;
      allLogs?: PinoLogger[];
    }
    interface Response {
      log?: PinoLogger;
      allLogs?: PinoLogger[];
    }
  }
}

declare module "express-serve-static-core" {
  interface Request {
    user?: Express.User;
    workspaceId?: string;
    workspaceContext?: { workspaceId?: string };
  }
}

export {};
