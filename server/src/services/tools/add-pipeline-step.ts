import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "@mariozechner/pi-ai";
import { pipelineSteps } from "@zerohand/db";
import type { AgentToolContext } from "./context.js";

export function makeAddPipelineStep(ctx: AgentToolContext): ToolDefinition {
  return {
    name: "add_pipeline_step",
    label: "Add Pipeline Step",
    description: "Add a new step to a pipeline.",
    parameters: Type.Object({
      pipelineId: Type.String({ description: "The pipeline ID" }),
      name: Type.String({ description: "Step name" }),
      skillName: Type.String({ description: "Skill name for this step" }),
      promptTemplate: Type.String({ description: "Prompt template text" }),
      stepIndex: Type.Number({ description: "Position in the pipeline (0-based)" }),
      timeoutSeconds: Type.Optional(Type.Number({ description: "Timeout in seconds (default 300)" })),
      approvalRequired: Type.Optional(Type.Boolean({ description: "Whether human approval is required before executing (default false)" })),
    }),
    execute: async (_id, params: { pipelineId: string; name: string; skillName: string; promptTemplate: string; stepIndex: number; timeoutSeconds?: number; approvalRequired?: boolean }) => {
      const [row] = await ctx.db
        .insert(pipelineSteps)
        .values({
          pipelineId: params.pipelineId,
          stepIndex: params.stepIndex,
          name: params.name,
          skillName: params.skillName,
          promptTemplate: params.promptTemplate,
          timeoutSeconds: params.timeoutSeconds ?? 300,
          approvalRequired: params.approvalRequired ?? false,
        })
        .returning();
      ctx.broadcastDataChanged("step", "created", row.id);
      ctx.broadcastDataChanged("pipeline", "updated", params.pipelineId);
      return { content: [{ type: "text" as const, text: JSON.stringify({ id: row.id, name: row.name, stepIndex: row.stepIndex }, null, 2) }], details: {} };
    },
  };
}
