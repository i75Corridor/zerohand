import { describe, expect, it } from "vitest";
import { formatTable, relativeTime, shortId } from "../formatters.js";
import { pipelineToYaml } from "../formatters.js";
import type { ApiPipeline } from "@zerohand/shared";

describe("shortId", () => {
  it("returns first 8 chars", () => {
    expect(shortId("abcd1234efgh5678")).toBe("abcd1234");
  });
});

describe("formatTable", () => {
  it("returns (none) for empty rows", () => {
    expect(formatTable([], ["NAME"])).toBe("(none)");
  });

  it("renders header and rows with correct column count", () => {
    const rows = [{ NAME: "foo", STATUS: "active" }];
    const output = formatTable(rows, ["NAME", "STATUS"]);
    const lines = output.split("\n");
    expect(lines[0]).toContain("NAME");
    expect(lines[0]).toContain("STATUS");
    expect(lines[2]).toContain("foo");
    expect(lines[2]).toContain("active");
  });

  it("pads columns to equal width", () => {
    const rows = [
      { A: "short", B: "x" },
      { A: "a-much-longer-value", B: "y" },
    ];
    const output = formatTable(rows, ["A", "B"]);
    const lines = output.split("\n");
    // All lines should have same length (padEnd ensures this)
    const lengths = lines.map((l) => l.trimEnd().length);
    expect(lengths[2]).toBeGreaterThan("short".length);
  });
});

describe("relativeTime", () => {
  it("formats seconds ago", () => {
    const iso = new Date(Date.now() - 30_000).toISOString();
    expect(relativeTime(iso)).toMatch(/\d+s ago/);
  });

  it("formats minutes ago", () => {
    const iso = new Date(Date.now() - 5 * 60_000).toISOString();
    expect(relativeTime(iso)).toMatch(/\d+m ago/);
  });
});

describe("pipelineToYaml", () => {
  const basePipeline: ApiPipeline = {
    id: "test-id",
    name: "Test Pipeline",
    description: "A test pipeline",
    status: "active",
    modelProvider: "google",
    modelName: "gemini-2.5-flash",
    systemPrompt: "You are a test agent.",
    inputSchema: {
      type: "object",
      properties: { topic: { type: "string" } },
      required: ["topic"],
    },
    createdAt: new Date().toISOString(),
    steps: [
      {
        id: "step-1",
        stepIndex: 0,
        name: "Research",
        skillName: "researcher",
        promptTemplate: "Research: {{input.topic}}",
        timeoutSeconds: 120,
        approvalRequired: false,
        metadata: null,
      },
    ],
  };

  it("includes name and description", () => {
    const yaml = pipelineToYaml(basePipeline);
    expect(yaml).toContain("name: Test Pipeline");
    expect(yaml).toContain("description: A test pipeline");
  });

  it("formats model as provider/name", () => {
    const yaml = pipelineToYaml(basePipeline);
    expect(yaml).toContain("model: google/gemini-2.5-flash");
  });

  it("includes systemPrompt", () => {
    const yaml = pipelineToYaml(basePipeline);
    expect(yaml).toContain("systemPrompt:");
    expect(yaml).toContain("You are a test agent");
  });

  it("includes step with skill", () => {
    const yaml = pipelineToYaml(basePipeline);
    expect(yaml).toContain("skill: researcher");
    expect(yaml).toContain("promptTemplate:");
  });

  it("omits model when not set", () => {
    const yaml = pipelineToYaml({ ...basePipeline, modelProvider: null, modelName: null });
    expect(yaml).not.toContain("model:");
  });

  it("omits timeoutSeconds when default (300)", () => {
    const pipeline = {
      ...basePipeline,
      steps: [{ ...basePipeline.steps[0], timeoutSeconds: 300 }],
    };
    const yaml = pipelineToYaml(pipeline);
    expect(yaml).not.toContain("timeoutSeconds");
  });
});
