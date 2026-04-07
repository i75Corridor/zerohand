import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "@mariozechner/pi-ai";
import { mcpServers } from "@pawn/db";
import type { AgentToolContext } from "./context.js";

export function makeListMcpServers(ctx: AgentToolContext): ToolDefinition {
  return {
    name: "list_mcp_servers",
    label: "List MCP Servers",
    description:
      "List all registered MCP servers from the global registry, showing name, transport, enabled status, and source. Use this to discover what external tools are available before authoring skill mcpServers frontmatter.",
    parameters: Type.Object({}),
    execute: async (_id, _params) => {
      const rows = await ctx.db.select().from(mcpServers).orderBy(mcpServers.name);
      if (rows.length === 0) {
        return { content: [{ type: "text" as const, text: "No MCP servers registered. Add servers in Settings > MCP Servers." }], details: {} };
      }
      const summary = rows.map((r) => ({
        name: r.name,
        transport: r.transport,
        enabled: r.enabled,
        source: r.source,
        command: r.command ?? undefined,
        url: r.url ?? undefined,
      }));
      return { content: [{ type: "text" as const, text: JSON.stringify(summary, null, 2) }], details: {} };
    },
  };
}
