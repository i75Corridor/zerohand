import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "@mariozechner/pi-ai";
import { eq } from "drizzle-orm";
import { budgetPolicies } from "@pawn/db";
import type { AgentToolContext } from "./context.js";

export function makeUpdateBudget(ctx: AgentToolContext): ToolDefinition {
  return {
    name: "update_budget",
    label: "Update Budget",
    description: "Update an existing budget policy by ID.",
    parameters: Type.Object({
      budgetId: Type.String({ description: "The budget policy ID to update" }),
      amountCents: Type.Optional(Type.Number({ description: "New budget amount in cents" })),
      windowKind: Type.Optional(Type.String({ description: "New window kind: calendar_month or lifetime" })),
      warnPercent: Type.Optional(Type.Number({ description: "New warning threshold percentage" })),
      hardStopEnabled: Type.Optional(Type.Boolean({ description: "Whether to hard-stop when budget is exceeded" })),
    }),
    execute: async (
      _id,
      params: {
        budgetId: string;
        amountCents?: number;
        windowKind?: string;
        warnPercent?: number;
        hardStopEnabled?: boolean;
      },
    ) => {
      const { budgetId, ...fields } = params;
      const [row] = await ctx.db
        .update(budgetPolicies)
        .set({ ...fields, updatedAt: new Date() })
        .where(eq(budgetPolicies.id, budgetId))
        .returning();
      if (!row) return { content: [{ type: "text" as const, text: "Budget policy not found." }], details: {} };
      ctx.broadcastDataChanged("budget", "updated", row.id);
      return { content: [{ type: "text" as const, text: `Updated budget policy ${row.id}.` }], details: {} };
    },
  };
}
