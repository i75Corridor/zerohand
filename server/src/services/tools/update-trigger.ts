import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "@mariozechner/pi-ai";
import { eq } from "drizzle-orm";
import { triggers } from "@pawn/db";
import { computeNextRun } from "../trigger-manager.js";
import type { AgentToolContext } from "./context.js";

export function makeUpdateTrigger(ctx: AgentToolContext): ToolDefinition {
  return {
    name: "update_trigger",
    label: "Update Trigger",
    description: "Update an existing trigger's configuration.",
    parameters: Type.Object({
      triggerId: Type.String({ description: "The trigger ID to update" }),
      cronExpression: Type.Optional(Type.String({ description: "New cron expression" })),
      timezone: Type.Optional(Type.String({ description: "New timezone" })),
      enabled: Type.Optional(Type.Boolean({ description: "Enable or disable the trigger" })),
      defaultInputs: Type.Optional(Type.Record(Type.String(), Type.Unknown(), { description: "New default input parameters" })),
    }),
    execute: async (
      _id,
      params: {
        triggerId: string;
        cronExpression?: string;
        timezone?: string;
        enabled?: boolean;
        defaultInputs?: Record<string, unknown>;
      },
    ) => {
      const { triggerId, ...fields } = params;
      const updates: Record<string, unknown> = { ...fields, updatedAt: new Date() };
      if (params.cronExpression) {
        updates.nextRunAt = computeNextRun(params.cronExpression, params.timezone ?? "UTC");
      }
      const [row] = await ctx.db
        .update(triggers)
        .set(updates)
        .where(eq(triggers.id, triggerId))
        .returning();
      if (!row) return { content: [{ type: "text" as const, text: "Trigger not found." }], details: {} };
      ctx.broadcastDataChanged("trigger", "updated", row.id);
      return { content: [{ type: "text" as const, text: `Updated trigger ${row.id}.` }], details: {} };
    },
  };
}
