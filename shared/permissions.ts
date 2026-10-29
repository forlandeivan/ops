// Enterprise RBAC — Permission catalog types and constants

/** Human-readable labels for each permission module. Single source of truth. */
export const MODULE_LABELS: Record<string, string> = {
  notifications: 'Уведомления',
  scheduled_tasks: 'Задачи по расписанию',
  kb: 'Базы знаний',
  assistants: 'Ассистенты',
  workflows: 'Workflow-сценарии',
  actions: 'Действия',
  chats: 'Чат',
  workspace: 'Настройки workspace',
  members: 'Участники',
  integrations: 'Интеграции',
  vector: 'Коллекции',
  dashboard: 'Дашборд',
  workspace_analytics: 'Аналитика пространства',
  builds: 'Сборки',
  skills: 'Навыки',
  global_variables: 'Глобальные переменные',
  prompts: 'Промпты',
  web: 'Интернет',
};

export const PERMISSION_MODULES = [
  'notifications',
  'scheduled_tasks',
  'kb',
  'assistants',
  'workflows',
  'actions',
  'chats',
  'workspace',
  'members',
  'integrations',
  'vector',
  'dashboard',
  'workspace_analytics',
  'builds',
  'skills',
  'global_variables',
  'prompts',
  'web',
] as const;
export type PermissionModule = (typeof PERMISSION_MODULES)[number];

// Type-safe permission ID constants
export const P = {
  NOTIFICATIONS_MANAGE: 'notifications:manage',
  NOTIFICATIONS_PUBLISH: 'notifications:publish',
  SCHEDULED_TASKS_VIEW: 'scheduled_tasks:view',
  SCHEDULED_TASKS_CREATE: 'scheduled_tasks:create',
  SCHEDULED_TASKS_MANAGE_OWN: 'scheduled_tasks:manage_own',
  SCHEDULED_TASKS_MANAGE_ALL: 'scheduled_tasks:manage_all',
  // Knowledge Base
  KB_VIEW: 'kb:view',
  KB_CREATE: 'kb:create',
  KB_EDIT: 'kb:edit',
  KB_DELETE: 'kb:delete',
  KB_DOCUMENT_CREATE: 'kb:document:create',
  KB_DOCUMENT_EDIT: 'kb:document:edit',
  KB_DOCUMENT_DELETE: 'kb:document:delete',
  KB_DOCUMENT_IMPORT: 'kb:document:import',
  KB_INDEX: 'kb:index',
  KB_EXPORT: 'kb:export',
  KB_ACCESS_MANAGE: 'kb:access:manage',
  KB_SHARE_MANAGE: 'kb:share:manage',

  // Assistants
  ASSISTANTS_VIEW: 'assistants:view',
  ASSISTANTS_CREATE: 'assistants:create',
  ASSISTANTS_EDIT: 'assistants:edit',
  ASSISTANTS_DELETE: 'assistants:delete',
  ASSISTANTS_ACTIONS_MANAGE: 'assistants:actions:manage',
  ASSISTANTS_ACTIONS_EXECUTE: 'assistants:actions:execute',

  // Workflows
  WORKFLOWS_VIEW: 'workflows:view',
  WORKFLOWS_CREATE: 'workflows:create',
  WORKFLOWS_EDIT: 'workflows:edit',
  WORKFLOWS_PUBLISH: 'workflows:publish',
  WORKFLOWS_ARCHIVE: 'workflows:archive',
  WORKFLOWS_DEBUG: 'workflows:debug',
  // Запуск опубликованного сценария. Отделено от просмотра намеренно: прогон тратит
  // кредиты, шлёт письма и пишет во внешние системы, поэтому право видеть список
  // сценариев не должно давать право их выполнять.
  WORKFLOWS_EXECUTE: 'workflows:execute',
  // W3.1 Code Node: правка кода узла «Код (JavaScript)» в сценариях пространства. Чувствительное:
  // исполняет произвольный JS. Стало делегируемым после выноса исполнения в изолированный
  // code runner (W1/W2) — до этого гейт был неделегируемым (только платформенный админ).
  // Инстанс-рубильник `workflowCodeExec.delegationEnabled` перекрывает право (см. гейт).
  WORKFLOWS_EDIT_CODE: 'workflows:edit_code',

  // Actions
  ACTIONS_VIEW: 'actions:view',
  ACTIONS_CREATE: 'actions:create',
  ACTIONS_EDIT: 'actions:edit',
  ACTIONS_DELETE: 'actions:delete',
  ACTIONS_EXECUTE: 'actions:execute',

  // Chats
  CHATS_VIEW: 'chats:view',
  CHATS_CREATE: 'chats:create',
  CHATS_DELETE: 'chats:delete',
  CHATS_SEND: 'chats:send',
  CHATS_FILES: 'chats:files',

  // Workspace
  WORKSPACE_VIEW: 'workspace:view',
  WORKSPACE_EDIT: 'workspace:edit',
  WORKSPACE_ICON_MANAGE: 'workspace:icon:manage',
  WORKSPACE_PLAN_VIEW: 'workspace:plan:view',
  WORKSPACE_PLAN_MANAGE: 'workspace:plan:manage',
  WORKSPACE_CREDITS_VIEW: 'workspace:credits:view',
  WORKSPACE_INSTRUCTIONS_MANAGE: 'workspace:instructions:manage',

  // Members
  MEMBERS_VIEW: 'members:view',
  MEMBERS_INVITE: 'members:invite',
  MEMBERS_EDIT: 'members:edit',
  MEMBERS_REMOVE: 'members:remove',
  MEMBERS_ROLES_MANAGE: 'members:roles:manage',

  // Integrations
  INTEGRATIONS_VIEW: 'integrations:view',
  INTEGRATIONS_MANAGE: 'integrations:manage',
  INTEGRATIONS_MCP_MANAGE: 'integrations:mcp:manage',
  // Подключение и удаление MCP-сервера по адресу: сервер получает токен пространства и ходит во внешнюю
  // сеть, поэтому право у владельца и менеджера, а не у каждого участника.
  INTEGRATIONS_MCP_CONNECT: 'integrations:mcp:connect',

  // Vector
  VECTOR_VIEW: 'vector:view',
  VECTOR_MANAGE: 'vector:manage',

  // Dashboard
  DASHBOARD_VIEW: 'dashboard:view',

  // Аналитика пространства: отчёт об активности и расходе участников. Чувствительное — видно, кто что делал и сколько
  // потратил. Системным ролям, кроме владельца, не выдаётся: владелец получает всё, остальным — дополнительной ролью.
  WORKSPACE_ANALYTICS_VIEW: 'workspace_analytics:view',

  // Builds (Сборки) — публикация/установка поставок ассистентов
  BUILDS_VIEW: 'builds:view',
  BUILDS_PUBLISH: 'builds:publish',
  BUILDS_INSTALL: 'builds:install',

  // Skills (пользовательские prompt-навыки пространства)
  SKILLS_AUTHOR: 'skills:author',
  SKILLS_PUBLISH: 'skills:publish',

  // Global variables (реестр глобальных переменных документов: значения — per-workspace,
  // define — workspace-дефиниции; инстанс-схема управляется только requireAdmin)
  GLOBAL_VARIABLES_READ: 'global_variables:read',
  GLOBAL_VARIABLES_WRITE: 'global_variables:write',
  GLOBAL_VARIABLES_READ_SECRET: 'global_variables:read_secret',
  GLOBAL_VARIABLES_DEFINE: 'global_variables:define',

  // Prompts (библиотека промптов и стартовые подсказки чата)
  PROMPTS_VIEW: 'prompts:view',
  PROMPTS_MANAGE: 'prompts:manage',
  // Веб агента (этап 1 стратегии v2): операции web.search и web.fetch.
  WEB_USE: 'web:use',
} as const;

