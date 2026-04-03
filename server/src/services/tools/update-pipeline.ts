import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "@mariozechner/pi-ai";
import { eq } from "drizzle-orm";
import { pipelines } from "@zerohand/db";
import type { AgentToolContext } from "./context.js";

export function makeUpdatePipeline(ctx: AgentToolContext): ToolDefinition {
  return {
    name: "update_pipeline",
    label: "Update Pipeline",
    description: "Update pipeline metadata (name, description, status, input schema).",
    parameters: Type.Object({
      pipelineId: Type.String({ description: "The pipeline ID" }),
      name: Type.Optional(Type.String()),
      description: Type.Optional(Type.String()),
      status: Type.Optional(Type.String()),
      inputSchema: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
    }),
    execute: async (_id, params: { pipelineId: string; name?: string; description?: string; status?: string; inputSchema?: Record<string, unknown> }) => {
      const { pipelineId, ...fields } = params;
      const [row] = await ctx.db
        .update(pipelines)
        .set({ ...fields, updatedAt: new Date() })
        .where(eq(pipelines.id, pipelineId))
        .returning();
      if (!row) return { content: [{ type: "text" as const, text: "Pipeline not found." }], details: {} };
      ctx.broadcastDataChanged("pipeline", "updated", row.id);
      return { content: [{ type: "text" as const, text: `Updated pipeline "${row.name}".` }], details: {} };
    },
  };
}
