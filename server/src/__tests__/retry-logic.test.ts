import { describe, it, expect } from "vitest";
import { classifyError, isRetryable } from "../services/execution-engine.js";

describe("classifyError", () => {
  it("classifies timeout errors", () => {
    expect(classifyError(new Error("Script timed out after 30s"))).toBe("timeout");
    expect(classifyError(new Error("Request timeout exceeded"))).toBe("timeout");
  });

  it("classifies budget exceeded errors", () => {
    expect(classifyError(new Error("Budget exceeded for this pipeline"))).toBe("budget_exceeded");
    expect(classifyError(new Error("budget limit reached"))).toBe("budget_exceeded");
  });

  it("classifies unknown errors", () => {
    expect(classifyError(new Error("Network error"))).toBe("unknown");
    expect(classifyError(new Error("Skill not found"))).toBe("unknown");
    expect(classifyError("some string error")).toBe("unknown");
  });
});

describe("isRetryable", () => {
  it("budget_exceeded is never retryable", () => {
    const budgetErr = new Error("Budget exceeded");
    expect(isRetryable(budgetErr, null)).toBe(false);
    expect(isRetryable(budgetErr, { maxRetries: 5, retryOnErrors: ["budget_exceeded"] })).toBe(false);
    expect(isRetryable(budgetErr, { maxRetries: 5 })).toBe(false);
  });

  it("with no retryOnErrors filter, all non-budget errors are retryable", () => {
    expect(isRetryable(new Error("timeout"), null)).toBe(true);
    expect(isRetryable(new Error("unknown failure"), { maxRetries: 3 })).toBe(true);
    expect(isRetryable(new Error("Network error"), { maxRetries: 1, retryOnErrors: [] })).toBe(true);
  });

  it("with retryOnErrors filter, only matching categories are retryable", () => {
    const config = { maxRetries: 3, retryOnErrors: ["timeout"] };
    expect(isRetryable(new Error("Script timed out after 30s"), config)).toBe(true);
    expect(isRetryable(new Error("Network error"), config)).toBe(false);
  });

  it("null config allows retry for non-budget errors", () => {
    expect(isRetryable(new Error("Some error"), null)).toBe(true);
  });
});
