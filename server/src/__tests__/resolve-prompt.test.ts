import { describe, it, expect } from "vitest";
import { resolvePrompt } from "../services/execution-engine.js";

describe("resolvePrompt", () => {
  it("substitutes {{input.key}} from params", () => {
    const result = resolvePrompt("Research: {{input.topic}}", { topic: "climate change" }, new Map());
    expect(result).toBe("Research: climate change");
  });

  it("substitutes {{steps.N.output}} from prior step", () => {
    const stepOutputs = new Map([[0, "step zero output"]]);
    const result = resolvePrompt("Based on: {{steps.0.output}}", {}, stepOutputs);
    expect(result).toBe("Based on: step zero output");
  });

  it("extracts a nested field from JSON step output", () => {
    const stepOutputs = new Map([[1, JSON.stringify({ title: "My Article", imagePrompt: "a sunset" })]]);
    const result = resolvePrompt("Image: {{steps.1.output.imagePrompt}}", {}, stepOutputs);
    expect(result).toBe("Image: a sunset");
  });

  it("extracts a deeply nested field from JSON step output", () => {
    const stepOutputs = new Map([[0, JSON.stringify({ meta: { author: "Alice" } })]]);
    const result = resolvePrompt("By {{steps.0.output.meta.author}}", {}, stepOutputs);
    expect(result).toBe("By Alice");
  });

  it("returns empty string for a missing input key", () => {
    expect(resolvePrompt("{{input.missing}}", {}, new Map())).toBe("");
  });

  it("returns empty string for a missing step index", () => {
    expect(resolvePrompt("{{steps.99.output}}", {}, new Map())).toBe("");
  });

  it("returns raw step output when field access fails on non-JSON", () => {
    const stepOutputs = new Map([[0, "not json"]]);
    // JSON.parse fails → fallback to raw output
    const result = resolvePrompt("{{steps.0.output.field}}", {}, stepOutputs);
    expect(result).toBe("not json");
  });

  it("returns empty string when nested field is missing in JSON", () => {
    const stepOutputs = new Map([[0, JSON.stringify({ title: "foo" })]]);
    const result = resolvePrompt("{{steps.0.output.missingKey}}", {}, stepOutputs);
    expect(result).toBe("");
  });

  it("leaves unrecognized templates untouched", () => {
    expect(resolvePrompt("{{unknown.thing}}", {}, new Map())).toBe("{{unknown.thing}}");
  });

  it("handles multiple substitutions in one template", () => {
    const stepOutputs = new Map([[0, "research result"]]);
    const result = resolvePrompt(
      "Topic: {{input.topic}}\nResearch: {{steps.0.output}}",
      { topic: "AI" },
      stepOutputs,
    );
    expect(result).toBe("Topic: AI\nResearch: research result");
  });

  it("coerces numeric input values to string", () => {
    const result = resolvePrompt("Count: {{input.count}}", { count: 42 }, new Map());
    expect(result).toBe("Count: 42");
  });
});
