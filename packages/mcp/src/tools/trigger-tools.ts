import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ApiClient } from "../api-client.js";
import type { ApiTrigger } from "@pawn/shared";

function formatTrigger(t: ApiTrigger): string {
  const lines = [`Trigger: ${t.id}`];
  lines.push(`  Pipeline: ${t.pipelineId}`);
  lines.push(`  Type: ${t.type}`);
  lines.push(`  Enabled: ${t.enabled}`);
  if (t.cronExpression) lines.push(`  Cron: ${t.cronExpression}`);
  if (t.timezone) lines.push(`  Timezone: ${t.timezone}`);
  if (t.channelType) lines.push(`  Channel Type: ${t.channelType}`);
  if (t.nextRunAt) lines.push(`  Next Run: ${t.nextRunAt}`);
  if (t.lastFiredAt) lines.push(`  Last Fired: ${t.lastFiredAt}`);
  lines.push(`  Created: ${t.createdAt}`);
  return lines.join("\n");
}

export function registerTriggerTools(server: McpServer, client: ApiClient): void {
  server.tool(
    "list_triggers",
    "List all triggers for a pipeline",
    {
      pipelineId: z.string().describe("Pipeline ID"),
    },
    async ({ pipelineId }) => {
      try {
        const triggers = await client.listTriggers(pipelineId);
        if (triggers.length === 0) {
          return { content: [{ type: "text", text: "No triggers found for this pipeline." }] };
        }
        const text = triggers.map(formatTrigger).join("\n\n");
        return { content: [{ type: "text", text }] };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Failed to list triggers: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "create_trigger",
    "Create a new trigger for a pipeline (cron or channel type)",
    {
      pipelineId: z.string().describe("Pipeline ID to attach the trigger to"),
      type: z.string().optional().describe("Trigger type: 'cron' or 'channel' (default: cron)"),
      cronExpression: z.string().optional().describe("Cron expression (for cron type)"),
      timezone: z.string().optional().describe("Timezone (default: UTC)"),
      enabled: z.boolean().optional().describe("Whether the trigger is enabled (default: true)"),
      defaultInputs: z.record(z.unknown()).optional().describe("Default input parameters for pipeline runs"),
      channelType: z.string().optional().describe("Channel type (for channel triggers)"),
      channelConfig: z.record(z.unknown()).optional().describe("Channel configuration (for channel triggers)"),
    },
    async ({ pipelineId, ...rest }) => {
      try {
        const trigger = await client.createTrigger(pipelineId, rest);
        return {
          content: [{ type: "text", text: `Trigger created successfully.\n${formatTrigger(trigger)}` }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Failed to create trigger: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "update_trigger",
    "Update an existing trigger's configuration",
    {
      triggerId: z.string().describe("Trigger ID to update"),
      cronExpression: z.string().optional().describe("New cron expression"),
      timezone: z.string().optional().describe("New timezone"),
      enabled: z.boolean().optional().describe("Enable or disable the trigger"),
      defaultInputs: z.record(z.unknown()).optional().describe("New default input parameters"),
    },
    async ({ triggerId, ...updates }) => {
      try {
        const trigger = await client.updateTrigger(triggerId, updates);
        return {
          content: [{ type: "text", text: `Trigger updated successfully.\n${formatTrigger(trigger)}` }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Failed to update trigger: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "delete_trigger",
    "Delete a trigger permanently",
    {
      triggerId: z.string().describe("Trigger ID to delete"),
    },
    async ({ triggerId }) => {
      try {
        await client.deleteTrigger(triggerId);
        return {
          content: [{ type: "text", text: `Trigger ${triggerId} deleted successfully.` }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Failed to delete trigger: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        };
      }
    },
  );
}
