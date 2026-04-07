import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "@mariozechner/pi-ai";
import { eq } from "drizzle-orm";
import { budgetPolicies } from "@pawn/db";
import type { AgentToolContext } from "./context.js";

export function makeDeleteBudget(ctx: AgentToolContext): ToolDefinition {
  return {
    name: "delete_budget",
    label: "Delete Budget",
    description: "Delete a budget policy by ID. This cannot be undone.",
    parameters: Type.Object({
      budgetId: Type.String({ description: "The budget policy ID to delete" }),
    }),
    execute: async (_id, params: { budgetId: string }) => {
      const deleted = await ctx.db
        .delete(budgetPolicies)
        .where(eq(budgetPolicies.id, params.budgetId))
        .returning();
      if (deleted.length === 0) return { content: [{ type: "text" as const, text: "Budget policy not found." }], details: {} };
      ctx.broadcastDataChanged("budget", "deleted", params.budgetId);
      return { content: [{ type: "text" as const, text: `Deleted budget policy ${params.budgetId}.` }], details: {} };
    },
  };
}
