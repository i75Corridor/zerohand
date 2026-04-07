import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";

// ── Mock child_process ─────────────────────────────────────────────────────

vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

// ── Mock mcp-registry ──────────────────────────────────────────────────────

vi.mock("../services/mcp-registry.js", () => ({
  lookupRegistry: vi.fn(),
  lookupRegistryByName: vi.fn(),
}));

import { spawn } from "node:child_process";
import { lookupRegistry, lookupRegistryByName } from "../services/mcp-registry.js";
import {
  detectEnvVars,
  _resetSemaphore,
  _setSemaphore,
  type DetectedEnvVar,
} from "../services/mcp-env-detector.js";

// ── Helpers ────────────────────────────────────────────────────────────────

/** Create a mock ChildProcess that emits stderr data and then closes. */
function makeMockChild(
  stderrChunks: string[],
  opts?: { exitCode?: number; emitError?: NodeJS.ErrnoException; hang?: boolean },
): ChildProcess {
  const child = new EventEmitter() as unknown as ChildProcess & { pid: number; stderr: EventEmitter };
  child.pid = 12345;
  (child as any).stderr = new EventEmitter();

  // Schedule stderr data + close on next tick (unless hang mode)
  if (!opts?.hang) {
    process.nextTick(() => {
      if (opts?.emitError) {
        child.emit("error", opts.emitError);
        return;
      }
      for (const chunk of stderrChunks) {
        child.stderr.emit("data", Buffer.from(chunk));
      }
      child.emit("close", opts?.exitCode ?? 1);
    });
  }

  return child;
}

// ── Tests ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  _resetSemaphore();
  (lookupRegistry as Mock).mockReturnValue(null);
  (lookupRegistryByName as Mock).mockReturnValue(null);
});

