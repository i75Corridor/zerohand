/**
 * Converts MCP tool definitions into pi-coding-agent ToolDefinition objects.
 * Tool names are prefixed: mcp__<serverName>__<toolName>
 */

import { Type, type TSchema } from "@mariozechner/pi-ai";
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import type { McpClientPool, McpToolInfo } from "./mcp-client.js";

const MCP_PREFIX = "mcp__";

/** Build the composite tool name used inside pi-coding-agent */
export function mcpToolName(serverName: string, toolName: string): string {
  return `${MCP_PREFIX}${serverName}__${toolName}`;
}

/** Parse server name and tool name back from composite name */
export function parseMcpToolName(compositeName: string): { serverName: string; toolName: string } | null {
  if (!compositeName.startsWith(MCP_PREFIX)) return null;
  const rest = compositeName.slice(MCP_PREFIX.length);
  const idx = rest.indexOf("__");
  if (idx === -1) return null;
  return { serverName: rest.slice(0, idx), toolName: rest.slice(idx + 2) };
}

/** Convert a JSON Schema object to a TypeBox-compatible TSchema. */
function jsonSchemaToTypeBox(schema: Record<string, unknown>): TSchema {
  const type = schema.type as string | undefined;
  const props = schema.properties as Record<string, Record<string, unknown>> | undefined;
  const required = schema.required as string[] | undefined;

  if (type !== "object" || !props) {
    // Fallback: accept any object
    return Type.Record(Type.String(), Type.Unknown());
  }

  const fields: Record<string, TSchema> = {};
  for (const [key, propSchema] of Object.entries(props)) {
    const isRequired = required?.includes(key) ?? false;
    const fieldType = jsonFieldSchema(propSchema);
    fields[key] = isRequired ? fieldType : Type.Optional(fieldType);
  }
  return Type.Object(fields);
}

function jsonFieldSchema(schema: Record<string, unknown>): TSchema {
  const type = schema.type as string | undefined;
  const desc = schema.description as string | undefined;
  const opts = desc ? { description: desc } : {};

  switch (type) {
    case "string":
      return Type.String(opts);
    case "number":
    case "integer":
      return Type.Number(opts);
    case "boolean":
      return Type.Boolean(opts);
    case "array": {
      const items = schema.items as Record<string, unknown> | undefined;
      const itemSchema = items ? jsonFieldSchema(items) : Type.Unknown();
      return Type.Array(itemSchema, opts);
    }
    case "object": {
      const nested = jsonSchemaToTypeBox(schema);
      return nested;
    }
    default:
      return Type.Unknown(opts as any);
  }
}

/** Convert a list of McpToolInfo objects into pi-coding-agent ToolDefinition[] */
export function mcpToolsToToolDefinitions(
  tools: McpToolInfo[],
  pool: McpClientPool,
): ToolDefinition[] {
  return tools.map((tool) => ({
    name: mcpToolName(tool.serverName, tool.name),
    label: `[MCP: ${tool.serverName}] ${tool.name}`,
    description: `[MCP: ${tool.serverName}] ${tool.description}`,
    parameters: jsonSchemaToTypeBox(tool.inputSchema),
    execute: async (_id: string, params: Record<string, unknown>) => {
      const result = await pool.callTool(tool.serverName, tool.name, params);
      const text = typeof result === "string" ? result : JSON.stringify(result, null, 2);
      return {
        content: [{ type: "text" as const, text }],
        details: { mcpServer: tool.serverName, mcpTool: tool.name },
      };
    },
  }));
}
