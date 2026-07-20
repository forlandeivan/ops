export type DocsTrackId = "beginner" | "workspace-manager" | "system-admin";

export type DocsTrackStatus = "published" | "coming_soon";

export type DocsArticleKind = "lesson" | "troubleshooting";

export interface DocsArticleProgress {
  isViewed: boolean;
  viewedAt: string | null;
  isCompleted: boolean;
  completedAt: string | null;
}

export interface DocsTrackProgress {
  lessonCount: number;
  completedLessonCount: number;
  viewedLessonCount: number;
  percent: number;
  isStarted: boolean;
  isCompleted: boolean;
  continueSlug: string | null;
}

export interface DocsTrackListItem {
  id: DocsTrackId;
  title: string;
  subtitle: string;
  audience: string;
  status: DocsTrackStatus;
  available: boolean;
  order: number;
  articleCount: number;
  lessonCount: number;
  summary: string;
  progress: DocsTrackProgress | null;
}

export interface DocsArticleSummary {
  title: string;
  slug: string;
  summary: string;
  kind: DocsArticleKind;
  order: number;
  image: string | null;
  ctaLabel: string | null;
  ctaRoute: string | null;
  progress: DocsArticleProgress | null;
}

export interface DocsTrack extends Omit<DocsTrackListItem, "progress"> {
  introMarkdown: string;
  image: string | null;
  articles: DocsArticleSummary[];
  progress: DocsTrackProgress;
}

export interface DocsArticleLink {
  slug: string;
  title: string;
  kind: DocsArticleKind;
}

export interface DocsArticle extends Omit<DocsArticleSummary, "progress"> {
  trackId: DocsTrackId;
  audience: string;
  status: string;
  markdown: string;
  relatedDocs: DocsArticleLink[];
  relatedRoutes: string[];
  owner: string;
  lastReviewedAt: string;
  prev: DocsArticleLink | null;
  next: DocsArticleLink | null;
  helpArticle: DocsArticleLink | null;
  progress: DocsArticleProgress;
}
