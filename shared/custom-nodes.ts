import { z } from "zod";

import type { JsonObject } from "./plugin-system";

export const customNodeLibraryStatuses = ["active", "archived"] as const;
export const customNodeDefinitionStatuses = ["draft", "published", "archived"] as const;
export const customNodeRuntimeLanguages = ["javascript"] as const;
export const customNodeTestRunPhases = [
  "input_validation",
  "compile",
  "execute",
  "timeout",
  "output_validation",
] as const;

export type CustomNodeLibraryStatus = (typeof customNodeLibraryStatuses)[number];
export type CustomNodeDefinitionStatus = (typeof customNodeDefinitionStatuses)[number];
export type CustomNodeRuntimeLanguage = (typeof customNodeRuntimeLanguages)[number];
export type CustomNodeTestRunPhase = (typeof customNodeTestRunPhases)[number];

export type CustomNodeRuntimeConfig = {
  language: CustomNodeRuntimeLanguage;
  timeoutMs: number;
  sourceSizeLimitBytes: number;
  inputSizeLimitBytes: number;
  outputSizeLimitBytes: number;
};

export const DEFAULT_CUSTOM_NODE_INPUT_SCHEMA: JsonObject = {
  type: "object",
  additionalProperties: true,
};

export const DEFAULT_CUSTOM_NODE_OUTPUT_SCHEMA: JsonObject = {
  type: "object",
  additionalProperties: true,
};

export const DEFAULT_CUSTOM_NODE_RUNTIME_CONFIG: CustomNodeRuntimeConfig = {
  language: "javascript",
  timeoutMs: 1000,
  sourceSizeLimitBytes: 50_000,
  inputSizeLimitBytes: 262_144,
  outputSizeLimitBytes: 262_144,
};

const jsonObjectSchema = z.record(z.string(), z.unknown());

export const customNodeRuntimeConfigSchema = z.object({
  language: z.enum(customNodeRuntimeLanguages).default("javascript"),
  timeoutMs: z.number().int().min(50).max(5000).default(DEFAULT_CUSTOM_NODE_RUNTIME_CONFIG.timeoutMs),
  sourceSizeLimitBytes: z
    .number()
    .int()
    .min(1_000)
    .max(200_000)
    .default(DEFAULT_CUSTOM_NODE_RUNTIME_CONFIG.sourceSizeLimitBytes),
  inputSizeLimitBytes: z
    .number()
    .int()
    .min(1_000)
    .max(1_048_576)
    .default(DEFAULT_CUSTOM_NODE_RUNTIME_CONFIG.inputSizeLimitBytes),
  outputSizeLimitBytes: z
    .number()
    .int()
    .min(1_000)
    .max(1_048_576)
    .default(DEFAULT_CUSTOM_NODE_RUNTIME_CONFIG.outputSizeLimitBytes),
});

export const createCustomNodeLibrarySchema = z.object({
  name: z.string().trim().min(1).max(255),
  slug: z.string().trim().min(1).max(255).optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  sortOrder: z.number().int().min(0).max(1_000_000).optional(),
});

export const updateCustomNodeLibrarySchema = createCustomNodeLibrarySchema.partial().extend({
  status: z.enum(customNodeLibraryStatuses).optional(),
});

export const createCustomNodeDefinitionSchema = z.object({
  key: z.string().trim().min(1).max(255),
  name: z.string().trim().min(1).max(255),
  description: z.string().trim().max(5000).nullable().optional(),
  sourceCode: z.string().min(1).max(200_000).optional(),
  inputSchema: jsonObjectSchema.optional(),
  outputSchema: jsonObjectSchema.optional(),
  runtimeConfig: customNodeRuntimeConfigSchema.partial().optional(),
});

export const updateCustomNodeDefinitionSchema = createCustomNodeDefinitionSchema.partial().extend({
  status: z.enum(customNodeDefinitionStatuses).optional(),
});

export const testRunCustomNodeDefinitionSchema = z.object({
  input: z.unknown().default({}),
  sourceCode: z.string().min(1).max(200_000).optional(),
  inputSchema: jsonObjectSchema.optional(),
  outputSchema: jsonObjectSchema.optional(),
  runtimeConfig: customNodeRuntimeConfigSchema.partial().optional(),
});

export type CreateCustomNodeLibraryDto = z.infer<typeof createCustomNodeLibrarySchema>;
export type UpdateCustomNodeLibraryDto = z.infer<typeof updateCustomNodeLibrarySchema>;
export type CreateCustomNodeDefinitionDto = z.infer<typeof createCustomNodeDefinitionSchema>;
export type UpdateCustomNodeDefinitionDto = z.infer<typeof updateCustomNodeDefinitionSchema>;
export type TestRunCustomNodeDefinitionDto = z.infer<typeof testRunCustomNodeDefinitionSchema>;

export type CustomNodeVersionDto = {
  id: string;
  nodeDefinitionId: string;
  versionNo: number;
  inputSchema: JsonObject;
  outputSchema: JsonObject;
  runtimeConfig: CustomNodeRuntimeConfig;
  sourceHash: string;
  publishedByUserId: string | null;
  publishedAt: string;
};

export type AdminCustomNodeDefinitionDto = {
  id: string;
  libraryId: string;
  key: string;
  name: string;
  description: string | null;
  status: CustomNodeDefinitionStatus;
  currentPublishedVersionId: string | null;
  currentPublishedVersion: CustomNodeVersionDto | null;
  draftSourceCode: string;
  draftInputSchema: JsonObject;
  draftOutputSchema: JsonObject;
  draftRuntimeConfig: CustomNodeRuntimeConfig;
  draftRevision: number;
  createdAt: string;
  updatedAt: string;
};

export type AdminCustomNodeLibraryDto = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: CustomNodeLibraryStatus;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  nodes: AdminCustomNodeDefinitionDto[];
};

export type CustomNodeCatalogVersionDto = Pick<
  CustomNodeVersionDto,
  "id" | "versionNo" | "inputSchema" | "outputSchema" | "runtimeConfig" | "sourceHash" | "publishedAt"
>;

export type CustomNodeCatalogNodeDto = {
  id: string;
  libraryId: string;
  key: string;
  name: string;
  description: string | null;
  currentVersion: CustomNodeCatalogVersionDto;
};

export type CustomNodeCatalogLibraryDto = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  sortOrder: number;
  nodes: CustomNodeCatalogNodeDto[];
};

export type CustomNodeTestRunSuccessDto = {
  ok: true;
  output: Record<string, unknown>;
  durationMs: number;
  sourceHash: string;
};

export type CustomNodeTestRunErrorDto = {
  ok: false;
  phase: CustomNodeTestRunPhase;
  message: string;
  details?: unknown;
  durationMs: number;
  sourceHash?: string;
};

export type CustomNodeTestRunDto = CustomNodeTestRunSuccessDto | CustomNodeTestRunErrorDto;
