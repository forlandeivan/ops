import { Cron } from "croner";
import { z } from "zod";

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Укажите время в формате ЧЧ:ММ");
const instantSchema = z.string().datetime({ offset: true, message: "Укажите дату и время с часовым поясом" });
const daysSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("daily") }).strict(),
  z.object({ kind: z.literal("weekdays") }).strict(),
  z.object({ kind: z.literal("weekdays_list"), values: z.array(z.number().int().min(0).max(6)).min(1).max(7) }).strict(),
  z.object({ kind: z.literal("month_day"), day: z.number().int().min(1).max(28) }).strict(),
  z.object({ kind: z.literal("month_last_day") }).strict(),
]);

/** Stored intervals always include an anchor; omitted input anchors are fixed at creation. */
export const scheduledTaskScheduleSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("once"), at: instantSchema }).strict(),
  z.object({
    kind: z.literal("calendar"),
    times: z.array(timeSchema).min(1).max(6).refine((times) => new Set(times).size === times.length, "Время не должно повторяться"),
    days: daysSchema,
  }).strict(),
  z.object({ kind: z.literal("interval"), everyMinutes: z.number().int().min(1).max(Math.floor(Number.MAX_SAFE_INTEGER / MINUTE)), anchorAt: instantSchema }).strict(),
  z.object({ kind: z.literal("cron"), expression: z.string().trim().min(1).max(256) }).strict(),
]);

export type ScheduledTaskSchedule = z.infer<typeof scheduledTaskScheduleSchema>;
export type ScheduleErrorCode = "invalid_schedule" | "invalid_timezone" | "invalid_cron" | "no_future_run" | "too_frequent";

export class ScheduledTaskScheduleError extends Error {
  constructor(readonly code: ScheduleErrorCode, message: string) {
    super(message);
    this.name = "ScheduledTaskScheduleError";
  }
}

export function normalizeScheduleTimezone(timezone: string): string {
  if (typeof timezone !== "string" || !timezone.trim() || /^[+-]/.test(timezone.trim())) {
    throw new ScheduledTaskScheduleError("invalid_timezone", "Укажите часовой пояс IANA, например Europe/Moscow");
  }
  try {
    return new Intl.DateTimeFormat("en", { timeZone: timezone.trim() }).resolvedOptions().timeZone;
  } catch {
    throw new ScheduledTaskScheduleError("invalid_timezone", "Неизвестный часовой пояс");
  }
}

function validDate(value: Date): number {
  const timestamp = value.getTime();
  if (!Number.isFinite(timestamp)) throw new ScheduledTaskScheduleError("invalid_schedule", "Некорректная дата расчёта");
  return timestamp;
}

/** The parser is never a timer: no callback, job name or implicit local timezone. */
function cron(expression: string): Cron {
  return new Cron(expression, {
    timezone: "UTC", paused: true, mode: "5-part", domAndDow: false,
    alternativeWeekdays: false, sloppyRanges: false,
  });
}

function cronExpressions(schedule: Extract<ScheduledTaskSchedule, { kind: "calendar" | "cron" }>): string[] {
  if (schedule.kind === "cron") {
    const fields = schedule.expression.trim().split(/\s+/);
    // Accept standard names, but no library extensions (?, L, W, #, +, aliases, seconds/year).
    const numeric = fields.map((field, index) => {
      const names = index === 3 ? /\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\b/gi
        : index === 4 ? /\b(SUN|MON|TUE|WED|THU|FRI|SAT)\b/gi : null;
      return names ? field.replace(names, "0") : field;
    });
    if (fields.length !== 5 || numeric.some((field) => !/^[\d*,/-]+$/.test(field))) {
      throw new ScheduledTaskScheduleError("invalid_cron", "Расписание cron должно содержать пять стандартных полей: минуты, часы, день, месяц, день недели");
    }
    return [fields.join(" ")];
  }
  let day = "*";
  let weekday = "*";
  switch (schedule.days.kind) {
    case "weekdays": weekday = "1-5"; break;
    case "weekdays_list": weekday = [...new Set(schedule.days.values)].sort().join(","); break;
    case "month_day": day = String(schedule.days.day); break;
    case "month_last_day": day = "L"; break;
  }
  return schedule.times.map((time) => {
    const [hour, minute] = time.split(":").map(Number);
    return `${minute} ${hour} ${day} * ${weekday}`;
  });
}

/**
 * Croner generates nominal wall-clock slots in UTC. Resolve them separately: Croner's
 * native gap behavior (02:30 -> 03:30) differs from our contract (02:30 -> 03:00).
 * Offset candidates cover non-hour transitions and whole skipped civil days as well.
 */
