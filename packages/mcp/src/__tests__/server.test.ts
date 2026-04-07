import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { ApiClient } from "../api-client.js";
import { registerPipelineTools } from "../tools/pipeline-tools.js";
import { registerRunTools } from "../tools/run-tools.js";
import { registerSkillTools } from "../tools/skill-tools.js";
import { registerResources } from "../resources/index.js";
import { registerPrompts } from "../prompts/index.js";

function createMockClient(): ApiClient {
  return {
    listPipelines: vi.fn().mockResolvedValue([
      {
        id: "p1",
        name: "Test Pipeline",
        description: "A test pipeline",
        status: "active",
        inputSchema: null,
        systemPrompt: null,
        modelProvider: null,
        modelName: null,
        steps: [],
        createdAt: "2026-01-01T00:00:00Z",
      },
    ]),
    getPipeline: vi.fn().mockResolvedValue({
      id: "p1",
      name: "Test Pipeline",
      description: "A test pipeline",
      status: "active",
      inputSchema: null,
      systemPrompt: null,
      modelProvider: null,
      modelName: null,
      steps: [],
      createdAt: "2026-01-01T00:00:00Z",
    }),
    createPipeline: vi.fn().mockResolvedValue({
      id: "p-new",
      name: "New Pipeline",
      description: null,
      status: "active",
      inputSchema: null,
      systemPrompt: null,
      modelProvider: null,
      modelName: null,
      steps: [],
      createdAt: "2026-01-01T00:00:00Z",
    }),
    updatePipeline: vi.fn().mockResolvedValue({
      id: "p1",
      name: "Updated Pipeline",
      description: null,
      status: "active",
      inputSchema: null,
      systemPrompt: null,
      modelProvider: null,
      modelName: null,
      steps: [],
      createdAt: "2026-01-01T00:00:00Z",
    }),
    deletePipeline: vi.fn().mockResolvedValue(undefined),
    createStep: vi.fn().mockResolvedValue({ id: "s1", stepIndex: 0, name: "Step 1" }),
    createRun: vi.fn().mockResolvedValue({
      id: "r1",
      pipelineId: "p1",
      status: "queued",
      inputParams: {},
      output: null,
      triggerType: "manual",
      startedAt: null,
      finishedAt: null,
      error: null,
      createdAt: "2026-01-01T00:00:00Z",
    }),
    listRuns: vi.fn().mockResolvedValue([]),
    getRun: vi.fn().mockResolvedValue({
      id: "r1",
      pipelineId: "p1",
      pipelineName: "Test Pipeline",
      status: "completed",
      inputParams: {},
      output: { result: "done" },
      triggerType: "manual",
      startedAt: "2026-01-01T00:00:00Z",
      finishedAt: "2026-01-01T00:01:00Z",
      error: null,
      createdAt: "2026-01-01T00:00:00Z",
    }),
    cancelRun: vi.fn().mockResolvedValue({
      id: "r1",
      status: "cancelled",
    }),
    getStepRuns: vi.fn().mockResolvedValue([]),
    listSkills: vi.fn().mockResolvedValue([
      { name: "summarize", version: "1.0.0", description: "Summarize text", allowedTools: [], scripts: [] },
    ]),
    getSkill: vi.fn().mockResolvedValue({
      name: "summarize",
      version: "1.0.0",
      description: "Summarize text",
      allowedTools: [],
      scripts: [],
      content: "# Summarize\nThis skill summarizes text.",
    }),
  } as unknown as ApiClient;
}

async function createTestServer() {
  const mockClient = createMockClient();
  const server = new McpServer({ name: "pawn-test", version: "0.1.0" });

  registerPipelineTools(server, mockClient);
  registerRunTools(server, mockClient);
  registerSkillTools(server, mockClient);
  registerResources(server, mockClient);
  registerPrompts(server, mockClient);

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "1.0.0" });

  await server.connect(serverTransport);
  await client.connect(clientTransport);

  return { server, client, mockClient };
}

