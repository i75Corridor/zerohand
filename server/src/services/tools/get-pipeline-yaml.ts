import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "@mariozechner/pi-ai";
import { eq, asc } from "drizzle-orm";
import { pipelines, pipelineSteps } from "@pawn/db";
import { pipelineToYaml } from "@pawn/shared";
import type { ApiPipeline } from "@pawn/shared";
import type { AgentToolContext } from "./context.js";

export function makeGetPipelineYaml(ctx: AgentToolContext): ToolDefinition {
  return {
    name: "get_pipeline_yaml",
    label: "Get Pipeline YAML",
    description: "Return the YAML representation of a pipeline as it would be exported in a blueprint. Useful for reviewing the final pipeline definition before publishing.",
    parameters: Type.Object({
      pipelineId: Type.String({ description: "The pipeline ID." }),
    }),
    execute: async (_id, params: { pipelineId: string }) => {
      const pipeline = await ctx.db.query.pipelines.findFirst({ where: eq(pipelines.id, params.pipelineId) });
      if (!pipeline) {
        return { content: [{ type: "text" as const, text: "Pipeline not found." }], details: {} };
      }
      const steps = await ctx.db.query.pipelineSteps.findMany({
        where: eq(pipelineSteps.pipelineId, params.pipelineId),
        orderBy: [asc(pipelineSteps.stepIndex)],
      });

      const apiPipeline: ApiPipeline = {
        id: pipeline.id,
        name: pipeline.name,
        description: pipeline.description,
        status: pipeline.status,
        inputSchema: pipeline.inputSchema as Record<string, unknown> | null,
        systemPrompt: pipeline.systemPrompt,
        modelProvider: pipeline.modelProvider,
        modelName: pipeline.modelName,
        createdAt: pipeline.createdAt.toISOString(),
        steps: steps.map((s) => ({
          id: s.id,
          stepIndex: s.stepIndex,
          name: s.name,
          skillName: s.skillName,
          promptTemplate: s.promptTemplate,
          timeoutSeconds: s.timeoutSeconds,
          approvalRequired: s.approvalRequired,
          retryConfig: s.retryConfig as any ?? null,
          metadata: s.metadata as Record<string, unknown> | null,
        })),
      };

      const yaml = pipelineToYaml(apiPipeline);
      return { content: [{ type: "text" as const, text: yaml }], details: {} };
    },
  };
}
