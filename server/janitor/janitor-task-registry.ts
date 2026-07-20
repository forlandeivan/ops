import type { CleanupAction, CleanupCategory } from "@shared/cleanup-policies";

/**
 * Декларативный реестр задач уборки (janitor). Источник правды о наборе ресурсов
 * и дефолтах. Override-ы хранятся в БД (`cleanup_policies`) и мёржатся поверх.
 *
 * Реестр сгруппирован по доменам-владельцам (category): при будущем расколе
 * монолита на сервисы каждый домен заберёт свой срез реестра.
 *
 * Модель: на «тяжёлый» домен — ДВЕ политики: «строки запуска» (delete_rows) и
 * «логи запуска». Одна политика может чистить НЕСКОЛЬКО мест хранения лога через
 * extraOperations (напр. у ASR лог лежит и в колонке pipeline_events, и в таблице
 * asr_execution_events). Сроки/включение задаёт администратор; ниже — дефолты.
 */
export interface JanitorOperation {
  /** Целевая таблица PostgreSQL. */
  table: string;
  /** Колонка-время для отбора по возрасту (cutoff = now - retentionDays). */
  timeColumn: string;
  /** Первичный ключ для батч-отбора. */
  pkColumn: string;
  action: CleanupAction;
  /** Для action=strip_columns — какие тяжёлые колонки обнулять. */
  strippedColumns: string[];
  /** Доп. условие равенства (напр. source='autosave'); иначе null. */
  equalsFilter: { column: string; value: string } | null;
}

export interface JanitorTaskDefinition {
  /** Стабильный ключ политики, напр. "pg.asr_executions.logs". */
  key: string;
  label: string;
  description: string;
  category: CleanupCategory;
  /** Основная операция политики. */
  action: CleanupAction;
  table: string;
  timeColumn: string;
  pkColumn: string;
  strippedColumns: string[];
  equalsFilter: { column: string; value: string } | null;
  /** Дополнительные операции той же политики (другие таблицы/колонки лога). */
  extraOperations: JanitorOperation[];
  defaultRetentionDays: number;
  defaultEnabled: boolean;
  defaultBatchSize: number;
  /** Как часто задача "созревает" для прогона. */
  intervalMinutes: number;
  /** Чувствительный ресурс (требует подтверждения при включении в UI). */
  sensitive: boolean;
  /** Заметка о каскадных удалениях по FK, если применимо. */
  cascadeNote: string | null;
  /**
   * Хранилище-владелец данных: PostgreSQL (по умолчанию), объектное (S3/MinIO) или
   * векторное (Qdrant). Для "s3" оркестратор использует S3-исполнитель (tasks/s3-retention-task),
   * для "qdrant" — GC осиротевших коллекций (tasks/qdrant-orphan-gc-task),
   * для "s3_reconcile" — storage-driven reconcile (tasks/s3-feedback-attachment-orphan-task),
   * а не PG-движок.
   */
  storage?: "postgres" | "s3" | "qdrant" | "s3_reconcile";
  /** S3: префиксы mime для отбора (напр. ["audio/", "video/"]); пусто — без фильтра по типу. */
  mimePrefixes?: string[];
  /** S3: true — отбирать строки, чей mime НЕ из mimePrefixes (включая mime IS NULL). */
  mimePrefixExclude?: boolean;
  /** S3: колонка, которая должна быть NULL для отбора (напр. message_id для неотправленных черновиков). */
  isNullColumn?: string | null;
}

const DEFAULT_BATCH_SIZE = 500;
const DEFAULT_INTERVAL_MINUTES = 360;

function task(
  definition: Partial<JanitorTaskDefinition> &
    Pick<JanitorTaskDefinition, "key" | "label" | "description" | "category" | "action" | "table" | "timeColumn">,
): JanitorTaskDefinition {
  return {
    pkColumn: "id",
    strippedColumns: [],
    equalsFilter: null,
    extraOperations: [],
    defaultRetentionDays: 30,
    defaultEnabled: false,
    defaultBatchSize: DEFAULT_BATCH_SIZE,
    intervalMinutes: DEFAULT_INTERVAL_MINUTES,
    sensitive: false,
    cascadeNote: null,
    storage: "postgres",
    mimePrefixes: [],
    mimePrefixExclude: false,
    isNullColumn: null,
    ...definition,
  };
}

