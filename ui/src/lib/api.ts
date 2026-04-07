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
  ApiMcpServer,
  ApiMcpTool,
  ApiValidationResult,
  ApiPipelineVersion,
  ApiPackagePreview,
  ApiModelWarning,
} from "@zerohand/shared";

const BASE = "/api";

/** Human-readable error messages by HTTP status code */
const STATUS_MESSAGES: Record<number, string> = {
  400: "Invalid request. Please check your input and try again.",
  401: "Your session has expired. Please refresh the page.",
  403: "You do not have permission to perform this action.",
  404: "The requested resource was not found.",
  409: "A conflict occurred. The resource may have been modified by another process.",
  429: "Too many requests. Please wait a moment and try again.",
  500: "An internal server error occurred. Please try again later.",
  502: "The server is temporarily unavailable. Please try again shortly.",
  503: "The service is temporarily unavailable. Please try again shortly.",
};

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly statusText: string,
    public readonly body: string,
  ) {
    const friendly = STATUS_MESSAGES[status] ?? `Request failed (${status})`;
    // Include the raw body for debugging but lead with the friendly message
    super(body ? `${friendly}\n${body}` : friendly);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      headers: { "Content-Type": "application/json", ...init?.headers },
      ...init,
    });
  } catch (err) {
    // Network-level failures (offline, DNS, CORS, etc.)
    if (err instanceof DOMException && err.name === "AbortError") {
      throw err; // Let AbortController cancellations propagate
    }
    throw new Error(
      "Unable to reach the server. Check your network connection and try again.",
    );
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ApiError(res.status, res.statusText, body);
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
  // skillName is a qualified "namespace/skill-name" string (e.g. "local/researcher")
  listSkills: () => request<ApiSkill[]>("/skills"),
  getSkill: (qualifiedName: string) => {
    const [ns, name] = qualifiedName.includes("/") ? qualifiedName.split("/") : ["local", qualifiedName];
    return request<ApiSkill>(`/skills/${encodeURIComponent(ns)}/${encodeURIComponent(name)}`);
  },
  getSkillBundle: (qualifiedName: string) => {
    const [ns, name] = qualifiedName.includes("/") ? qualifiedName.split("/") : ["local", qualifiedName];
    return request<ApiSkillBundle>(`/skills/${encodeURIComponent(ns)}/${encodeURIComponent(name)}/bundle`);
  },
  createSkill: (body: { name: string; namespace?: string; description?: string; version?: string; allowedTools?: string[] }) =>
    request<ApiSkill>("/skills", { method: "POST", body: JSON.stringify(body) }),
  updateSkillContent: (qualifiedName: string, content: string) => {
    const [ns, name] = qualifiedName.includes("/") ? qualifiedName.split("/") : ["local", qualifiedName];
    return request<ApiSkill & { content: string }>(`/skills/${encodeURIComponent(ns)}/${encodeURIComponent(name)}`, {
      method: "PATCH",
      body: JSON.stringify({ content }),
    });
  },
  saveSkillScript: (qualifiedSkillName: string, filename: string, content: string) => {
    const [ns, name] = qualifiedSkillName.includes("/") ? qualifiedSkillName.split("/") : ["local", qualifiedSkillName];
    return request<{ filename: string }>(`/skills/${encodeURIComponent(ns)}/${encodeURIComponent(name)}/scripts/${encodeURIComponent(filename)}`, {
      method: "PUT",
      body: JSON.stringify({ content }),
    });
  },
  deleteSkillScript: (qualifiedSkillName: string, filename: string) => {
    const [ns, name] = qualifiedSkillName.includes("/") ? qualifiedSkillName.split("/") : ["local", qualifiedSkillName];
    return request<void>(`/skills/${encodeURIComponent(ns)}/${encodeURIComponent(name)}/scripts/${encodeURIComponent(filename)}`, { method: "DELETE" });
  },

  // Pipeline runs
  listRuns: (pipelineId?: string) =>
    request<ApiPipelineRun[]>(`/runs${pipelineId ? `?pipelineId=${pipelineId}` : ""}`),
  getRun: (id: string) => request<ApiPipelineRun>(`/runs/${id}`),
  triggerRun: (pipelineId: string, inputParams: Record<string, unknown> = {}, executionMode?: "step_by_step") =>
    request<ApiPipelineRun>("/runs", {
      method: "POST",
      body: JSON.stringify({ pipelineId, inputParams, executionMode }),
    }),
  cancelRun: (id: string) => request<ApiPipelineRun>(`/runs/${id}/cancel`, { method: "POST" }),
  resumeRun: (id: string) => request<ApiPipelineRun>(`/runs/${id}/resume`, { method: "POST" }),
  rerunStep: (runId: string, stepRunId: string) =>
    request<ApiPipelineRun>(`/runs/${runId}/steps/${stepRunId}/rerun`, { method: "POST" }),
  getRunSteps: (runId: string) => request<ApiStepRun[]>(`/runs/${runId}/steps`),
  getStepEvents: (runId: string, stepRunId: string) =>
    request<unknown[]>(`/runs/${runId}/steps/${stepRunId}/events`),
  getRunLog: async (runId: string): Promise<Record<string, unknown>[]> => {
    const res = await fetch(`${BASE}/runs/${runId}/log`);
    if (!res.ok) return []; // 404 = no log file, 500 = not yet created; both show empty
    const text = await res.text();
    return text
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        try { return JSON.parse(line) as Record<string, unknown>; } catch { return null; }
      })
      .filter((x): x is Record<string, unknown> => x !== null);
  },

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

  // Pipeline validation & versions
  validatePipeline: (id: string) => request<ApiValidationResult>(`/pipelines/${id}/validate`, { method: "POST" }),
  listPipelineVersions: (id: string) => request<ApiPipelineVersion[]>(`/pipelines/${id}/versions`),
  getPipelineVersion: (id: string, version: number) =>
    request<ApiPipelineVersion>(`/pipelines/${id}/versions/${version}`),
  restorePipelineVersion: (id: string, version: number) =>
    request<ApiPipeline>(`/pipelines/${id}/versions/${version}/restore`, { method: "POST" }),

  // Packages
  previewPackage: (pipelineId: string) =>
    request<ApiPackagePreview>("/packages/preview", {
      method: "POST",
      body: JSON.stringify({ pipelineId }),
    }),
  exportPackage: async (pipelineId: string): Promise<void> => {
    const res = await fetch(`${BASE}/packages/export`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pipelineId }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`${res.status} ${res.statusText}: ${body}`);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const cd = res.headers.get("content-disposition") ?? "";
    const filename = cd.match(/filename="([^"]+)"/)?.[1] ?? "package.tar.gz";
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  },
  getGhStatus: () => request<{ available: boolean }>("/packages/gh-status"),
  publishPackage: (body: { pipelineId: string; repo?: string; private?: boolean; description?: string }) =>
    request<{ id: string; repoUrl: string; repoFullName: string; prUrl?: string; noChanges?: boolean }>("/packages/publish", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  listInstalledPackages: () => request<ApiInstalledPackage[]>("/packages"),
  discoverPackages: (q?: string) =>
    request<ApiDiscoveredPackage[]>(`/packages/discover${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  installPackage: (repoUrl: string, force?: boolean) =>
    request<{ pipelineName: string; modelWarnings?: ApiModelWarning[] }>("/packages/install", {
      method: "POST",
      body: JSON.stringify({ repoUrl, force: force ?? false }),
    }),
  updatePackage: (id: string) =>
    request<{ pipelineName: string; modelWarnings?: ApiModelWarning[] }>(`/packages/${id}/update`, { method: "POST" }),
  uninstallPackage: (id: string) => request<void>(`/packages/${id}`, { method: "DELETE" }),
  checkForUpdates: () => request<{ message: string }>("/packages/check-updates", { method: "POST" }),

  // MCP Servers
  listMcpServers: () => request<ApiMcpServer[]>("/mcp-servers"),
  getMcpServer: (id: string) => request<ApiMcpServer>(`/mcp-servers/${id}`),
  createMcpServer: (body: Omit<ApiMcpServer, "id" | "source" | "sourcePackageId">) =>
    request<ApiMcpServer>("/mcp-servers", { method: "POST", body: JSON.stringify(body) }),
  updateMcpServer: (id: string, body: Partial<ApiMcpServer>) =>
    request<ApiMcpServer>(`/mcp-servers/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteMcpServer: (id: string) => request<void>(`/mcp-servers/${id}`, { method: "DELETE" }),
  testMcpServer: (id: string) =>
    request<{ connected: boolean; tools: ApiMcpTool[]; error?: string }>(`/mcp-servers/${id}/test`, { method: "POST" }),
  listMcpServerTools: (id: string) => request<ApiMcpTool[]>(`/mcp-servers/${id}/tools`),

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
