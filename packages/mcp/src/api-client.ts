import type {
  ApiPipeline,
  ApiPipelineRun,
  ApiPipelineStep,
  ApiSkill,
  ApiStepRun,
  ApiTrigger,
  ApiApproval,
  ApiBudgetPolicy,
  ApiInstalledBlueprint,
  ApiSetting,
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

  deletePipeline(id: string): Promise<void> {
    return this.request("DELETE", `/pipelines/${id}`);
  }

  createStep(pipelineId: string, step: object): Promise<ApiPipelineStep> {
    return this.request("POST", `/pipelines/${pipelineId}/steps`, step);
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

  // Skills
  listSkills(): Promise<ApiSkill[]> {
    return this.request("GET", "/skills");
  }

  getSkill(name: string): Promise<ApiSkill & { content: string }> {
    return this.request("GET", `/skills/${encodeURIComponent(name)}`);
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

  // Approvals
  listApprovals(status?: string): Promise<ApiApproval[]> {
    const qs = status ? `?status=${encodeURIComponent(status)}` : "";
    return this.request("GET", `/approvals${qs}`);
  }

  approveStep(id: string, note?: string): Promise<ApiApproval> {
    return this.request("POST", `/approvals/${id}/approve`, note ? { note } : {});
  }

  rejectStep(id: string, note?: string): Promise<ApiApproval> {
    return this.request("POST", `/approvals/${id}/reject`, note ? { note } : {});
  }

  // Budgets
  listBudgets(scopeType?: string, scopeId?: string): Promise<ApiBudgetPolicy[]> {
    const params = new URLSearchParams();
    if (scopeType) params.set("scopeType", scopeType);
    if (scopeId) params.set("scopeId", scopeId);
    const qs = params.toString() ? `?${params.toString()}` : "";
    return this.request("GET", `/budgets${qs}`);
  }

  createBudget(data: object): Promise<ApiBudgetPolicy> {
    return this.request("POST", "/budgets", data);
  }

  updateBudget(id: string, data: object): Promise<ApiBudgetPolicy> {
    return this.request("PATCH", `/budgets/${id}`, data);
  }

  deleteBudget(id: string): Promise<void> {
    return this.request("DELETE", `/budgets/${id}`);
  }

  // Blueprints
  listBlueprints(): Promise<ApiInstalledBlueprint[]> {
    return this.request("GET", "/blueprints");
  }

  installBlueprint(repoUrl: string, force?: boolean): Promise<object> {
    return this.request("POST", "/blueprints/install", { repoUrl, force });
  }

  updateBlueprint(id: string, force?: boolean): Promise<object> {
    return this.request("POST", `/blueprints/${id}/update`, { force });
  }

  uninstallBlueprint(id: string): Promise<void> {
    return this.request("DELETE", `/blueprints/${id}`);
  }

  discoverBlueprints(query?: string): Promise<object[]> {
    const qs = query ? `?q=${encodeURIComponent(query)}` : "";
    return this.request("GET", `/blueprints/discover${qs}`);
  }

  scanBlueprint(repoUrl: string): Promise<object> {
    return this.request("POST", "/blueprints/scan", { repoUrl });
  }

  // Settings
  listSettings(): Promise<ApiSetting[]> {
    return this.request("GET", "/settings");
  }

  updateSetting(key: string, value: unknown): Promise<ApiSetting> {
    return this.request("PUT", `/settings/${encodeURIComponent(key)}`, { value });
  }
}