/** Хранилище-владелец задачи (по умолчанию PostgreSQL). */
export function storageOf(task: JanitorTaskDefinition): "postgres" | "s3" | "qdrant" | "s3_reconcile" {
  return task.storage ?? "postgres";
}

/** Полный список операций политики (основная + дополнительные). */
export function operationsOf(task: JanitorTaskDefinition): JanitorOperation[] {
  const primary: JanitorOperation = {
    table: task.table,
    timeColumn: task.timeColumn,
    pkColumn: task.pkColumn,
    action: task.action,
    strippedColumns: task.strippedColumns,
    equalsFilter: task.equalsFilter,
  };
  return [primary, ...task.extraOperations];
}

/**
 * PostgreSQL. Все политики по умолчанию выключены; включение и сроки задаёт
 * администратор. Включённая политика чистит по расписанию.
 */
export const JANITOR_TASKS: readonly JanitorTaskDefinition[] = [
  // ── LLM ────────────────────────────────────────────────────────────────
  task({
    key: "pg.assistant_execution_steps.payloads",
    label: "Логи запуска LLM",
    description:
      "Обнуляет тяжёлые данные лога шагов выполнения ассистента (input_payload / output_payload / diagnostic_info в assistant_execution_steps) старше срока хранения. Строка запуска и скелет шагов сохраняются.",
    category: "llm",
    action: "strip_columns",
    table: "assistant_execution_steps",
    timeColumn: "started_at",
    strippedColumns: ["input_payload", "output_payload", "diagnostic_info"],
  }),
  task({
    key: "pg.assistant_executions",
    label: "Строки запуска LLM (assistant_executions)",
    description:
      "Полностью удаляет строки запуска ассистента старше срока хранения (каскадно — шаги). Отдельная политика: можно держать выключенной, чтобы строки запуска не удалялись вовсе.",
    category: "llm",
    action: "delete_rows",
    table: "assistant_executions",
    timeColumn: "started_at",
    defaultEnabled: true,
    defaultRetentionDays: 30,
    sensitive: true,
    cascadeNote: "Каскадно удаляет шаги выполнения (assistant_execution_steps).",
  }),

  // ── Агент (журнал запусков агента) ────────────────────────────────────
  task({
    key: "pg.agent_execution_events.debug_payloads",
    label: "Debug-трейс запусков агента",
    description:
      "Обнуляет полные debug-данные событий журнала запусков агента (payload / truncation в agent_execution_events: LLM-сообщения раундов, скрипты, stdout) старше срока хранения. Скелет событий и summary сохраняются. Содержит тексты документов пользователей.",
    category: "agent",
    action: "strip_columns",
    table: "agent_execution_events",
    timeColumn: "created_at",
    strippedColumns: ["payload", "truncation"],
    defaultEnabled: true,
    defaultRetentionDays: 7,
    sensitive: true,
  }),
  task({
    key: "pg.agent_execution_events.logs",
    label: "Логи запусков агента",
    description:
      "Обнуляет summary событий журнала запусков агента (agent_execution_events) старше срока хранения. Строка запуска и скелет хронологии сохраняются.",
    category: "agent",
    action: "strip_columns",
    table: "agent_execution_events",
    timeColumn: "created_at",
    strippedColumns: ["summary"],
  }),
  task({
    key: "pg.agent_executions",
    label: "Строки запусков агента (agent_executions)",
    description:
      "Полностью удаляет строки журнала запусков агента старше срока хранения (каскадно — события). Отдельная политика: можно держать выключенной.",
    category: "agent",
    action: "delete_rows",
    table: "agent_executions",
    timeColumn: "started_at",
    defaultEnabled: true,
    defaultRetentionDays: 90,
    sensitive: true,
    cascadeNote: "Каскадно удаляет события журнала (agent_execution_events).",
  }),

  // ── ASR ────────────────────────────────────────────────────────────────
  task({
    key: "pg.asr_executions.logs",
    label: "Логи запуска ASR",
    description:
      "Обнуляет тяжёлые данные лога ASR старше срока хранения сразу в двух местах: колонка pipeline_events в asr_executions и details в событиях asr_execution_events. Строки запуска и скелет событий сохраняются.",
    category: "asr",
    action: "strip_columns",
    table: "asr_executions",
    timeColumn: "created_at",
    strippedColumns: ["pipeline_events"],
    extraOperations: [
      {
        table: "asr_execution_events",
        timeColumn: "occurred_at",
        pkColumn: "id",
        action: "strip_columns",
        strippedColumns: ["details"],
        equalsFilter: null,
      },
    ],
  }),
  task({
    key: "pg.asr_executions",
    label: "Строки запуска ASR (asr_executions)",
    description:
      "Полностью удаляет строки запуска ASR старше срока хранения (каскадно — события). Отдельная политика: можно держать выключенной.",
    category: "asr",
    action: "delete_rows",
    table: "asr_executions",
    timeColumn: "created_at",
    defaultRetentionDays: 180,
    sensitive: true,
    cascadeNote: "Каскадно удаляет события ASR (asr_execution_events).",
  }),

  // ── Знания (индексация) ─────────────────────────────────────────────────────
  task({
    key: "pg.knowledge_base_indexing_actions",
    label: "Журнал индексации БЗ (knowledge_base_indexing_actions)",
    description:
      "Удаляет записи журнала индексации баз знаний (история на странице «История индексации») старше срока хранения. На каждую операцию создаётся запись — таблица растёт неограниченно.",
    category: "knowledge",
    action: "delete_rows",
    table: "knowledge_base_indexing_actions",
    timeColumn: "created_at",
    defaultRetentionDays: 90,
  }),

  // ── Логи / события ───────────────────────────────────────────────────────
  task({
    key: "pg.mcp_execution_logs",
    label: "Логи выполнения MCP-инструментов",
    description: "Удаляет записи mcp_execution_logs старше срока хранения.",
    category: "logs",
    action: "delete_rows",
    table: "mcp_execution_logs",
    timeColumn: "created_at",
  }),
  task({
    key: "pg.action_executions",
    label: "Выполнения действий (action_executions)",
    description: "Удаляет записи о выполнении действий старше срока хранения.",
    category: "events",
    action: "delete_rows",
    table: "action_executions",
    timeColumn: "started_at",
  }),
  task({
    key: "pg.guard_block_events",
    label: "События блокировок лимитов (guard_block_events)",
    description: "Удаляет события срабатывания лимитов старше срока хранения.",
    category: "events",
    action: "delete_rows",
    table: "guard_block_events",
    timeColumn: "created_at",
  }),
  task({
    key: "pg.external_trigger_receipts",
    label: "Входящие внешние события (external_trigger_receipts)",
    description: "Удаляет квитанции о приёме внешних событий старше срока хранения.",
    category: "events",
    action: "delete_rows",
    table: "external_trigger_receipts",
    timeColumn: "created_at",
  }),
  task({
    key: "pg.external_trigger_deliveries",
    label: "Исходящие доставки во внешние системы (external_trigger_deliveries)",
    description: "Удаляет записи о доставках во внешние системы старше срока хранения.",
    category: "events",
    action: "delete_rows",
    table: "external_trigger_deliveries",
    timeColumn: "created_at",
  }),
  task({
    key: "pg.assistant_workflow_run_events",
    label: "События шагов workflow (assistant_workflow_run_events)",
    description: "Удаляет события выполнения workflow-шагов старше срока хранения.",
    category: "events",
    action: "delete_rows",
    table: "assistant_workflow_run_events",
    timeColumn: "created_at",
  }),

  // ── Аудит ────────────────────────────────────────────────────────────────
  task({
    key: "pg.workflow_audit_log",
    label: "Аудит workflow (workflow_audit_log)",
    description: "Удаляет аудит-записи изменений workflow старше срока хранения.",
    category: "audit",
    action: "delete_rows",
    table: "workflow_audit_log",
    timeColumn: "created_at",
    defaultRetentionDays: 90,
  }),
  task({
    key: "pg.permission_audit_log",
    label: "Аудит прав (permission_audit_log)",
    description: "Удаляет аудит-записи RBAC старше срока хранения.",
    category: "audit",
    action: "delete_rows",
    table: "permission_audit_log",
    timeColumn: "created_at",
    defaultRetentionDays: 90,
  }),
  task({
    key: "pg.feature_access_audit_log",
    label: "Аудит доступа к фичам (feature_access_audit_log)",
    description: "Удаляет аудит-записи доступа к фичам старше срока хранения.",
    category: "audit",
    action: "delete_rows",
    table: "feature_access_audit_log",
    timeColumn: "created_at",
    defaultRetentionDays: 90,
  }),
  task({
    key: "pg.maintenance_mode_audit_log",
    label: "Аудит режима обслуживания (maintenance_mode_audit_log)",
    description: "Удаляет аудит-записи режима обслуживания старше срока хранения.",
    category: "audit",
    action: "delete_rows",
    table: "maintenance_mode_audit_log",
    timeColumn: "occurred_at",
    defaultRetentionDays: 90,
  }),
  task({
    key: "pg.system_notification_logs",
    label: "Логи системных уведомлений (system_notification_logs)",
    description: "Удаляет логи отправленных уведомлений старше срока хранения.",
    category: "logs",
    action: "delete_rows",
    table: "system_notification_logs",
    timeColumn: "created_at",
    defaultEnabled: true,
    defaultRetentionDays: 90,
  }),
  task({
    key: "pg.document_revisions.autosave",
    label: "Автосохранения документов (document_revisions, source=autosave)",
    description:
      "Удаляет автосохранённые ревизии документов старше срока хранения. Пользовательские ревизии не трогаются (фильтр source='autosave').",
    category: "content",
    action: "delete_rows",
    table: "document_revisions",
    timeColumn: "created_at",
    defaultEnabled: true,
    equalsFilter: { column: "source", value: "autosave" },
  }),

  // ── Токены / сессии (отбор по сроку годности) ──────────────────────────────
  task({
    key: "pg.expired_tokens_sessions",
    label: "Токены и сессии (истёкшие)",
    description:
      "Удаляет истёкшие токены подтверждения email, токены сброса пароля и HTTP-сессии (отбор по сроку годности — старше N дней после истечения). Одна политика на все три таблицы.",
    category: "tokens",
    action: "delete_rows",
    table: "email_confirmation_tokens",
    timeColumn: "expires_at",
    defaultRetentionDays: 7,
    extraOperations: [
      {
        table: "password_reset_tokens",
        timeColumn: "expires_at",
        pkColumn: "id",
        action: "delete_rows",
        strippedColumns: [],
        equalsFilter: null,
      },
      {
        table: "session",
        timeColumn: "expire",
        pkColumn: "sid",
        action: "delete_rows",
        strippedColumns: [],
        equalsFilter: null,
      },
    ],
  }),

  // ── Служебное ──────────────────────────────────────────────────────────────
  task({
    key: "pg.cleanup_run_log",
    label: "Журнал прогонов уборщика (cleanup_run_log)",
    description: "Удаляет старые записи журнала прогонов janitor старше срока хранения.",
    category: "meta",
    action: "delete_rows",
    table: "cleanup_run_log",
    timeColumn: "started_at",
    defaultRetentionDays: 90,
  }),

  // ── Хранилище (вложения чата в MinIO/S3) ────────────────────────────────────
  // Политики удаляют тяжёлый файл из объектного хранилища, обнуляют адрес в строке
  // chat_attachments (storage_key и производные), но строку и транскрипт сохраняют.
  task({
    key: "s3.chat_attachments.drafts",
    label: "Неотправленные черновики вложений чата",
    description:
      "Удаляет файлы вложений, которые загрузили в чат, но так и не отправили в сообщении (message_id пуст), старше срока хранения. Поглощает прежний фоновый джоб уборки черновиков. Адрес в строке обнуляется, строка сохраняется.",
    category: "storage",
    storage: "s3",
    action: "delete_object",
    table: "chat_attachments",
    timeColumn: "created_at",
    strippedColumns: ["storage_key", "preview_object_key", "derived_manifest_object_key"],
    isNullColumn: "message_id",
    defaultEnabled: true,
    defaultRetentionDays: 1,
    defaultBatchSize: 100,
    intervalMinutes: 360,
  }),
  task({
    key: "s3.chat_attachments.audio_video",
    label: "Аудио/видео чата",
    description:
      "Удаляет аудио- и видео-файлы вложений чата (mime audio/* и video/*) старше срока хранения. Транскрипт и текст сохраняются — удаляется только тяжёлый медиафайл. Срок задаёт администратор.",
    category: "storage",
    storage: "s3",
    action: "delete_object",
    table: "chat_attachments",
    timeColumn: "created_at",
    strippedColumns: ["storage_key", "preview_object_key", "derived_manifest_object_key"],
    mimePrefixes: ["audio/", "video/"],
    defaultRetentionDays: 30,
    defaultBatchSize: 100,
    intervalMinutes: 360,
  }),
  task({
    key: "s3.chat_attachments.other",
    label: "Прочие вложения чата",
    description:
      "Удаляет прочие вложения чата (документы, изображения и т.п. — всё, кроме audio/* и video/*) старше срока хранения. Извлечённый текст сохраняется. Срок задаёт администратор.",
    category: "storage",
    storage: "s3",
    action: "delete_object",
    table: "chat_attachments",
    timeColumn: "created_at",
    strippedColumns: ["storage_key", "preview_object_key", "derived_manifest_object_key"],
    mimePrefixes: ["audio/", "video/"],
    mimePrefixExclude: true,
    defaultRetentionDays: 90,
    defaultBatchSize: 100,
    intervalMinutes: 360,
  }),
  task({
    key: "s3.chat_feedback_attachments.drafts",
    label: "Неотправленные скриншоты отзывов",
    description:
      "Удаляет скриншоты, которые загрузили к отзыву (лайк/дизлайк или «Оставить отзыв»), но так и не отправили (feedback_id пуст), старше срока хранения. Адрес в строке обнуляется, строка сохраняется.",
    category: "storage",
    storage: "s3",
    action: "delete_object",
    table: "chat_feedback_attachments",
    timeColumn: "created_at",
    strippedColumns: ["storage_key"],
    isNullColumn: "feedback_id",
    defaultRetentionDays: 7,
    defaultBatchSize: 100,
    intervalMinutes: 360,
  }),
  task({
    key: "s3.chat_feedback_attachments.orphans",
    label: "Осиротевшие скриншоты отзывов (без строки в БД)",
    description:
      "Удаляет объекты MinIO с префиксом `feedback-attachments/`, у которых нет соответствующей строки в `chat_feedback_attachments`. Такие объекты остаются после каскадного удаления пользователя-загрузчика (uploader_user_id CASCADE). Объекты удаляются только если LastModified старше grace-периода (поле «Срок, дней»); `dry_run` считает без удаления. Черновики с living DB-строкой не затрагиваются.",
    category: "storage",
    storage: "s3_reconcile",
    action: "delete_object",
    table: "chat_feedback_attachments",
    timeColumn: "created_at",
    defaultRetentionDays: 7,
    defaultBatchSize: 200,
    intervalMinutes: 1440,
  }),

  // ── Векторное хранилище (Qdrant) ────────────────────────────────────────────
  // GC осиротевших коллекций Qdrant: удаляет коллекции, не связанные ни с одной БЗ/
  // ассистентом в БД (после неудачных удалений БЗ, каскадов при удалении пространства,
  // сбоев уборки арены). Удаляется только то, что числится сиротой дольше grace-периода
  // (поле «Срок, дней»). В конце прогона оживляется reconcile usage. См.
  // server/janitor/tasks/qdrant-orphan-gc-task.ts.
  task({
    key: "qdrant.orphaned_collections",
    label: "Осиротевшие коллекции Qdrant",
    description:
      "Удаляет коллекции Qdrant, не связанные ни с одной базой знаний или ассистентом в БД (остаются после неудачных удалений БЗ, удаления пространств и сбоев индексации). Удаляется только то, что непрерывно числится сиротой дольше grace-периода (поле «Срок, дней»). Топология коллекций не меняется, векторы не перекладываются.",
    category: "vector",
    storage: "qdrant",
    action: "delete_collection",
    table: "qdrant_orphan_candidates", // для валидации реестра; PG-движок для этой задачи не вызывается
    timeColumn: "first_seen_at",
    defaultEnabled: false,
    defaultRetentionDays: 3, // grace, дней
    defaultBatchSize: 25, // максимум коллекций к удалению за прогон
    intervalMinutes: 1440, // 1×/сутки
    sensitive: true,
    cascadeNote: "Удаляет данные из Qdrant безвозвратно. Первый прод-прогон рекомендуется делать через «Предпросмотр».",
  }),

  // ── Ассистенты и чаты ───────────────────────────────────────────────────────
  // Доменная группа «Ассистенты и чаты»: физическое удаление ассистентов из архива
  // и purge мягко-удалённых чатов. Обе задачи чувствительные и по умолчанию выключены —
  // архив служит «корзиной» (есть restore), удаление необратимо.
  task({
    key: "pg.assistants.archived",
    label: "Архивные ассистенты (physical purge)",
    description:
      "Физически удаляет ассистентов из архива (status='archived') старше срока хранения. Активные и системные ассистенты не трогаются (системные нельзя архивировать). Срок отсчитывается от последнего изменения строки (фактически — момента архивации: у ассистента нет отдельной колонки archived_at). Каскадно удаляет все данные ассистента; тяжёлые файлы в MinIO и коллекция в Qdrant остаются сиротами до профильных GC-политик. Выключена по умолчанию.",
    category: "assistants",
    action: "delete_rows",
    table: "assistants",
    timeColumn: "updated_at",
    equalsFilter: { column: "status", value: "archived" },
    defaultEnabled: false,
    defaultRetentionDays: 90,
    defaultBatchSize: 50,
    intervalMinutes: 1440,
    sensitive: true,
    cascadeNote:
      "Каскадно удаляет ВСЕ данные ассистента: чаты (сообщения, карточки, вложения, транскрипты), файлы-метаданные, действия, привязки навыков, прогоны и события workflow. Объекты MinIO и коллекция Qdrant остаются сиротами до политик «Осиротевшие коллекции Qdrant» и storage-реконсиляции. Действие необратимо.",
  }),
  task({
    key: "pg.chat_sessions",
    label: "Удалённые чаты (physical purge soft-deleted)",
    description:
      "Физически удаляет чаты, помеченные удалёнными (deleted_at), старше срока хранения. Активные чаты не трогаются. Каскадно удаляет сообщения, карточки, вложения и транскрипты.",
    category: "assistants",
    action: "delete_rows",
    table: "chat_sessions",
    timeColumn: "deleted_at",
    sensitive: true,
    cascadeNote: "Каскадно удаляет сообщения, карточки, вложения и транскрипты чата.",
  }),
] as const;

export function getJanitorTask(key: string): JanitorTaskDefinition | undefined {
  return JANITOR_TASKS.find((item) => item.key === key);
}