function wallClock(timezone: string) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  });
  const offsetCache = new Map<number, number[]>();
  const wall = (timestamp: number): number => {
    const parts = Object.fromEntries(formatter.formatToParts(timestamp).map((part) => [part.type, part.value]));
    return Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
  };
  const resolve = (nominal: number): number => {
    const day = Math.floor(nominal / DAY) * DAY;
    let offsets = offsetCache.get(day);
    if (!offsets) {
      const values = new Set<number>();
      for (let hour = -48; hour <= 48; hour += 6) {
        const timestamp = day + hour * 60 * MINUTE;
        values.add(wall(timestamp) - timestamp);
      }
      offsets = [...values];
      offsetCache.set(day, offsets);
    }
    const candidates = offsets.map((offset) => nominal - offset).sort((a, b) => a - b);
    const exact = candidates.filter((timestamp) => wall(timestamp) === nominal);
    if (exact.length) return exact[0]; // First occurrence of an ambiguous local time, never the second.

    const before = candidates.filter((timestamp) => wall(timestamp) < nominal);
    const after = candidates.filter((timestamp) => wall(timestamp) > nominal);
    let low = Math.max(...before);
    let high = Math.min(...after);
    if (!Number.isFinite(low) || !Number.isFinite(high) || high <= low) {
      throw new ScheduledTaskScheduleError("invalid_schedule", "Не удалось разрешить местное время в выбранном часовом поясе");
    }
    // Find the exact transition, rather than preserving the missing minutes in a DST gap.
    while (high - low > 1000) {
      const middle = Math.floor((low + high) / 2000) * 1000;
      if (wall(middle) >= nominal) high = middle;
      else low = middle;
    }
    return high;
  };
  return { wall, resolve };
}

/** Strictly after `after`. Independent of process timezone, clock, database and timers. */
export function scheduledTaskLocalDateTimeToInstant(value: string, timezone: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new ScheduledTaskScheduleError("invalid_schedule", "Укажите дату и время запуска");
  const nominal = Date.parse(`${value}:00Z`);
  if (!Number.isFinite(nominal) || new Date(nominal).toISOString().slice(0, 16) !== value) throw new ScheduledTaskScheduleError("invalid_schedule", "Некорректная дата запуска");
  return new Date(wallClock(normalizeScheduleTimezone(timezone)).resolve(nominal)).toISOString();
}

/** Strictly after `after`. Independent of process timezone, clock, database and timers. */
export function nextScheduledTaskOccurrences(
  input: ScheduledTaskSchedule, timezone: string, after: Date, count = 5,
): Date[] {
  const parsed = scheduledTaskScheduleSchema.safeParse(input);
  if (!parsed.success) throw new ScheduledTaskScheduleError("invalid_schedule", "Проверьте параметры расписания");
  const schedule = parsed.data;
  const zone = normalizeScheduleTimezone(timezone);
  const timestamp = validDate(after);
  if (!Number.isInteger(count) || count < 1 || count > 48) {
    throw new ScheduledTaskScheduleError("invalid_schedule", "Количество дат должно быть от 1 до 48");
  }
  if (schedule.kind === "once") {
    const at = new Date(schedule.at);
    return at.getTime() > timestamp ? [at] : [];
  }
  if (schedule.kind === "interval") {
    const anchor = Date.parse(schedule.anchorAt);
    const interval = schedule.everyMinutes * MINUTE;
    const first = anchor + Math.max(0, Math.floor((timestamp - anchor) / interval) + 1) * interval;
    return Array.from({ length: count }, (_, index) => {
      const occurrence = new Date(first + index * interval);
      validDate(occurrence);
      return occurrence;
    });
  }
  let jobs: Cron[];
  try { jobs = cronExpressions(schedule).map(cron); } catch (error) {
    if (error instanceof ScheduledTaskScheduleError) throw error;
    throw new ScheduledTaskScheduleError("invalid_cron", "Некорректное выражение cron: проверьте значения и диапазоны");
  }
  const local = wallClock(zone);
  // Search forward in local time; resolving a fold always selects its first occurrence.
  // Slots already passed in UTC are filtered below, including a restart in the second hour.
  const start = new Date(local.wall(timestamp));
  const candidates = jobs.map((job) => job.nextRun(start)?.getTime() ?? Infinity);
  const result: Date[] = [];
  let previous = timestamp;
  for (let iteration = 0; iteration < 10_000; iteration += 1) {
    const nominal = Math.min(...candidates);
    if (!Number.isFinite(nominal)) return result;
    const actual = local.resolve(nominal);
    if (actual > previous) {
      result.push(new Date(actual));
      previous = actual;
      if (result.length === count) return result;
    }
    for (let index = 0; index < jobs.length; index += 1) {
      if (candidates[index] === nominal) candidates[index] = jobs[index].nextRun(new Date(nominal))?.getTime() ?? Infinity;
    }
  }
  throw new ScheduledTaskScheduleError("invalid_schedule", "Превышен предел расчёта расписания");
}

