import type {
  ApiPipelineRun,
  ApiStepRun,
  ApiPipeline,
  ApiPipelineStep,
  ApiTrigger,
  ApiApproval,
  ApiBudgetPolicy,
  ApiSkill,
  ApiSkillBundle,
  ApiInstalledPackage,
  ApiDiscoveredPackage,
  ApiModelEntry,
  ApiCostBreakdown,
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
  getSkillBundle: (name: string) => request<ApiSkillBundle>(`/skills/${encodeURIComponent(name)}/bundle`),
  saveSkillScript: (skillName: string, filename: string, content: string) =>
    request<{ filename: string }>(`/skills/${encodeURIComponent(skillName)}/scripts/${encodeURIComponent(filename)}`, {
      method: "PUT",
      body: JSON.stringify({ content }),
    }),
  deleteSkillScript: (skillName: string, filename: string) =>
    request<void>(`/skills/${encodeURIComponent(skillName)}/scripts/${encodeURIComponent(filename)}`, { method: "DELETE" }),

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
  getCostBreakdown: (from?: string, to?: string) => {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const qs = params.toString();
    return request<ApiCostBreakdown>(`/stats/costs${qs ? `?${qs}` : ""}`);
  },

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

  // Packages
  listInstalledPackages: () => request<ApiInstalledPackage[]>("/packages"),
  discoverPackages: (q?: string) =>
    request<ApiDiscoveredPackage[]>(`/packages/discover${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  installPackage: (repoUrl: string, force?: boolean) =>
    request<{ pipelineName: string }>("/packages/install", {
      method: "POST",
      body: JSON.stringify({ repoUrl, force: force ?? false }),
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
