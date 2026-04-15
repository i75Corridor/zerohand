import { stringify } from "yaml";

// Pipeline run statuses
export const PIPELINE_RUN_STATUS = ["queued", "running", "paused", "completed", "failed", "cancelled"] as const;
export type PipelineRunStatus = (typeof PIPELINE_RUN_STATUS)[number];

// Step run statuses
export const STEP_RUN_STATUS = ["queued", "running", "retrying", "awaiting_approval", "completed", "failed", "cancelled"] as const;
export type StepRunStatus = (typeof STEP_RUN_STATUS)[number];

// Trigger types
export const TRIGGER_TYPE = ["cron", "webhook", "channel"] as const;
export type TriggerType = (typeof TRIGGER_TYPE)[number];

// Approval statuses
export const APPROVAL_STATUS = ["pending", "approved", "rejected"] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUS)[number];

// Step run event types
export const STEP_RUN_EVENT_TYPE = [
  "text_delta",
  "tool_call_start",
  "tool_call_end",
  "tool_result",
  "status_change",
  "error",
] as const;
export type StepRunEventType = (typeof STEP_RUN_EVENT_TYPE)[number];

/** Immutable step definition snapshotted when a run is created. */
export interface RunStepSnapshot {
  stepIndex: number;
  name: string;
  skillName: string | null;
  promptTemplate: string | null;
  approvalRequired: boolean;
  retryConfig: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
}

// API response shapes
export interface ApiPipelineRun {
  id: string;
  pipelineId: string;
  pipelineName?: string;
  status: PipelineRunStatus;
  inputParams: Record<string, unknown>;
  output: Record<string, unknown> | null;
  triggerType: string;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  createdAt: string;
  /** Step definitions as they existed when this run was triggered. */
  stepSnapshot?: RunStepSnapshot[];
}

