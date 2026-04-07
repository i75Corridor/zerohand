import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getOllamaModels,
  startOllamaPolling,
  stopOllamaPolling,
  resolveModel,
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

describe("resolveModel", () => {
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

  it("resolves an Ollama model from the cache", async () => {
    process.env.OLLAMA_HOST = "http://localhost:11434";
    mockFetch.mockResolvedValueOnce(
      ollamaTagsResponse([{ name: "llama3:latest" }, { name: "mistral:7b" }]),
    );
    await startOllamaPolling();

    const model = resolveModel("ollama", "llama3:latest");
    expect(model).toBeDefined();
    expect(model.id).toBe("llama3:latest");
    expect((model as any).provider).toBe("ollama");
    expect((model as any).api).toBe("openai-completions");
    expect((model as any).baseUrl).toBe("http://localhost:11434/v1");
  });

  it("delegates to pi-ai getModel for non-ollama providers", () => {
    // pi-ai has built-in models — anthropic/claude-sonnet-4-5-20250514 should exist
    // If it doesn't exist in the pi-ai registry, resolveModel should throw
    // We test that the delegation path works (doesn't try Ollama for non-ollama providers)
    try {
      const model = resolveModel("anthropic", "claude-sonnet-4-5-20250514");
      // If pi-ai has this model registered, we get it back
      expect(model).toBeDefined();
      expect(model.id).toBe("claude-sonnet-4-5-20250514");
    } catch (err) {
      // If pi-ai doesn't have this exact model, it should throw the generic error
      expect(String(err)).toContain("Model not found: anthropic/");
    }
  });

  it("throws 'Model not found in Ollama' when cache has models but requested model is missing", async () => {
    process.env.OLLAMA_HOST = "http://localhost:11434";
    mockFetch.mockResolvedValueOnce(
      ollamaTagsResponse([{ name: "llama3:latest" }]),
    );
    await startOllamaPolling();

    expect(() => resolveModel("ollama", "nonexistent-model")).toThrow(
      "Model not found in Ollama: nonexistent-model",
    );
  });

  it("throws 'Ollama is not available' when cache is empty", () => {
    // No polling started, cache is empty
    expect(() => resolveModel("ollama", "llama3:latest")).toThrow(
      "Ollama is not available — ensure Ollama is running and OLLAMA_HOST is set",
    );
  });

  it("throws generic error for unknown non-ollama provider", () => {
    expect(() => resolveModel("nonexistent-provider", "some-model")).toThrow(
      "Model not found: nonexistent-provider/some-model",
    );
  });
});
