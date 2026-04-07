import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "@mariozechner/pi-ai";
import { eq, desc } from "drizzle-orm";
import { pipelineRuns } from "@pawn/db";
import type { AgentToolContext } from "./context.js";

export function makeListRecentRuns(ctx: AgentToolContext): ToolDefinition {
  return {
    name: "list_recent_runs",
    label: "List Recent Runs",
    description: "List recent pipeline runs, optionally filtered by pipeline.",
    parameters: Type.Object({
      limit: Type.Optional(Type.Number({ description: "Max results (default 10)" })),
      pipelineId: Type.Optional(Type.String({ description: "Filter by pipeline ID" })),
    }),
    execute: async (_id, params: { limit?: number; pipelineId?: string }) => {
      const limit = params.limit ?? 10;
      const rows = await ctx.db.query.pipelineRuns.findMany({
        where: params.pipelineId ? eq(pipelineRuns.pipelineId, params.pipelineId) : undefined,
        orderBy: [desc(pipelineRuns.createdAt)],
        limit,
        with: { pipeline: { columns: { name: true } } } as any,
      });
      const result = rows.map((r: any) => ({
        id: r.id,
        pipelineName: r.pipeline?.name ?? r.pipelineId,
        status: r.status,
        triggerType: r.triggerType,
        createdAt: r.createdAt,
        finishedAt: r.finishedAt,
      }));
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }], details: {} };
    },
  };
}