export type PermissionId = (typeof P)[keyof typeof P];

export const ALL_PERMISSION_IDS: PermissionId[] = Object.values(P);

// System role codes
export const SYSTEM_ROLE_CODES = ['owner', 'manager', 'member', 'viewer'] as const;
export type SystemRoleCode = (typeof SYSTEM_ROLE_CODES)[number];

// Permissions per system role
export const SYSTEM_ROLE_PERMISSIONS: Record<SystemRoleCode, PermissionId[]> = {
  owner: ALL_PERMISSION_IDS,
  manager: [
    P.NOTIFICATIONS_MANAGE,
    P.SCHEDULED_TASKS_VIEW, P.SCHEDULED_TASKS_CREATE, P.SCHEDULED_TASKS_MANAGE_OWN, P.SCHEDULED_TASKS_MANAGE_ALL,
    P.KB_VIEW, P.KB_CREATE, P.KB_EDIT, P.KB_DELETE,
    P.KB_DOCUMENT_CREATE, P.KB_DOCUMENT_EDIT, P.KB_DOCUMENT_DELETE,
    P.KB_DOCUMENT_IMPORT, P.KB_INDEX, P.KB_EXPORT, P.KB_ACCESS_MANAGE, P.KB_SHARE_MANAGE,
    P.ASSISTANTS_VIEW, P.ASSISTANTS_CREATE, P.ASSISTANTS_EDIT, P.ASSISTANTS_DELETE,
    P.ASSISTANTS_ACTIONS_MANAGE, P.ASSISTANTS_ACTIONS_EXECUTE,
    P.WORKFLOWS_VIEW, P.WORKFLOWS_EXECUTE, P.WORKFLOWS_CREATE, P.WORKFLOWS_EDIT, P.WORKFLOWS_PUBLISH, P.WORKFLOWS_ARCHIVE,
    P.WORKFLOWS_DEBUG, P.WORKFLOWS_EDIT_CODE,
    P.ACTIONS_VIEW, P.ACTIONS_CREATE, P.ACTIONS_EDIT, P.ACTIONS_DELETE, P.ACTIONS_EXECUTE,
    P.CHATS_VIEW, P.CHATS_CREATE, P.CHATS_DELETE, P.CHATS_SEND, P.CHATS_FILES,
    P.WORKSPACE_VIEW, P.WORKSPACE_EDIT, P.WORKSPACE_ICON_MANAGE,
    P.WORKSPACE_PLAN_VIEW, P.WORKSPACE_CREDITS_VIEW, P.WORKSPACE_INSTRUCTIONS_MANAGE,
    P.MEMBERS_VIEW, P.MEMBERS_INVITE, P.MEMBERS_EDIT, P.MEMBERS_REMOVE,
    P.INTEGRATIONS_VIEW, P.INTEGRATIONS_MANAGE, P.INTEGRATIONS_MCP_MANAGE, P.INTEGRATIONS_MCP_CONNECT,
    P.VECTOR_VIEW, P.VECTOR_MANAGE,
    P.DASHBOARD_VIEW,
    P.BUILDS_VIEW, P.BUILDS_PUBLISH, P.BUILDS_INSTALL,
    P.SKILLS_AUTHOR, P.SKILLS_PUBLISH,
    P.GLOBAL_VARIABLES_READ, P.GLOBAL_VARIABLES_WRITE,
    P.GLOBAL_VARIABLES_READ_SECRET, P.GLOBAL_VARIABLES_DEFINE,
    P.PROMPTS_VIEW, P.PROMPTS_MANAGE,
    P.WEB_USE,
  ],
  member: [
    P.SCHEDULED_TASKS_VIEW, P.SCHEDULED_TASKS_CREATE, P.SCHEDULED_TASKS_MANAGE_OWN,
    P.KB_VIEW, P.KB_CREATE, P.KB_EDIT,
    P.KB_DOCUMENT_CREATE, P.KB_DOCUMENT_EDIT, P.KB_DOCUMENT_DELETE,
    P.KB_DOCUMENT_IMPORT, P.KB_INDEX, P.KB_EXPORT,
    P.ASSISTANTS_VIEW, P.ASSISTANTS_CREATE, P.ASSISTANTS_EDIT,
    P.ASSISTANTS_ACTIONS_MANAGE, P.ASSISTANTS_ACTIONS_EXECUTE,
    P.WORKFLOWS_VIEW, P.WORKFLOWS_EXECUTE, P.WORKFLOWS_CREATE, P.WORKFLOWS_EDIT, P.WORKFLOWS_DEBUG, P.WORKFLOWS_EDIT_CODE,
    P.ACTIONS_VIEW, P.ACTIONS_CREATE, P.ACTIONS_EDIT, P.ACTIONS_EXECUTE,
    P.CHATS_VIEW, P.CHATS_CREATE, P.CHATS_DELETE, P.CHATS_SEND, P.CHATS_FILES,
    P.WORKSPACE_VIEW, P.WORKSPACE_PLAN_VIEW, P.WORKSPACE_CREDITS_VIEW,
    P.MEMBERS_VIEW,
    // Управление MCP-инструментами у участника снято (план remote-MCP §5.4): политики инструментов
    // чужих серверов и их подключение — у менеджера и владельца.
    P.INTEGRATIONS_VIEW, P.INTEGRATIONS_MANAGE,
    // Векторный API (страница «Векторные коллекции») у участника снят (SEC-05): он отдавал сырые фрагменты
    // баз и позволял удалять коллекции пространства — это инструмент владельца и менеджера.
    P.DASHBOARD_VIEW,
    P.BUILDS_VIEW, P.BUILDS_INSTALL,
    P.SKILLS_AUTHOR,
    P.GLOBAL_VARIABLES_READ,
    P.PROMPTS_VIEW,
    P.WEB_USE,
  ],
  viewer: [
    P.SCHEDULED_TASKS_VIEW,
    P.KB_VIEW,
    P.ASSISTANTS_VIEW, P.ASSISTANTS_ACTIONS_EXECUTE,
    P.WORKFLOWS_VIEW,
    P.ACTIONS_VIEW, P.ACTIONS_EXECUTE,
    P.CHATS_VIEW, P.CHATS_CREATE, P.CHATS_SEND,
    P.WORKSPACE_VIEW, P.WORKSPACE_PLAN_VIEW, P.WORKSPACE_CREDITS_VIEW,
    P.MEMBERS_VIEW,
    P.INTEGRATIONS_VIEW,
    P.DASHBOARD_VIEW,
    P.BUILDS_VIEW,
    P.GLOBAL_VARIABLES_READ,
    P.PROMPTS_VIEW,
  ],
};

