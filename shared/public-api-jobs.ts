/**
 * Единый объект задания публичного API.
 *
 * Длительные операции платформы устроены по-разному. Индексация базы знаний говорит
 * `completed` и `canceled`, действие ассистента — `success` и `cancelled`, расшифровка
 * добавляет `expired` и одиннадцать промежуточных состояний, прогон сценария — четыре
 * разных ожидания. Одно и то же состояние называется тремя словами, а отмена пишется в
 * двух орфографиях.
 *
 * Интегратору такое разнообразие означает четырёх клиентов вместо одного. Публичный API
 * отдаёт пять состояний, и каждое внутреннее отображается в одно из них.
 */

export const PUBLIC_JOB_STATUSES = ["queued", "running", "succeeded", "failed", "cancelled"] as const;

export type PublicJobStatus = (typeof PUBLIC_JOB_STATUSES)[number];

/** Задание завершилось: состояние больше не изменится, опрашивать его незачем. */
export function isTerminalJobStatus(status: PublicJobStatus): boolean {
  return status === "succeeded" || status === "failed" || status === "cancelled";
}

/**
 * Тип операции, которую представляет задание. Нужен, чтобы прочитать состояние из
 * правильного источника, и виден интегратору — по нему понятно, что именно выполняется.
 */
export const PUBLIC_JOB_KINDS = [
  "knowledge_indexing",
  "knowledge_ingestion",
  "assistant_action",
  "assistant_response",
  "transcription",
  "workflow_run",
] as const;

export type PublicJobKind = (typeof PUBLIC_JOB_KINDS)[number];

/**
 * Ожидание внешнего события — это `running`, а не отдельное состояние. Согласование,
 * задержка и ожидание ответа снаружи для вызывающего означают одно: работа идёт, ответа
 * пока нет. Промежуточные состояния видны в поле `stage`, но ветвить логику по ним не надо.
 */
const WORKFLOW_RUN_STATUS_MAP: Record<string, PublicJobStatus> = {
  queued: "queued",
  pending: "queued",
  running: "running",
  waiting_approval: "running",
  waiting_delay: "running",
  waiting_external: "running",
  waiting_debug_step: "running",
  success: "succeeded",
  error: "failed",
  cancelled: "cancelled",
};

const KNOWLEDGE_INDEXING_STATUS_MAP: Record<string, PublicJobStatus> = {
  pending: "queued",
  processing: "running",
  // Пауза индексации — это остановка по решению пространства, но работа не закончена.
  paused: "running",
  completed: "succeeded",
  failed: "failed",
  canceled: "cancelled",
};

const ASSISTANT_ACTION_STATUS_MAP: Record<string, PublicJobStatus> = {
  pending: "queued",
  running: "running",
  success: "succeeded",
  error: "failed",
  cancelled: "cancelled",
};

const TRANSCRIPTION_STATUS_MAP: Record<string, PublicJobStatus> = {
  pending: "queued",
  processing: "running",
  success: "succeeded",
  failed: "failed",
  cancelled: "cancelled",
  // Истёкшая расшифровка для вызывающего неотличима от неудачной: результата нет и не будет.
  expired: "failed",
};

/**
 * Приём файла в базу знаний: распознавание, разбор, нормализация, сохранение, нарезка и
 * индексация. Все стадии для вызывающего означают одно — работа идёт.
 *
 * `needs_attention` — терминальный отказ, а не ожидание: конвейер остановился и ждёт человека
 * в интерфейсе, автоматический путь на этом закончился. `superseded` — файл вытеснен более
 * новым источником: собственного результата у него не будет.
 */
const KNOWLEDGE_INGESTION_STATUS_MAP: Record<string, PublicJobStatus> = {
  received: "queued",
  detecting: "running",
  extracting: "running",
  normalizing: "running",
  persisting: "running",
  chunking: "running",
  indexing: "running",
  ready: "succeeded",
  ready_with_quality_notes: "succeeded",
  needs_attention: "failed",
  failed: "failed",
  canceled: "cancelled",
  superseded: "cancelled",
};

/**
 * Ответ ассистента, ушедший в фон.
 *
 * Единственный вид, у которого нет подсистемы-источника: работу выполняет сам публичный API,
 * и состояние он пишет прямо в реестр. Поэтому внутренние состояния совпадают с публичными —
 * переводить нечего.
 */
const ASSISTANT_RESPONSE_STATUS_MAP: Record<string, PublicJobStatus> = {
  queued: "queued",
  running: "running",
  succeeded: "succeeded",
  failed: "failed",
  cancelled: "cancelled",
};

const STATUS_MAPS: Record<PublicJobKind, Record<string, PublicJobStatus>> = {
  assistant_response: ASSISTANT_RESPONSE_STATUS_MAP,
  knowledge_indexing: KNOWLEDGE_INDEXING_STATUS_MAP,
  knowledge_ingestion: KNOWLEDGE_INGESTION_STATUS_MAP,
  assistant_action: ASSISTANT_ACTION_STATUS_MAP,
  transcription: TRANSCRIPTION_STATUS_MAP,
  workflow_run: WORKFLOW_RUN_STATUS_MAP,
};

/**
 * Отображает внутреннее состояние в состояние задания.
 *
 * Неизвестное значение считается `running`, а не `failed`: новое промежуточное состояние
 * во внутренней модели не должно превращать работающую операцию в проваленную. Ошибочно
 * названный успех при этом невозможен — успех и отмена перечислены явно.
 */
export function toPublicJobStatus(kind: PublicJobKind, internalStatus: string | null | undefined): PublicJobStatus {
  if (!internalStatus) {
    return "queued";
  }
  return STATUS_MAPS[kind][internalStatus.trim().toLowerCase()] ?? "running";
}

export type PublicJobErrorBody = {
  code: string;
  message: string;
};

/**
 * Задание в ответе публичного API.
 *
 * `result` и `error` взаимоисключающие: непустой результат бывает только у `succeeded`,
 * непустая ошибка — только у `failed`. Иначе интегратору пришлось бы гадать, что делать с
 * ответом, где заполнены оба поля.
 */
export type PublicJobBody = {
  id: string;
  kind: PublicJobKind;
  status: PublicJobStatus;
  workspace_id: string;
  created_at: string;
  updated_at: string;
  /** Внутреннее состояние источника — для диагностики, ветвить логику по нему не нужно. */
  stage: string | null;
  result: Record<string, unknown> | null;
  error: PublicJobErrorBody | null;
};
