import { Counter, Gauge, Histogram } from "prom-client";

import { register } from "./metrics";

export const fileArtifactCleanupJobsTotal = new Counter({
  name: "file_artifact_cleanup_jobs_total",
  help: "Durable file artifact cleanup jobs processed by outcome",
  labelNames: ["outcome"] as const,
  registers: [register],
});

export const fileArtifactCleanupJobDurationSeconds = new Histogram({
  name: "file_artifact_cleanup_job_duration_seconds",
  help: "Duration of a file artifact cleanup job attempt",
  buckets: [0.05, 0.2, 1, 5, 15, 30, 60, 180, 300],
  registers: [register],
});

export const fileArtifactCleanupQueueJobs = new Gauge({
  name: "file_artifact_cleanup_queue_jobs",
  help: "Current durable file artifact cleanup queue size (error is retryable; dead is terminal)",
  labelNames: ["status"] as const,
  registers: [register],
});

export const fileArtifactCleanupOldestReadyAgeSeconds = new Gauge({
  name: "file_artifact_cleanup_oldest_ready_age_seconds",
  help: "Age in seconds of the oldest file artifact cleanup job ready to be claimed",
  registers: [register],
});
