import { z } from "zod";

import {
  confirmationPolicyValues,
  operationPermissionLevelValues,
  type JsonObject,
} from "./plugin-system";

export const systemOperationCategoryValues = [
  "admin",
  "agent",
  "chat",
  "data",
  "documents",
  "files",
  "geo",
  "knowledge",
  "packages",
  "security",
  "skills",
  "transcripts",
  "visualizations",
  "workflow",
  "workspace",
] as const;
export type SystemOperationCategory = (typeof systemOperationCategoryValues)[number];

const jsonObjectSchema: z.ZodType<JsonObject> = z.record(z.string(), z.unknown());

export const systemOperationDefinitionSchema = z.object({
  key: z.string().trim().min(1).max(255),
  fullKey: z.string().trim().min(1).max(255),
  name: z.string().trim().min(1).max(255),
  description: z.string().trim().max(4000).nullable().optional(),
  category: z.enum(systemOperationCategoryValues),
  permissionLevel: z.enum(operationPermissionLevelValues).default("read"),
  confirmationPolicy: z.enum(confirmationPolicyValues).default("never"),
  inputSchema: jsonObjectSchema.default({}),
  outputSchema: jsonObjectSchema.default({}),
  tags: z.array(z.string().trim().min(1).max(255)).default([]),
  metadata: jsonObjectSchema.default({}),
});

export const systemOperationListResponseSchema = z.object({
  operations: z.array(systemOperationDefinitionSchema),
});

export type SystemOperationDefinition = z.infer<typeof systemOperationDefinitionSchema>;
export type SystemOperationListResponse = z.infer<typeof systemOperationListResponseSchema>;
