import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ApiClient } from "./api-client.js";

export function createMcpServer(client: ApiClient): McpServer {
  const server = new McpServer({
    name: "zerohand",
    version: "0.1.0",
  });

  // Tools, resources, and prompts are registered in their respective modules
  // and called from index.ts after server creation

  return server;
}