// Shared interfaces used by both client and server
export interface PermissionDefinition {
  id: string;
  module: PermissionModule;
  action: string;
  description: string;
  isSensitive: boolean;
}

export interface WorkspaceRoleInfo {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  isSystem: boolean;
  systemCode: SystemRoleCode | null;
  priority: number;
  color: string | null;
  permissions: string[];
  memberCount?: number;
}

export interface WorkspaceMemberRoleAssignment {
  workspaceId: string;
  userId: string;
  roleId: string;
  roleName: string;
  roleSystemCode: SystemRoleCode | null;
  assignedBy: string | null;
  assignedAt: string;
  expiresAt: string | null;
}

export interface EffectivePermissions {
  roles: Array<{ id: string; name: string; systemCode: SystemRoleCode | null }>;
  permissions: string[];
}

// ---------------------------------------------------------------------------
// Hierarchical access levels per module
// ---------------------------------------------------------------------------

export type AccessLevelCode = 'none' | 'viewer' | 'user' | 'editor' | 'manager' | 'admin';

export interface AccessLevel {
  code: AccessLevelCode;
  label: string;
  /** Cumulative permissions — includes all permissions from lower levels */
  permissions: readonly PermissionId[];
}

export const MODULE_ACCESS_LEVELS: Record<PermissionModule, readonly AccessLevel[]> = {
  notifications: [
    { code: 'none', label: 'Нет доступа', permissions: [] },
    { code: 'editor', label: 'Подготовка', permissions: [P.NOTIFICATIONS_MANAGE] },
    { code: 'manager', label: 'Публикация', permissions: [P.NOTIFICATIONS_MANAGE, P.NOTIFICATIONS_PUBLISH] },
  ],
  scheduled_tasks: [
    { code: 'none', label: 'Нет доступа', permissions: [] },
    { code: 'viewer', label: 'Просмотр', permissions: [P.SCHEDULED_TASKS_VIEW] },
    { code: 'editor', label: 'Свои задачи', permissions: [P.SCHEDULED_TASKS_VIEW, P.SCHEDULED_TASKS_CREATE, P.SCHEDULED_TASKS_MANAGE_OWN] },
    { code: 'manager', label: 'Все задачи', permissions: [P.SCHEDULED_TASKS_VIEW, P.SCHEDULED_TASKS_CREATE, P.SCHEDULED_TASKS_MANAGE_OWN, P.SCHEDULED_TASKS_MANAGE_ALL] },
  ],
  kb: [
    { code: 'none',   label: 'Нет доступа',   permissions: [] },
    { code: 'viewer', label: 'Просмотр',       permissions: [P.KB_VIEW] },
    { code: 'editor', label: 'Редактирование', permissions: [P.KB_VIEW, P.KB_CREATE, P.KB_EDIT, P.KB_DELETE, P.KB_DOCUMENT_CREATE, P.KB_DOCUMENT_EDIT, P.KB_DOCUMENT_DELETE, P.KB_DOCUMENT_IMPORT, P.KB_INDEX, P.KB_EXPORT, P.KB_ACCESS_MANAGE, P.KB_SHARE_MANAGE] },
  ],
  assistants: [
    { code: 'none',   label: 'Нет доступа',   permissions: [] },
    { code: 'viewer', label: 'Просмотр',       permissions: [P.ASSISTANTS_VIEW] },
    { code: 'editor', label: 'Редактирование', permissions: [P.ASSISTANTS_VIEW, P.ASSISTANTS_CREATE, P.ASSISTANTS_EDIT, P.ASSISTANTS_DELETE, P.ASSISTANTS_ACTIONS_MANAGE, P.ASSISTANTS_ACTIONS_EXECUTE] },
  ],
  workflows: [
    { code: 'none',   label: 'Нет доступа',   permissions: [] },
    { code: 'viewer', label: 'Просмотр',       permissions: [P.WORKFLOWS_VIEW] },
    // Уровень для интегратора и дежурного: запускает опубликованный сценарий, но не
    // правит его. Без него запуск пришлось бы выдавать вместе с редактированием.
    { code: 'user', label: 'Просмотр и запуск', permissions: [P.WORKFLOWS_VIEW, P.WORKFLOWS_EXECUTE] },
    { code: 'editor', label: 'Редактирование', permissions: [P.WORKFLOWS_VIEW, P.WORKFLOWS_EXECUTE, P.WORKFLOWS_CREATE, P.WORKFLOWS_EDIT, P.WORKFLOWS_DEBUG, P.WORKFLOWS_EDIT_CODE] },
    { code: 'manager', label: 'Публикация', permissions: [P.WORKFLOWS_VIEW, P.WORKFLOWS_EXECUTE, P.WORKFLOWS_CREATE, P.WORKFLOWS_EDIT, P.WORKFLOWS_DEBUG, P.WORKFLOWS_EDIT_CODE, P.WORKFLOWS_PUBLISH, P.WORKFLOWS_ARCHIVE] },
  ],
  actions: [
    { code: 'none',   label: 'Нет доступа',   permissions: [] },
    { code: 'viewer', label: 'Просмотр',       permissions: [P.ACTIONS_VIEW] },
    { code: 'editor', label: 'Редактирование', permissions: [P.ACTIONS_VIEW, P.ACTIONS_CREATE, P.ACTIONS_EDIT, P.ACTIONS_DELETE, P.ACTIONS_EXECUTE] },
  ],
  chats: [
    { code: 'none',   label: 'Нет доступа',   permissions: [] },
    { code: 'viewer', label: 'Просмотр',       permissions: [P.CHATS_VIEW] },
    { code: 'editor', label: 'Редактирование', permissions: [P.CHATS_VIEW, P.CHATS_CREATE, P.CHATS_DELETE, P.CHATS_SEND, P.CHATS_FILES] },
  ],
  workspace: [
    { code: 'none',   label: 'Нет доступа',   permissions: [] },
    { code: 'viewer', label: 'Просмотр',       permissions: [P.WORKSPACE_VIEW, P.WORKSPACE_PLAN_VIEW, P.WORKSPACE_CREDITS_VIEW] },
    { code: 'editor', label: 'Редактирование', permissions: [P.WORKSPACE_VIEW, P.WORKSPACE_EDIT, P.WORKSPACE_ICON_MANAGE, P.WORKSPACE_PLAN_VIEW, P.WORKSPACE_PLAN_MANAGE, P.WORKSPACE_CREDITS_VIEW, P.WORKSPACE_INSTRUCTIONS_MANAGE] },
  ],
  members: [
    { code: 'none',   label: 'Нет доступа',   permissions: [] },
    { code: 'viewer', label: 'Просмотр',       permissions: [P.MEMBERS_VIEW] },
    { code: 'editor', label: 'Редактирование', permissions: [P.MEMBERS_VIEW, P.MEMBERS_INVITE, P.MEMBERS_EDIT, P.MEMBERS_REMOVE, P.MEMBERS_ROLES_MANAGE] },
  ],
  integrations: [
    { code: 'none',   label: 'Нет доступа',   permissions: [] },
    { code: 'viewer', label: 'Просмотр',       permissions: [P.INTEGRATIONS_VIEW] },
    { code: 'editor', label: 'Редактирование', permissions: [P.INTEGRATIONS_VIEW, P.INTEGRATIONS_MANAGE, P.INTEGRATIONS_MCP_MANAGE, P.INTEGRATIONS_MCP_CONNECT] },
  ],
  vector: [
    { code: 'none',   label: 'Нет доступа',   permissions: [] },
    { code: 'viewer', label: 'Просмотр',       permissions: [P.VECTOR_VIEW] },
    { code: 'editor', label: 'Редактирование', permissions: [P.VECTOR_VIEW, P.VECTOR_MANAGE] },
  ],
  dashboard: [
    { code: 'none',   label: 'Нет доступа', permissions: [] },
    { code: 'viewer', label: 'Просмотр',    permissions: [P.DASHBOARD_VIEW] },
  ],
  workspace_analytics: [
    { code: 'none',   label: 'Нет доступа', permissions: [] },
    { code: 'viewer', label: 'Просмотр',    permissions: [P.WORKSPACE_ANALYTICS_VIEW] },
  ],
  builds: [
    { code: 'none',   label: 'Нет доступа', permissions: [] },
    { code: 'viewer', label: 'Просмотр',    permissions: [P.BUILDS_VIEW] },
    { code: 'editor', label: 'Публикация и установка', permissions: [P.BUILDS_VIEW, P.BUILDS_PUBLISH, P.BUILDS_INSTALL] },
  ],
  skills: [
    { code: 'none',    label: 'Нет доступа',            permissions: [] },
    { code: 'editor',  label: 'Создание навыков',       permissions: [P.SKILLS_AUTHOR] },
    { code: 'manager', label: 'Создание и публикация',  permissions: [P.SKILLS_AUTHOR, P.SKILLS_PUBLISH] },
  ],
  global_variables: [
    { code: 'none',    label: 'Нет доступа',              permissions: [] },
    { code: 'viewer',  label: 'Просмотр',                 permissions: [P.GLOBAL_VARIABLES_READ] },
    { code: 'editor',  label: 'Изменение значений',       permissions: [P.GLOBAL_VARIABLES_READ, P.GLOBAL_VARIABLES_WRITE] },
    { code: 'manager', label: 'Схема и секреты',          permissions: [P.GLOBAL_VARIABLES_READ, P.GLOBAL_VARIABLES_WRITE, P.GLOBAL_VARIABLES_READ_SECRET, P.GLOBAL_VARIABLES_DEFINE] },
  ],
  prompts: [
    { code: 'none',   label: 'Нет доступа',   permissions: [] },
    { code: 'viewer', label: 'Просмотр',       permissions: [P.PROMPTS_VIEW] },
    { code: 'editor', label: 'Управление',     permissions: [P.PROMPTS_VIEW, P.PROMPTS_MANAGE] },
  ],
  web: [
    { code: 'none',   label: 'Нет доступа',   permissions: [] },
    { code: 'editor', label: 'Поиск и чтение страниц', permissions: [P.WEB_USE] },
  ],
};