export interface ApiStepRun {
  id: string;
  pipelineRunId: string;
  stepIndex: number;
  status: StepRunStatus;
  output: Record<string, unknown> | null;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface ApiSkillSchemaField {
  name: string;
  type?: "string" | "number" | "boolean";
  description?: string;
  required?: boolean;
}

export interface ApiSkill {
  name: string;
  /** Namespace this skill belongs to (e.g. "local", "daily-absurdist") */
  namespace: string;
  /** Fully-qualified name: "<namespace>/<name>" */
  qualifiedName?: string;
  version: string;
  description: string;
  allowedTools: string[];
  scripts: string[];
  content?: string;
  /** Advisory: what inputs this skill is designed to receive */
  inputSchema?: ApiSkillSchemaField[];
  /** What structured data this skill produces (enforced at runtime when present) */
  outputSchema?: ApiSkillSchemaField[];
}

export interface ApiPipeline {
  id: string;
  name: string;
  description: string | null;
  status: string;
  inputSchema: Record<string, unknown> | null;
  systemPrompt: string | null;
  modelProvider: string | null;
  modelName: string | null;
  steps: ApiPipelineStep[];
  createdAt: string;
}

export interface RetryConfig {
  maxRetries?: number;
  backoffMs?: number;
  retryOnErrors?: string[];
}

export interface ApiPipelineStep {
  id: string;
  stepIndex: number;
  name: string;
  skillName: string | null;
  /** Whether the skill file exists on disk. undefined when skillName is null. */
  skillFound?: boolean;
  promptTemplate: string;
  timeoutSeconds: number;
  approvalRequired: boolean;
  retryConfig: RetryConfig | null;
  metadata: Record<string, unknown> | null;
}

export interface ApiTrigger {
  id: string;
  pipelineId: string;
  type: "cron" | "webhook" | "channel";
  enabled: boolean;
  cronExpression: string | null;
  timezone: string;
  defaultInputs: Record<string, unknown>;
  nextRunAt: string | null;
  lastFiredAt: string | null;
  channelType: string | null;
  channelConfig: Record<string, unknown> | null;
  createdAt: string;
}

export interface ModelCostEntry {
  inputPerM: number;  // cents per 1M input tokens
  outputPerM: number; // cents per 1M output tokens
}

export interface ApiSetting {
  key: string;
  value: unknown;
  updatedAt: string;
}


export interface ApiApproval {
  id: string;
  pipelineRunId: string;
  stepRunId: string | null;
  status: ApprovalStatus;
  payload: Record<string, unknown>;
  decisionNote: string | null;
  decidedAt: string | null;
  pipelineName?: string;
  stepName?: string;
  createdAt: string;
}

export interface ApiBudgetPolicy {
  id: string;
  scopeType: "worker" | "pipeline";
  scopeId: string;
  amountCents: number;
  windowKind: "calendar_month" | "lifetime";
  warnPercent: number;
  hardStopEnabled: boolean;
  createdAt: string;
}

export type SecurityLevel = "low" | "medium" | "high";

export interface ApiSecurityFinding {
  level: SecurityLevel;
  category: string;
  file: string;
  line?: number;
  description: string;
}

export interface ApiSecurityReport {
  level: SecurityLevel;
  findings: ApiSecurityFinding[];
  scannedFiles: number;
  scannedAt: string;
}

export interface ApiInstalledBlueprint {
  id: string;
  repoUrl: string;
  repoFullName: string;
  pipelineId: string | null;
  pipelineName: string | null;
  skills: string[];
  updateAvailable: boolean;
  repoNotFound: boolean;
  installedRef: string | null;
  latestRef: string | null;
  metadata: Record<string, unknown> | null;
  installedAt: string | null;
  lastCheckedAt: string | null;
  updatedAt: string | null;
}

export interface ApiSkillBundleScript {
  filename: string;
  content: string;
}

export interface ApiSkillBundle {
  name: string;
  skillMd: string;
  scripts: ApiSkillBundleScript[];
}

export interface ApiDiscoveredBlueprint {
  fullName: string;
  description: string;
  url: string;
  stars: number;
  topics: string[];
  installed: boolean;
}

export interface ApiCostBreakdown {
  daily: { date: string; costCents: number }[];
  bySkill: { skillName: string; costCents: number }[];
  byPipeline: { pipelineName: string; costCents: number }[];
  summary: {
    totalThisMonth: number;
    dailyAverage: number;
    projectedMonthEnd: number;
    topSkill: string | null;
    topPipeline: string | null;
  };
}

export interface ApiPipelineVersion {
  id: string;
  pipelineId: string;
  versionNumber: number;
  snapshot?: ApiPipeline;
  changeSummary: string | null;
  createdAt: string;
}

export interface ApiValidationError {
  type:
    | "missing_skill"
    | "invalid_template"
    | "broken_step_ref"
    | "schema_mismatch"
    | "missing_mcp_server"
    | "missing_secret"
    | "missing_model"
    | "bash_not_enabled";
  stepIndex?: number;
  field: string;
  message: string;
  severity: "error" | "warning";
}

export interface ApiModelWarning {
  skillName: string;
  provider: string;
  model: string;
  message: string;
}

export interface ApiValidationResult {
  valid: boolean;
  errors: ApiValidationError[];
  warnings: ApiValidationError[];
}

export interface ApiBlueprintPreview {
  pipelineYaml: string;
  skills: Array<{
    name: string;
    qualifiedName: string;
    skillMd: string;
    scripts: Array<{ filename: string; content: string }>;
  }>;
  validation: ApiValidationResult;
}

export interface McpEnvRequirement {
  name: string;
  required: boolean;
  description?: string;
  docsUrl?: string;
  detectedFrom?: string;
}

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl: boolean;
  sslMode?: "disable" | "allow" | "prefer" | "require" | "verify-ca" | "verify-full";
}

export type ApiOAuthStatus = 'active' | 'expired' | 'revoked' | 'error' | 'disconnected';

export interface ApiOAuthConnection {
  id: string;
  mcpServerId: string;
  status: ApiOAuthStatus;
  scope?: string;
  tokenType: string;
  connectedAt: string;
  lastRefreshedAt?: string;
  expiresAt?: string;
  errorMessage?: string;
}

export interface ApiOAuthConfig {
  clientId: string;
  hasClientSecret: boolean;  // Never expose raw secret
  scopes?: string[];
}

export interface ApiOAuthConnectResponse {
  authUrl: string;
  state: string;
}

