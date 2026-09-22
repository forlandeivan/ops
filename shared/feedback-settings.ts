import { z } from "zod";

export const COMMUNITY_ICON_PRESETS = [
  { value: "max", label: "MAX" }, { value: "vk", label: "ВКонтакте" },
  { value: "ok", label: "Одноклассники" }, { value: "dzen", label: "Дзен" },
  { value: "rutube", label: "RUTUBE" }, { value: "vk-video", label: "VK Видео" },
  { value: "link", label: "Ссылка" }, { value: "community", label: "Сообщество" },
] as const;
export const communityIconSchema = z.enum(["max", "vk", "ok", "dzen", "rutube", "vk-video", "link", "community"]);
export type CommunityIcon = z.infer<typeof communityIconSchema>;
export const MAX_COMMUNITY_LINKS = 10;
export const MAX_ROOT_COMMUNITY_LINKS = 2;
export const ROOT_LINK_LIMIT_MESSAGE = "Можно вынести не больше двух пунктов";
export const communityLinkSchema = z.object({
  id: z.string().min(1).max(64),
  label: z.string().trim().min(1, "Введите текст").max(80, "Не больше 80 символов"),
  url: z.string().trim().max(2048).url("Введите полный адрес ссылки").refine(value => {
    try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password; }
    catch { return false; }
  }, "Используйте ссылку http:// или https:// без логина и пароля"),
  icon: communityIconSchema,
  enabled: z.boolean(),
  // Missing on existing stored links: preserve their position inside the group.
  placement: z.enum(["menu", "root"]).optional(),
}).strict();
export type CommunityLink = z.infer<typeof communityLinkSchema>;
export const feedbackSettingsSchema = z.object({
  menuLabel: z.string().trim().min(1, "Введите текст").max(40, "Не больше 40 символов"),
  links: z.array(communityLinkSchema).max(MAX_COMMUNITY_LINKS).refine(
    links => new Set(links.map(link => link.id)).size === links.length, "Идентификаторы ссылок должны быть уникальны",
  ).refine(links => links.filter(link => link.placement === "root").length <= MAX_ROOT_COMMUNITY_LINKS, ROOT_LINK_LIMIT_MESSAGE),
}).strict();
export type FeedbackSettings = z.infer<typeof feedbackSettingsSchema>;

export const COMMUNITY_CHAT_LINK = {
  label: "Чат сообщества Unica",
  url: "https://max.ru/join/ahaWe9Gqw35WZ7yHubGheTs40fzOfeNbSG0-SmRfE08",
} as const;

export const DEFAULT_FEEDBACK_SETTINGS: FeedbackSettings = {
  menuLabel: "Обратная связь",
  links: [],
};
export type FeedbackMenuSettings = { menuLabel: string; links: CommunityLink[] };
export function toFeedbackMenuSettings(settings: FeedbackSettings): FeedbackMenuSettings {
  return { menuLabel: settings.menuLabel, links: settings.links.filter(link => link.enabled) };
}

export function splitCommunityLinks(links: CommunityLink[]) {
  return {
    root: links.filter(link => link.enabled && link.placement === "root"),
    menu: links.filter(link => link.enabled && link.placement !== "root"),
  };
}

/** Move before a target in the destination, or append after its last link. */
export function placeCommunityLink(links: CommunityLink[], id: string, placement: "root" | "menu", beforeId?: string): CommunityLink[] {
  const source = links.find(link => link.id === id);
  if (!source || beforeId === id) return links;
  if (placement === "root" && source.placement !== "root" && links.filter(link => link.placement === "root").length >= MAX_ROOT_COMMUNITY_LINKS) return links;
  const remaining = links.filter(link => link.id !== id);
  let index = beforeId ? remaining.findIndex(link => link.id === beforeId) : -1;
  if (index < 0) {
    index = remaining.reduce((last, link, i) => (link.placement ?? "menu") === placement ? i + 1 : last, remaining.length);
  }
  remaining.splice(index, 0, { ...source, placement });
  return remaining;
}