/** Convert per-module access levels to a flat permission ID array. */
export function levelsToPermissions(
  levels: Partial<Record<PermissionModule, AccessLevelCode>>,
): PermissionId[] {
  const result: PermissionId[] = [];
  for (const module of PERMISSION_MODULES) {
    const levelCode = levels[module] ?? 'none';
    const moduleLevels = MODULE_ACCESS_LEVELS[module];
    const level = moduleLevels.find((l) => l.code === levelCode);
    if (level) {
      result.push(...level.permissions);
    }
  }
  return [...new Set(result)];
}

/**
 * Reverse-map a flat permission array to per-module access levels.
 * For each module, finds the highest level whose permissions are fully contained in the given set.
 */
export function permissionsToLevels(
  permissions: readonly string[],
): Record<PermissionModule, AccessLevelCode> {
  const permSet = new Set(permissions);
  const result = {} as Record<PermissionModule, AccessLevelCode>;

  for (const module of PERMISSION_MODULES) {
    const levels = MODULE_ACCESS_LEVELS[module];
    let matched: AccessLevel = levels[0];
    for (let i = levels.length - 1; i >= 0; i--) {
      if (levels[i].permissions.every((p) => permSet.has(p))) {
        matched = levels[i];
        break;
      }
    }
    result[module] = matched.code;
  }

  return result;
}

