import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "@mariozechner/pi-ai";
import { mcpServers } from "@zerohand/db";
import type { AgentToolContext } from "./context.js";

export function makeRegisterMcpServer(ctx: AgentToolContext): ToolDefinition {
  return {
    name: "register_mcp_server",
    label: "Register MCP Server",
    description:
      "Register a new MCP server in the global registry. Once registered, skills can reference it by name in their mcpServers frontmatter field. Transport types: 'stdio' (local CLI, requires command+args), 'sse' (HTTP SSE, requires url), 'streamable-http' (HTTP Streamable, requires url).",
    parameters: Type.Object({
      name: Type.String({ description: "Unique server name used to reference it in skill frontmatter (e.g. 'brave-search')" }),
      transport: Type.Union(
        [Type.Literal("stdio"), Type.Literal("sse"), Type.Literal("streamable-http")],
        { description: "Connection transport type" },
      ),
      command: Type.Optional(Type.String({ description: "stdio only: executable to run (e.g. 'npx')" })),
      args: Type.Optional(Type.Array(Type.String(), { description: "stdio only: command arguments" })),
      url: Type.Optional(Type.String({ description: "sse/streamable-http only: server URL" })),
      headers: Type.Optional(Type.Record(Type.String(), Type.String(), { description: "HTTP headers (e.g. Authorization)" })),
      env: Type.Optional(Type.Record(Type.String(), Type.String(), { description: "stdio only: extra environment variables for the server process" })),
      enabled: Type.Optional(Type.Boolean({ description: "Whether to enable immediately (default true)" })),
    }),
    execute: async (_id, params: { name: string; transport: "stdio" | "sse" | "streamable-http"; command?: string; args?: string[]; url?: string; headers?: Record<string, string>; env?: Record<string, string>; enabled?: boolean }) => {
      const [row] = await ctx.db
        .insert(mcpServers)
        .values({
          name: params.name,
          transport: params.transport,
          command: params.command ?? null,
          args: params.args ?? [],
          url: params.url ?? null,
          headers: params.headers ?? {},
          env: params.env ?? {},
          enabled: params.enabled ?? true,
          source: "manual",
        })
        .returning();
      // No broadcastDataChanged — MCP servers are not a live-updated entity in the UI
      return {
        content: [{ type: "text" as const, text: `Registered MCP server '${row.name}' (id: ${row.id})` }],
        details: { id: row.id },
      };
    },
  };
}
