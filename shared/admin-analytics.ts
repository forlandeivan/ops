/**
 * Shared types for Admin Analytics Dashboard
 */

// ============================================================================
// Common
// ============================================================================

export type AnalyticsDateRange = {
  from: string; // ISO date string
  to: string;   // ISO date string
};

export type AnalyticsInstallationType = "cloud" | "onprem";
export type AnalyticsFeatureArea =
  | "chat"
  | "rag"
  | "asr"
  | "knowledge_base"
  | "documents"
  | "assistants"
  | "actions"
  | "imports"
  | "storage"
  | "vector";
export type AnalyticsEntityType =
  | "knowledge_base"
  | "knowledge_document"
  | "canvas_document"
  | "transcript";
export type AnalyticsStatusGroup = "success" | "error" | "blocked";
export type AnalyticsNewReturning = "all" | "new" | "returning";
export type AnalyticsUserRole = "owner" | "manager" | "user";
export type AnalyticsTeamSizeSegment = "all" | "solo" | "team_2_plus" | "team_4_plus";

export type AdminAnalyticsQuery = AnalyticsDateRange & {
  workspaceIds?: string[];
  installationType?: AnalyticsInstallationType | "all";
  featureArea?: AnalyticsFeatureArea | "all";
  provider?: string;
  model?: string;
  status?: AnalyticsStatusGroup | "all";
  newVsReturning?: AnalyticsNewReturning;
  userRole?: AnalyticsUserRole | "all";
  teamSizeSegment?: AnalyticsTeamSizeSegment;
};

export type AnalyticsGranularity = "day" | "week";

export type TimeseriesPoint = {
  day: string; // YYYY-MM-DD
  value: number;
};

export type AdminAnalyticsMetricDefinition = {
  key: string;
  label: string;
  labelRu: string;
  abbreviation?: string;
  description: string;
  unit: "count" | "ratio" | "tokens" | "credits" | "minutes" | "bytes" | "milliseconds";
  semantics: string[];
};

export type AdminAnalyticsDefinitionsResponse = {
  generatedAt: string;
  featureAreas: Array<{ key: AnalyticsFeatureArea; label: string; labelRu: string }>;
  entityTypes: Array<{ key: AnalyticsEntityType; label: string; labelRu: string }>;
  metrics: AdminAnalyticsMetricDefinition[];
};

export type AdminAnalyticsFilterOption = {
  value: string;
  label: string;
  count?: number;
};

export type AdminAnalyticsFiltersResponse = {
  generatedAt: string;
  defaults: {
    featureArea: AnalyticsFeatureArea | "all";
  };
  filters: {
    featureAreas: AdminAnalyticsFilterOption[];
    workspaces: AdminAnalyticsFilterOption[];
  };
};

export type AdminAnalyticsResponseMeta = {
  query: AdminAnalyticsQuery;
  installationType: AnalyticsInstallationType;
  generatedAt: string;
  definitions: Array<Pick<AdminAnalyticsMetricDefinition, "key" | "labelRu" | "abbreviation">>;
};

export type AdminAnalyticsKpi = {
  key: string;
  label: string;
  labelRu: string;
  abbreviation?: string;
  unit: AdminAnalyticsMetricDefinition["unit"];
  value: number;
  previousValue: number;
  delta: number;
  deltaRatio: number | null;
};

export type AdminAnalyticsRebuildResponse = {
  from: string;
  to: string;
  userActivityRows: number;
  workspaceActivityRows: number;
  featureUsageRows: number;
  entityLifecycleRows: number;
  completedAt: string;
};

export type AdminAnalyticsHealthCheck = {
  key: string;
  label: string;
  ok: boolean;
  rawValue: number;
  aggregateValue: number;
  delta: number;
};

export type AdminAnalyticsRollupHealthResponse = {
  generatedAt: string;
  state: {
    pipelineKey: string;
    lastProcessedDay: string | null;
    lastRepairFrom: string | null;
    lastRepairTo: string | null;
    lastSuccessfulAt: string | null;
    lastError: string | null;
  };
  checks: AdminAnalyticsHealthCheck[];
};

