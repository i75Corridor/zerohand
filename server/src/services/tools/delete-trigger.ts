import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "@mariozechner/pi-ai";
import { eq } from "drizzle-orm";
import { triggers } from "@zerohand/db";
import type { AgentToolContext } from "./context.js";

export function makeDeleteTrigger(ctx: AgentToolContext): ToolDefinition {
  return {
    name: "delete_trigger",
    label: "Delete Trigger",
    description: "Delete a trigger by ID. This cannot be undone.",
    parameters: Type.Object({
      triggerId: Type.String({ description: "The trigger ID to delete" }),
    }),
    execute: async (_id, params: { triggerId: string }) => {
      const deleted = await ctx.db
        .delete(triggers)
        .where(eq(triggers.id, params.triggerId))
        .returning();
      if (deleted.length === 0) return { content: [{ type: "text" as const, text: "Trigger not found." }], details: {} };
      ctx.broadcastDataChanged("trigger", "deleted", params.triggerId);
      return { content: [{ type: "text" as const, text: `Deleted trigger ${params.triggerId}.` }], details: {} };
    },
  };
}
