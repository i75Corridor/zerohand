import { ApiClient } from "./api-client.js";
import { createMcpServer } from "./server.js";
import { registerPipelineTools } from "./tools/pipeline-tools.js";
import { registerRunTools } from "./tools/run-tools.js";
import { registerSkillTools } from "./tools/skill-tools.js";
import { registerTriggerTools } from "./tools/trigger-tools.js";
import { registerApprovalTools } from "./tools/approval-tools.js";
import { registerSettingsTools } from "./tools/settings-tools.js";
import { registerBudgetTools } from "./tools/budget-tools.js";
import { registerBlueprintTools } from "./tools/blueprint-tools.js";
import { registerResources } from "./resources/index.js";
import { registerPrompts } from "./prompts/index.js";

function validateUrl(raw: string): string {
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error(`Unsupported protocol: ${url.protocol}`);
    }
    return url.origin;
  } catch {
    console.error(`[pawn-mcp] Invalid PAWN_URL: ${raw}`);
    process.exit(1);
  }
}

function buildServer(client: ApiClient) {
  const server = createMcpServer(client);
  registerPipelineTools(server, client);
  registerRunTools(server, client);
  registerSkillTools(server, client);
  registerTriggerTools(server, client);
  registerApprovalTools(server, client);
  registerSettingsTools(server, client);
  registerBudgetTools(server, client);
  registerBlueprintTools(server, client);
  registerResources(server, client);
  registerPrompts(server, client);
  return server;
}

async function runStdio(client: ApiClient) {
  const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js");
  const server = buildServer(client);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[pawn-mcp] Server running via stdio");
}

async function runHttp(client: ApiClient) {
  const { default: express } = await import("express");
  const { default: cors } = await import("cors");
  const { StreamableHTTPServerTransport } = await import("@modelcontextprotocol/sdk/server/streamableHttp.js");

  const app = express();
  app.use(cors());
  app.use(express.json());

  // API key auth middleware (optional — only enforced when MCP_API_KEY is set)
  const mcpApiKey = process.env.MCP_API_KEY;
  if (mcpApiKey) {
    app.use("/mcp", (req, res, next) => {
      const auth = req.headers.authorization;
      if (!auth || auth !== `Bearer ${mcpApiKey}`) {
        res.status(401).json({ error: "Unauthorized — provide a valid Bearer token" });
        return;
      }
      next();
    });
    console.error("[pawn-mcp] API key authentication enabled");
  }

  // Stateless: new server + transport per request
  app.post("/mcp", async (req, res) => {
    try {
      const server = buildServer(client);
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      res.on("close", () => { void transport.close(); });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal server error" });
      }
    }
  });

  // Handle GET and DELETE for SSE compatibility (returns 405)
  app.get("/mcp", (_req, res) => {
    res.status(405).json({ error: "Method not allowed. Use POST." });
  });
  app.delete("/mcp", (_req, res) => {
    res.status(405).json({ error: "Method not allowed. Use POST." });
  });

  const host = process.env.MCP_HOST ?? "127.0.0.1";
  const port = parseInt(process.env.MCP_PORT ?? "3100", 10);
  app.listen(port, host, () => {
    console.error(`[pawn-mcp] Server running via HTTP at http://${host}:${port}/mcp`);
  });
}

async function main() {
  const rawUrl = process.env.PAWN_URL ?? "http://localhost:3009";
  const serverUrl = validateUrl(rawUrl);
  const apiKey = process.env.PAWN_API_KEY;
  const client = new ApiClient(serverUrl, apiKey);

  const transport = process.env.TRANSPORT ?? "stdio";

  if (transport === "http") {
    await runHttp(client);
  } else {
    await runStdio(client);
  }
}

main().catch((err) => {
  console.error("[pawn-mcp] Fatal error:", err);
  process.exit(1);
});
