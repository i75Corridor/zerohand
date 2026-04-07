import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "@mariozechner/pi-ai";
import { eq, asc } from "drizzle-orm";
import { triggers } from "@pawn/db";
import type { AgentToolContext } from "./context.js";

export function makeListTriggers(ctx: AgentToolContext): ToolDefinition {
  return {
    name: "list_triggers",
    label: "List Triggers",
    description: "List all triggers for a given pipeline.",
    parameters: Type.Object({
      pipelineId: Type.String({ description: "Pipeline ID" }),
    }),
    execute: async (_id, params: { pipelineId: string }) => {
      const rows = await ctx.db
        .select()
        .from(triggers)
        .where(eq(triggers.pipelineId, params.pipelineId))
        .orderBy(asc(triggers.createdAt));
      return { content: [{ type: "text" as const, text: JSON.stringify(rows, null, 2) }], details: {} };
    },
  };
}
