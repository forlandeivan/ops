import { z } from "zod";
import { P } from "./permissions";

export const releaseAudienceSchema = z.object({
  permission: z.string().refine(value=>(Object.values(P) as string[]).includes(value)).optional(),
  feature: z.enum(["scheduled_tasks.enabled","ingestion.auto_index","assistants.auto_mode","chat.answer_quality"]).optional(),
}).strict();
export type ReleaseAudience = z.infer<typeof releaseAudienceSchema>;

export function isPublicationUrl(value: string): boolean {
  if (/[\\\u0000-\u0020\u007f]/.test(value)) return false;
  if (value.startsWith("/") && !value.startsWith("//")) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}
export const publicationActionSchema = z
  .object({
    label: z.string().trim().min(1,"Введите название кнопки").max(80,"Название кнопки — до 80 символов"),
    href: z
      .string()
      .max(2048)
      .refine(isPublicationUrl, "Укажите путь в продукте или HTTPS-ссылку"),
  })
  .strict();
export const publicationContentSchema = z
  .object({
    schemaVersion: z.literal(1),
    summary: z.string().trim().min(1,"Введите краткое описание").max(320,"Краткое описание — до 320 символов"),
    bodyMarkdown: z.string().trim().min(1,"Введите полный текст").max(30_000,"Полный текст — до 30 000 символов"),
    actions: z.array(publicationActionSchema).max(2,"Добавьте не больше двух кнопок").default([]),
    assetIds: z.array(z.string().uuid()).max(5,"Добавьте не больше пяти изображений").default([]),
  })
  .strict();
export type PublicationContent = z.infer<typeof publicationContentSchema>;
export interface PublicationDetail {
  externalLinksAllowed?: boolean;
  title: string;
  content: PublicationContent | null;
  legacyBody?: string;
  withdrawn: boolean;
  sourceLabel: string;
  active: boolean;
}
export const releaseNewsPolicySchema = z
  .object({
    mode: z.enum(["auto", "approval", "disabled"]),
    externalLinks: z.boolean(),
  })
  .strict();
export type ReleaseNewsPolicy = z.infer<typeof releaseNewsPolicySchema>;
export const releaseNotificationSchema = z
  .object({
    audience: releaseAudienceSchema.optional(),
    expiresAt: z.string().datetime().nullable().optional(),
    id: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/),
    title: z.string().trim().min(1).max(160),
    content: publicationContentSchema,
  })
  .strict();
export const releaseBundleSchema = z
  .object({
    schemaVersion: z.literal(1),
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
    notification: releaseNotificationSchema.nullable(),
    assets: z
      .array(
        z
          .object({
            id: z.string().uuid(),
            alt: z.string().trim().min(1).max(300),
            mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]),
            data: z.string().max(2_800_000),
          })
          .strict(),
      )
      .max(5)
      .default([]),
  })
  .strict()
  .superRefine((bundle, context) => {
    const ids = new Set(bundle.assets.map((asset) => asset.id));
    if (
      ids.size !== bundle.assets.length ||
      bundle.notification?.content.assetIds.some((id) => !ids.has(id))
    )
      context.addIssue({
        code: "custom",
        message: "Не найдены изображения публикации",
      });
  });
export type ReleaseBundle = z.infer<typeof releaseBundleSchema>;
