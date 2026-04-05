import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "@mariozechner/pi-ai";
import { eq } from "drizzle-orm";
import { settings } from "@zerohand/db";
import { invalidateModelCostsCache } from "../budget-guard.js";
import type { AgentToolContext } from "./context.js";

export function makeUpdateSetting(ctx: AgentToolContext): ToolDefinition {
  return {
    name: "update_setting",
    label: "Update Setting",
    description: "Create or update an application setting by key.",
    parameters: Type.Object({
      key: Type.String({ description: "The setting key to create or update" }),
      value: Type.Unknown({ description: "The value to set" }),
    }),
    execute: async (_id, params: { key: string; value: unknown }) => {
      const { key, value } = params;

      const [row] = await ctx.db
        .insert(settings)
        .values({ key, value, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: settings.key,
          set: { value, updatedAt: new Date() },
        })
        .returning();

      if (key === "model_costs") {
        invalidateModelCostsCache();
      }

      ctx.broadcastDataChanged("setting", "updated", key);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              { key: row.key, value: row.value, updatedAt: row.updatedAt.toISOString() },
              null,
              2,
            ),
          },
        ],
        details: {},
      };
    },
  };
}
