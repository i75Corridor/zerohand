import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Mock pi-ai's getProviders to return a known set of built-in providers
vi.mock("@mariozechner/pi-ai", () => ({
  getProviders: () => ["openai", "anthropic", "google"],
}));

import {
  loadCustomProviders,
  getCustomProviderModels,
  getCustomProviderConfig,
  saveCustomProviderConfig,
  customProviderModelsToApiEntries,
} from "../services/custom-providers.js";
import type { CustomProvidersConfig } from "../services/custom-providers.js";

describe("custom-providers", () => {
  let tmpDir: string;
  let origDataDir: string | undefined;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "custom-providers-test-"));
    origDataDir = process.env.DATA_DIR;
    process.env.DATA_DIR = tmpDir;
  });

  afterEach(() => {
    if (origDataDir === undefined) {
      delete process.env.DATA_DIR;
    } else {
      process.env.DATA_DIR = origDataDir;
    }
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  it("returns models with correct shape for valid providers.json", () => {
    const config: CustomProvidersConfig = {
      providers: {
        "my-litellm": {
          baseUrl: "http://localhost:4000/v1",
          apiKey: "sk-test",
          models: [
            { id: "gpt-4o", name: "GPT-4o via LiteLLM", contextWindow: 128000, maxTokens: 16384 },
            { id: "llama3-70b", name: "Llama 3 70B" },
          ],
        },
      },
    };
    writeFileSync(join(tmpDir, "providers.json"), JSON.stringify(config));

    loadCustomProviders();
    const models = getCustomProviderModels();

    expect(models).toHaveLength(2);

    // First model — explicit values
    expect(models[0]).toMatchObject({
      id: "gpt-4o",
      name: "GPT-4o via LiteLLM",
      api: "openai-completions",
      provider: "my-litellm",
      baseUrl: "http://localhost:4000/v1",
      reasoning: false,
      input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 128000,
      maxTokens: 16384,
      compat: {
        supportsStore: false,
        supportsDeveloperRole: false,
        supportsReasoningEffort: false,
      },
    });

    // Second model — defaults applied
    expect(models[1].id).toBe("llama3-70b");
    expect(models[1].name).toBe("Llama 3 70B");
    expect(models[1].provider).toBe("my-litellm");
  });

  it("applies defaults when model has only id", () => {
    const config: CustomProvidersConfig = {
      providers: {
        "local-server": {
          baseUrl: "http://localhost:8080/v1/",
          models: [{ id: "my-model" }],
        },
      },
    };
    writeFileSync(join(tmpDir, "providers.json"), JSON.stringify(config));

    loadCustomProviders();
    const models = getCustomProviderModels();

    expect(models).toHaveLength(1);
    expect(models[0].name).toBe("my-model"); // defaults to id
    expect(models[0].contextWindow).toBe(4096);
    expect(models[0].maxTokens).toBe(2048); // contextWindow / 2
    // baseUrl should have trailing slash stripped
    expect(models[0].baseUrl).toBe("http://localhost:8080/v1");
  });

  it("returns empty array when providers.json does not exist", () => {
    loadCustomProviders();
    expect(getCustomProviderModels()).toEqual([]);
    expect(getCustomProviderConfig()).toEqual({ providers: {} });
  });

  it("logs warning and returns empty for malformed JSON", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    writeFileSync(join(tmpDir, "providers.json"), "NOT VALID JSON {{{");

    loadCustomProviders();

    expect(getCustomProviderModels()).toEqual([]);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Malformed JSON"),
    );
    warnSpy.mockRestore();
  });

  it("skips provider that conflicts with built-in pi-ai provider", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const config: CustomProvidersConfig = {
      providers: {
        openai: {
          baseUrl: "http://localhost:9999/v1",
          models: [{ id: "fake-model" }],
        },
        "safe-provider": {
          baseUrl: "http://localhost:8080/v1",
          models: [{ id: "real-model" }],
        },
      },
    };
    writeFileSync(join(tmpDir, "providers.json"), JSON.stringify(config));

    loadCustomProviders();
    const models = getCustomProviderModels();

    expect(models).toHaveLength(1);
    expect(models[0].provider).toBe("safe-provider");
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Skipping provider "openai"'),
    );
    warnSpy.mockRestore();
  });

  it("skips model missing id with warning", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const config: CustomProvidersConfig = {
      providers: {
        "my-server": {
          baseUrl: "http://localhost:8080/v1",
          models: [
            { id: "good-model" },
            { id: "" } as any, // empty string
            {} as any, // missing id entirely
          ],
        },
      },
    };
    writeFileSync(join(tmpDir, "providers.json"), JSON.stringify(config));

    loadCustomProviders();
    const models = getCustomProviderModels();

    expect(models).toHaveLength(1);
    expect(models[0].id).toBe("good-model");
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('missing or invalid "id"'),
    );
    warnSpy.mockRestore();
  });

  it("saveCustomProviderConfig writes and reloads", () => {
    const config: CustomProvidersConfig = {
      providers: {
        "saved-provider": {
          baseUrl: "http://localhost:5555/v1",
          models: [{ id: "saved-model", name: "Saved Model" }],
        },
      },
    };

    saveCustomProviderConfig(config);

    const models = getCustomProviderModels();
    expect(models).toHaveLength(1);
    expect(models[0].id).toBe("saved-model");
    expect(models[0].provider).toBe("saved-provider");

    // Verify the raw config is accessible
    const rawConfig = getCustomProviderConfig();
    expect(rawConfig.providers["saved-provider"]).toBeDefined();
    expect(rawConfig.providers["saved-provider"].baseUrl).toBe("http://localhost:5555/v1");
  });

  it("customProviderModelsToApiEntries maps correctly", () => {
    const config: CustomProvidersConfig = {
      providers: {
        "test-provider": {
          baseUrl: "http://localhost:8080/v1",
          models: [{ id: "test-model", name: "Test Model", contextWindow: 8192, maxTokens: 4096 }],
        },
      },
    };
    writeFileSync(join(tmpDir, "providers.json"), JSON.stringify(config));
    loadCustomProviders();

    const entries = customProviderModelsToApiEntries();

    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({
      id: "test-model",
      fullId: "test-provider/test-model",
      name: "Test Model",
      provider: "test-provider",
      contextWindow: 8192,
      maxTokens: 4096,
      reasoning: false,
      costInputPerM: 0,
      costOutputPerM: 0,
      available: true,
    });
  });
});