/** Called at creation/update; persist both normalized values, especially the interval anchor. */
export function validateScheduledTaskSchedule(
  input: unknown, timezone: string, options: { now: Date; minIntervalMinutes: number },
): { schedule: ScheduledTaskSchedule; timezone: string; preview: Date[] } {
  validDate(options.now);
  if (!Number.isFinite(options.minIntervalMinutes) || options.minIntervalMinutes < 1) {
    throw new ScheduledTaskScheduleError("invalid_schedule", "Минимальный интервал должен быть положительным");
  }
  let candidate = input;
  if (input && typeof input === "object" && "kind" in input && input.kind === "interval") {
    candidate = { ...input, anchorAt: "anchorAt" in input && input.anchorAt !== undefined ? input.anchorAt : options.now.toISOString() };
  }
  const parsed = scheduledTaskScheduleSchema.safeParse(candidate);
  if (!parsed.success) throw new ScheduledTaskScheduleError("invalid_schedule", "Проверьте параметры расписания: дату, время и периодичность");
  const schedule = parsed.data;
  if (schedule.kind === "once") schedule.at = new Date(schedule.at).toISOString();
  if (schedule.kind === "interval") schedule.anchorAt = new Date(schedule.anchorAt).toISOString();
  if (schedule.kind === "calendar") schedule.times.sort();
  const zone = normalizeScheduleTimezone(timezone);
  const dates = nextScheduledTaskOccurrences(schedule, zone, options.now, 48);
  if (!dates.length) throw new ScheduledTaskScheduleError("no_future_run", "У расписания нет будущих запусков");
  if (dates.some((date, index) => index > 0 && date.getTime() - dates[index - 1].getTime() < options.minIntervalMinutes * MINUTE)) {
    throw new ScheduledTaskScheduleError("too_frequent", `Интервал между запусками должен быть не меньше ${options.minIntervalMinutes} мин.`);
  }
  return { schedule, timezone: zone, preview: dates.slice(0, 5) };
}

/** Forward-only, stable across replicas/restarts, bounded by 10% of the next nominal gap. */
export function scheduledTaskStartJitterMs(taskId: string, scheduledFor: Date, next: Date | null, maxSeconds: number): number {
  const at = validDate(scheduledFor);
  if (!Number.isFinite(maxSeconds) || maxSeconds < 0 || maxSeconds > 600) {
    throw new ScheduledTaskScheduleError("invalid_schedule", "Разброс старта должен быть от 0 до 600 секунд");
  }
  if (!next) return 0; // A one-off task has no following slot.
  const bound = Math.floor(Math.min(maxSeconds * 1000, Math.max(0, validDate(next) - at) / 10));
  if (bound <= 0) return 0;
  let hash = 2166136261;
  for (let index = 0; index < taskId.length; index += 1) hash = Math.imul(hash ^ taskId.charCodeAt(index), 16777619) >>> 0;
  return hash % bound;
}

export const scheduledTaskAllowedHoursSchema = z.object({
  from: timeSchema, to: timeSchema, timezone: z.string(),
}).strict().refine((hours) => hours.from !== hours.to, "Начало и конец окна должны различаться; для круглосуточной работы удалите окно");

/** Only a first-start gate; resume has separate admission rules. End is exclusive. */
export function isWithinScheduledTaskAllowedHours(at: Date, input: z.infer<typeof scheduledTaskAllowedHoursSchema> | null): boolean {
  validDate(at);
  if (!input) return true;
  const parsed = scheduledTaskAllowedHoursSchema.safeParse(input);
  if (!parsed.success) throw new ScheduledTaskScheduleError("invalid_schedule", "Проверьте разрешённые часы старта");
  const hours = parsed.data;
  const zone = normalizeScheduleTimezone(hours.timezone);
  const minute = Math.floor(((wallClock(zone).wall(at.getTime()) % DAY) + DAY) % DAY / MINUTE);
  const minutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
  const from = minutes(hours.from);
  const to = minutes(hours.to);
  return from < to ? minute >= from && minute < to : minute >= from || minute < to;
}
