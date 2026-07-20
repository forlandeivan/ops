import { z } from "zod";

import type { JsonObject } from "./plugin-system";

export const mcpTransports = ["streamable_http"] as const;
export type McpTransport = (typeof mcpTransports)[number];

export const mcpInstallationStatuses = ["draft", "ready", "error", "disabled"] as const;
export type McpInstallationStatus = (typeof mcpInstallationStatuses)[number];

export const mcpToolPermissionLevels = ["read", "write", "admin"] as const;
export type McpToolPermissionLevel = (typeof mcpToolPermissionLevels)[number];

export const mcpToolConfirmationPolicies = ["never", "ask", "always"] as const;
export type McpToolConfirmationPolicy = (typeof mcpToolConfirmationPolicies)[number];

export const mcpToolHealthStatuses = ["unknown", "healthy", "unhealthy"] as const;
export type McpToolHealthStatus = (typeof mcpToolHealthStatuses)[number];

export const mcpServerTrustTiers = ["vendor_verified", "partner_verified", "community", "private"] as const;
export type McpServerTrustTier = (typeof mcpServerTrustTiers)[number];

export const mcpServerRegistryStatuses = ["active", "disabled"] as const;
export type McpServerRegistryStatus = (typeof mcpServerRegistryStatuses)[number];

const jsonObjectInputSchema = z.record(z.string(), z.unknown());
const jsonStringRecordSchema = z.record(z.string(), z.string());

export const mcpToolPolicySchema = z.object({
  permissionLevel: z.enum(mcpToolPermissionLevels).optional(),
  confirmationPolicy: z.enum(mcpToolConfirmationPolicies).optional(),
  enabled: z.boolean().optional(),
  exposedToAgent: z.boolean().optional(),
  tags: z.array(z.string().trim().min(1).max(80)).max(32).optional(),
});

export type McpToolPolicy = z.infer<typeof mcpToolPolicySchema>;

export const agentRuntimeMcpToolCapabilitySchema = z.object({
  id: z.string().min(1),
  installationId: z.string().min(1),
  serverKey: z.string().trim().min(1),
  toolName: z.string().trim().min(1),
  displayName: z.string().trim().min(1),
  description: z.string().nullable(),
  inputSchema: jsonObjectInputSchema.default({}),
  permissionLevel: z.enum(mcpToolPermissionLevels),
  confirmationPolicy: z.enum(mcpToolConfirmationPolicies),
  enabled: z.boolean().default(true),
  exposedToAgent: z.boolean().default(true),
  healthStatus: z.enum(mcpToolHealthStatuses),
  tags: z.array(z.string()).default([]),
});

export type AgentRuntimeMcpToolCapability = z.infer<typeof agentRuntimeMcpToolCapabilitySchema>;

export const localMcpServerEntrySchema = z
  .object({
    transport: z.enum(mcpTransports).optional(),
    type: z.string().trim().min(1).optional(),
    url: z.string().url().optional(),
    baseUrl: z.string().url().optional(),
    version: z.string().trim().min(1).optional(),
    protocolVersion: z.string().trim().min(1).optional(),
    name: z.string().trim().min(1).optional(),
    description: z.string().trim().min(1).optional(),
    configSchema: jsonObjectInputSchema.optional(),
    secretSchema: jsonObjectInputSchema.optional(),
    headers: jsonStringRecordSchema.optional(),
    toolDefaults: mcpToolPolicySchema.optional(),
    tools: z.record(z.string(), mcpToolPolicySchema).optional(),
    metadata: jsonObjectInputSchema.optional(),
    command: z.string().trim().min(1).optional(),
    args: z.array(z.string()).optional(),
  })
  .passthrough();

export type LocalMcpServerEntry = z.infer<typeof localMcpServerEntrySchema>;

export const localMcpServerFileSchema = z.object({
  mcpServers: z.record(z.string(), localMcpServerEntrySchema),
});

export type LocalMcpServerFile = z.infer<typeof localMcpServerFileSchema>;

export const mcpServerManifestSchema = z.object({
  serverKey: z.string().trim().min(1).max(255),
  name: z.string().trim().min(1).max(255),
  description: z.string().trim().max(4000).nullable().optional(),
  version: z.string().trim().min(1).max(100),
  transport: z.enum(mcpTransports),
  protocolVersion: z.string().trim().min(1).max(64).default("2025-11-25"),
  defaultBaseUrl: z.string().url(),
  configSchema: jsonObjectInputSchema.default({}),
  secretSchema: jsonObjectInputSchema.default({}),
  headerTemplates: jsonStringRecordSchema.default({}),
  toolDefaults: mcpToolPolicySchema.default({}),
  tools: z.record(z.string(), mcpToolPolicySchema).default({}),
  metadata: jsonObjectInputSchema.default({}),
});

export type McpServerManifest = z.infer<typeof mcpServerManifestSchema>;

export const workspaceMcpInstallationCreateSchema = z.object({
  serverId: z.string().uuid(),
  versionId: z.string().uuid().optional(),
  baseUrl: z.string().url().optional(),
  config: jsonObjectInputSchema.default({}),
  secrets: jsonObjectInputSchema.default({}),
  policyOverrides: mcpToolPolicySchema.default({}),
});

export type WorkspaceMcpInstallationCreateInput = z.infer<typeof workspaceMcpInstallationCreateSchema>;

export const workspaceMcpInstallationUpdateSchema = z.object({
  baseUrl: z.string().url().optional(),
  config: jsonObjectInputSchema.optional(),
  secrets: jsonObjectInputSchema.optional(),
  policyOverrides: mcpToolPolicySchema.optional(),
  status: z.enum(mcpInstallationStatuses).optional(),
  isActive: z.boolean().optional(),
});

export type WorkspaceMcpInstallationUpdateInput = z.infer<typeof workspaceMcpInstallationUpdateSchema>;

export const workspaceMcpToolPolicyUpdateSchema = mcpToolPolicySchema.extend({
  enabled: z.boolean().optional(),
  exposedToAgent: z.boolean().optional(),
});

export type WorkspaceMcpToolPolicyUpdateInput = z.infer<typeof workspaceMcpToolPolicyUpdateSchema>;

export type McpJsonObject = JsonObject;
