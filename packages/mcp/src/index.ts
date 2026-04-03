import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ApiClient } from "./api-client.js";
import { createMcpServer } from "./server.js";
import { registerPipelineTools } from "./tools/pipeline-tools.js";
import { registerRunTools } from "./tools/run-tools.js";
import { registerSkillTools } from "./tools/skill-tools.js";
import { registerResources } from "./resources/index.js";
import { registerPrompts } from "./prompts/index.js";

function validateUrl(raw: string): string {
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error(`Unsupported protocol: ${url.protocol}`);
    }
    return url.origin;
  } catch (err) {
    console.error(`[zerohand-mcp] Invalid ZEROHAND_URL: ${raw}`);
    process.exit(1);
  }
}

async function main() {
  const rawUrl = process.env.ZEROHAND_URL ?? "http://localhost:3009";
  const serverUrl = validateUrl(rawUrl);
  const client = new ApiClient(serverUrl);

  const server = createMcpServer(client);

  // Register all tools, resources, and prompts
  registerPipelineTools(server, client);
  registerRunTools(server, client);
  registerSkillTools(server, client);
  registerResources(server, client);
  registerPrompts(server, client);

  // Connect stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("[zerohand-mcp] Server running via stdio");
}

main().catch((err) => {
  console.error("[zerohand-mcp] Fatal error:", err);
  process.exit(1);
});