// ============================================================================
// Active Users
// ============================================================================

export type ActiveUsersResponse = {
  dau: number;
  wau: number;
  mau: number;
  timeseries: TimeseriesPoint[];
  granularity?: AnalyticsGranularity;
  meta?: AdminAnalyticsResponseMeta;
};

// ============================================================================
// Summary
// ============================================================================

export type AdminAnalyticsSummaryResponse = {
  kpis: AdminAnalyticsKpi[];
  meta?: AdminAnalyticsResponseMeta;
};

// ============================================================================
// Active Workspaces
// ============================================================================

export type ActiveWorkspacesResponse = {
  activeWorkspaces: number;
  averageActiveWorkspaces: number;
  timeseries: TimeseriesPoint[];
  granularity: AnalyticsGranularity;
  meta?: AdminAnalyticsResponseMeta;
};

// ============================================================================
// New vs Returning Users
// ============================================================================

export type NewReturningUsersTimeseriesPoint = {
  day: string;
  newUsers: number;
  returningUsers: number;
};

export type AnalyticsUserSegment = "new" | "returning" | "mixed";

export type AnalyticsUserDrilldownRow = {
  userId: string;
  fullName: string;
  email: string;
  segment: AnalyticsUserSegment;
  activeDays: number;
  workspaceCount: number;
  meaningfulActions: number;
  featureBreadth: number;
};

export type NewReturningUsersResponse = {
  totals: {
    activeUsers: number;
    newUsers: number;
    returningUsers: number;
    activeDaysPerUser: number;
    actionsPerUser: number;
  };
  timeseries: NewReturningUsersTimeseriesPoint[];
  granularity: AnalyticsGranularity;
  topUsers: AnalyticsUserDrilldownRow[];
  meta?: AdminAnalyticsResponseMeta;
};

// ============================================================================
// Team Adoption
// ============================================================================

export type AnalyticsTeamDistributionSegment =
  | "solo"
  | "team_2_3"
  | "team_4_plus";

export type TeamAdoptionDistributionRow = {
  segment: AnalyticsTeamDistributionSegment;
  label: string;
  workspaces: number;
  share: number;
};

export type TeamAdoptionTimeseriesPoint = {
  day: string;
  soloWorkspaces: number;
  team2PlusWorkspaces: number;
  team4PlusWorkspaces: number;
};

export type TeamAdoptionWorkspaceRow = {
  workspaceId: string;
  workspaceName: string;
  teamSegment: AnalyticsTeamDistributionSegment;
  activeUsers: number;
  activeDays: number;
  meaningfulActions: number;
};

export type TeamAdoptionResponse = {
  summary: {
    activeWorkspaces: number;
    team2PlusWorkspaces: number;
    team4PlusWorkspaces: number;
    championRiskWorkspaces: number;
    teamAdoptionRate: number;
    team4PlusRate: number;
    championRiskRate: number;
  };
  distribution: TeamAdoptionDistributionRow[];
  timeseries: TeamAdoptionTimeseriesPoint[];
  granularity: AnalyticsGranularity;
  workspaces: TeamAdoptionWorkspaceRow[];
  meta?: AdminAnalyticsResponseMeta;
};

// ============================================================================
// Feature Adoption
// ============================================================================

export type FeatureAdoptionRow = {
  featureArea: AnalyticsFeatureArea;
  label: string;
  labelRu: string;
  uniqueUsers: number;
  uniqueWorkspaces: number;
  userAdoptionRate: number;
  workspaceAdoptionRate: number;
  createdCount: number;
  usedCount: number;
  reusedCount: number;
  repeatUsageRate: number;
  successCount: number;
  errorCount: number;
  blockedCount: number;
  successRate: number;
};

export type FeatureAdoptionMatrixResponse = {
  totals: {
    activeUsers: number;
    activeWorkspaces: number;
  };
  rows: FeatureAdoptionRow[];
  meta?: AdminAnalyticsResponseMeta;
};

// ============================================================================
// Workspace Health
// ============================================================================

export type WorkspaceHealthSegment = "growing" | "stable" | "at_risk" | "champion_risk";

