import type {
  ApiPipelineRun,
  ApiStepRun,
  ApiPipeline,
  ApiPipelineStep,
  ApiTrigger,
  ApiApproval,
  ApiBudgetPolicy,
  ApiSkill,
  ApiSecret,
  ApiInstalledPackage,
  ApiDiscoveredPackage,
  ApiModelEntry,
} from "@zerohand/shared";

const BASE = "/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}: ${body}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  // Pipelines
  listPipelines: () => request<ApiPipeline[]>("/pipelines"),
  getPipeline: (id: string) => request<ApiPipeline>(`/pipelines/${id}`),
  createPipeline: (body: Partial<ApiPipeline>) =>
    request<ApiPipeline>("/pipelines", { method: "POST", body: JSON.stringify(body) }),
  updatePipeline: (id: string, body: Partial<ApiPipeline>) =>
    request<ApiPipeline>(`/pipelines/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deletePipeline: (id: string) => request<void>(`/pipelines/${id}`, { method: "DELETE" }),

  // Pipeline steps
  listSteps: (pipelineId: string) =>
    request<ApiPipelineStep[]>(`/pipelines/${pipelineId}/steps`),
  createStep: (pipelineId: string, body: Partial<ApiPipelineStep>) =>
    request<ApiPipelineStep>(`/pipelines/${pipelineId}/steps`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateStep: (pipelineId: string, stepId: string, body: Partial<ApiPipelineStep>) =>
    request<ApiPipelineStep>(`/pipelines/${pipelineId}/steps/${stepId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteStep: (pipelineId: string, stepId: string) =>
    request<void>(`/pipelines/${pipelineId}/steps/${stepId}`, { method: "DELETE" }),

  // Skills
  listSkills: () => request<ApiSkill[]>("/skills"),
  getSkill: (name: string) => request<ApiSkill>(`/skills/${name}`),

  // Pipeline runs
  listRuns: (pipelineId?: string) =>
    request<ApiPipelineRun[]>(`/runs${pipelineId ? `?pipelineId=${pipelineId}` : ""}`),
  getRun: (id: string) => request<ApiPipelineRun>(`/runs/${id}`),
  triggerRun: (pipelineId: string, inputParams: Record<string, unknown> = {}) =>
    request<ApiPipelineRun>("/runs", {
      method: "POST",
      body: JSON.stringify({ pipelineId, inputParams }),
    }),
  cancelRun: (id: string) => request<ApiPipelineRun>(`/runs/${id}/cancel`, { method: "POST" }),
  getRunSteps: (runId: string) => request<ApiStepRun[]>(`/runs/${runId}/steps`),
  getStepEvents: (runId: string, stepRunId: string) =>
    request<unknown[]>(`/runs/${runId}/steps/${stepRunId}/events`),

  // Triggers
  listTriggers: (pipelineId: string) =>
    request<ApiTrigger[]>(`/pipelines/${pipelineId}/triggers`),
  createTrigger: (pipelineId: string, body: Partial<ApiTrigger>) =>
    request<ApiTrigger>(`/pipelines/${pipelineId}/triggers`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateTrigger: (id: string, body: Partial<ApiTrigger>) =>
    request<ApiTrigger>(`/triggers/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteTrigger: (id: string) => request<void>(`/triggers/${id}`, { method: "DELETE" }),

  // Approvals
  listApprovals: (status = "pending") =>
    request<ApiApproval[]>(`/approvals?status=${status}`),
  approveStep: (id: string, note?: string) =>
    request<ApiApproval>(`/approvals/${id}/approve`, { method: "POST", body: JSON.stringify({ note }) }),
  rejectStep: (id: string, note?: string) =>
    request<ApiApproval>(`/approvals/${id}/reject`, { method: "POST", body: JSON.stringify({ note }) }),

  // Stats
  getStats: () =>
    request<{ runsThisMonth: number; activeRuns: number; costCentsThisMonth: number }>("/stats"),

  // Settings
  getSettings: () => request<import("@zerohand/shared").ApiSetting[]>("/settings"),
  getSetting: (key: string) => request<import("@zerohand/shared").ApiSetting>(`/settings/${key}`),
  updateSetting: (key: string, value: unknown) =>
    request<import("@zerohand/shared").ApiSetting>(`/settings/${key}`, {
      method: "PUT",
      body: JSON.stringify({ value }),
    }),

  // Files
  getFileUrl: (serverPath: string): string => {
    const filename = serverPath.split("/").pop() ?? serverPath;
    return `/api/files/${encodeURIComponent(filename)}`;
  },

  // Secrets
  listSecrets: () => request<ApiSecret[]>("/secrets"),
  createSecret: (key: string, value: string, description?: string) =>
    request<ApiSecret>("/secrets", {
      method: "POST",
      body: JSON.stringify({ key, value, description }),
    }),
  updateSecret: (key: string, value: string, description?: string) =>
    request<ApiSecret>(`/secrets/${encodeURIComponent(key)}`, {
      method: "PUT",
      body: JSON.stringify({ value, description }),
    }),
  deleteSecret: (key: string) =>
    request<void>(`/secrets/${encodeURIComponent(key)}`, { method: "DELETE" }),

  // Packages
  listInstalledPackages: () => request<ApiInstalledPackage[]>("/packages"),
  discoverPackages: (q?: string) =>
    request<ApiDiscoveredPackage[]>(`/packages/discover${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  installPackage: (repoUrl: string) =>
    request<{ pipelineName: string }>("/packages/install", {
      method: "POST",
      body: JSON.stringify({ repoUrl }),
    }),
  updatePackage: (id: string) => request<{ pipelineName: string }>(`/packages/${id}/update`, { method: "POST" }),
  uninstallPackage: (id: string) => request<void>(`/packages/${id}`, { method: "DELETE" }),
  checkForUpdates: () => request<{ message: string }>("/packages/check-updates", { method: "POST" }),

  // Models
  listModels: () => request<ApiModelEntry[]>("/models"),

  // Budgets
  listBudgets: (scopeType?: string, scopeId?: string) => {
    const params = new URLSearchParams();
    if (scopeType) params.set("scopeType", scopeType);
    if (scopeId) params.set("scopeId", scopeId);
    const qs = params.toString();
    return request<ApiBudgetPolicy[]>(`/budgets${qs ? `?${qs}` : ""}`);
  },
  createBudget: (body: Partial<ApiBudgetPolicy>) =>
    request<ApiBudgetPolicy>("/budgets", { method: "POST", body: JSON.stringify(body) }),
  updateBudget: (id: string, body: Partial<ApiBudgetPolicy>) =>
    request<ApiBudgetPolicy>(`/budgets/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteBudget: (id: string) => request<void>(`/budgets/${id}`, { method: "DELETE" }),
};