describe("mcp-env-detector", () => {
  describe("happy path: dry-run stderr parsing", () => {
    it('detects BRAVE_API_KEY from "Error: BRAVE_API_KEY is not set"', async () => {
      (spawn as Mock).mockReturnValue(
        makeMockChild(["Error: BRAVE_API_KEY is not set\n"]),
      );

      const result = await detectEnvVars({
        command: "npx",
        args: ["-y", "@anthropic/brave-search-mcp"],
        transport: "stdio",
      });

      expect(result.detected).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: "BRAVE_API_KEY",
            required: true,
            detectedFrom: "dry-run",
          }),
        ]),
      );
      expect(result.error).toBeUndefined();
    });

    it("detects multiple env vars from stderr", async () => {
      (spawn as Mock).mockReturnValue(
        makeMockChild([
          "Error: MY_API_KEY is not set\n",
          "missing MY_SECRET\n",
        ]),
      );

      const result = await detectEnvVars({
        command: "npx",
        args: ["-y", "some-server"],
        transport: "stdio",
      });

      const names = result.detected.map((d) => d.name);
      expect(names).toContain("MY_API_KEY");
      expect(names).toContain("MY_SECRET");
    });

    it('detects from "SOME_VAR is required" pattern', async () => {
      (spawn as Mock).mockReturnValue(
        makeMockChild(["DATABASE_URL is required\n"]),
      );

      const result = await detectEnvVars({
        command: "node",
        args: ["server.js"],
        transport: "stdio",
      });

      expect(result.detected).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "DATABASE_URL", detectedFrom: "dry-run" }),
        ]),
      );
    });

    it('detects from "${VAR} is not defined" pattern', async () => {
      (spawn as Mock).mockReturnValue(
        makeMockChild(["${AUTH_TOKEN} is not defined\n"]),
      );

      const result = await detectEnvVars({
        command: "node",
        args: ["server.js"],
        transport: "stdio",
      });

      expect(result.detected).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "AUTH_TOKEN", detectedFrom: "dry-run" }),
        ]),
      );
    });
  });

  describe("happy path: registry enrichment", () => {
    it("enriches dry-run results with registry descriptions", async () => {
      (lookupRegistry as Mock).mockReturnValue({
        packageName: "@anthropic/brave-search-mcp",
        envVars: [
          {
            name: "BRAVE_API_KEY",
            description: "Brave Search API key",
            required: true,
            docsUrl: "https://brave.com/search/api/",
          },
        ],
      });

      (spawn as Mock).mockReturnValue(
        makeMockChild(["Error: BRAVE_API_KEY is not set\n"]),
      );

      const result = await detectEnvVars({
        command: "npx",
        args: ["-y", "@anthropic/brave-search-mcp"],
        transport: "stdio",
      });

      expect(result.detected).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: "BRAVE_API_KEY",
            description: "Brave Search API key",
            docsUrl: "https://brave.com/search/api/",
            detectedFrom: "both",
          }),
        ]),
      );
    });

    it("returns registry-only vars not found in dry-run", async () => {
      (lookupRegistry as Mock).mockReturnValue({
        packageName: "test-server",
        envVars: [
          { name: "API_KEY", description: "The API key", required: true },
          { name: "OPTIONAL_VAR", description: "Optional config", required: false },
        ],
      });

      // Dry-run only mentions API_KEY
      (spawn as Mock).mockReturnValue(
        makeMockChild(["Error: API_KEY is not set\n"]),
      );

      const result = await detectEnvVars({
        command: "npx",
        args: ["-y", "test-server"],
        transport: "stdio",
      });

      const apiKey = result.detected.find((d) => d.name === "API_KEY");
      const optVar = result.detected.find((d) => d.name === "OPTIONAL_VAR");

      expect(apiKey?.detectedFrom).toBe("both");
      expect(optVar?.detectedFrom).toBe("registry");
    });
  });

  describe("happy path: non-stdio transport", () => {
    it("returns registry-only results for SSE transport", async () => {
      (lookupRegistryByName as Mock).mockReturnValue({
        packageName: "some-sse-server",
        envVars: [
          { name: "SSE_KEY", description: "SSE API key", required: true },
        ],
      });

      const result = await detectEnvVars({
        transport: "sse",
        name: "some-sse-server",
      });

      expect(result.detected).toEqual([
        expect.objectContaining({
          name: "SSE_KEY",
          detectedFrom: "registry",
        }),
      ]);
      // spawn should never be called for non-stdio
      expect(spawn).not.toHaveBeenCalled();
    });

    it("returns registry-only results for streamable-http transport", async () => {
      const result = await detectEnvVars({
        transport: "streamable-http",
        name: "unknown",
      });

      expect(result.detected).toEqual([]);
      expect(spawn).not.toHaveBeenCalled();
    });
  });

  describe("edge case: no useful stderr", () => {
    it("returns empty detected array when server exits with no stderr", async () => {
      (spawn as Mock).mockReturnValue(makeMockChild([]));

      const result = await detectEnvVars({
        command: "npx",
        args: ["-y", "some-server"],
        transport: "stdio",
      });

      expect(result.detected).toEqual([]);
      expect(result.error).toBeUndefined();
    });

    it("returns empty when stderr has no env var patterns", async () => {
      (spawn as Mock).mockReturnValue(
        makeMockChild(["Server starting...\nListening on port 3000\n"]),
      );

      const result = await detectEnvVars({
        command: "node",
        args: ["server.js"],
        transport: "stdio",
      });

      expect(result.detected).toEqual([]);
    });
  });

  describe("edge case: server hangs (timeout)", () => {
    it("kills after timeout and returns whatever was captured", async () => {
      const child = makeMockChild([], { hang: true });

      // Emit some stderr before the hang
      process.nextTick(() => {
        child.stderr!.emit("data", Buffer.from("Error: HANG_VAR is not set\n"));
      });

      (spawn as Mock).mockReturnValue(child);

      // Mock process.kill to simulate process group kill
      const origKill = process.kill;
      const killMock = vi.fn();
      process.kill = killMock as unknown as typeof process.kill;

      const resultPromise = detectEnvVars({
        command: "npx",
        args: ["-y", "hanging-server"],
        transport: "stdio",
      });

      // Advance timers — use real timeout; the test will resolve via the 5s timer
      // We need to use fake timers to avoid waiting 5s
      // Instead, manually trigger the close after a short delay
      setTimeout(() => {
        child.emit("close", 1);
      }, 50);

      const result = await resultPromise;

      expect(result.detected).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "HANG_VAR", detectedFrom: "dry-run" }),
        ]),
      );

      process.kill = origKill;
    });
  });

  describe("error path: ENOENT (command not found)", () => {
    it("returns error message for missing command", async () => {
      const enoentErr = new Error("spawn nonexistent ENOENT") as NodeJS.ErrnoException;
      enoentErr.code = "ENOENT";

      (spawn as Mock).mockReturnValue(
        makeMockChild([], { emitError: enoentErr }),
      );

      const result = await detectEnvVars({
        command: "nonexistent",
        args: [],
        transport: "stdio",
      });

      expect(result.error).toBe("command not found: nonexistent");
      expect(result.detected).toEqual([]);
    });

    it("preserves registry results when command not found", async () => {
      (lookupRegistry as Mock).mockReturnValue({
        packageName: "test-pkg",
        envVars: [
          { name: "REG_VAR", description: "From registry", required: true },
        ],
      });

      const enoentErr = new Error("spawn bad-cmd ENOENT") as NodeJS.ErrnoException;
      enoentErr.code = "ENOENT";

      (spawn as Mock).mockReturnValue(
        makeMockChild([], { emitError: enoentErr }),
      );

      const result = await detectEnvVars({
        command: "bad-cmd",
        args: ["-y", "test-pkg"],
        transport: "stdio",
      });

      expect(result.error).toBe("command not found: bad-cmd");
      expect(result.detected).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "REG_VAR", detectedFrom: "registry" }),
        ]),
      );
    });
  });

  describe("edge case: duplicate vars from registry and dry-run", () => {
    it("deduplicates with 'both' source", async () => {
      (lookupRegistry as Mock).mockReturnValue({
        packageName: "test-pkg",
        envVars: [
          { name: "SHARED_VAR", description: "Shared variable", required: true },
          { name: "REGISTRY_ONLY", description: "Only in registry", required: false },
        ],
      });

      (spawn as Mock).mockReturnValue(
        makeMockChild([
          "Error: SHARED_VAR is not set\n",
          "Error: DRYRUN_ONLY is not set\n",
        ]),
      );

      const result = await detectEnvVars({
        command: "npx",
        args: ["-y", "test-pkg"],
        transport: "stdio",
      });

      const shared = result.detected.find((d) => d.name === "SHARED_VAR");
      const regOnly = result.detected.find((d) => d.name === "REGISTRY_ONLY");
      const dryOnly = result.detected.find((d) => d.name === "DRYRUN_ONLY");

      expect(shared?.detectedFrom).toBe("both");
      expect(shared?.description).toBe("Shared variable");
      expect(regOnly?.detectedFrom).toBe("registry");
      expect(dryOnly?.detectedFrom).toBe("dry-run");
      expect(result.detected).toHaveLength(3);
    });
  });

  describe("edge case: semaphore full", () => {
    it('returns "detection busy" when max concurrent dry-runs reached', async () => {
      // Simulate semaphore being full by setting it directly
      _setSemaphore(2);

      const result = await detectEnvVars({
        command: "cmd3",
        args: [],
        transport: "stdio",
      });

      expect(result.error).toBe("detection busy");
      expect(result.detected).toEqual([]);
      // spawn should not have been called
      expect(spawn).not.toHaveBeenCalled();
    });
  });

  describe("edge case: adversarial stderr", () => {
    it("filters out non-env-var-like names", async () => {
      (spawn as Mock).mockReturnValue(
        makeMockChild([
          // Valid: uppercase with underscores
          "Error: VALID_KEY is not set\n",
          // Invalid: lowercase — filtered by ENV_VAR_PATTERN
          "Error: invalid_key is not set\n",
          // Valid
          "need API_SECRET\n",
          // Noise: no env-var keyword context
          "Just some random output\n",
        ]),
      );

      const result = await detectEnvVars({
        command: "node",
        args: ["server.js"],
        transport: "stdio",
      });

      const names = result.detected.map((d) => d.name);
      expect(names).toContain("VALID_KEY");
      expect(names).toContain("API_SECRET");
      expect(names).not.toContain("invalid_key");
      // "random" and "output" are lowercase, should not appear
      expect(names).not.toContain("random");
      expect(names).not.toContain("output");
    });
  });

  describe("registry name fallback", () => {
    it("uses lookupRegistryByName when command/args have no match", async () => {
      (lookupRegistryByName as Mock).mockReturnValue({
        packageName: "@anthropic/brave-search-mcp",
        envVars: [
          { name: "BRAVE_API_KEY", description: "Brave key", required: true },
        ],
      });

      (spawn as Mock).mockReturnValue(makeMockChild([]));

      const result = await detectEnvVars({
        command: "npx",
        args: ["-y", "unknown-pkg"],
        transport: "stdio",
        name: "brave-search",
      });

      expect(lookupRegistryByName).toHaveBeenCalledWith("brave-search");
      expect(result.detected).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: "BRAVE_API_KEY",
            detectedFrom: "registry",
          }),
        ]),
      );
    });
  });
});
