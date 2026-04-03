import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "@mariozechner/pi-ai";
import { eq } from "drizzle-orm";
import { pipelineRuns } from "@zerohand/db";
import type { AgentToolContext } from "./context.js";

export function makeCancelRun(ctx: AgentToolContext): ToolDefinition {
  return {
    name: "cancel_run",
    label: "Cancel Run",
    description: "Cancel an active pipeline run.",
    parameters: Type.Object({
      runId: Type.String({ description: "The pipeline run ID to cancel" }),
    }),
    execute: async (_id, params: { runId: string }) => {
      ctx.cancelRun(params.runId);
      await ctx.db
        .update(pipelineRuns)
        .set({ status: "cancelled", finishedAt: new Date(), updatedAt: new Date() })
        .where(eq(pipelineRuns.id, params.runId));
      return { content: [{ type: "text" as const, text: `Run ${params.runId} has been cancelled.` }], details: {} };
    },
  };
}
