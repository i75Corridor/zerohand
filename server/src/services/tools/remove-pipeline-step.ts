import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "@mariozechner/pi-ai";
import { eq } from "drizzle-orm";
import { pipelineSteps } from "@zerohand/db";
import type { AgentToolContext } from "./context.js";

export function makeRemovePipelineStep(ctx: AgentToolContext): ToolDefinition {
  return {
    name: "remove_pipeline_step",
    label: "Remove Pipeline Step",
    description: "Remove a step from a pipeline.",
    parameters: Type.Object({
      stepId: Type.String({ description: "The step ID to remove" }),
    }),
    execute: async (_id, params: { stepId: string }) => {
      const deleted = await ctx.db
        .delete(pipelineSteps)
        .where(eq(pipelineSteps.id, params.stepId))
        .returning();
      if (deleted.length === 0) return { content: [{ type: "text" as const, text: "Step not found." }], details: {} };
      ctx.broadcastDataChanged("step", "deleted", params.stepId);
      ctx.broadcastDataChanged("pipeline", "updated", deleted[0].pipelineId);
      return { content: [{ type: "text" as const, text: `Removed step "${deleted[0].name}".` }], details: {} };
    },
  };
}
