export const chatFeedbackVotes = ["like", "dislike"] as const;
export type ChatFeedbackVote = (typeof chatFeedbackVotes)[number];

export const chatFeedbackKinds = ["chat_answer", "general"] as const;
export type ChatFeedbackKind = (typeof chatFeedbackKinds)[number];

export const generalFeedbackCategories = ["question", "bug", "idea", "other"] as const;
export type GeneralFeedbackCategory = (typeof generalFeedbackCategories)[number];

export const GENERAL_FEEDBACK_CATEGORY_LABELS: Record<GeneralFeedbackCategory, string> = {
  question: "Вопрос",
  bug: "Баг",
  idea: "Идея",
  other: "Другое",
};

export const chatFeedbackReasonCodes = [
  "incorrect",
  "incomplete",
  "ignored_context",
  "format_or_tone",
  "tool_or_file_issue",
  "other",
] as const;
export type ChatFeedbackReasonCode = (typeof chatFeedbackReasonCodes)[number];

export const CHAT_FEEDBACK_REASON_LABELS: Record<ChatFeedbackReasonCode, string> = {
  incorrect: "Ответ неверный",
  incomplete: "Ответ неполный",
  ignored_context: "Не учтен контекст",
  format_or_tone: "Проблема с форматом или тоном",
  tool_or_file_issue: "Проблема с файлом или инструментом",
  other: "Другое",
};

export function isChatFeedbackVote(value: unknown): value is ChatFeedbackVote {
  return typeof value === "string" && chatFeedbackVotes.includes(value as ChatFeedbackVote);
}

export function isChatFeedbackReasonCode(value: unknown): value is ChatFeedbackReasonCode {
  return typeof value === "string" && chatFeedbackReasonCodes.includes(value as ChatFeedbackReasonCode);
}

export function isChatFeedbackKind(value: unknown): value is ChatFeedbackKind {
  return typeof value === "string" && chatFeedbackKinds.includes(value as ChatFeedbackKind);
}

export function isGeneralFeedbackCategory(value: unknown): value is GeneralFeedbackCategory {
  return typeof value === "string" && generalFeedbackCategories.includes(value as GeneralFeedbackCategory);
}
