import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "@mariozechner/pi-ai";
import { pipelines } from "@pawn/db";
import type { AgentToolContext } from "./context.js";

export function makeCreatePipeline(ctx: AgentToolContext): ToolDefinition {
  return {
    name: "create_pipeline",
    label: "Create Pipeline",
    description: "Create a new pipeline.",
    parameters: Type.Object({
      name: Type.String({ description: "Pipeline name" }),
      description: Type.Optional(Type.String({ description: "Pipeline description" })),
      inputSchema: Type.Optional(Type.Record(Type.String(), Type.Unknown(), { description: "JSON Schema for pipeline inputs" })),
    }),
    execute: async (_id, params: { name: string; description?: string; inputSchema?: Record<string, unknown> }) => {
      const [row] = await ctx.db
        .insert(pipelines)
        .values({ name: params.name, description: params.description, inputSchema: params.inputSchema })
        .returning();
      ctx.broadcastDataChanged("pipeline", "created", row.id);
      return { content: [{ type: "text" as const, text: JSON.stringify({ id: row.id, name: row.name }, null, 2) }], details: {} };
    },
  };
}
