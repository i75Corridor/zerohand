import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "@mariozechner/pi-ai";
import { gte, count, sql } from "drizzle-orm";
import { pipelineRuns, costEvents } from "@zerohand/db";
import type { AgentToolContext } from "./context.js";

export function makeGetSystemStats(ctx: AgentToolContext): ToolDefinition {
  return {
    name: "get_system_stats",
    label: "Get System Stats",
    description: "Get system statistics: runs this month, active runs, and total cost this month.",
    parameters: Type.Object({}),
    execute: async () => {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      const [runsThisMonth] = await ctx.db
        .select({ count: count() })
        .from(pipelineRuns)
        .where(gte(pipelineRuns.createdAt, monthStart));

      const [activeRuns] = await ctx.db
        .select({ count: count() })
        .from(pipelineRuns)
        .where(sql`${pipelineRuns.status} IN ('running', 'queued', 'paused')`);

      const [costResult] = await ctx.db
        .select({ total: sql<number>`coalesce(sum(${costEvents.costCents}), 0)` })
        .from(costEvents)
        .where(gte(costEvents.occurredAt, monthStart));

      const result = {
        runsThisMonth: runsThisMonth?.count ?? 0,
        activeRuns: activeRuns?.count ?? 0,
        costCentsThisMonth: Number(costResult?.total ?? 0),
        costDollarsThisMonth: (Number(costResult?.total ?? 0) / 100).toFixed(2),
      };
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }], details: {} };
    },
  };
}
