/**
 * @shared-фасады простых конфиг-/значение-типов для дерева workflow-runtime (W2/S8 Tier-2,
 * дешёвый срез, docs/w2-workflow-packaging-plan.md §5). Чистые struct/литеральные типы из
 * доменов монолита, которые ядро и порт используют в аннотациях — вынесены в @shared, чтобы
 * поддерево компилировалось без server/**-импортов для этих типов.
 *
 * Резолверы и их регистрация остаются в монолите; сюда вынесена только форма результата.
 */

/** server/config/process-role.ts — роль процесса приложения. */
export type AppProcessRole = "api" | "janitor" | "worker";

/** server/text-extraction.ts PageBoundary — границы страницы PDF в извлечённом тексте. */
export interface PageBoundary {
  pageNumber: number;
  charStart: number;
  charEnd: number;
}

/** Профиль узла agent в системном сценарии «Универсальный агент». */
export type AgentCapabilityOptimizationProfile = "universal_agent_v1";
