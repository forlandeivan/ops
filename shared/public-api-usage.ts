/**
 * Учёт активности публичного API.
 *
 * Отвечает на вопрос администратора «этим вообще кто-нибудь пользуется?». Метрики
 * Prometheus на него не отвечают: они считают маршруты, а не арендаторов, и намеренно
 * не несут пространства и пользователя. Журнал не отвечает тоже — успешный быстрый
 * вызов в него не попадает вовсе.
 *
 * Единица учёта — суточное ведро «пространство × токен × маршрут × исход». Строка на
 * вызов не заводится осознанно: при дефолтной квоте это сто тысяч строк на пространство
 * в сутки, то есть журнал ради четырёх чисел на экране.
 */

/** Исход вызова. Отделён от кода ответа: экран говорит о смысле, а не о номере. */
export const PUBLIC_API_USAGE_OUTCOMES = [
  "success",
  "client_error",
  "rate_limited",
  "server_error",
] as const;

export type PublicApiUsageOutcome = (typeof PUBLIC_API_USAGE_OUTCOMES)[number];

export const PUBLIC_API_USAGE_OUTCOME_LABELS: Record<PublicApiUsageOutcome, string> = {
  success: "Успешно",
  client_error: "Ошибка вызывающего",
  rate_limited: "Отказ по потолку",
  server_error: "Ошибка платформы",
};

/**
 * Отказ по потолку вынесен из общих клиентских ошибок отдельным исходом: именно он
 * отвечает, не пора ли поднять квоту в «Политиках API», и растворяться в 4xx не должен.
 */
export function classifyPublicApiOutcome(statusCode: number): PublicApiUsageOutcome {
  if (statusCode === 429) return "rate_limited";
  if (statusCode >= 500) return "server_error";
  if (statusCode >= 400) return "client_error";
  return "success";
}

export interface PublicApiUsageTotalsDto {
  calls: number;
  success: number;
  clientErrors: number;
  rateLimited: number;
  serverErrors: number;
  /** Среднее по всем вызовам периода. Перцентиль из суточного агрегата не восстановить. */
  avgDurationMs: number;
}

export interface PublicApiUsageDayPointDto {
  day: string;
  calls: number;
  errors: number;
  rateLimited: number;
}

export interface PublicApiUsageConsumerDto {
  id: string;
  name: string;
  calls: number;
  errors: number;
  lastCalledAt: string | null;
}

export interface PublicApiUsageRouteDto {
  route: string;
  calls: number;
  errors: number;
  avgDurationMs: number;
}

export interface PublicApiUsageSummaryDto {
  range: { from: string; to: string };
  totals: PublicApiUsageTotalsDto;
  series: PublicApiUsageDayPointDto[];
  topWorkspaces: PublicApiUsageConsumerDto[];
  topTokens: PublicApiUsageConsumerDto[];
  topRoutes: PublicApiUsageRouteDto[];
  /**
   * Последнее обращение по токену — из отметки самого токена, а не из агрегата.
   * Служебные ручки (`/me`, `/ping`) в агрегат не попадают, но отметку обновляют,
   * поэтому «интеграция настраивается» отличима от «интеграции нет».
   */
  lastTokenUseAt: string | null;
  /** Токенов, обращавшихся за период. */
  activeTokens: number;
  /** Токенов, выпущенных и не отозванных, — «выпустили пять, ходят два». */
  issuedTokens: number;
}

/**
 * Почему на экране пусто. Три причины означают разное — «доступ ещё не выдавали»,
 * «выдали и ни разу не пришли», «пришли, но не в этом периоде», — и общий текст «нет
 * данных» смешал бы «ещё не начали» с «перестали». Вариант считается отдельно от
 * представления, чтобы это различение проверялось тестом, а не разглядыванием экрана.
 */
export type PublicApiUsageEmptyVariant = "no_tokens" | "never_used" | "idle_period";

export function resolvePublicApiUsageEmptyVariant(input: {
  issuedTokens: number;
  lastTokenUseAt: string | null;
}): PublicApiUsageEmptyVariant {
  if (input.issuedTokens <= 0) {
    return "no_tokens";
  }
  return input.lastTokenUseAt ? "idle_period" : "never_used";
}