export interface ApiMcpServer {
  id: string;
  name: string;
  transport: "stdio" | "sse" | "streamable-http";
  command?: string;
  args?: string[];
  url?: string;
  headers?: Record<string, string>;
  env?: Record<string, string>;
  enabled: boolean;
  source: "manual" | "blueprint";
  sourceBlueprintId?: string;
  metadata?: {
    envRequirements?: McpEnvRequirement[];
  };
  oauthConfig?: ApiOAuthConfig;
  oauthConnection?: ApiOAuthConnection;
}

export interface ApiMcpTool {
  serverName: string;
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ApiModelEntry {
  /** e.g. "gemini-2.5-flash" */
  id: string;
  /** Full ID including provider: "google/gemini-2.5-flash" */
  fullId: string;
  /** Human-readable name */
  name: string;
  provider: string;
  contextWindow: number;
  maxTokens: number;
  reasoning: boolean;
  /** Cents per 1M input tokens (from registry, may be 0 if unknown) */
  costInputPerM: number;
  /** Cents per 1M output tokens */
  costOutputPerM: number;
  /** True if the env var for this provider is set */
  available: boolean;
}

// WebSocket message types
export interface WsStepEvent {
  type: "step_event";
  pipelineRunId: string;
  stepRunId: string;
  stepIndex: number;
  eventType: StepRunEventType;
  message?: string;
  payload?: Record<string, unknown>;
}

export interface WsRunStatusChange {
  type: "run_status";
  pipelineRunId: string;
  status: PipelineRunStatus;
}

export interface WsStepStatusChange {
  type: "step_status";
  pipelineRunId: string;
  stepRunId: string;
  stepIndex: number;
  status: StepRunStatus;
}

export interface WsChatAck {
  type: "chat_ack";
  stepRunId: string;
  accepted: boolean;
  error?: string;
}

export interface WsIncomingChat {
  type: "chat";
  stepRunId: string;
  action: "steer" | "followUp" | "abort";
  message?: string;
}

// Global agent WebSocket types
export interface WsIncomingGlobalChat {
  type: "global_chat";
  action: "prompt" | "abort" | "reset";
  message?: string;
  context?: { path: string; pipelineId?: string; runId?: string };
}

export interface WsDataChanged {
  type: "data_changed";
  entity: "pipeline" | "step" | "skill" | "trigger" | "approval" | "budget" | "blueprint" | "setting" | "cost";
  action: "created" | "updated" | "deleted";
  id: string;
}

export interface WsGlobalAgentEvent {
  type: "global_agent_event";
  eventType: "text_delta" | "tool_call_start" | "tool_call_end" | "status_change" | "error" | "navigate";
  message?: string;
  payload?: Record<string, unknown>;
}

export type WsMessage = WsStepEvent | WsRunStatusChange | WsStepStatusChange | WsChatAck | WsGlobalAgentEvent | WsDataChanged;

// ─── Pipeline → YAML ─────────────────────────────────────────────────────────

export function pipelineToYaml(pipeline: ApiPipeline): string {
  const doc: Record<string, unknown> = { name: pipeline.name };

  if (pipeline.description) doc.description = pipeline.description;

  if (pipeline.modelProvider && pipeline.modelName) {
    doc.model = `${pipeline.modelProvider}/${pipeline.modelName}`;
  }

  if (pipeline.systemPrompt) doc.systemPrompt = pipeline.systemPrompt;

  if (pipeline.inputSchema && Object.keys(pipeline.inputSchema).length > 0) {
    doc.inputSchema = pipeline.inputSchema;
  }

  doc.steps = pipeline.steps.map((step) => {
    const s: Record<string, unknown> = { name: step.name };
    if (step.skillName) s.skill = step.skillName;
    s.promptTemplate = step.promptTemplate;
    if (step.timeoutSeconds && step.timeoutSeconds !== 300) s.timeoutSeconds = step.timeoutSeconds;
    if (step.approvalRequired) s.approvalRequired = true;
    if (step.metadata && Object.keys(step.metadata).length > 0) s.metadata = step.metadata;
    return s;
  });

  return stringify(doc, { lineWidth: 100 });
}
