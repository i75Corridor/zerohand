import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ApiClient } from "../api-client.js";
import type { ApiSetting } from "@pawn/shared";

function formatSetting(s: ApiSetting): string {
  const val = typeof s.value === "string" ? s.value : JSON.stringify(s.value);
  return `${s.key} = ${val}  (updated ${s.updatedAt})`;
}

export function registerSettingsTools(server: McpServer, client: ApiClient): void {
  server.tool(
    "list_settings",
    "List all application settings with their current values",
    {},
    async () => {
      try {
        const settings = await client.listSettings();
        if (settings.length === 0) {
          return { content: [{ type: "text", text: "No settings found." }] };
        }
        const text = settings.map(formatSetting).join("\n");
        return { content: [{ type: "text", text }] };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Failed to list settings: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "update_setting",
    "Create or update an application setting by key",
    {
      key: z.string().describe("The setting key to create or update"),
      value: z.unknown().describe("The value to set"),
    },
    async ({ key, value }) => {
      try {
        const setting = await client.updateSetting(key, value);
        let text = `Updated: ${formatSetting(setting)}`;
        if (key === "database_config") {
          text += "\n\nWarning: Database configuration changes require a server restart to take effect.";
        }
        return { content: [{ type: "text", text }] };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Failed to update setting: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        };
      }
    },
  );
}
