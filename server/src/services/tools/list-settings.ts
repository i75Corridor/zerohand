import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "@mariozechner/pi-ai";
import { settings } from "@zerohand/db";
import type { AgentToolContext } from "./context.js";

export function makeListSettings(ctx: AgentToolContext): ToolDefinition {
  return {
    name: "list_settings",
    label: "List Settings",
    description: "List all application settings with their current values.",
    parameters: Type.Object({}),
    execute: async () => {
      const rows = await ctx.db.select().from(settings);
      const result = rows.map((r) => ({
        key: r.key,
        value: r.value,
        updatedAt: r.updatedAt.toISOString(),
      }));
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }], details: {} };
    },
  };
}
