export const ASR_EXECUTION_STATUSES = [
  "pending",
  "processing",
  "success",
  "failed",
  "cancelled",
  "expired",
] as const;

export const ASR_EXECUTION_LIFECYCLE_STATUSES = [
  "accepted",
  "preparing_media",
  "media_ready",
  "dispatching_asr",
  "provider_processing",
  "provider_completed",
  "finalizing",
  "completed",
  "failed",
  "cancelled",
  "expired",
] as const;

export const ASR_EXECUTION_DISPLAY_STATUSES = [
  "queued",
  "ready_to_start",
  "processing",
  "success",
  "error",
  "cancelled",
  "expired",
] as const;

export const ASR_EXECUTION_SORT_MODES = [
  "started_desc",
  "started_asc",
  "status_asc",
  "status_desc",
  "workspace_asc",
  "workspace_desc",
  "assistant_asc",
  "assistant_desc",
  "action_asc",
  "action_desc",
  "file_asc",
  "file_desc",
  "audio_duration_desc",
  "audio_duration_asc",
  "rpx_desc",
  "rpx_asc",
  "diarization_desc",
  "diarization_asc",
] as const;

export type AsrExecutionStatus = (typeof ASR_EXECUTION_STATUSES)[number];
export type AsrExecutionLifecycleStatus = (typeof ASR_EXECUTION_LIFECYCLE_STATUSES)[number];
export type AsrExecutionDisplayStatus = (typeof ASR_EXECUTION_DISPLAY_STATUSES)[number];
export type AsrExecutionSortMode = (typeof ASR_EXECUTION_SORT_MODES)[number];

export type AsrExecutionDisplayStateInput = {
  status?: string | null;
  lifecycleStatus?: string | null;
  currentStage?: string | null;
  failureStage?: string | null;
  statusReasonCode?: string | null;
  postprocessingStatus?: string | null;
};

export type AsrExecutionDisplayState = {
  displayStatus: AsrExecutionDisplayStatus;
  displayLabel: string;
};

const lifecycleStatusSet = new Set<string>(ASR_EXECUTION_LIFECYCLE_STATUSES);
const executionStatusSet = new Set<string>(ASR_EXECUTION_STATUSES);

export function isAsrExecutionStatus(value: unknown): value is AsrExecutionStatus {
  return typeof value === "string" && executionStatusSet.has(value);
}

export function isAsrExecutionLifecycleStatus(value: unknown): value is AsrExecutionLifecycleStatus {
  return typeof value === "string" && lifecycleStatusSet.has(value);
}

export function normalizeAsrLifecycleStatus(params: {
  lifecycleStatus?: string | null;
  status?: string | null;
}): AsrExecutionLifecycleStatus {
  if (isAsrExecutionLifecycleStatus(params.lifecycleStatus)) {
    return params.lifecycleStatus;
  }

  switch (params.status) {
    case "success":
      return "completed";
    case "failed":
      return "failed";
    case "cancelled":
      return "cancelled";
    case "expired":
      return "expired";
    case "processing":
      return "provider_processing";
    default:
      return "accepted";
  }
}

const TERMINAL_ASR_LIFECYCLE_STATUSES = new Set<string>([
  "completed",
  "failed",
  "cancelled",
  "expired",
]);

/**
 * Терминальные lifecycle-статусы — запуск дошёл до конца (успех/ошибка/отмена/истечение)
 * и не должен «откатываться» назад в промежуточное состояние поздними/дублирующими
 * апдейтами поллинга. См. защиту от регресса в AsrExecutionLogService.recordTransition.
 */
export function isTerminalAsrLifecycleStatus(value: unknown): value is AsrExecutionLifecycleStatus {
  return isAsrExecutionLifecycleStatus(value) && TERMINAL_ASR_LIFECYCLE_STATUSES.has(value);
}

export function statusForAsrLifecycleStatus(lifecycleStatus: AsrExecutionLifecycleStatus): AsrExecutionStatus {
  switch (lifecycleStatus) {
    case "completed":
      return "success";
    case "failed":
      return "failed";
    case "cancelled":
      return "cancelled";
    case "expired":
      return "expired";
    case "accepted":
    case "preparing_media":
    case "media_ready":
      return "pending";
    default:
      return "processing";
  }
}

