export const adminSetupStepKeys = ["access", "llm", "knowledge", "speech"] as const;
export type AdminSetupStepKey = (typeof adminSetupStepKeys)[number];

export const adminSetupStepStatuses = ["not_configured", "attention", "ready"] as const;
export type AdminSetupStepStatus = (typeof adminSetupStepStatuses)[number];

export type DeploymentMode = "cloud" | "onprem";

export interface AdminSetupStepSummary {
  key: AdminSetupStepKey;
  title: string;
  description: string;
  status: AdminSetupStepStatus;
  ctaLabel: string;
  ctaHref: string;
  blockers: string[];
  signals: string[];
}

export interface AdminSetupAfterLaunchLink {
  key: "actions" | "llmExecutions" | "asrExecutions";
  label: string;
  href: string;
}

export interface AdminSetupSummary {
  deploymentMode: DeploymentMode;
  steps: AdminSetupStepSummary[];
  afterLaunchLinks: AdminSetupAfterLaunchLink[];
}

export const ADMIN_SETUP_STEP_TEMPLATES = [
  {
    key: "access",
    title: "Доступ и роли",
    description: "Создайте рабочее пространство и назначьте роли.",
    ctaLabel: "Рабочие пространства",
    ctaHref: "/settings/administration/access/workspaces",
  },
  {
    key: "llm",
    title: "LLM и модели",
    description: "Подключите провайдера и добавьте нужные модели.",
    ctaLabel: "Провайдеры LLM",
    ctaHref: "/settings/administration/llm/providers",
  },
  {
    key: "knowledge",
    title: "Базы знаний",
    description: "Подключите эмбеддинги и настройте индексацию.",
    ctaLabel: "Эмбеддинги",
    ctaHref: "/settings/administration/knowledge/embeddings",
  },
  {
    key: "speech",
    title: "Транскрибация",
    description: "Подключите ASR и проверьте первые расшифровки.",
    ctaLabel: "ASR провайдеры",
    ctaHref: "/settings/administration/speech/asr-providers",
  },
] as const satisfies ReadonlyArray<
  Pick<AdminSetupStepSummary, "key" | "title" | "description" | "ctaLabel" | "ctaHref">
>;

export const ADMIN_SETUP_AFTER_LAUNCH_LINKS: AdminSetupAfterLaunchLink[] = [
  {
    key: "actions",
    label: "Журнал действий",
    href: "/settings/administration/activity/actions",
  },
  {
    key: "llmExecutions",
    label: "Запуски LLM",
    href: "/settings/administration/llm-executions",
  },
  {
    key: "asrExecutions",
    label: "Запуски ASR",
    href: "/settings/administration/asr-executions",
  },
];
