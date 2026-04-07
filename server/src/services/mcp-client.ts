/**
 * MCP Client Pool — manages connections to external MCP servers.
 * Create one pool per pipeline run; call disconnectAll() in finally.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export interface McpServerConfig {
  id: string;
  name: string;
  transport: "stdio" | "sse" | "streamable-http";
  command?: string;
  args?: string[];
  url?: string;
  headers?: Record<string, string>;
  env?: Record<string, string>;
}

export interface McpToolInfo {
  serverName: string;
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

interface PoolEntry {
  client: Client;
  config: McpServerConfig;
  tools: McpToolInfo[];
}

const CONNECT_TIMEOUT_MS = 30_000;

const ENV_REF_PATTERN = /^\$\{[A-Z_][A-Z0-9_]*\}$/;

export function resolveEnvRefs(
  env: Record<string, string>,
  processEnv: Record<string, string | undefined>,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (ENV_REF_PATTERN.test(value)) {
      const varName = value.slice(2, -1);
      const resolved = processEnv[varName];
      if (resolved !== undefined) {
        result[key] = resolved;
      }
      // If not found, omit the key entirely
    } else {
      result[key] = value;
    }
  }
  return result;
}

export class McpClientPool {
  private entries = new Map<string, PoolEntry>();

  async connect(config: McpServerConfig): Promise<McpToolInfo[]> {
    if (this.entries.has(config.name)) {
      return this.entries.get(config.name)!.tools;
    }

    const client = new Client({ name: "zerohand", version: "1.0.0" });
    const transport = buildTransport(config);

    await Promise.race([
      client.connect(transport),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`MCP connect timeout: ${config.name}`)), CONNECT_TIMEOUT_MS),
      ),
    ]);

    const listResult = await client.listTools();
    const tools: McpToolInfo[] = (listResult.tools ?? []).map((t) => ({
      serverName: config.name,
      name: t.name,
      description: t.description ?? "",
      inputSchema: (t.inputSchema as Record<string, unknown>) ?? { type: "object", properties: {} },
    }));

    this.entries.set(config.name, { client, config, tools });
    return tools;
  }

  async callTool(serverName: string, toolName: string, args: Record<string, unknown>): Promise<unknown> {
    const entry = this.entries.get(serverName);
    if (!entry) throw new Error(`MCP server not connected: ${serverName}`);
    const result = await entry.client.callTool({ name: toolName, arguments: args });
    return result;
  }

  listConnected(): string[] {
    return [...this.entries.keys()];
  }

  getTools(serverName: string): McpToolInfo[] {
    return this.entries.get(serverName)?.tools ?? [];
  }

  async disconnectAll(): Promise<void> {
    const errors: Error[] = [];
    for (const [name, entry] of this.entries) {
      try {
        await entry.client.close();
      } catch (e) {
        errors.push(new Error(`Failed to disconnect MCP server ${name}: ${String(e)}`));
      }
    }
    this.entries.clear();
    if (errors.length > 0) {
      console.error("[mcp-client] Disconnect errors:", errors.map((e) => e.message).join("; "));
    }
  }
}

function buildTransport(config: McpServerConfig) {
  switch (config.transport) {
    case "stdio": {
      if (!config.command) throw new Error(`MCP stdio server ${config.name} missing command`);
      return new StdioClientTransport({
        command: config.command,
        args: config.args ?? [],
        env: { ...process.env, ...resolveEnvRefs(config.env ?? {}, process.env as Record<string, string | undefined>) } as Record<string, string>,
      });
    }
    case "sse": {
      if (!config.url) throw new Error(`MCP SSE server ${config.name} missing url`);
      return new SSEClientTransport(new URL(config.url), {
        requestInit: config.headers ? { headers: config.headers } : undefined,
      });
    }
    case "streamable-http": {
      if (!config.url) throw new Error(`MCP streamable-http server ${config.name} missing url`);
      return new StreamableHTTPClientTransport(new URL(config.url), {
        requestInit: config.headers ? { headers: config.headers } : undefined,
      });
    }
    default:
      throw new Error(`Unknown MCP transport: ${(config as any).transport}`);
  }
}
