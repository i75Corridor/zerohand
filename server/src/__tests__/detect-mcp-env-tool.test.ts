import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock the detector service ─────────────────────────────────────────────

vi.mock("../services/mcp-env-detector.js", () => ({
  detectEnvVars: vi.fn(),
}));

import { detectEnvVars } from "../services/mcp-env-detector.js";
import { makeDetectMcpEnv } from "../services/tools/detect-mcp-env.js";
import type { AgentToolContext } from "../services/tools/context.js";
import type { DetectionResult } from "../services/mcp-env-detector.js";

// ── Minimal stub context ──────────────────────────────────────────────────

const stubCtx = {} as unknown as AgentToolContext;

/** Helper to call execute with only the params we care about in tests. */
function callTool(tool: ReturnType<typeof makeDetectMcpEnv>, id: string, params: Record<string, unknown>) {
  // The real signature has 5 args (id, params, signal, onUpdate, ctx).
  // In tests we only need the first two.
  return (tool.execute as (id: string, params: unknown) => Promise<unknown>)(id, params);
}

beforeEach(() => {
  vi.mocked(detectEnvVars).mockReset();
});

describe("detect_mcp_env tool", () => {
  it("returns structured list of detected env vars", async () => {
    const mockResult: DetectionResult = {
      detected: [
        {
          name: "BRAVE_API_KEY",
          required: true,
          description: "Brave Search API key",
          docsUrl: "https://brave.com/search/api/",
          detectedFrom: "registry",
        },
        {
          name: "BRAVE_EXTRA",
          required: false,
          detectedFrom: "dry-run",
        },
      ],
    };
    vi.mocked(detectEnvVars).mockResolvedValue(mockResult);

    const tool = makeDetectMcpEnv(stubCtx);
    const result = await callTool(tool, "call-1", {
      transport: "stdio",
      command: "npx",
      args: ["-y", "@anthropic/brave-search-mcp"],
      name: "brave-search",
    });

    // Verify detectEnvVars was called with correct params
    expect(detectEnvVars).toHaveBeenCalledWith({
      transport: "stdio",
      command: "npx",
      args: ["-y", "@anthropic/brave-search-mcp"],
      name: "brave-search",
    });

    // Check response text contains env var info
    const text = (result as { content: { text: string }[] }).content[0].text;
    expect(text).toContain("BRAVE_API_KEY");
    expect(text).toContain("required");
    expect(text).toContain("[verified]"); // registry source
    expect(text).toContain("BRAVE_EXTRA");
    expect(text).toContain("[detected]"); // dry-run source
    expect(text).toContain("Brave Search API key");
    expect(text).toContain("https://brave.com/search/api/");

    // Check details payload
    const details = (result as { details: { detected: unknown[] } }).details;
    expect(details.detected).toHaveLength(2);
  });

  it("returns helpful message when no env vars detected", async () => {
    vi.mocked(detectEnvVars).mockResolvedValue({ detected: [] });

    const tool = makeDetectMcpEnv(stubCtx);
    const result = await callTool(tool, "call-2", {
      transport: "stdio",
      command: "npx",
      args: ["-y", "some-server"],
    });

    const text = (result as { content: { text: string }[] }).content[0].text;
    expect(text).toContain("No required environment variables detected");

    const details = (result as { details: { detected: unknown[] } }).details;
    expect(details.detected).toEqual([]);
  });

  it("includes error message when detector returns an error", async () => {
    vi.mocked(detectEnvVars).mockResolvedValue({
      detected: [],
      error: "command not found: foobar",
    });

    const tool = makeDetectMcpEnv(stubCtx);
    const result = await callTool(tool, "call-3", {
      transport: "stdio",
      command: "foobar",
      args: [],
    });

    const text = (result as { content: { text: string }[] }).content[0].text;
    expect(text).toContain("No environment variables detected");
    expect(text).toContain("command not found: foobar");
  });

  it("includes error note alongside detected vars", async () => {
    vi.mocked(detectEnvVars).mockResolvedValue({
      detected: [
        { name: "API_KEY", required: true, detectedFrom: "registry" },
      ],
      error: "dry-run timed out",
    });

    const tool = makeDetectMcpEnv(stubCtx);
    const result = await callTool(tool, "call-4", {
      transport: "stdio",
      command: "npx",
      args: ["some-server"],
    });

    const text = (result as { content: { text: string }[] }).content[0].text;
    expect(text).toContain("API_KEY");
    expect(text).toContain("Note: dry-run timed out");
  });
});
