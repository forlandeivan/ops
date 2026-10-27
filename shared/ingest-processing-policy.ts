import { z } from "zod";

/** Permission to spend work on a batch; independent of a user's confirmation. */
export const ingestProcessingPolicySchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("confirmation") }).strict(),
  z.object({
    mode: z.literal("automatic"),
    maxOcrPagesPerBatch: z.number().int().min(1).max(100_000),
    maxVisionImagesPerBatch: z.number().int().min(1).max(100_000),
  }).strict(),
]);
export type IngestProcessingPolicy = z.infer<typeof ingestProcessingPolicySchema>;
export const DEFAULT_INGEST_PROCESSING_POLICY: IngestProcessingPolicy = { mode: "confirmation" };

export const ingestProcessingPolicySnapshotSchema = z.object({
  version: z.literal(1),
  policy: ingestProcessingPolicySchema,
  origin: z.enum(["default", "instance", "workspace"]),
  revision: z.string().nullable(),
  capturedAt: z.string(),
  appliedByAdminId: z.string().nullable(),
});
export type IngestProcessingPolicySnapshot = z.infer<typeof ingestProcessingPolicySnapshotSchema>;
export function readIngestProcessingPolicy(value: unknown): IngestProcessingPolicy {
  return ingestProcessingPolicySnapshotSchema.safeParse(value).data?.policy ?? DEFAULT_INGEST_PROCESSING_POLICY;
}

export type IngestProcessingPolicySettings = {
  instance: IngestProcessingPolicy;
  override: IngestProcessingPolicy | null;
  effective: IngestProcessingPolicySnapshot;
};

/** Zero is a known text-only plan; unknown/invalid sizes fail closed. */
export function canReserveIngestWork(limit: number, used: number, reserved: number, requested: number): boolean {
  return Number.isSafeInteger(requested) && requested >= 0
    && Number.isSafeInteger(used) && used >= 0
    && Number.isSafeInteger(reserved) && reserved >= 0
    && used + Math.max(0, requested - reserved) <= limit;
}
