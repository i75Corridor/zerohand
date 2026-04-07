import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "@mariozechner/pi-ai";
import type { AgentToolContext } from "./context.js";
import { detectEnvVars } from "../mcp-env-detector.js";

export function makeDetectMcpEnv(_ctx: AgentToolContext): ToolDefinition {
  return {
    name: "detect_mcp_env",
    label: "Detect MCP Server Environment Variables",
    description:
      "Detect required environment variables for an MCP server. Uses a built-in registry of popular servers and/or dry-run detection by attempting to start the server and parsing error messages. Call this after registering an MCP server to discover what env vars it needs.",
    parameters: Type.Object({
      transport: Type.Union(
        [Type.Literal("stdio"), Type.Literal("sse"), Type.Literal("streamable-http")],
        { description: "Connection transport type" },
      ),
      command: Type.Optional(Type.String({ description: "stdio only: executable to run (e.g. 'npx')" })),
      args: Type.Optional(Type.Array(Type.String(), { description: "stdio only: command arguments" })),
      url: Type.Optional(Type.String({ description: "sse/streamable-http only: server URL" })),
      name: Type.Optional(Type.String({ description: "Server name for registry lookup" })),
    }),
    execute: async (
      _id,
      params: {
        transport: "stdio" | "sse" | "streamable-http";
        command?: string;
        args?: string[];
        url?: string;
        name?: string;
      },
    ) => {
      const result = await detectEnvVars({
        transport: params.transport,
        command: params.command,
        args: params.args,
        name: params.name,
      });

      if (result.detected.length === 0) {
        const msg = result.error
          ? `No environment variables detected. ${result.error}`
          : "No required environment variables detected for this server.";
        return {
          content: [{ type: "text" as const, text: msg }],
          details: { detected: [] },
        };
      }

      const lines = result.detected.map((v) => {
        const parts = [
          `• ${v.name} (${v.required ? "required" : "optional"})${v.detectedFrom === "registry" ? " [verified]" : " [detected]"}`,
        ];
        if (v.description) parts.push(`  ${v.description}`);
        if (v.docsUrl) parts.push(`  Docs: ${v.docsUrl}`);
        return parts.join("\n");
      });

      const text = `Detected environment variables:\n\n${lines.join("\n\n")}${result.error ? `\n\nNote: ${result.error}` : ""}`;

      return {
        content: [{ type: "text" as const, text }],
        details: { detected: result.detected },
      };
    },
  };
}