describe("MCP Server Integration", () => {
  it("lists all 10 registered tools", async () => {
    const { client } = await createTestServer();
    const result = await client.listTools();
    const toolNames = result.tools.map((t) => t.name).sort();
    expect(toolNames).toEqual([
      "cancel_run",
      "create_pipeline",
      "execute_pipeline",
      "get_run_status",
      "get_skill",
      "list_pipelines",
      "list_runs",
      "list_skills",
      "modify_pipeline",
      "remove_pipeline",
    ]);
  });

  it("lists all registered resources", async () => {
    const { client } = await createTestServer();
    const result = await client.listResources();
    const uris = result.resources.map((r) => r.uri).sort();
    expect(uris).toContain("pawn://pipelines");
    expect(uris).toContain("pawn://skills");
  });

  it("lists resource templates", async () => {
    const { client } = await createTestServer();
    const result = await client.listResourceTemplates();
    const templates = result.resourceTemplates.map((t) => t.uriTemplate).sort();
    expect(templates).toContain("pawn://pipelines/{id}");
    expect(templates).toContain("pawn://skills/{name}");
    expect(templates).toContain("pawn://runs/{id}");
  });

  it("lists both registered prompts", async () => {
    const { client } = await createTestServer();
    const result = await client.listPrompts();
    const promptNames = result.prompts.map((p) => p.name).sort();
    expect(promptNames).toEqual(["create-pipeline", "debug-run"]);
  });

  it("calls list_pipelines tool", async () => {
    const { client } = await createTestServer();
    const result = await client.callTool({ name: "list_pipelines", arguments: {} });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    expect(text).toContain("Test Pipeline");
    expect(text).toContain("p1");
  });

  it("calls create_pipeline tool", async () => {
    const { client } = await createTestServer();
    const result = await client.callTool({
      name: "create_pipeline",
      arguments: { name: "My Pipeline" },
    });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    expect(text).toContain("created successfully");
    expect(text).toContain("p-new");
  });

  it("calls remove_pipeline tool", async () => {
    const { client } = await createTestServer();
    const result = await client.callTool({
      name: "remove_pipeline",
      arguments: { pipelineId: "p1" },
    });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    expect(text).toContain("deleted successfully");
  });

  it("calls execute_pipeline tool", async () => {
    const { client } = await createTestServer();
    const result = await client.callTool({
      name: "execute_pipeline",
      arguments: { pipelineId: "p1" },
    });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    expect(text).toContain("run started");
    expect(text).toContain("r1");
  });

  it("calls get_run_status tool", async () => {
    const { client } = await createTestServer();
    const result = await client.callTool({
      name: "get_run_status",
      arguments: { runId: "r1" },
    });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    expect(text).toContain("completed");
    expect(text).toContain("Test Pipeline");
  });

  it("calls list_skills tool", async () => {
    const { client } = await createTestServer();
    const result = await client.callTool({ name: "list_skills", arguments: {} });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    expect(text).toContain("summarize");
  });

  it("calls get_skill tool", async () => {
    const { client } = await createTestServer();
    const result = await client.callTool({
      name: "get_skill",
      arguments: { skillName: "summarize" },
    });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    expect(text).toContain("summarize");
    expect(text).toContain("SKILL.md");
  });

  it("reads pipeline resource", async () => {
    const { client } = await createTestServer();
    const result = await client.readResource({ uri: "pawn://pipelines" });
    const content = result.contents[0];
    const text = "text" in content ? content.text : "";
    const data = JSON.parse(text);
    expect(data).toHaveLength(1);
    expect(data[0].name).toBe("Test Pipeline");
  });

  it("gets create-pipeline prompt", async () => {
    const { client } = await createTestServer();
    const result = await client.getPrompt({ name: "create-pipeline", arguments: {} });
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].role).toBe("user");
  });

  it("gets debug-run prompt", async () => {
    const { client } = await createTestServer();
    const result = await client.getPrompt({
      name: "debug-run",
      arguments: { runId: "r1" },
    });
    expect(result.messages).toHaveLength(1);
    const text = (result.messages[0].content as { type: string; text: string }).text;
    expect(text).toContain("completed");
    expect(text).toContain("Test Pipeline");
  });
});
