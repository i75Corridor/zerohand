import type {
  ApiApproval,
  ApiBudgetPolicy,
  ApiDiscoveredBlueprint,
  ApiInstalledBlueprint,
  ApiPipeline,
  ApiPipelineRun,
  ApiPipelineStep,
  ApiSecurityReport,
  ApiSetting,
  ApiSkillBundle,
  ApiStepRun,
  ApiTrigger,
} from "@pawn/shared";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export class ApiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey?: string,
  ) {}

  private headers(): Record<string, string> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.apiKey) headers["Authorization"] = `Bearer ${this.apiKey}`;
    return headers;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}/api${path}`;
    const res = await fetch(url, {
      method,
      headers: this.headers(),
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    if (!res.ok) {
      let msg = text;
      try {
        msg = (JSON.parse(text) as { error?: string }).error ?? text;
      } catch {}
      throw new ApiError(res.status, msg);
    }
    return JSON.parse(text) as T;
  }

  // Pipelines
  listPipelines(): Promise<ApiPipeline[]> {
    return this.request("GET", "/pipelines");
  }

  getPipeline(id: string): Promise<ApiPipeline> {
    return this.request("GET", `/pipelines/${id}`);
  }

  createPipeline(data: object): Promise<ApiPipeline> {
    return this.request("POST", "/pipelines", data);
  }

  updatePipeline(id: string, data: object): Promise<ApiPipeline> {
    return this.request("PATCH", `/pipelines/${id}`, data);
  }

  createStep(pipelineId: string, step: object): Promise<ApiPipelineStep> {
    return this.request("POST", `/pipelines/${pipelineId}/steps`, step);
  }

  deleteStep(pipelineId: string, stepId: string): Promise<void> {
    return this.request("DELETE", `/pipelines/${pipelineId}/steps/${stepId}`);
  }

  // Runs
  createRun(pipelineId: string, inputParams?: Record<string, unknown>): Promise<ApiPipelineRun> {
    return this.request("POST", "/runs", { pipelineId, inputParams: inputParams ?? {}, triggerType: "manual" });
  }

  listRuns(pipelineId?: string): Promise<ApiPipelineRun[]> {
    const qs = pipelineId ? `?pipelineId=${encodeURIComponent(pipelineId)}` : "";
    return this.request("GET", `/runs${qs}`);
  }

  getRun(id: string): Promise<ApiPipelineRun> {
    return this.request("GET", `/runs/${id}`);
  }

  cancelRun(id: string): Promise<ApiPipelineRun> {
    return this.request("POST", `/runs/${id}/cancel`);
  }

  getStepRuns(runId: string): Promise<ApiStepRun[]> {
    return this.request("GET", `/runs/${runId}/steps`);
  }

  // Blueprints
  listBlueprints(): Promise<ApiInstalledBlueprint[]> {
    return this.request("GET", "/blueprints");
  }

  discoverBlueprints(query?: string): Promise<ApiDiscoveredBlueprint[]> {
    const qs = query ? `?q=${encodeURIComponent(query)}` : "";
    return this.request("GET", `/blueprints/discover${qs}`);
  }

  installBlueprint(repoUrl: string, force?: boolean): Promise<object> {
    return this.request("POST", "/blueprints/install", { repoUrl, force: force ?? false });
  }

  getSkillBundle(name: string): Promise<ApiSkillBundle> {
    return this.request("GET", `/skills/${encodeURIComponent(name)}/bundle`);
  }

  scanBlueprint(repoUrl: string): Promise<ApiSecurityReport> {
    return this.request("POST", "/blueprints/scan", { repoUrl });
  }

  getBlueprintSecurity(id: string): Promise<ApiSecurityReport> {
    return this.request("GET", `/blueprints/${id}/security`);
  }

  installLocalBlueprint(localPath: string): Promise<object> {
    return this.request("POST", "/blueprints/install-local", { localPath });
  }

  updateBlueprint(id: string): Promise<object> {
    return this.request("POST", `/blueprints/${id}/update`);
  }

  uninstallBlueprint(id: string): Promise<void> {
    return this.request("DELETE", `/blueprints/${id}`);
  }

  // Triggers
  listTriggers(pipelineId: string): Promise<ApiTrigger[]> {
    return this.request("GET", `/pipelines/${pipelineId}/triggers`);
  }

  createTrigger(pipelineId: string, data: object): Promise<ApiTrigger> {
    return this.request("POST", `/pipelines/${pipelineId}/triggers`, data);
  }

  updateTrigger(id: string, data: object): Promise<ApiTrigger> {
    return this.request("PATCH", `/triggers/${id}`, data);
  }

  deleteTrigger(id: string): Promise<void> {
    return this.request("DELETE", `/triggers/${id}`);
  }

  async listAllTriggers(): Promise<(ApiTrigger & { pipelineName?: string })[]> {
    const pipelines = await this.listPipelines();
    const nested = await Promise.all(
      pipelines.map(async (p) => {
        const triggers = await this.listTriggers(p.id);
        return triggers.map((t) => ({ ...t, pipelineName: p.name }));
      }),
    );
    return nested.flat();
  }

  // Approvals
  listApprovals(status?: string): Promise<ApiApproval[]> {
    const qs = status ? `?status=${encodeURIComponent(status)}` : "";
    return this.request("GET", `/approvals${qs}`);
  }

  approveStep(id: string, note?: string): Promise<ApiApproval> {
    return this.request("POST", `/approvals/${id}/approve`, { note });
  }

  rejectStep(id: string, note?: string): Promise<ApiApproval> {
    return this.request("POST", `/approvals/${id}/reject`, { note });
  }

  // Budgets
  listBudgets(): Promise<ApiBudgetPolicy[]> {
    return this.request("GET", "/budgets");
  }

  createBudget(data: object): Promise<ApiBudgetPolicy> {
    return this.request("POST", "/budgets", data);
  }

  deleteBudget(id: string): Promise<void> {
    return this.request("DELETE", `/budgets/${id}`);
  }

  // Settings
  listSettings(): Promise<ApiSetting[]> {
    return this.request("GET", "/settings");
  }

  updateSetting(key: string, value: unknown): Promise<ApiSetting> {
    return this.request("PUT", `/settings/${encodeURIComponent(key)}`, { value });
  }

  // Helpers
  async findPipelineByName(name: string): Promise<ApiPipeline | null> {
    const all = await this.listPipelines();
    return all.find((p) => p.name.toLowerCase() === name.toLowerCase()) ?? null;
  }

  async findBlueprintByName(name: string): Promise<ApiInstalledBlueprint | null> {
    const all = await this.listBlueprints();
    const lower = name.toLowerCase();
    return (
      all.find((p) => {
        const repoName = p.repoFullName.split("/").pop() ?? "";
        return repoName.toLowerCase() === lower || p.repoFullName.toLowerCase() === lower;
      }) ?? null
    );
  }
}

export function makeClient(serverUrl: string, apiKey?: string): ApiClient {
  return new ApiClient(serverUrl, apiKey);
}
