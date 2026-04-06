import { describe, it, expect } from "vitest";
import { resolveEnvRefs } from "../services/mcp-client.js";

describe("resolveEnvRefs", () => {
  it("resolves ${FOO} to process.env.FOO value", () => {
    const result = resolveEnvRefs(
      { API_KEY: "${FOO}" },
      { FOO: "bar-value" },
    );
    expect(result).toEqual({ API_KEY: "bar-value" });
  });

  it("passes literal values through unchanged", () => {
    const result = resolveEnvRefs(
      { KEY: "my-key" },
      {},
    );
    expect(result).toEqual({ KEY: "my-key" });
  });

  it("does NOT treat ${} as a reference when embedded in a substring", () => {
    const result = resolveEnvRefs(
      { KEY: "abc${DEF}ghi" },
      { DEF: "resolved" },
    );
    expect(result).toEqual({ KEY: "abc${DEF}ghi" });
  });

  it("omits key when referenced env var is not set", () => {
    const result = resolveEnvRefs(
      { SECRET: "${MISSING_VAR}" },
      {},
    );
    expect(result).toEqual({});
    expect("SECRET" in result).toBe(false);
  });

  it("resolves FOO to value of BAR when FOO=${BAR}", () => {
    const result = resolveEnvRefs(
      { FOO: "${BAR}" },
      { BAR: "baz" },
    );
    expect(result).toEqual({ FOO: "baz" });
  });

  it("passes through malformed syntax unchanged", () => {
    const cases: Record<string, string> = {
      A: "${",
      B: "${}",
      C: "${foo}",  // lowercase not matched by pattern
    };
    const result = resolveEnvRefs(cases, { foo: "should-not-resolve" });
    expect(result).toEqual({
      A: "${",
      B: "${}",
      C: "${foo}",
    });
  });

  it("returns empty object for empty env", () => {
    const result = resolveEnvRefs({}, { FOO: "bar" });
    expect(result).toEqual({});
  });
});
