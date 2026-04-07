import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "@mariozechner/pi-ai";
import { eq } from "drizzle-orm";
import { pipelineRuns, stepRuns, pipelines } from "@pawn/db";
import type { AgentToolContext } from "./context.js";

export function makeGetRunStatus(ctx: AgentToolContext): ToolDefinition {
  return {
    name: "get_run_status",
    label: "Get Run Status",
    description: "Get detailed status of a specific pipeline run including all steps.",
    parameters: Type.Object({
      runId: Type.String({ description: "The pipeline run ID" }),
    }),
    execute: async (_id, params: { runId: string }) => {
      const run = await ctx.db.query.pipelineRuns.findFirst({
        where: eq(pipelineRuns.id, params.runId),
      });
      if (!run) return { content: [{ type: "text" as const, text: `Run ${params.runId} not found.` }], details: {} };

      const [pipeline, steps] = await Promise.all([
        ctx.db.query.pipelines.findFirst({ where: eq(pipelines.id, run.pipelineId) }),
        ctx.db.select().from(stepRuns).where(eq(stepRuns.pipelineRunId, params.runId)).orderBy(stepRuns.stepIndex),
      ]);

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            run: {
              id: run.id,
              status: run.status,
              error: run.error,
              pipelineId: run.pipelineId,
              pipelineName: pipeline?.name ?? run.pipelineId,
              triggerType: run.triggerType,
              inputParams: run.inputParams,
              createdAt: run.createdAt,
              finishedAt: run.finishedAt,
            },
            steps: steps.map((s) => ({ stepIndex: s.stepIndex, status: s.status, error: s.error, output: (s.output as { text?: string })?.text?.slice(0, 500) })),
          }, null, 2),
        }],
        details: {},
      };
    },
  };
}