export type WorkspaceHealthRow = {
  workspaceId: string;
  workspaceName: string;
  segment: WorkspaceHealthSegment;
  activeUsers: number;
  activeDays: number;
  meaningfulActions: number;
  featureBreadth: number;
  previousActiveUsers: number;
  previousMeaningfulActions: number;
  deltaActions: number;
  deltaActionsRatio: number | null;
};

export type WorkspaceHealthResponse = {
  summary: {
    activeWorkspaces: number;
    growing: number;
    stable: number;
    atRisk: number;
    championRisk: number;
  };
  rows: WorkspaceHealthRow[];
  meta?: AdminAnalyticsResponseMeta;
};

// ============================================================================
// Content Analytics
// ============================================================================

export type AnalyticsContentMode = "created" | "used" | "reused";
export type AnalyticsContentEntity = AnalyticsEntityType | "imports";

export type ContentOverviewRow = {
  entityType: AnalyticsContentEntity;
  label: string;
  labelRu: string;
  createdCount: number;
  usedCount: number;
  reusedCount: number;
  uniqueAuthors: number;
  uniqueUsers: number;
  activeWorkspaces: number;
  reuseRate: number;
};

export type ContentOverviewTimeseriesPoint = {
  day: string;
  knowledgeBasesCreated: number;
  knowledgeDocumentsCreated: number;
  canvasDocumentsCreated: number;
  transcriptsCreated: number;
  importsCreated: number;
  usedCount: number;
  reusedCount: number;
};

export type ContentOverviewResponse = {
  kpis: AdminAnalyticsKpi[];
  rows: ContentOverviewRow[];
  timeseries: ContentOverviewTimeseriesPoint[];
  meta?: AdminAnalyticsResponseMeta;
};

export type ContentDrilldownRow = {
  entityType: AnalyticsContentEntity;
  labelRu: string;
  workspaceId: string;
  workspaceName: string;
  createdCount: number;
  usedCount: number;
  reusedCount: number;
  uniqueAuthors: number;
  uniqueUsers: number;
  value: number;
};

export type ContentReuseResponse = {
  mode: AnalyticsContentMode;
  rows: ContentDrilldownRow[];
  meta?: AdminAnalyticsResponseMeta;
};

// ============================================================================
// AI Workload Analytics
// ============================================================================

export type AdminAnalyticsWorkloadMetrics = {
  llmTokens: number;
  embeddingTokens: number;
  asrMinutes: number;
  creditsBurned: number;
  storageBytes: number;
  vectorPoints: number;
  vectorStorage: number;
};

export type AiWorkloadTimeseriesPoint = AdminAnalyticsWorkloadMetrics & {
  day: string;
};

export type AiWorkloadBreakdownRow = AdminAnalyticsWorkloadMetrics & {
  key: string;
  label: string;
  labelRu: string;
};

export type AiWorkloadOverviewResponse = {
  totals: AdminAnalyticsWorkloadMetrics;
  perActiveWorkspace: AdminAnalyticsWorkloadMetrics;
  timeseries: AiWorkloadTimeseriesPoint[];
  perActiveWorkspaceTimeseries: AiWorkloadTimeseriesPoint[];
  workspaceRows: AiWorkloadBreakdownRow[];
  featureAreaRows: AiWorkloadBreakdownRow[];
  signals: {
    storageTimeseries: boolean;
    vectorTimeseries: boolean;
    featureAreaAttribution: boolean;
  };
  meta?: AdminAnalyticsResponseMeta;
};

export type AiProviderModelBreakdownKind = "llm" | "embedding" | "asr";

export type AiProviderModelBreakdownRow = {
  kind: AiProviderModelBreakdownKind;
  providerId?: string;
  provider: string;
  model: string;
  requests: number;
  llmTokens: number;
  embeddingTokens: number;
  asrMinutes: number;
  creditsBurned: number;
};

export type AiProviderModelBreakdownResponse = {
  rows: AiProviderModelBreakdownRow[];
  meta?: AdminAnalyticsResponseMeta;
};

// ============================================================================
// Quality / Failures Analytics
// ============================================================================