// Catalog records used in the migration seed
export const PERMISSION_CATALOG: Array<{
  id: string;
  module: string;
  action: string;
  description: string;
  isSensitive: boolean;
}> = [
  { id: P.SCHEDULED_TASKS_VIEW, module: 'scheduled_tasks', action: 'view', description: 'Просмотр задач по расписанию', isSensitive: false },
  { id: P.NOTIFICATIONS_MANAGE, module: 'notifications', action: 'manage', description: 'Подготовка объявлений, настройки уведомлений и диагностика доставки', isSensitive: false },
  { id: P.NOTIFICATIONS_PUBLISH, module: 'notifications', action: 'publish', description: 'Публикация и отмена адресных объявлений', isSensitive: true },
  { id: P.SCHEDULED_TASKS_CREATE, module: 'scheduled_tasks', action: 'create', description: 'Создание задач по расписанию', isSensitive: false },
  { id: P.SCHEDULED_TASKS_MANAGE_OWN, module: 'scheduled_tasks', action: 'manage_own', description: 'Управление своими задачами по расписанию', isSensitive: false },
  { id: P.SCHEDULED_TASKS_MANAGE_ALL, module: 'scheduled_tasks', action: 'manage_all', description: 'Управление всеми задачами без доступа к содержимому', isSensitive: true },
  { id: P.KB_VIEW, module: 'kb', action: 'view', description: 'Просмотр баз знаний и документов', isSensitive: false },
  { id: P.KB_CREATE, module: 'kb', action: 'create', description: 'Создание баз знаний', isSensitive: false },
  { id: P.KB_EDIT, module: 'kb', action: 'edit', description: 'Редактирование настроек базы знаний', isSensitive: false },
  { id: P.KB_DELETE, module: 'kb', action: 'delete', description: 'Удаление баз знаний', isSensitive: true },
  { id: P.KB_DOCUMENT_CREATE, module: 'kb', action: 'document:create', description: 'Создание документов и папок', isSensitive: false },
  { id: P.KB_DOCUMENT_EDIT, module: 'kb', action: 'document:edit', description: 'Редактирование документов', isSensitive: false },
  { id: P.KB_DOCUMENT_DELETE, module: 'kb', action: 'document:delete', description: 'Удаление документов и папок', isSensitive: true },
  { id: P.KB_DOCUMENT_IMPORT, module: 'kb', action: 'document:import', description: 'Импорт файлов в базу знаний', isSensitive: false },
  { id: P.KB_INDEX, module: 'kb', action: 'index', description: 'Запуск индексации базы знаний', isSensitive: false },
  { id: P.KB_EXPORT, module: 'kb', action: 'export', description: 'Экспорт баз знаний', isSensitive: false },
  { id: P.KB_ACCESS_MANAGE, module: 'kb', action: 'access:manage', description: 'Управление доступом к ресурсам KB', isSensitive: true },
  { id: P.KB_SHARE_MANAGE, module: 'kb', action: 'share:manage', description: 'Расшаривание баз знаний другим пространствам (on-prem)', isSensitive: true },
  { id: P.ASSISTANTS_VIEW, module: 'assistants', action: 'view', description: 'Просмотр ассистентов', isSensitive: false },
  { id: P.ASSISTANTS_CREATE, module: 'assistants', action: 'create', description: 'Создание ассистентов', isSensitive: false },
  { id: P.ASSISTANTS_EDIT, module: 'assistants', action: 'edit', description: 'Редактирование ассистентов', isSensitive: false },
  { id: P.ASSISTANTS_DELETE, module: 'assistants', action: 'delete', description: 'Удаление ассистентов', isSensitive: true },
  { id: P.ASSISTANTS_ACTIONS_MANAGE, module: 'assistants', action: 'actions:manage', description: 'Управление действиями ассистентов', isSensitive: false },
  { id: P.ASSISTANTS_ACTIONS_EXECUTE, module: 'assistants', action: 'actions:execute', description: 'Выполнение действий ассистентов', isSensitive: false },
  { id: P.WORKFLOWS_VIEW, module: 'workflows', action: 'view', description: 'Просмотр workflow-сценариев и шаблонов', isSensitive: false },
  { id: P.WORKFLOWS_EXECUTE, module: 'workflows', action: 'execute', description: 'Запуск опубликованных workflow-сценариев', isSensitive: false },
  { id: P.WORKFLOWS_CREATE, module: 'workflows', action: 'create', description: 'Создание workflow-сценариев', isSensitive: false },
  { id: P.WORKFLOWS_EDIT, module: 'workflows', action: 'edit', description: 'Редактирование draft-версий workflow-сценариев', isSensitive: false },
  { id: P.WORKFLOWS_PUBLISH, module: 'workflows', action: 'publish', description: 'Публикация workflow-сценариев', isSensitive: true },
  { id: P.WORKFLOWS_ARCHIVE, module: 'workflows', action: 'archive', description: 'Архивация и восстановление workflow-сценариев', isSensitive: true },
  { id: P.WORKFLOWS_DEBUG, module: 'workflows', action: 'debug', description: 'Пошаговая отладка workflow-сценариев (арминг сессии, захват вызова, перезапуск узлов)', isSensitive: false },
  { id: P.WORKFLOWS_EDIT_CODE, module: 'workflows', action: 'edit_code', description: 'Редактирование кода узла «Код (JavaScript)» в сценариях пространства', isSensitive: true },
  { id: P.ACTIONS_VIEW, module: 'actions', action: 'view', description: 'Просмотр действий', isSensitive: false },
  { id: P.ACTIONS_CREATE, module: 'actions', action: 'create', description: 'Создание действий', isSensitive: false },
  { id: P.ACTIONS_EDIT, module: 'actions', action: 'edit', description: 'Редактирование действий', isSensitive: false },
  { id: P.ACTIONS_DELETE, module: 'actions', action: 'delete', description: 'Удаление действий', isSensitive: true },
  { id: P.ACTIONS_EXECUTE, module: 'actions', action: 'execute', description: 'Выполнение действий', isSensitive: false },
  { id: P.CHATS_VIEW, module: 'chats', action: 'view', description: 'Доступ к чатам', isSensitive: false },
  { id: P.CHATS_CREATE, module: 'chats', action: 'create', description: 'Создание чат-сессий', isSensitive: false },
  { id: P.CHATS_DELETE, module: 'chats', action: 'delete', description: 'Удаление чат-сессий', isSensitive: false },
  { id: P.CHATS_SEND, module: 'chats', action: 'send', description: 'Отправка сообщений', isSensitive: false },
  { id: P.CHATS_FILES, module: 'chats', action: 'files', description: 'Загрузка файлов в чат', isSensitive: false },
  { id: P.WORKSPACE_VIEW, module: 'workspace', action: 'view', description: 'Просмотр настроек workspace', isSensitive: false },
  { id: P.WORKSPACE_EDIT, module: 'workspace', action: 'edit', description: 'Редактирование настроек workspace', isSensitive: false },
  { id: P.WORKSPACE_ICON_MANAGE, module: 'workspace', action: 'icon:manage', description: 'Управление иконкой workspace', isSensitive: false },
  { id: P.WORKSPACE_PLAN_VIEW, module: 'workspace', action: 'plan:view', description: 'Просмотр тарифа workspace', isSensitive: false },
  { id: P.WORKSPACE_PLAN_MANAGE, module: 'workspace', action: 'plan:manage', description: 'Управление тарифом workspace', isSensitive: true },
  { id: P.WORKSPACE_CREDITS_VIEW, module: 'workspace', action: 'credits:view', description: 'Просмотр кредитов workspace', isSensitive: false },
  { id: P.WORKSPACE_INSTRUCTIONS_MANAGE, module: 'workspace', action: 'instructions:manage', description: 'Управление инструкциями агента на уровне пространства', isSensitive: true },
  { id: P.MEMBERS_VIEW, module: 'members', action: 'view', description: 'Просмотр участников workspace', isSensitive: false },
  { id: P.MEMBERS_INVITE, module: 'members', action: 'invite', description: 'Приглашение новых участников', isSensitive: false },
  { id: P.MEMBERS_EDIT, module: 'members', action: 'edit', description: 'Изменение ролей участников', isSensitive: false },
  { id: P.MEMBERS_REMOVE, module: 'members', action: 'remove', description: 'Удаление участников', isSensitive: true },
  { id: P.MEMBERS_ROLES_MANAGE, module: 'members', action: 'roles:manage', description: 'Управление кастомными ролями', isSensitive: true },
  { id: P.INTEGRATIONS_VIEW, module: 'integrations', action: 'view', description: 'Просмотр интеграций', isSensitive: false },
  { id: P.INTEGRATIONS_MANAGE, module: 'integrations', action: 'manage', description: 'Управление интеграциями', isSensitive: false },
  { id: P.INTEGRATIONS_MCP_MANAGE, module: 'integrations', action: 'mcp:manage', description: 'Управление MCP инструментами', isSensitive: false },
  { id: P.INTEGRATIONS_MCP_CONNECT, module: 'integrations', action: 'mcp:connect', description: 'Подключение и удаление MCP-серверов', isSensitive: true },
  { id: P.VECTOR_VIEW, module: 'vector', action: 'view', description: 'Просмотр векторных коллекций', isSensitive: false },
  { id: P.VECTOR_MANAGE, module: 'vector', action: 'manage', description: 'Управление векторными коллекциями', isSensitive: false },
  { id: P.DASHBOARD_VIEW, module: 'dashboard', action: 'view', description: 'Просмотр дашборда', isSensitive: false },
  { id: P.WORKSPACE_ANALYTICS_VIEW, module: 'workspace_analytics', action: 'view', description: 'Отчёт об активности и расходе участников пространства', isSensitive: true },
  { id: P.BUILDS_VIEW, module: 'builds', action: 'view', description: 'Просмотр витрины сборок', isSensitive: false },
  { id: P.BUILDS_PUBLISH, module: 'builds', action: 'publish', description: 'Публикация ассистента как сборки', isSensitive: true },
  { id: P.BUILDS_INSTALL, module: 'builds', action: 'install', description: 'Установка сборки в рабочее пространство', isSensitive: false },
  { id: P.SKILLS_AUTHOR, module: 'skills', action: 'author', description: 'Создание и редактирование навыков пространства', isSensitive: false },
  { id: P.SKILLS_PUBLISH, module: 'skills', action: 'publish', description: 'Публикация навыка по умолчанию для ассистентов пространства', isSensitive: true },
  { id: P.GLOBAL_VARIABLES_READ, module: 'global_variables', action: 'read', description: 'Просмотр глобальных переменных пространства', isSensitive: false },
  { id: P.GLOBAL_VARIABLES_WRITE, module: 'global_variables', action: 'write', description: 'Изменение значений глобальных переменных пространства', isSensitive: false },
  { id: P.GLOBAL_VARIABLES_READ_SECRET, module: 'global_variables', action: 'read_secret', description: 'Просмотр секретных значений глобальных переменных', isSensitive: true },
  { id: P.GLOBAL_VARIABLES_DEFINE, module: 'global_variables', action: 'define', description: 'Управление переменными уровня пространства (создание/правка/удаление дефиниций)', isSensitive: true },
  { id: P.PROMPTS_VIEW, module: 'prompts', action: 'view', description: 'Просмотр библиотеки промптов и стартовых подсказок', isSensitive: false },
  { id: P.PROMPTS_MANAGE, module: 'prompts', action: 'manage', description: 'Управление промптами пространства (создание, правка, удаление)', isSensitive: false },
  { id: P.WEB_USE, module: 'web', action: 'use', description: 'Поиск и чтение страниц в интернете агентом (если функция включена пространству)', isSensitive: false },
];
