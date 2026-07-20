import { z } from "zod";

export const workflowStatusTemplateAllowedNodeKinds = ["ai", "knowledge", "tool", "transcript"] as const;

export type WorkflowStatusTemplateAllowedNodeKind = (typeof workflowStatusTemplateAllowedNodeKinds)[number];

export const workflowStatusTemplateAllowedNodeKindSchema = z.enum(workflowStatusTemplateAllowedNodeKinds);

export const workflowStatusTemplateBasePlaceholders = ["nodeTitle"] as const;
export const workflowStatusTemplateKnowledgePlaceholders = ["knowledgeBaseName", "knowledgeBaseNames"] as const;
export const workflowStatusTemplateToolPlaceholders = ["toolName"] as const;
export const workflowStatusTemplateTranscriptPlaceholders = ["transcriptTitle"] as const;

export const workflowStatusTemplatePlaceholdersByNodeKind: Record<
  WorkflowStatusTemplateAllowedNodeKind,
  readonly string[]
> = {
  ai: workflowStatusTemplateBasePlaceholders,
  knowledge: [...workflowStatusTemplateBasePlaceholders, ...workflowStatusTemplateKnowledgePlaceholders],
  tool: [...workflowStatusTemplateBasePlaceholders, ...workflowStatusTemplateToolPlaceholders],
  transcript: [...workflowStatusTemplateBasePlaceholders, ...workflowStatusTemplateTranscriptPlaceholders],
};

export const workflowStatusTemplateSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(255),
  template: z.string().trim().min(1).max(500),
  allowedNodeKinds: z.array(workflowStatusTemplateAllowedNodeKindSchema).min(1),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const workflowStatusTemplateListQuerySchema = z.object({
  nodeKind: workflowStatusTemplateAllowedNodeKindSchema.optional(),
  activeOnly: z
    .union([z.boolean(), z.enum(["true", "false", "1", "0", "yes", "no"])])
    .optional()
    .transform((value) => {
      if (typeof value === "boolean") {
        return value;
      }
      if (value === undefined) {
        return false;
      }
      return value === "true" || value === "1" || value === "yes";
    }),
});

export const createWorkflowStatusTemplateSchema = z.object({
  name: z.string().trim().min(1).max(255),
  template: z.string().trim().min(1).max(500),
  allowedNodeKinds: z.array(workflowStatusTemplateAllowedNodeKindSchema).min(1),
  isActive: z.boolean().optional().default(true),
});

export const updateWorkflowStatusTemplateSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  template: z.string().trim().min(1).max(500).optional(),
  allowedNodeKinds: z.array(workflowStatusTemplateAllowedNodeKindSchema).min(1).optional(),
  isActive: z.boolean().optional(),
});

export type WorkflowStatusTemplateRecord = z.infer<typeof workflowStatusTemplateSchema>;
export type CreateWorkflowStatusTemplateInput = z.infer<typeof createWorkflowStatusTemplateSchema>;
export type UpdateWorkflowStatusTemplateInput = z.infer<typeof updateWorkflowStatusTemplateSchema>;
export type WorkflowStatusTemplateRenderValues = Partial<
  Record<
    | "nodeTitle"
    | "knowledgeBaseName"
    | "knowledgeBaseNames"
    | "toolName"
    | "transcriptTitle",
    string | null | undefined
  >
>;

const WORKFLOW_STATUS_TEMPLATE_PLACEHOLDER_PATTERN = /{{\s*([A-Za-z][A-Za-z0-9]*)\s*}}/g;

export function extractWorkflowStatusTemplatePlaceholders(template: string): string[] {
  const placeholders = new Set<string>();
  for (const match of template.matchAll(WORKFLOW_STATUS_TEMPLATE_PLACEHOLDER_PATTERN)) {
    const placeholder = match[1]?.trim();
    if (placeholder) {
      placeholders.add(placeholder);
    }
  }
  return [...placeholders];
}

export function getAllowedWorkflowStatusTemplatePlaceholders(
  allowedNodeKinds: readonly WorkflowStatusTemplateAllowedNodeKind[],
): string[] {
  const placeholders = new Set<string>();
  for (const nodeKind of allowedNodeKinds) {
    for (const placeholder of workflowStatusTemplatePlaceholdersByNodeKind[nodeKind] ?? []) {
      placeholders.add(placeholder);
    }
  }
  return [...placeholders];
}

export function validateWorkflowStatusTemplatePlaceholders(params: {
  template: string;
  allowedNodeKinds: readonly WorkflowStatusTemplateAllowedNodeKind[];
}): {
  placeholders: string[];
  invalidPlaceholders: string[];
} {
  const placeholders = extractWorkflowStatusTemplatePlaceholders(params.template);
  const allowed = new Set(getAllowedWorkflowStatusTemplatePlaceholders(params.allowedNodeKinds));
  return {
    placeholders,
    invalidPlaceholders: placeholders.filter((placeholder) => !allowed.has(placeholder)),
  };
}

export function renderWorkflowStatusTemplate(
  template: string,
  values: WorkflowStatusTemplateRenderValues,
): string {
  return template.replace(WORKFLOW_STATUS_TEMPLATE_PLACEHOLDER_PATTERN, (_match, rawName: string) => {
    const placeholderName = rawName.trim() as keyof WorkflowStatusTemplateRenderValues;
    const value = values[placeholderName];
    return typeof value === "string" ? value : "";
  });
}