export type AnalyticsQualityArea =
  | "rag"
  | "asr"
  | "assistants"
  | "actions"
  | "indexing"
  | "imports"
  | "guard_blocks";

export type QualityOverviewRow = {
  area: AnalyticsQualityArea;
  label: string;
  labelRu: string;
  totalRuns: number;
  successCount: number;
  errorCount: number;
  blockedCount: number;
  successRate: number;
  errorRate: number;
  blockRate: number;
  averageDurationMs: number;
  durationSamples: number;
};

export type QualityOverviewTimeseriesPoint = {
  day: string;
  successCount: number;
  errorCount: number;
  blockedCount: number;
};

export type QualityOverviewAsrRtfxPoint = {
  executionId: string;
  occurredAt: string;
  rtfx: number;
  processingDurationMs: number;
  audioDurationMs: number;
  fileName: string | null;
  workspaceId: string | null;
  assistantId: string | null;
  provider: string | null;
  status: string;
};

export type QualityOverviewResponse = {
  summary: {
    totalRuns: number;
    successCount: number;
    errorCount: number;
    blockedCount: number;
    successRate: number;
    errorRate: number;
    blockRate: number;
    averageDurationMs: number;
    durationSamples: number;
    indexingDurationMs: number;
    ragResponseTimeMs: number;
  };
  rows: QualityOverviewRow[];
  timeseries: QualityOverviewTimeseriesPoint[];
  asrRtfxSeries: QualityOverviewAsrRtfxPoint[];
  meta?: AdminAnalyticsResponseMeta;
};

export type BlockedScenarioRow = {
  featureArea: AnalyticsFeatureArea;
  reasonCode: string;
  operationType: string;
  workspaceId: string;
  workspaceName: string;
  blocks: number;
  softBlocks: number;
  hardBlocks: number;
  upgradeAvailable: boolean;
  lastSeenAt: string;
};

export type BlockedScenariosResponse = {
  summary: {
    blockedEvents: number;
    affectedWorkspaces: number;
    softBlocks: number;
    hardBlocks: number;
    upgradeAvailableBlocks: number;
  };
  rows: BlockedScenarioRow[];
  meta?: AdminAnalyticsResponseMeta;
};

// ============================================================================
// Export
// ============================================================================

export type AdminAnalyticsExportKind =
  | "content"
  | "workload-workspaces"
  | "workload-providers"
  | "quality"
  | "blocked";

// ============================================================================
// Feature Usage
// ============================================================================

export type FeatureUsageTimeseries = {
  day: string;
  chats: number;
  messages: number;
  assistantExecutions: number;
  actionRuns: number;
  asrJobs: number;
  ragQueries: number;
};

export type FeatureUsageTotals = {
  chats: number;
  messages: number;
  assistantExecutions: number;
  actionRuns: number;
  asrJobs: number;
  ragQueries: number;
};

export type FeatureUsageResponse = {
  totals: FeatureUsageTotals;
  timeseries: FeatureUsageTimeseries[];
  meta?: AdminAnalyticsResponseMeta;
};

// ============================================================================
// Token Consumption
// ============================================================================

export type TokenConsumptionTimeseries = {
  day: string;
  llmTokens: number;
  embeddingTokens: number;
  llmCredits: number;
  embeddingCredits: number;
};

export type TokenConsumptionResponse = {
  totals: {
    llmTokens: number;
    embeddingTokens: number;
    llmCredits: number;
    embeddingCredits: number;
  };
  timeseries: TokenConsumptionTimeseries[];
};

// ============================================================================
// Top Workspaces
// ============================================================================

export type TopWorkspaceMetric = "activity" | "tokens" | "credits";

export type TopWorkspaceRow = {
  workspaceId: string;
  workspaceName: string;
  value: number;
};

export type TopWorkspacesResponse = {
  metric: TopWorkspaceMetric;
  rows: TopWorkspaceRow[];
};

// ============================================================================
// Growth
// ============================================================================

export type GrowthTimeseries = {
  day: string;
  newUsers: number;
  newWorkspaces: number;
};

export type GrowthResponse = {
  totalUsers: number;
  totalWorkspaces: number;
  timeseries: GrowthTimeseries[];
};
