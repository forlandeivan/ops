/**
 * Карта владения объектами бакета пространства — общий контракт монолита и сервиса уборки
 * `unica-ops` (зеркалится в ops-репо, гейт `verify:ops-schema-mirror`).
 *
 * Политика «Файлы-сироты в хранилище» сравнивает содержимое бакетов с базой по этой карте.
 * Объект живой, если на его ключ ссылается строка из `references` или в его пути стоит id
 * существующей строки из `pathOwners`. Папки вне карты и папки с режимом `protected` только
 * попадают в отчёт и не удаляются никогда.
 *
 * Новая колонка с ключом файла обязана попасть сюда. Тест-контракт
 * `tests/storage-ownership-contract.test.ts` находит такие колонки в схеме и падает, если
 * колонка не описана: иначе живые файлы, на которые ссылается новая колонка, проверка сочла бы
 * сиротами.
 */

export const storageOrphanCategories = [
  "chat_attachments",
  "knowledge_images",
  "knowledge_originals",
  "ingest_workdir",
  "derived_assets",
  "feedback_screenshots",
  "workspace_icons",
  "legacy_imports",
] as const;
export type StorageOrphanCategory = (typeof storageOrphanCategories)[number];

/**
 * `reconcile` — объект без ссылки из базы считается сиротой; `orphan_all` — у папки нет
 * владельцев вовсе, всё в ней остатки; `protected` — папку не трогаем, только считаем.
 */
export type StoragePrefixMode = "reconcile" | "orphan_all" | "protected";

/** Колонка, в которой лежит полный ключ объекта. */
export interface StorageKeyReference {
  table: string;
  column: string;
  /** Колонка пространства для отбора; null — пространство берётся через `workspaceVia`. */
  workspaceColumn: string | null;
  /** Пространство через родительскую строку: `localColumn` ссылается на `id` таблицы `table`. */
  workspaceVia?: { table: string; localColumn: string; workspaceColumn: string };
}

/** Объект принадлежит строке, id которой стоит в пути (первая группа захвата). */
export interface StoragePathOwner {
  pattern: string;
  table: string;
  column: string;
  workspaceColumn: string | null;
}

export interface StoragePrefixOwnership {
  prefix: string;
  /** Категория отчёта; null — папка защищена и в сироты не попадает. */
  category: StorageOrphanCategory | null;
  mode: StoragePrefixMode;
  references: readonly StorageKeyReference[];
  pathOwners: readonly StoragePathOwner[];
  note: string;
}

/**
 * Папки бакета пространства, в которые платформа пишет через workspace-storage-service
 * (белый список `ensureAllowedPrefix`).
 */
export const WORKSPACE_STORAGE_WRITABLE_PREFIXES = [
  "icons/",
  "files/",
  "workflow-templates/",
  "attachments/",
  "chat-attachments/",
  "feedback-attachments/",
  "json-imports/",
  "archive-imports/",
  "document-imports/",
  "knowledge-upload-sessions/",
  // Конвейер приёма (Э0/C12): ingest/<sourceId>/ — рабочие файлы стадий (janitor чистит
  // через 7 дней после терминала источника); canonical/<sha256>/<parser>.udoc.json.gz —
  // кэш артефакта парсинга, адресуется содержимым и по возрасту НЕ удаляется (иначе
  // каждый реиндекс возвращает повторный OCR) — живёт до удаления пространства.
  "ingest/",
  "canonical/",
  // Постоянные content-addressed assets, произведённые ingestion. В отличие от
  // ingest/ они живут, пока на blob ссылается хотя бы один источник workspace.
  "derived-assets/",
  // frames/<sourceId>/<tMs>.jpg — ключевые кадры видео (волна 6/M13); политика уборки —
  // janitor s3.ingest_frames (E13), 30 дней с автоудалением, пересчёт из оригинала.
  "frames/",
] as const;

