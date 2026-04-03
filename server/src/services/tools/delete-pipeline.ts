import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "@mariozechner/pi-ai";
import { eq } from "drizzle-orm";
import { pipelines } from "@zerohand/db";
import type { AgentToolContext } from "./context.js";

export function makeDeletePipeline(ctx: AgentToolContext): ToolDefinition {
  return {
    name: "delete_pipeline",
    label: "Delete Pipeline",
    description: "Delete a pipeline and all its steps. This cannot be undone.",
    parameters: Type.Object({
      pipelineId: Type.String({ description: "The pipeline ID to delete" }),
    }),
    execute: async (_id, params: { pipelineId: string }) => {
      const deleted = await ctx.db
        .delete(pipelines)
        .where(eq(pipelines.id, params.pipelineId))
        .returning();
      if (deleted.length === 0) return { content: [{ type: "text" as const, text: "Pipeline not found." }], details: {} };
      ctx.broadcastDataChanged("pipeline", "deleted", params.pipelineId);
      return { content: [{ type: "text" as const, text: `Deleted pipeline ${params.pipelineId}.` }], details: {} };
    },
  };
}
