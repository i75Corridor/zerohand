import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "@mariozechner/pi-ai";
import { triggers } from "@pawn/db";
import { computeNextRun } from "../trigger-manager.js";
import type { AgentToolContext } from "./context.js";

export function makeCreateTrigger(ctx: AgentToolContext): ToolDefinition {
  return {
    name: "create_trigger",
    label: "Create Trigger",
    description: "Create a new trigger for a pipeline (cron or channel type).",
    parameters: Type.Object({
      pipelineId: Type.String({ description: "Pipeline ID to attach the trigger to" }),
      type: Type.Optional(Type.String({ description: "Trigger type: 'cron' or 'channel' (default: cron)" })),
      cronExpression: Type.Optional(Type.String({ description: "Cron expression (for cron type)" })),
      timezone: Type.Optional(Type.String({ description: "Timezone (default: UTC)" })),
      enabled: Type.Optional(Type.Boolean({ description: "Whether the trigger is enabled (default: true)" })),
      defaultInputs: Type.Optional(Type.Record(Type.String(), Type.Unknown(), { description: "Default input parameters for pipeline runs" })),
      channelType: Type.Optional(Type.String({ description: "Channel type (for channel triggers)" })),
      channelConfig: Type.Optional(Type.Record(Type.String(), Type.Unknown(), { description: "Channel configuration (for channel triggers)" })),
    }),
    execute: async (
      _id,
      params: {
        pipelineId: string;
        type?: string;
        cronExpression?: string;
        timezone?: string;
        enabled?: boolean;
        defaultInputs?: Record<string, unknown>;
        channelType?: string;
        channelConfig?: Record<string, unknown>;
      },
    ) => {
      const type = params.type ?? "cron";
      const tz = params.timezone ?? "UTC";

      if (type === "channel") {
        const [row] = await ctx.db
          .insert(triggers)
          .values({
            pipelineId: params.pipelineId,
            type: "channel",
            enabled: params.enabled ?? true,
            channelType: params.channelType,
            channelConfig: params.channelConfig,
            timezone: tz,
            defaultInputs: params.defaultInputs,
          })
          .returning();
        ctx.broadcastDataChanged("trigger", "created", row.id);
        return { content: [{ type: "text" as const, text: JSON.stringify({ id: row.id, type: row.type, channelType: row.channelType }, null, 2) }], details: {} };
      }

      const nextRunAt = params.cronExpression ? computeNextRun(params.cronExpression, tz) : null;
      const [row] = await ctx.db
        .insert(triggers)
        .values({
          pipelineId: params.pipelineId,
          type,
          enabled: params.enabled ?? true,
          cronExpression: params.cronExpression,
          timezone: tz,
          nextRunAt,
          defaultInputs: params.defaultInputs,
        })
        .returning();
      ctx.broadcastDataChanged("trigger", "created", row.id);
      return { content: [{ type: "text" as const, text: JSON.stringify({ id: row.id, type: row.type, cronExpression: row.cronExpression, nextRunAt: row.nextRunAt }, null, 2) }], details: {} };
    },
  };
}