/** Папки, которые пишутся мимо белого списка: картинки баз знаний image-storage кладёт сырым putObject. */
export const WORKSPACE_STORAGE_UNLISTED_PREFIXES = ["kb-images/"] as const;

const CHAT_ATTACHMENT_KEYS: readonly StorageKeyReference[] = [
  { table: "chat_attachments", column: "storage_key", workspaceColumn: "workspace_id" },
  { table: "chat_attachments", column: "preview_object_key", workspaceColumn: "workspace_id" },
  { table: "chat_attachments", column: "derived_manifest_object_key", workspaceColumn: "workspace_id" },
];

/** Загруженный файл: на один объект могут ссылаться источник приёма, файл ассистента, файл API и вложение. */
const UPLOADED_FILE_KEYS: readonly StorageKeyReference[] = [
  { table: "files", column: "object_key", workspaceColumn: "workspace_id" },
  { table: "assistant_files", column: "storage_key", workspaceColumn: "workspace_id" },
  { table: "ingest_sources", column: "blob_key", workspaceColumn: "workspace_id" },
  {
    table: "knowledge_upload_session_items",
    column: "storage_key",
    workspaceColumn: null,
    workspaceVia: { table: "knowledge_upload_sessions", localColumn: "session_id", workspaceColumn: "workspace_id" },
  },
];

const LEGACY_IMPORT_NOTE =
  "Исходники трёх конвейеров импорта, снесённых волной 8: таблицы-владельцы удалены миграцией 0320.";

export const WORKSPACE_STORAGE_OWNERSHIP: readonly StoragePrefixOwnership[] = [
  {
    prefix: "chat-attachments/",
    category: "chat_attachments",
    mode: "reconcile",
    references: [...CHAT_ATTACHMENT_KEYS, ...UPLOADED_FILE_KEYS],
    pathOwners: [
      {
        pattern: "^chat-attachments/assistants/[^/]+/chats/[^/]+/attachments/([^/]+)/",
        table: "chat_attachments",
        column: "id",
        workspaceColumn: "workspace_id",
      },
    ],
    note: "Оригиналы вложений чата и их производные: превью, шарды и манифест лежат в папке вложения.",
  },
  {
    prefix: "attachments/",
    category: "chat_attachments",
    mode: "reconcile",
    references: [...CHAT_ATTACHMENT_KEYS, ...UPLOADED_FILE_KEYS],
    pathOwners: [],
    note: "Файлы, которые создали агент и workflow.",
  },
  {
    prefix: "kb-images/",
    category: "knowledge_images",
    mode: "reconcile",
    references: [{ table: "knowledge_document_images", column: "storage_key", workspaceColumn: "workspace_id" }],
    pathOwners: [],
    note: "Картинки документов баз знаний.",
  },
  {
    prefix: "knowledge-upload-sessions/",
    category: "knowledge_originals",
    mode: "reconcile",
    references: [...UPLOADED_FILE_KEYS, ...CHAT_ATTACHMENT_KEYS],
    pathOwners: [],
    note: "Загруженные файлы: оригиналы документов, файлы ассистентов, крупные медиа чата.",
  },
  {
    prefix: "files/",
    category: "knowledge_originals",
    mode: "reconcile",
    references: [...UPLOADED_FILE_KEYS, ...CHAT_ATTACHMENT_KEYS],
    pathOwners: [],
    note: "Файлы ассистентов и публичного API.",
  },
  {
    prefix: "ingest/",
    category: "ingest_workdir",
    mode: "reconcile",
    references: [{ table: "ingest_sources", column: "blob_key", workspaceColumn: "workspace_id" }],
    pathOwners: [
      { pattern: "^ingest/([^/]+)/", table: "ingest_sources", column: "id", workspaceColumn: "workspace_id" },
    ],
    note: "Рабочие файлы конвейера приёма: папка источника живёт, пока жива его строка.",
  },
  {
    prefix: "frames/",
    category: "ingest_workdir",
    mode: "reconcile",
    references: [],
    pathOwners: [
      { pattern: "^frames/([^/]+)/", table: "ingest_sources", column: "id", workspaceColumn: "workspace_id" },
    ],
    note: "Ключевые кадры видео источника.",
  },
  {
    prefix: "derived-assets/",
    category: "derived_assets",
    mode: "reconcile",
    references: [
      { table: "ingest_asset_blobs", column: "storage_key", workspaceColumn: "workspace_id" },
      { table: "knowledge_document_images", column: "storage_key", workspaceColumn: "workspace_id" },
    ],
    pathOwners: [],
    note: "Общие картинки конвейера приёма, живут, пока есть строка блоба.",
  },
  {
    prefix: "feedback-attachments/",
    category: "feedback_screenshots",
    mode: "reconcile",
    references: [{ table: "chat_feedback_attachments", column: "storage_key", workspaceColumn: "workspace_id" }],
    pathOwners: [],
    note: "Скриншоты к отзывам.",
  },
  {
    prefix: "icons/",
    category: "workspace_icons",
    mode: "reconcile",
    references: [{ table: "workspaces", column: "icon_key", workspaceColumn: "id" }],
    pathOwners: [],
    note: "Иконка пространства; при смене формата прежний файл остаётся.",
  },
  {
    prefix: "json-imports/",
    category: "legacy_imports",
    mode: "orphan_all",
    references: [],
    pathOwners: [],
    note: LEGACY_IMPORT_NOTE,
  },
  {
    prefix: "archive-imports/",
    category: "legacy_imports",
    mode: "orphan_all",
    references: [],
    pathOwners: [],
    note: LEGACY_IMPORT_NOTE,
  },
  {
    prefix: "document-imports/",
    category: "legacy_imports",
    mode: "orphan_all",
    references: [],
    pathOwners: [],
    note: LEGACY_IMPORT_NOTE,
  },
  {
    prefix: "canonical/",
    category: null,
    mode: "protected",
    references: [],
    pathOwners: [],
    note: "Кэш разбора адресуется содержимым: его потеря означает повторный платный OCR при реиндексе.",
  },
  {
    prefix: "workflow-templates/",
    category: null,
    mode: "protected",
    references: [],
    pathOwners: [],
    note: "На шаблоны ссылаются настройки узлов workflow внутри JSON, отдельной колонки с ключом нет.",
  },
];

