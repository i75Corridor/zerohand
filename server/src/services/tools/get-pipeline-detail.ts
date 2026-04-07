import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "@mariozechner/pi-ai";
import { eq } from "drizzle-orm";
import { pipelines, pipelineSteps } from "@pawn/db";
import type { AgentToolContext } from "./context.js";

export function makeGetPipelineDetail(ctx: AgentToolContext): ToolDefinition {
  return {
    name: "get_pipeline_detail",
    label: "Get Pipeline Detail",
    description: "Get full details for a pipeline including all steps with worker names.",
    parameters: Type.Object({
      pipelineId: Type.String({ description: "The pipeline ID" }),
    }),
    execute: async (_id, params: { pipelineId: string }) => {
      const pipeline = await ctx.db.query.pipelines.findFirst({ where: eq(pipelines.id, params.pipelineId) });
      if (!pipeline) return { content: [{ type: "text" as const, text: "Pipeline not found." }], details: {} };
      const steps = await ctx.db.query.pipelineSteps.findMany({ where: eq(pipelineSteps.pipelineId, params.pipelineId) });
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            id: pipeline.id, name: pipeline.name, description: pipeline.description,
            status: pipeline.status, inputSchema: pipeline.inputSchema,
            steps: steps.map((s) => ({
              id: s.id, stepIndex: s.stepIndex, name: s.name,
              skillName: s.skillName,
              promptTemplate: s.promptTemplate, timeoutSeconds: s.timeoutSeconds,
              approvalRequired: s.approvalRequired,
            })),
          }, null, 2),
        }],
        details: {},
      };
    },
  };
}
