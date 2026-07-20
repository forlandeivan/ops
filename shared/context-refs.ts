import { z } from "zod";

export const contextRefTargetTypes = ["knowledge_base", "canvas_document"] as const;
export const contextRefSources = ["composer", "agent_context_request"] as const;

export const contextRefSnapshotSchema = z.object({
  revision: z.number().int().positive().optional(),
  updatedAt: z.string().trim().min(1).optional(),
});

export const contextRefSchema = z.object({
  type: z.enum(contextRefTargetTypes),
  id: z.string().trim().min(1).max(200),
  label: z.string().trim().min(1).max(300),
  href: z.string().trim().min(1).max(1000),
  snapshot: contextRefSnapshotSchema.optional(),
  source: z.enum(contextRefSources),
});

export const resolvedContextRefSchema = contextRefSchema.extend({
  resolvedAt: z.string().trim().min(1),
  resolvedText: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const textPartSchema = z.object({
  kind: z.literal("text"),
  text: z.string(),
});

export const contextRefPartSchema = z.object({
  kind: z.literal("context_ref"),
  ref: contextRefSchema,
});

export const composerPartSchema = z.union([textPartSchema, contextRefPartSchema]);

export const composerDraftSchema = z.object({
  parts: z.array(composerPartSchema).default([]),
});

export const contextRefSearchQuerySchema = z.object({
  q: z.string().trim().max(200).optional().default(""),
  types: z
    .string()
    .trim()
    .optional()
    .transform((value) => {
      const raw = value?.length ? value.split(",") : [...contextRefTargetTypes];
      const normalized = raw
        .map((item) => item.trim())
        .filter((item): item is ContextRefTargetType =>
          contextRefTargetTypes.includes(item as ContextRefTargetType),
        );
      return normalized.length > 0 ? Array.from(new Set(normalized)) : [...contextRefTargetTypes];
    }),
  chatId: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
});

export const workflowContextRequestChatMetadataSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["pending", "submitted", "expired", "cancelled"]),
  nodeId: z.string(),
  stepId: z.string(),
  question: z.string().trim().min(1).max(2000),
  queryHint: z.string().trim().max(500).nullable().optional(),
  acceptedTypes: z.array(z.enum(contextRefTargetTypes)).min(1).max(contextRefTargetTypes.length),
  submittedContextRefs: z.array(contextRefSchema).default([]),
  resolvedContextRefs: z.array(resolvedContextRefSchema).default([]),
});

export const assistantWorkflowContextRequestSubmissionSchema = z.object({
  contextRefs: z.array(contextRefSchema).max(20),
  composerParts: z.array(composerPartSchema).max(200).optional(),
});

export type ContextRefTargetType = (typeof contextRefTargetTypes)[number];
export type ContextRefSource = (typeof contextRefSources)[number];
export type ContextRef = z.infer<typeof contextRefSchema>;
export type ResolvedContextRef = z.infer<typeof resolvedContextRefSchema>;
export type TextPart = z.infer<typeof textPartSchema>;
export type ContextRefPart = z.infer<typeof contextRefPartSchema>;
export type ComposerPart = z.infer<typeof composerPartSchema>;
export type ComposerDraft = z.infer<typeof composerDraftSchema>;
export type WorkflowContextRequestChatMetadata = z.infer<typeof workflowContextRequestChatMetadataSchema>;
export type AssistantWorkflowContextRequestSubmission = z.infer<
  typeof assistantWorkflowContextRequestSubmissionSchema
>;

export type ComposerSubmitPayload = {
  content: string;
  composerParts: ComposerPart[];
  contextRefs: ContextRef[];
};

export function createEmptyComposerDraft(): ComposerDraft {
  return { parts: [] };
}

export function createTextComposerDraft(text: string): ComposerDraft {
  return text.length > 0 ? { parts: [{ kind: "text", text }] } : createEmptyComposerDraft();
}

export function getContextRefTypeLabel(type: ContextRefTargetType): string {
  return type === "knowledge_base" ? "База знаний" : "Холст";
}

export function contextRefToPlainText(ref: Pick<ContextRef, "type" | "label">): string {
  return `/${getContextRefTypeLabel(ref.type)}: ${ref.label}`;
}

export function normalizeComposerParts(parts: ComposerPart[] | undefined | null): ComposerPart[] {
  const normalized: ComposerPart[] = [];
  for (const part of parts ?? []) {
    if (part.kind === "text") {
      if (part.text.length === 0) {
        continue;
      }
      const previous = normalized[normalized.length - 1];
      if (previous?.kind === "text") {
        previous.text += part.text;
      } else {
        normalized.push({ kind: "text", text: part.text });
      }
      continue;
    }
    normalized.push(part);
  }
  return normalized;
}

export function composerPartsToPlainText(parts: ComposerPart[] | undefined | null): string {
  return normalizeComposerParts(parts)
    .map((part) => (part.kind === "text" ? part.text : contextRefToPlainText(part.ref)))
    .join("");
}

export function draftToPlainText(draft: ComposerDraft | undefined | null): string {
  return composerPartsToPlainText(draft?.parts ?? []);
}

export function extractContextRefsFromParts(parts: ComposerPart[] | undefined | null): ContextRef[] {
  const refs = new Map<string, ContextRef>();
  for (const part of parts ?? []) {
    if (part.kind !== "context_ref") {
      continue;
    }
    refs.set(`${part.ref.type}:${part.ref.id}`, part.ref);
  }
  return Array.from(refs.values());
}

export function buildComposerSubmitPayload(draft: ComposerDraft): ComposerSubmitPayload {
  const composerParts = normalizeComposerParts(draft.parts);
  return {
    content: composerPartsToPlainText(composerParts),
    composerParts,
    contextRefs: extractContextRefsFromParts(composerParts),
  };
}

export function coerceComposerDraft(value: ComposerDraft | string | undefined | null): ComposerDraft {
  if (typeof value === "string") {
    return createTextComposerDraft(value);
  }
  if (!value || !Array.isArray(value.parts)) {
    return createEmptyComposerDraft();
  }
  return { parts: normalizeComposerParts(value.parts) };
}
