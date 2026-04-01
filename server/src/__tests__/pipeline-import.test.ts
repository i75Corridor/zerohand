import { describe, it, expect } from "vitest";
import { hashConfig, parsePipelineModel } from "../services/pipeline-import.js";

describe("hashConfig", () => {
  it("returns a 16-char hex string", () => {
    const hash = hashConfig("hello");
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it("is deterministic — same input produces same hash", () => {
    const yaml = "name: Test\nsteps: []";
    expect(hashConfig(yaml)).toBe(hashConfig(yaml));
  });

  it("produces different hashes for different inputs", () => {
    expect(hashConfig("version: 1")).not.toBe(hashConfig("version: 2"));
  });

  it("is sensitive to whitespace", () => {
    expect(hashConfig("name: foo")).not.toBe(hashConfig("name:  foo"));
  });
});

describe("parsePipelineModel", () => {
  it("parses provider/model format", () => {
    expect(parsePipelineModel("google/gemini-2.5-flash")).toEqual({
      modelProvider: "google",
      modelName: "gemini-2.5-flash",
    });
  });

  it("parses anthropic/model", () => {
    expect(parsePipelineModel("anthropic/claude-opus-4-6")).toEqual({
      modelProvider: "anthropic",
      modelName: "claude-opus-4-6",
    });
  });

  it("handles model names with multiple slashes (takes first as provider)", () => {
    const result = parsePipelineModel("openai/gpt-4/turbo");
    expect(result.modelProvider).toBe("openai");
    expect(result.modelName).toBe("gpt-4/turbo");
  });

  it("returns empty object for undefined", () => {
    expect(parsePipelineModel(undefined)).toEqual({});
  });

  it("returns empty object when no slash present", () => {
    expect(parsePipelineModel("gemini-2.5-flash")).toEqual({});
  });

  it("returns empty object for empty string", () => {
    expect(parsePipelineModel("")).toEqual({});
  });
});
