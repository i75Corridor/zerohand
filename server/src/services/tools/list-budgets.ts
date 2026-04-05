import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "@mariozechner/pi-ai";
import { budgetPolicies } from "@zerohand/db";
import type { AgentToolContext } from "./context.js";

export function makeListBudgets(ctx: AgentToolContext): ToolDefinition {
  return {
    name: "list_budgets",
    label: "List Budgets",
    description: "List budget policies with optional filters by scope type and scope ID.",
    parameters: Type.Object({
      scopeType: Type.Optional(Type.String({ description: "Filter by scope type: worker or pipeline" })),
      scopeId: Type.Optional(Type.String({ description: "Filter by scope ID" })),
    }),
    execute: async (_id, params: { scopeType?: string; scopeId?: string }) => {
      let rows = await ctx.db.select().from(budgetPolicies);
      if (params.scopeType) rows = rows.filter((r) => r.scopeType === params.scopeType);
      if (params.scopeId) rows = rows.filter((r) => r.scopeId === params.scopeId);
      const result = rows.map((r) => ({
        id: r.id,
        scopeType: r.scopeType,
        scopeId: r.scopeId,
        amountCents: r.amountCents,
        windowKind: r.windowKind,
        warnPercent: r.warnPercent,
        hardStopEnabled: r.hardStopEnabled,
      }));
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }], details: {} };
    },
  };
}
