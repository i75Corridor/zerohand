import { describe, it, expect } from "vitest";
import { resolvePrompt, cleanJsonOutput } from "../services/execution-engine.js";

describe("resolvePrompt", () => {
  it("substitutes {{input.key}} from params", () => {
    const result = resolvePrompt("Research: {{input.topic}}", { topic: "climate change" }, new Map());
    expect(result).toBe("Research: climate change");
  });

  it("substitutes {{steps.1.output}} from first step (1-based)", () => {
    const stepOutputs = new Map([[0, "step one output"]]);
    const result = resolvePrompt("Based on: {{steps.1.output}}", {}, stepOutputs);
    expect(result).toBe("Based on: step one output");
  });

  it("substitutes {{steps.2.output}} from second step (1-based)", () => {
    const stepOutputs = new Map([[0, "first"], [1, "second"]]);
    const result = resolvePrompt("Based on: {{steps.2.output}}", {}, stepOutputs);
    expect(result).toBe("Based on: second");
  });

  it("{{steps.0.output}} still resolves first step for backward compatibility", () => {
    const stepOutputs = new Map([[0, "legacy output"]]);
    const result = resolvePrompt("Based on: {{steps.0.output}}", {}, stepOutputs);
    expect(result).toBe("Based on: legacy output");
  });

  it("extracts a nested field from JSON step output (1-based)", () => {
    const stepOutputs = new Map([[0, JSON.stringify({ title: "My Article", imagePrompt: "a sunset" })]]);
    const result = resolvePrompt("Image: {{steps.1.output.imagePrompt}}", {}, stepOutputs);
    expect(result).toBe("Image: a sunset");
  });

  it("extracts a deeply nested field from JSON step output (1-based)", () => {
    const stepOutputs = new Map([[0, JSON.stringify({ meta: { author: "Alice" } })]]);
    const result = resolvePrompt("By {{steps.1.output.meta.author}}", {}, stepOutputs);
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
    const result = resolvePrompt("{{steps.1.output.field}}", {}, stepOutputs);
    expect(result).toBe("not json");
  });

  it("returns empty string when nested field is missing in JSON", () => {
    const stepOutputs = new Map([[0, JSON.stringify({ title: "foo" })]]);
    const result = resolvePrompt("{{steps.1.output.missingKey}}", {}, stepOutputs);
    expect(result).toBe("");
  });

  it("leaves unrecognized templates untouched", () => {
    expect(resolvePrompt("{{unknown.thing}}", {}, new Map())).toBe("{{unknown.thing}}");
  });

  it("handles multiple substitutions in one template", () => {
    const stepOutputs = new Map([[0, "research result"]]);
    const result = resolvePrompt(
      "Topic: {{input.topic}}\nResearch: {{steps.1.output}}",
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

// ── cleanJsonOutput ────────────────────────────────────────────────────────────

describe("cleanJsonOutput", () => {
  it("returns already-clean JSON unchanged", () => {
    const json = JSON.stringify({ title: "foo", count: 1 });
    expect(cleanJsonOutput(json)).toBe(JSON.stringify(JSON.parse(json)));
  });

  it("strips ```json ... ``` markdown fences", () => {
    const raw = "```json\n{\"title\": \"hello\"}\n```";
    expect(cleanJsonOutput(raw)).toBe('{"title":"hello"}');
  });

  it("strips plain ``` ... ``` markdown fences", () => {
    const raw = "```\n{\"x\": 1}\n```";
    expect(cleanJsonOutput(raw)).toBe('{"x":1}');
  });

  it("finds JSON object after preamble text", () => {
    const raw = "Here is the result:\n{\"verdict\": \"pass\"}";
    expect(cleanJsonOutput(raw)).toBe('{"verdict":"pass"}');
  });

  it("returns raw output when not valid JSON", () => {
    expect(cleanJsonOutput("not json at all")).toBe("not json at all");
  });

  it("returns raw output when fenced content is not valid JSON", () => {
    const raw = "```json\nnot json\n```";
    // After stripping fence: "not json" — not parseable → returns raw
    expect(cleanJsonOutput(raw)).toBe(raw);
  });

  it("normalizes whitespace in JSON (compact re-serialization)", () => {
    const raw = '{\n  "a": 1,\n  "b": "hello"\n}';
    expect(cleanJsonOutput(raw)).toBe('{"a":1,"b":"hello"}');
  });
});
