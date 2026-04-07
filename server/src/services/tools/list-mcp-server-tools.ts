import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "@mariozechner/pi-ai";
import { eq } from "drizzle-orm";
import { mcpServers } from "@pawn/db";
import { McpClientPool } from "../mcp-client.js";
import type { AgentToolContext } from "./context.js";

export function makeListMcpServerTools(ctx: AgentToolContext): ToolDefinition {
  return {
    name: "list_mcp_server_tools",
    label: "List MCP Server Tools",
    description:
      "Connect to a registered MCP server and return the full list of tools it exposes — names, descriptions, and input schemas. Use this before authoring a skill that references an MCP server so you can write an accurate system prompt and know exactly what tools the LLM will have access to.",
    parameters: Type.Object({
      serverName: Type.String({ description: "Name of the registered MCP server (as shown by list_mcp_servers)" }),
    }),
    execute: async (_id, params: { serverName: string }) => {
      const [server] = await ctx.db
        .select()
        .from(mcpServers)
        .where(eq(mcpServers.name, params.serverName));

      if (!server) {
        return {
          content: [{ type: "text" as const, text: `No MCP server found with name '${params.serverName}'. Use list_mcp_servers to see registered servers.` }],
          details: {},
        };
      }

      if (!server.enabled) {
        return {
          content: [{ type: "text" as const, text: `MCP server '${params.serverName}' is disabled. Enable it first with update_mcp_server.` }],
          details: {},
        };
      }

      const pool = new McpClientPool();
      try {
        const tools = await pool.connect({
          id: server.id,
          name: server.name,
          transport: server.transport as "stdio" | "sse" | "streamable-http",
          command: server.command ?? undefined,
          args: (server.args as string[]) ?? [],
          url: server.url ?? undefined,
          headers: (server.headers as Record<string, string>) ?? {},
          env: (server.env as Record<string, string>) ?? {},
        });

        if (tools.length === 0) {
          return {
            content: [{ type: "text" as const, text: `Connected to '${params.serverName}' but it exposes no tools.` }],
            details: { tools: [] },
          };
        }

        const summary = tools.map((t) => ({
          name: t.name,
          agentToolName: `mcp__${server.name.replace(/-/g, "_")}__${t.name}`,
          description: t.description,
          inputSchema: t.inputSchema,
        }));

        return {
          content: [{ type: "text" as const, text: JSON.stringify(summary, null, 2) }],
          details: { serverName: params.serverName, toolCount: tools.length },
        };
      } finally {
        await pool.disconnectAll();
      }
    },
  };
}
