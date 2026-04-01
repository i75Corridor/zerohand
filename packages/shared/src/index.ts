// Pipeline run statuses
export const PIPELINE_RUN_STATUS = ["queued", "running", "paused", "completed", "failed", "cancelled"] as const;
export type PipelineRunStatus = (typeof PIPELINE_RUN_STATUS)[number];

// Step run statuses
export const STEP_RUN_STATUS = ["queued", "running", "awaiting_approval", "completed", "failed", "cancelled"] as const;
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

export interface ApiSkill {
  name: string;
  version: string;
  description: string;
  allowedTools: string[];
  scripts: string[];
  content?: string;
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

export interface ApiPipelineStep {
  id: string;
  stepIndex: number;
  name: string;
  skillName: string | null;
  promptTemplate: string;
  timeoutSeconds: number;
  approvalRequired: boolean;
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
  entity: "pipeline" | "step";
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