/** Колонки с «ключом» в имени, которые не ссылаются на объекты бакета пространства. */
export const STORAGE_KEY_COLUMNS_OUTSIDE_WORKSPACE_OBJECTS: readonly {
  table: string;
  column: string;
  reason: string;
}[] = [
  { table: "users", column: "avatar_key", reason: "аватары лежат в глобальном бакете user-avatars" },
  { table: "workspaces", column: "storage_bucket", reason: "имя бакета, а не ключ объекта" },
  { table: "knowledge_document_images", column: "storage_bucket", reason: "имя бакета, а не ключ объекта" },
  { table: "ingest_asset_blobs", column: "storage_bucket", reason: "имя бакета, а не ключ объекта" },
  {
    table: "ingest_sources",
    column: "canonical_key",
    reason: "адрес кэша разбора; папка canonical/ защищена и не удаляется",
  },
  { table: "assistant_workflow_run_events", column: "icon_key", reason: "имя иконки интерфейса, а не файл" },
];

/** Правило для ключа объекта: самый длинный подходящий префикс; null — папка не описана. */
export function resolveStoragePrefixOwnership(key: string): StoragePrefixOwnership | null {
  let best: StoragePrefixOwnership | null = null;
  for (const rule of WORKSPACE_STORAGE_OWNERSHIP) {
    if (key.startsWith(rule.prefix) && (!best || rule.prefix.length > best.prefix.length)) {
      best = rule;
    }
  }
  return best;
}
