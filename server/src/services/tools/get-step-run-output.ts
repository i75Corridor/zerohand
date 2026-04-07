import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "@mariozechner/pi-ai";
import { eq, asc } from "drizzle-orm";
import { pipelineRuns, stepRuns } from "@pawn/db";
import type { AgentToolContext } from "./context.js";

export function makeGetStepRunOutput(ctx: AgentToolContext): ToolDefinition {
  return {
    name: "get_step_run_output",
    label: "Get Step Run Output",
    description: "Retrieve the output text of a specific step from a pipeline run. Provide either stepRunId directly, or a runId + stepIndex to look it up.",
    parameters: Type.Object({
      runId: Type.Optional(Type.String({ description: "Pipeline run ID." })),
      stepIndex: Type.Optional(Type.Number({ description: "Step index (0-based) within the run." })),
      stepRunId: Type.Optional(Type.String({ description: "Step run ID (direct lookup, overrides runId+stepIndex)." })),
    }),
    execute: async (_id, params: { runId?: string; stepIndex?: number; stepRunId?: string }) => {
      let stepRun: typeof stepRuns.$inferSelect | undefined;

      if (params.stepRunId) {
        stepRun = await ctx.db.query.stepRuns.findFirst({ where: eq(stepRuns.id, params.stepRunId) });
      } else if (params.runId !== undefined && params.stepIndex !== undefined) {
        // Get the most recent step run for this run+stepIndex
        const run = await ctx.db.query.pipelineRuns.findFirst({ where: eq(pipelineRuns.id, params.runId) });
        if (!run) return { content: [{ type: "text" as const, text: "Run not found." }], details: {} };

        const candidates = await ctx.db.query.stepRuns.findMany({
          where: eq(stepRuns.pipelineRunId, params.runId),
          orderBy: [asc(stepRuns.createdAt)],
        });
        stepRun = candidates.find((s) => s.stepIndex === params.stepIndex);
      } else {
        return { content: [{ type: "text" as const, text: "Provide either stepRunId, or both runId and stepIndex." }], details: {} };
      }

      if (!stepRun) return { content: [{ type: "text" as const, text: "Step run not found." }], details: {} };

      const output = (stepRun.output as { text?: string } | null)?.text ?? "";
      const result = {
        stepRunId: stepRun.id,
        stepIndex: stepRun.stepIndex,
        status: stepRun.status,
        output,
        error: stepRun.error,
        startedAt: stepRun.startedAt?.toISOString() ?? null,
        finishedAt: stepRun.finishedAt?.toISOString() ?? null,
      };
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }], details: {} };
    },
  };
}
