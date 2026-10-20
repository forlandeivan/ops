import { z } from "zod";
import { publicationContentSchema } from "./notification-publications";

const plainText = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine(
      (value) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value),
      "Недопустимые символы",
    );
export const announcementAudienceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("all") }).strict(),
  z
    .object({
      kind: z.literal("users"),
      userIds: z.array(z.string().min(1).max(128)).min(1).max(500),
    })
    .strict(),
  // Catalog IDs are bld-<hash>, not UUIDs (builds-service makeBuildId).
  z
    .object({
      kind: z.literal("build_installers"),
      buildId: z.string().trim().min(1).max(255),
    })
    .strict(),
]);
export const announcementDraftSchema = z
  .object({
    title: plainText(160),
    body: plainText(2000),
    content: publicationContentSchema.nullable().optional(),
    audience: announcementAudienceSchema,
    expiresAt: z.string().datetime().nullable(),
  })
  .strict();
export type AnnouncementDraft = z.infer<typeof announcementDraftSchema>;
export const announcementPatchSchema = announcementDraftSchema.extend({
  revision: z.number().int().positive(),
});
export const announcementRevisionSchema = z
  .object({ revision: z.number().int().positive() })
  .strict();
export interface AnnouncementDto extends AnnouncementDraft {
  id: string;
  status: "draft" | "published" | "canceled";
  revision: number;
  recipientCount: number;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  canceledAt: string | null;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  publishedByUserId: string | null;
  canceledByUserId: string | null;
}
export interface AnnouncementPreview {
  recipientCount: number;
  deliverableCount: number;
}
export interface NotificationAudienceOptions {
  users: { id: string; name: string }[];
  builds: { id: string; name: string }[];
}
export const MAX_ANNOUNCEMENT_RECIPIENTS = 10_000;
export const ANNOUNCEMENT_OUTBOX_CHUNK_SIZE = 100;
export function validateAnnouncementExpiry(
  expiresAt: string | null,
  now = Date.now(),
): boolean {
  if (expiresAt === null) return true;
  const deadline = Date.parse(expiresAt);
  return (
    Number.isFinite(deadline) &&
    deadline > now &&
    deadline <= now + 365 * 24 * 60 * 60 * 1000
  );
}
export function announcementIsVisible(
  source: { status: string; expiresAt: Date | null },
  now = Date.now(),
): boolean {
  return (
    source.status === "published" &&
    (!source.expiresAt || source.expiresAt.getTime() > now)
  );
}
