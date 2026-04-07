import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getOllamaModels,
  isOllamaAvailable,
  startOllamaPolling,
  stopOllamaPolling,
  ollamaModelsToApiEntries,
} from "../services/ollama-provider.js";

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function ollamaTagsResponse(models: Array<{ name: string }>) {
  return {
    ok: true,
    json: async () => ({ models: models.map((m) => ({ name: m.name, size: 0, modified_at: "" })) }),
  };
}

describe("ollama-provider", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    stopOllamaPolling();
    mockFetch.mockReset();
  });

  afterEach(() => {
    stopOllamaPolling();
    delete process.env.OLLAMA_HOST;
    vi.useRealTimers();
  });

  it("returns empty models when OLLAMA_HOST is not set", async () => {
    delete process.env.OLLAMA_HOST;
    await startOllamaPolling();
    expect(getOllamaModels()).toEqual([]);
    expect(isOllamaAvailable()).toBe(false);
  });

  it("discovers models from /api/tags", async () => {
    process.env.OLLAMA_HOST = "http://localhost:11434";
    mockFetch.mockResolvedValueOnce(
      ollamaTagsResponse([{ name: "llama3.1:8b" }, { name: "qwen2.5-coder:7b" }]),
    );

    await startOllamaPolling();

    const models = getOllamaModels();
    expect(models).toHaveLength(2);
    expect(models[0].id).toBe("llama3.1:8b");
    expect(models[0].provider).toBe("ollama");
    expect(models[0].api).toBe("openai-completions");
    expect(models[0].baseUrl).toBe("http://localhost:11434/v1");
    expect(models[0].cost).toEqual({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
    expect(models[0].compat).toEqual({
      supportsStore: false,
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
    });
    expect(models[1].id).toBe("qwen2.5-coder:7b");
    expect(isOllamaAvailable()).toBe(true);
  });

  it("handles empty model list from Ollama", async () => {
    process.env.OLLAMA_HOST = "http://localhost:11434";
    mockFetch.mockResolvedValueOnce(ollamaTagsResponse([]));

    await startOllamaPolling();

    expect(getOllamaModels()).toEqual([]);
    expect(isOllamaAvailable()).toBe(true);
  });

  it("marks unavailable when Ollama is unreachable", async () => {
    process.env.OLLAMA_HOST = "http://localhost:11434";
    mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    await startOllamaPolling();

    expect(getOllamaModels()).toEqual([]);
    expect(isOllamaAvailable()).toBe(false);
  });

  it("keeps stale cache on subsequent poll failure", async () => {
    process.env.OLLAMA_HOST = "http://localhost:11434";
    // First poll succeeds
    mockFetch.mockResolvedValueOnce(ollamaTagsResponse([{ name: "llama3:latest" }]));
    await startOllamaPolling();
    expect(getOllamaModels()).toHaveLength(1);
    expect(isOllamaAvailable()).toBe(true);

    // Second poll fails
    mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    await vi.advanceTimersByTimeAsync(30_000);

    // Models are stale-cached, but availability flips
    expect(getOllamaModels()).toHaveLength(1);
    expect(isOllamaAvailable()).toBe(false);
  });

  it("strips trailing slash from OLLAMA_HOST", async () => {
    process.env.OLLAMA_HOST = "http://localhost:11434/";
    mockFetch.mockResolvedValueOnce(ollamaTagsResponse([{ name: "test:latest" }]));

    await startOllamaPolling();

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:11434/api/tags",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(getOllamaModels()[0].baseUrl).toBe("http://localhost:11434/v1");
  });

  it("maps to ApiModelEntry format correctly", async () => {
    process.env.OLLAMA_HOST = "http://localhost:11434";
    mockFetch.mockResolvedValueOnce(ollamaTagsResponse([{ name: "qwen2.5-coder:7b" }]));
    await startOllamaPolling();

    const entries = ollamaModelsToApiEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({
      id: "qwen2.5-coder:7b",
      fullId: "ollama/qwen2.5-coder:7b",
      name: "qwen2.5-coder:7b",
      provider: "ollama",
      contextWindow: 4096,
      maxTokens: 2048,
      reasoning: false,
      costInputPerM: 0,
      costOutputPerM: 0,
      available: true,
    });
  });

  it("stopOllamaPolling resets state", async () => {
    process.env.OLLAMA_HOST = "http://localhost:11434";
    mockFetch.mockResolvedValueOnce(ollamaTagsResponse([{ name: "test:latest" }]));
    await startOllamaPolling();
    expect(getOllamaModels()).toHaveLength(1);

    stopOllamaPolling();
    expect(getOllamaModels()).toEqual([]);
    expect(isOllamaAvailable()).toBe(false);
  });
});
