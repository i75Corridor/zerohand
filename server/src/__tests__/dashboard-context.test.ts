import { describe, it, expect } from "vitest";
import { formatDashboardContext, type DashboardContext } from "../services/dashboard-context.js";

function makeContext(overrides: Partial<DashboardContext> = {}): DashboardContext {
  return {
    activeRuns: 0,
    runsThisMonth: 0,
    costCentsThisMonth: 0,
    pendingApprovals: 0,
    recentFailures: [],
    ...overrides,
  };
}

describe("formatDashboardContext", () => {
  it("formats a fully populated context block", () => {
    const ctx = makeContext({
      activeRuns: 3,
      runsThisMonth: 47,
      costCentsThisMonth: 1245,
      pendingApprovals: 2,
      recentFailures: [
        { pipeline: "ETL Pipeline", error: "timeout after 300s", createdAt: new Date() },
        { pipeline: "Slack Notifier", error: "429 rate limit", createdAt: new Date() },
      ],
      navigation: { path: "/pipelines/abc", pipelineName: "ETL Pipeline", runStatus: "running" },
    });

    const result = formatDashboardContext(ctx);

    expect(result).toContain("[Dashboard:");
    expect(result).toContain("3 active runs");
    expect(result).toContain("$12.45 cost this month");
    expect(result).toContain("47 runs this month");
    expect(result).toContain("2 pending approvals");
    expect(result).toContain('Recent failures: "ETL Pipeline": timeout after 300s; "Slack Notifier": 429 rate limit');
    expect(result).toContain('[Navigation: path: /pipelines/abc | pipeline: "ETL Pipeline" | status: running]');
  });

  it("produces a block with zero values and no failures section", () => {
    const ctx = makeContext();
    const result = formatDashboardContext(ctx);

    expect(result).toContain("0 active runs");
    expect(result).toContain("$0.00 cost this month");
    expect(result).toContain("0 runs this month");
    expect(result).toContain("0 pending approvals");
    expect(result).not.toContain("Recent failures");
    expect(result).not.toContain("[Navigation:");
  });

  it("omits navigation section when navigation is undefined", () => {
    const ctx = makeContext({ activeRuns: 1 });
    const result = formatDashboardContext(ctx);

    expect(result).not.toContain("[Navigation:");
    expect(result).toContain("1 active runs");
  });

  it("includes navigation with path only when no pipeline/run info", () => {
    const ctx = makeContext({ navigation: { path: "/settings" } });
    const result = formatDashboardContext(ctx);

    expect(result).toContain("[Navigation: path: /settings]");
    expect(result).not.toContain("pipeline");
    expect(result).not.toContain("run status");
  });

  it("truncates error strings longer than 150 characters", () => {
    const longError = "a".repeat(200);
    const truncated = longError.slice(0, 147) + "...";
    const ctx = makeContext({
      recentFailures: [{ pipeline: "Test", error: truncated, createdAt: new Date() }],
    });
    const result = formatDashboardContext(ctx);

    expect(result).toContain("...");
    // The error in the formatted output should not exceed 150 chars
    const errorMatch = result.match(/"Test": (.+?)(?:;|\])/);
    expect(errorMatch).toBeTruthy();
    expect(errorMatch![1].length).toBeLessThanOrEqual(150);
  });

  it("handles fallback pipeline name for deleted pipelines", () => {
    const ctx = makeContext({
      recentFailures: [{ pipeline: "Unknown", error: "connection refused", createdAt: new Date() }],
    });
    const result = formatDashboardContext(ctx);

    expect(result).toContain('"Unknown": connection refused');
  });

  it("limits to provided failures only (caller caps at 5)", () => {
    const failures = Array.from({ length: 5 }, (_, i) => ({
      pipeline: `Pipeline ${i}`,
      error: `error ${i}`,
      createdAt: new Date(),
    }));
    const ctx = makeContext({ recentFailures: failures });
    const result = formatDashboardContext(ctx);

    for (let i = 0; i < 5; i++) {
      expect(result).toContain(`"Pipeline ${i}"`);
    }
  });

  it("formats cost cents correctly for small amounts", () => {
    const ctx = makeContext({ costCentsThisMonth: 3 });
    const result = formatDashboardContext(ctx);
    expect(result).toContain("$0.03 cost this month");
  });
});
