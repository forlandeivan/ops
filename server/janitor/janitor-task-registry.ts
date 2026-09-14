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
  /**
   * Двухфазный purge: перед удалением корней дренировать их дочерние chat_sessions
   * порциями по batchSize чатов за стейтмент (фаза A), а корни удалять только когда
   * чатов не осталось (фаза B, batchSize = корней за стейтмент). Ограничивает объём
   * каждого стейтмента независимо от размера каскада одного корня.
   */
  drainChildrenFirst?: boolean;
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
  /** См. JanitorOperation.drainChildrenFirst (двухфазный purge основной операции). */
  drainChildrenFirst?: boolean;
  /**
   * Хранилище-владелец данных: PostgreSQL (по умолчанию), объектное (S3/MinIO) или
   * векторное (Qdrant). Для "s3" оркестратор использует S3-исполнитель (tasks/s3-retention-task),
   * для "qdrant" — GC осиротевших коллекций (tasks/qdrant-orphan-gc-task),
   * для "s3_reconcile" — сверку содержимого бакетов с базой (tasks/storage-orphan-task),
   * а не PG-движок.
   */
  storage?: "postgres" | "s3" | "qdrant" | "s3_reconcile";
  /** S3: префиксы mime для отбора (напр. ["audio/", "video/"]); пусто — без фильтра по типу. */
  mimePrefixes?: string[];
  /** S3: true — отбирать строки, чей mime НЕ из mimePrefixes (включая mime IS NULL). */
  mimePrefixExclude?: boolean;
  /** S3: колонка, которая должна быть NULL для отбора (напр. message_id для неотправленных черновиков). */
  isNullColumn?: string | null;
  /**
   * `table` — синтетический идентификатор набора объектов в хранилище, а НЕ таблица БД.
   * Ставится только для storage-driven задач (`s3_reconcile`), у которых строки-владельца
   * в базе не осталось или отбор идёт целиком по содержимому хранилища: реконсиляция по
   * префиксу сравнивает бакет сам с собой, PG по этому имени не читается и не пишется.
   * Такие имена не участвуют в контракте «реестр ↔ shared/schema»: миграции под них не
   * заводятся, и таблицы с таким именем в схеме быть не должно. Задачи с реальной
   * таблицей-владельцем (напр. s3.chat_attachments.other) флаг НЕ ставят —
   * контракт обязан ловить у них переименование колонок.
   */
  virtualTable?: boolean;
  /**
   * Прогон идёт в фоне: предпросмотр и ручной запуск отвечают сразу, журнал получает строку
   * со статусом running и обновляет отчёт по ходу. Для долгой сверки хранилища, которая не
   * укладывается в синхронный вызов из админки.
   */
  backgroundRun?: boolean;
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
    virtualTable: false,
    backgroundRun: false,
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
    drainChildrenFirst: task.drainChildrenFirst,
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

  // ── Проверка достоверности ответов (docs/rag-answer-quality-metrics-strategy-2026-09.md) ──
  task({
    key: "pg.chat_answer_quality.claims",
    label: "Утверждения проверок достоверности",
    description:
      "Обнуляет детализацию утверждений (claims) в проверках достоверности ответов старше срока хранения. Строка проверки, вердикт и оценки сохраняются для статистики.",
    category: "llm",
    action: "strip_columns",
    table: "chat_answer_quality",
    timeColumn: "created_at",
    strippedColumns: ["claims"],
    defaultEnabled: true,
    defaultRetentionDays: 90,
  }),
  task({
    key: "pg.chat_answer_quality",
    label: "Строки проверок достоверности (chat_answer_quality)",
    description:
      "Полностью удаляет проверки достоверности ответов старше срока хранения. Суточные срезы (chat_answer_quality_stats_day) не затрагиваются, отметки в сообщениях чата остаются.",
    category: "llm",
    action: "delete_rows",
    table: "chat_answer_quality",
    timeColumn: "created_at",
    defaultEnabled: true,
    defaultRetentionDays: 400,
  }),
  task({
    key: "pg.chat_answer_quality_jobs",
    label: "Выполненные задания проверок достоверности (chat_answer_quality_jobs)",
    description:
      "Удаляет выполненные задания очереди проверки достоверности старше срока хранения. Ожидающие, выполняющиеся и сбойные задания не трогает — их закрывает сам воркер.",
    category: "llm",
    action: "delete_rows",
    table: "chat_answer_quality_jobs",
    timeColumn: "updated_at",
    equalsFilter: { column: "status", value: "done" },
    defaultEnabled: true,
    defaultRetentionDays: 7,
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

  // ── Публичный API ─────────────────────────────────────────────────────────
  // Реестр заданий и ключи повтора росли бессрочно: ни одна политика на эти таблицы
  // не ссылалась. У интегратора с постоянной нагрузкой рост линейный и ничем не
  // ограниченный, а в ключах лежат ещё и сохранённые тела ответов.
  task({
    key: "pg.public_api_jobs",
    label: "Задания публичного API (public_api_jobs)",
    description:
      "Удаляет записи реестра заданий публичного API старше срока хранения. Задание нужно вызывающему, пока он опрашивает его состояние; дальше это след вызова.",
    category: "logs",
    action: "delete_rows",
    table: "public_api_jobs",
    timeColumn: "created_at",
    defaultEnabled: true,
    defaultRetentionDays: 90,
  }),
  task({
    key: "pg.public_api_usage_day",
    label: "Учёт активности публичного API (public_api_usage_day)",
    description:
      "Удаляет суточные вёдра учёта вызовов публичного API старше срока хранения. Год с запасом закрывает вопрос «кто ходил прошлой осенью»; дальше это балласт, восстановить его неоткуда и незачем.",
    category: "logs",
    action: "delete_rows",
    table: "public_api_usage_day",
    timeColumn: "day",
    defaultEnabled: true,
    defaultRetentionDays: 400,
  }),
  task({
    key: "pg.public_api_idempotency_keys",
    label: "Ключи идемпотентности публичного API (public_api_idempotency_keys)",
    description:
      "Удаляет истёкшие ключи повтора вместе с сохранёнными телами ответов — отбор по сроку годности, старше N дней после истечения.",
    category: "tokens",
    action: "delete_rows",
    table: "public_api_idempotency_keys",
    timeColumn: "expires_at",
    defaultEnabled: true,
    defaultRetentionDays: 7,
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
      "Ставит в durable-очередь удаление канонического объекта MinIO, производных и Files-копии для audio/video старше срока. Активные ASR-задачи пропускаются; транскрипт, текст и история сохраняются.",
    category: "storage",
    storage: "s3",
    action: "delete_object",
    table: "chat_attachments",
    timeColumn: "created_at",
    strippedColumns: ["storage_key", "preview_object_key", "derived_manifest_object_key"],
    mimePrefixes: ["audio/", "video/"],
    defaultEnabled: false,
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
    key: "s3.ingest_sources.workdir",
    label: "Рабочие файлы конвейера приёма (ingest/)",
    description:
      "Удаляет промежуточные рабочие файлы конвейера приёма (префикс ingest/) для источников в терминальном статусе старше срока хранения (отсчёт от terminal_at). Удаляются ТОЛЬКО объекты под ingest/ — оригиналы файлов и кэш разбора canonical/ этой политикой не затрагиваются: кэш адресуется содержимым, по возрасту не удаляется (иначе каждый реиндекс возвращает повторный OCR) и живёт до удаления пространства.",
    category: "storage",
    storage: "s3",
    action: "delete_object",
    table: "ingest_sources",
    timeColumn: "terminal_at",
    strippedColumns: ["blob_key"],
    defaultEnabled: true,
    defaultRetentionDays: 7,
    defaultBatchSize: 100,
    intervalMinutes: 360,
  }),
  // ── Файлы-сироты: единая сверка хранилища с базой ─────────────────────────────
  // Заменила четыре сверки по отдельным папкам (скриншоты отзывов, ingest/, canonical/,
  // старые импорты). Какие колонки базы владеют файлами каждой папки, описывает
  // shared/storage-ownership.ts; исполнитель в ops сравнивает с этой картой все бакеты
  // пространств. Прогон идёт в фоне: сверка терабайтного хранилища занимает минуты.
  task({
    key: "s3.storage.orphans",
    label: "Файлы-сироты в хранилище",
    description:
      "Сравнивает содержимое бакетов всех пространств с базой и удаляет файлы, на которые не ссылается ни одна запись, если они старше срока (поле «Срок, дней» — возраст файла). Бакеты удалённых пространств очищаются целиком. Незнакомые и защищённые папки попадают только в отчёт. Проверка идёт в фоне и собирает отчёт по категориям.",
    category: "storage",
    storage: "s3_reconcile",
    action: "delete_object",
    table: "storage_orphan_objects", // синтетический идентификатор набора объектов: сирота — объект без строки-владельца
    virtualTable: true,
    timeColumn: "last_modified",
    defaultEnabled: false,
    defaultRetentionDays: 7, // возраст файла: свежий объект мог ещё не получить свою строку в базе
    defaultBatchSize: 500, // ключей в одном задании удаления; больше 1000 исполнитель не принимает
    intervalMinutes: 1440,
    sensitive: true,
    backgroundRun: true,
    cascadeNote:
      "Удаляет файлы безвозвратно. Файлы моложе срока, незнакомые папки, кэш разбора canonical/ и шаблоны workflow не удаляются никогда.",
  }),

  // ── Артефакты конвейера приёма (волна 4/E13) ────────────────────────────────
  task({
    key: "s3.ingest_frames",
    label: "Ключевые кадры видео (frames/)",
    description:
      "Удаляет ключевые кадры видео под frames/ для источников в терминальном статусе старше срока хранения (отсчёт от terminal_at). Кадры нужны в первые дни работы с материалом; после удаления пересчитываются из сохранённого оригинала по требованию.",
    category: "storage",
    storage: "s3",
    action: "delete_object",
    table: "ingest_sources",
    timeColumn: "terminal_at",
    defaultEnabled: true,
    defaultRetentionDays: 30,
    defaultBatchSize: 100,
    intervalMinutes: 1440,
    cascadeNote:
      "Цитата по видео после удаления кадра показывает кадр не мгновенно, а после пересчёта из оригинала.",
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
      "Физически удаляет ассистентов из архива (status='archived') старше срока хранения — в два шага: сначала чаты кандидата дренируются порциями (вложения каждой порции атомарно ставятся в durable file-cleanup очередь), затем удаляется сам ассистент, когда чатов не осталось. Активные и системные ассистенты не трогаются; ассистент с активной ASR откладывается. Выключена по умолчанию.",
    category: "assistants",
    action: "delete_rows",
    table: "assistants",
    timeColumn: "updated_at",
    equalsFilter: { column: "status", value: "archived" },
    drainChildrenFirst: true,
    defaultEnabled: false,
    defaultRetentionDays: 90,
    defaultBatchSize: 50,
    intervalMinutes: 1440,
    sensitive: true,
    cascadeNote:
      "Двухфазный purge: сначала порциями удаляются ВСЕ чаты ассистента (размер батча = чатов за стейтмент; их вложения фиксируются в durable cleanup-очереди), затем каскадно удаляется сам ассистент, оставшийся без чатов (размер батча = ассистентов за стейтмент). Активная ASR блокирует purge кандидата. Коллекция Qdrant остаётся до профильного GC. Действие необратимо.",
  }),
  task({
    key: "pg.chat_sessions",
    label: "Удалённые чаты (physical purge soft-deleted)",
    description:
      "Физически удаляет чаты, помеченные удалёнными (deleted_at), старше срока хранения. Перед каскадом snapshots вложений атомарно ставятся в durable file-cleanup очередь. Чаты с активной ASR откладываются.",
    category: "assistants",
    action: "delete_rows",
    table: "chat_sessions",
    timeColumn: "deleted_at",
    sensitive: true,
    cascadeNote:
      "Каскадно удаляет сообщения, карточки, вложения и транскрипты; MinIO/Files очищает durable worker по сохранённым snapshots.",
  }),
] as const;

export function getJanitorTask(key: string): JanitorTaskDefinition | undefined {
  return JANITOR_TASKS.find((item) => item.key === key);
}
