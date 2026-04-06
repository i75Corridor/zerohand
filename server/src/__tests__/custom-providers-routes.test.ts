import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  loadCustomProviders,
  getCustomProviderConfig,
  saveCustomProviderConfig,
} from "../services/custom-providers.js";

/**
 * Tests the custom providers config read/write cycle that the API routes rely on.
 * The route layer is a thin wrapper around these functions.
 */
describe("custom-providers config API layer", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "zh-cp-routes-"));
    process.env.DATA_DIR = tmpDir;
  });

  afterEach(() => {
    delete process.env.DATA_DIR;
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns empty config when no providers.json exists", () => {
    loadCustomProviders();
    expect(getCustomProviderConfig()).toEqual({ providers: {} });
  });

  it("loads config with API keys intact (route layer masks them)", () => {
    writeFileSync(
      join(tmpDir, "providers.json"),
      JSON.stringify({
        providers: {
          litellm: {
            baseUrl: "http://localhost:4000/v1",
            apiKey: "sk-very-secret-key-12345",
            models: [{ id: "gpt-4o" }],
          },
        },
      }),
    );
    loadCustomProviders();

    const config = getCustomProviderConfig();
    expect(config.providers.litellm.apiKey).toBe("sk-very-secret-key-12345");
    expect(config.providers.litellm.baseUrl).toBe("http://localhost:4000/v1");
  });

  it("save writes valid JSON and reload picks it up", () => {
    loadCustomProviders();

    saveCustomProviderConfig({
      providers: {
        vllm: {
          baseUrl: "http://localhost:8000/v1",
          models: [{ id: "llama-70b" }],
        },
      },
    });

    // Verify file was written
    const written = JSON.parse(readFileSync(join(tmpDir, "providers.json"), "utf-8"));
    expect(written.providers.vllm.baseUrl).toBe("http://localhost:8000/v1");

    // Verify cache was refreshed
    const config = getCustomProviderConfig();
    expect(config.providers.vllm).toBeDefined();
    expect(config.providers.vllm.models[0].id).toBe("llama-70b");
  });
});
