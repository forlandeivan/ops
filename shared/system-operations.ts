import { z } from "zod";

import {
  confirmationPolicyValues,
  operationPermissionLevelValues,
  type JsonObject,
} from "./plugin-system";

// Только выпущенные имена операций. Произвольный ключ из старого пространства имён прав не получает.
const profileOperationAliases = new Map<string, string>([
  ["assistant.read_material", "agent.read_material"],
  ["assistants.list_options", "agents.list_options"],
  ["assistants.list", "agents.list"],
  ["assistants.get", "agents.get"],
  ["assistants.dry_run", "agents.dry_run"],
  ["assistants.create", "agents.create"],
  ["assistants.update", "agents.update"],
  ["assistants.update_skills", "agents.update_skills"],
  ["assistants.bind_action", "agents.bind_action"],
  ["assistants.create_file_from_attachment", "agents.create_file_from_attachment"],
]);
const profileOperationKeys = new Set(profileOperationAliases.values());

export function canonicalSystemOperationKey(key: string): string {
  const bare = key.startsWith("system.") ? key.slice("system.".length) : key;
  return profileOperationAliases.get(bare) ?? (profileOperationKeys.has(bare) ? bare : key);
}

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
  "web",
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
