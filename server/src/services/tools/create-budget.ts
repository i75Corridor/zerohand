import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "@mariozechner/pi-ai";
import { budgetPolicies } from "@zerohand/db";
import type { AgentToolContext } from "./context.js";

export function makeCreateBudget(ctx: AgentToolContext): ToolDefinition {
  return {
    name: "create_budget",
    label: "Create Budget",
    description: "Create a new budget policy for a worker or pipeline.",
    parameters: Type.Object({
      scopeType: Type.String({ description: "Scope type: worker or pipeline" }),
      scopeId: Type.String({ description: "The ID of the worker or pipeline" }),
      amountCents: Type.Number({ description: "Budget amount in cents" }),
      windowKind: Type.Optional(Type.String({ description: "Budget window: calendar_month or lifetime (default: calendar_month)" })),
      warnPercent: Type.Optional(Type.Number({ description: "Warning threshold percentage (default: 80)" })),
      hardStopEnabled: Type.Optional(Type.Boolean({ description: "Whether to hard-stop when budget is exceeded (default: true)" })),
    }),
    execute: async (
      _id,
      params: {
        scopeType: string;
        scopeId: string;
        amountCents: number;
        windowKind?: string;
        warnPercent?: number;
        hardStopEnabled?: boolean;
      },
    ) => {
      const [row] = await ctx.db
        .insert(budgetPolicies)
        .values({
          scopeType: params.scopeType,
          scopeId: params.scopeId,
          amountCents: params.amountCents,
          windowKind: params.windowKind ?? "calendar_month",
          warnPercent: params.warnPercent ?? 80,
          hardStopEnabled: params.hardStopEnabled ?? true,
        })
        .returning();
      ctx.broadcastDataChanged("budget", "created", row.id);
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ id: row.id, scopeType: row.scopeType, scopeId: row.scopeId, amountCents: row.amountCents }, null, 2) }],
        details: {},
      };
    },
  };
}
