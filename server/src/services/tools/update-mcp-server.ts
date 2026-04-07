import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "@mariozechner/pi-ai";
import { eq } from "drizzle-orm";
import { mcpServers } from "@pawn/db";
import type { AgentToolContext } from "./context.js";

export function makeUpdateMcpServer(ctx: AgentToolContext): ToolDefinition {
  return {
    name: "update_mcp_server",
    label: "Update MCP Server",
    description: "Update an existing MCP server registration. Identify the server by name. Only provided fields are changed.",
    parameters: Type.Object({
      name: Type.String({ description: "Name of the server to update" }),
      enabled: Type.Optional(Type.Boolean({ description: "Enable or disable the server" })),
      command: Type.Optional(Type.String({ description: "stdio: new command" })),
      args: Type.Optional(Type.Array(Type.String(), { description: "stdio: new args" })),
      url: Type.Optional(Type.String({ description: "HTTP: new URL" })),
      headers: Type.Optional(Type.Record(Type.String(), Type.String(), { description: "HTTP: new headers" })),
      env: Type.Optional(Type.Record(Type.String(), Type.String(), { description: "stdio: new env vars" })),
    }),
    execute: async (_id, params: { name: string; enabled?: boolean; command?: string; args?: string[]; url?: string; headers?: Record<string, string>; env?: Record<string, string> }) => {
      const { name, ...patch } = params;
      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (patch.enabled !== undefined) updates.enabled = patch.enabled;
      if (patch.command !== undefined) updates.command = patch.command;
      if (patch.args !== undefined) updates.args = patch.args;
      if (patch.url !== undefined) updates.url = patch.url;
      if (patch.headers !== undefined) updates.headers = patch.headers;
      if (patch.env !== undefined) updates.env = patch.env;

      const [row] = await ctx.db
        .update(mcpServers)
        .set(updates)
        .where(eq(mcpServers.name, name))
        .returning();

      if (!row) {
        return { content: [{ type: "text" as const, text: `No MCP server found with name '${name}'` }], details: {} };
      }
      // No broadcastDataChanged — MCP servers are not a live-updated entity in the UI
      return {
        content: [{ type: "text" as const, text: `Updated MCP server '${row.name}'` }],
        details: { id: row.id },
      };
    },
  };
}
