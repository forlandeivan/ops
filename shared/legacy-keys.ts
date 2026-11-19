import { z } from "zod";

export function normalizeLegacyKeys(input: unknown, ctx: z.RefinementCtx, aliases: Readonly<Record<string, string>>): unknown {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return input;
  const values = { ...input } as Record<string, unknown>;
  for (const [legacy, canonical] of Object.entries(aliases)) {
    if (!(legacy in values)) continue;
    if (canonical in values && values[canonical] !== values[legacy]) {
      ctx.addIssue({ code: "custom", path: [canonical], message: "Conflicting values for legacy and canonical keys" });
    } else {
      values[canonical] = values[legacy];
    }
    delete values[legacy];
  }
  return values;
}

export function normalizeActionInheritance(input: unknown, ctx: z.RefinementCtx): unknown {
  return normalizeLegacyKeys(input, ctx, { inheritAssistantSystemPrompt: "inheritAgentSystemPrompt" });
}

export function normalizeAgentId(input: unknown, ctx: z.RefinementCtx): unknown {
  return normalizeLegacyKeys(input, ctx, { assistantId: "agentId" });
}
