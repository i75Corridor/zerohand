import type { ApiPipelineRun, ApiStepRun, ApiWorker, ApiPipeline } from "@zerohand/shared";

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
  // Workers
  listWorkers: () => request<ApiWorker[]>("/workers"),
  getWorker: (id: string) => request<ApiWorker>(`/workers/${id}`),
  createWorker: (body: Partial<ApiWorker>) =>
    request<ApiWorker>("/workers", { method: "POST", body: JSON.stringify(body) }),
  updateWorker: (id: string, body: Partial<ApiWorker>) =>
    request<ApiWorker>(`/workers/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteWorker: (id: string) => request<void>(`/workers/${id}`, { method: "DELETE" }),

  // Pipelines
  listPipelines: () => request<ApiPipeline[]>("/pipelines"),
  getPipeline: (id: string) => request<ApiPipeline>(`/pipelines/${id}`),
  createPipeline: (body: Partial<ApiPipeline>) =>
    request<ApiPipeline>("/pipelines", { method: "POST", body: JSON.stringify(body) }),
  updatePipeline: (id: string, body: Partial<ApiPipeline>) =>
    request<ApiPipeline>(`/pipelines/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deletePipeline: (id: string) => request<void>(`/pipelines/${id}`, { method: "DELETE" }),

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
};