export function resolveAsrExecutionDisplayState(input: AsrExecutionDisplayStateInput): AsrExecutionDisplayState {
  const lifecycleStatus = normalizeAsrLifecycleStatus({
    lifecycleStatus: input.lifecycleStatus,
    status: input.status,
  });

  if (lifecycleStatus === "failed" || input.status === "failed") {
    const failureStage = input.failureStage ?? input.currentStage ?? input.statusReasonCode ?? "";
    if (/upload|media|file_provider|workspace_file/i.test(failureStage)) {
      return { displayStatus: "error", displayLabel: "Ошибка загрузки файла" };
    }
    if (/provider_resolution|configuration|file_provider_required/i.test(failureStage)) {
      return { displayStatus: "error", displayLabel: "Ошибка настройки ASR" };
    }
    if (/dispatch|start/i.test(failureStage)) {
      return { displayStatus: "error", displayLabel: "Ошибка запуска ASR" };
    }
    if (/transcript|finalizing|save/i.test(failureStage)) {
      return { displayStatus: "error", displayLabel: "Ошибка сохранения" };
    }
    return { displayStatus: "error", displayLabel: "Ошибка" };
  }

  if (lifecycleStatus === "cancelled" || input.status === "cancelled") {
    return { displayStatus: "cancelled", displayLabel: "Отменено" };
  }

  if (lifecycleStatus === "expired" || input.status === "expired") {
    return { displayStatus: "expired", displayLabel: "Истекло" };
  }

  if (lifecycleStatus === "completed" || input.status === "success") {
    if (input.postprocessingStatus === "failed") {
      return { displayStatus: "success", displayLabel: "Успех, автодействие с ошибкой" };
    }
    return { displayStatus: "success", displayLabel: "Успех" };
  }

  switch (lifecycleStatus) {
    case "accepted":
      return { displayStatus: "queued", displayLabel: "Принят" };
    case "preparing_media":
      return { displayStatus: "queued", displayLabel: "Загрузка файла" };
    case "media_ready":
      return { displayStatus: "ready_to_start", displayLabel: "Файл загружен" };
    case "dispatching_asr":
      return { displayStatus: "processing", displayLabel: "Отправка в ASR" };
    case "provider_processing":
      return { displayStatus: "processing", displayLabel: "Распознавание" };
    case "provider_completed":
      return { displayStatus: "processing", displayLabel: "ASR завершен" };
    case "finalizing":
      return { displayStatus: "processing", displayLabel: "Сохраняем стенограмму" };
    default:
      return { displayStatus: "queued", displayLabel: "Ожидание" };
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readBooleanLike(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (["true", "1", "yes", "on", "да"].includes(normalized)) {
    return true;
  }
  if (["false", "0", "no", "off", "нет"].includes(normalized)) {
    return false;
  }
  return null;
}

function findCaseInsensitiveValue(source: Record<string, unknown>, key: string): unknown {
  const normalizedKey = key.toLowerCase();
  for (const [entryKey, value] of Object.entries(source)) {
    if (entryKey.toLowerCase() === normalizedKey) {
      return value;
    }
  }
  return undefined;
}

function parseRequestBody(body: unknown): Record<string, unknown> | null {
  if (isPlainObject(body)) {
    return body;
  }
  if (typeof body !== "string" || body.trim().length === 0) {
    return null;
  }

  const text = body.trim();
  try {
    const parsed = JSON.parse(text);
    return isPlainObject(parsed) ? parsed : null;
  } catch {
    const params = new URLSearchParams(text);
    const result: Record<string, unknown> = {};
    params.forEach((value, key) => {
      result[key] = value;
    });
    return Object.keys(result).length > 0 ? result : null;
  }
}

export function resolveAsrExecutionDiarizationEnabledFromDetails(details: unknown): boolean | null {
  if (!isPlainObject(details)) {
    return null;
  }

  const directValue =
    findCaseInsensitiveValue(details, "diarizationEnabled") ??
    findCaseInsensitiveValue(details, "diarizeEnabled") ??
    findCaseInsensitiveValue(details, "diarize");
  const directBoolean = readBooleanLike(directValue);
  if (directBoolean !== null) {
    return directBoolean;
  }

  const advancedOptions = isPlainObject(details.advancedOptions) ? details.advancedOptions : null;
  if (advancedOptions) {
    const advancedBoolean = readBooleanLike(findCaseInsensitiveValue(advancedOptions, "diarize"));
    if (advancedBoolean !== null) {
      return advancedBoolean;
    }
  }

  const effectiveOptions = isPlainObject(details.effectiveOptions) ? details.effectiveOptions : null;
  if (effectiveOptions) {
    const effectiveBoolean = readBooleanLike(findCaseInsensitiveValue(effectiveOptions, "diarize"));
    if (effectiveBoolean !== null) {
      return effectiveBoolean;
    }
  }

  const httpRequest = isPlainObject(details.httpRequest) ? details.httpRequest : null;
  const requestBody = parseRequestBody(httpRequest?.body);
  if (requestBody) {
    const requestBoolean = readBooleanLike(findCaseInsensitiveValue(requestBody, "diarize"));
    if (requestBoolean !== null) {
      return requestBoolean;
    }
  }

  return null;
}

function normalizeEventsInput(events: unknown): unknown[] {
  if (Array.isArray(events)) {
    return events;
  }
  if (typeof events === "string" && events.trim().length > 0) {
    try {
      const parsed = JSON.parse(events);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function resolveAsrExecutionDiarizationEnabledFromEvents(events: unknown): boolean | null {
  for (const event of normalizeEventsInput(events)) {
    const details = isPlainObject(event) && "details" in event ? event.details : event;
    const value = resolveAsrExecutionDiarizationEnabledFromDetails(details);
    if (value !== null) {
      return value;
    }
  }
  return null;
}

export function formatAsrExecutionDiarizationLabel(value: boolean | null | undefined): string {
  if (value === true) {
    return "включена";
  }
  if (value === false) {
    return "выключена";
  }
  return "не задана";
}
