import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "@mariozechner/pi-ai";
import { eq } from "drizzle-orm";
import { mcpServers } from "@zerohand/db";
import type { AgentToolContext } from "./context.js";

export function makeDeleteMcpServer(ctx: AgentToolContext): ToolDefinition {
  return {
    name: "delete_mcp_server",
    label: "Delete MCP Server",
    description: "Remove an MCP server from the global registry by name. Does not affect running pipelines.",
    parameters: Type.Object({
      name: Type.String({ description: "Name of the server to remove" }),
    }),
    execute: async (_id, params: { name: string }) => {
      const deleted = await ctx.db
        .delete(mcpServers)
        .where(eq(mcpServers.name, params.name))
        .returning();

      if (deleted.length === 0) {
        return { content: [{ type: "text" as const, text: `No MCP server found with name '${params.name}'` }], details: {} };
      }
      return {
        content: [{ type: "text" as const, text: `Deleted MCP server '${params.name}'` }],
        details: {},
      };
    },
  };
}
