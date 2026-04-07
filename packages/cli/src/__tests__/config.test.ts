import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// We override XDG_CONFIG_HOME so config reads/writes go to a temp dir
let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "zh-config-test-"));
  process.env.XDG_CONFIG_HOME = tmpDir;
  delete process.env.PAWN_SERVER_URL;
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.XDG_CONFIG_HOME;
  delete process.env.PAWN_SERVER_URL;
});

describe("loadConfig", () => {
  it("returns defaults when config file does not exist", async () => {
    const { loadConfig } = await import("../config.js");
    const config = loadConfig();
    expect(config.serverUrl).toBe("http://localhost:3009");
    expect(config.apiKey).toBeUndefined();
  });
});

describe("saveConfig + loadConfig", () => {
  it("saves and loads serverUrl", async () => {
    const { saveConfig, loadConfig } = await import("../config.js");
    saveConfig({ serverUrl: "http://example.com:9000" });
    const loaded = loadConfig();
    expect(loaded.serverUrl).toBe("http://example.com:9000");
  });

  it("merges updates, preserving existing keys", async () => {
    const { saveConfig, loadConfig } = await import("../config.js");
    saveConfig({ serverUrl: "http://example.com", apiKey: "abc123" });
    saveConfig({ apiKey: "xyz789" });
    const loaded = loadConfig();
    expect(loaded.serverUrl).toBe("http://example.com");
    expect(loaded.apiKey).toBe("xyz789");
  });
});

describe("getServerUrl", () => {
  it("returns config value by default", async () => {
    const { saveConfig, getServerUrl } = await import("../config.js");
    saveConfig({ serverUrl: "http://custom:1234" });
    expect(getServerUrl()).toBe("http://custom:1234");
  });

  it("returns env var override when set", async () => {
    const { getServerUrl } = await import("../config.js");
    process.env.PAWN_SERVER_URL = "http://override:5555";
    expect(getServerUrl()).toBe("http://override:5555");
  });
});
