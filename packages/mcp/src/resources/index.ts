import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ApiClient } from "../api-client.js";

export function registerResources(server: McpServer, client: ApiClient): void {
  // Static: all pipelines
  server.resource(
    "pipelines",
    "zerohand://pipelines",
    { description: "All pipelines with metadata", mimeType: "application/json" },
    async (uri) => {
      const pipelines = await client.listPipelines();
      return {
        contents: [{ uri: uri.href, text: JSON.stringify(pipelines, null, 2) }],
      };
    },
  );

  // Dynamic: single pipeline
  server.resource(
    "pipeline",
    new ResourceTemplate("zerohand://pipelines/{id}", {
      list: async () => {
        const pipelines = await client.listPipelines();
        return {
          resources: pipelines.map((p) => ({
            uri: `zerohand://pipelines/${p.id}`,
            name: p.name,
          })),
        };
      },
    }),
    { description: "Single pipeline with steps", mimeType: "application/json" },
    async (uri, { id }) => {
      const pipeline = await client.getPipeline(id as string);
      return {
        contents: [{ uri: uri.href, text: JSON.stringify(pipeline, null, 2) }],
      };
    },
  );

  // Static: all skills
  server.resource(
    "skills",
    "zerohand://skills",
    { description: "Skill catalog", mimeType: "application/json" },
    async (uri) => {
      const skills = await client.listSkills();
      return {
        contents: [{ uri: uri.href, text: JSON.stringify(skills, null, 2) }],
      };
    },
  );

  // Dynamic: single skill
  server.resource(
    "skill",
    new ResourceTemplate("zerohand://skills/{name}", {
      list: async () => {
        const skills = await client.listSkills();
        return {
          resources: skills.map((s) => ({
            uri: `zerohand://skills/${s.name}`,
            name: s.name,
          })),
        };
      },
    }),
    { description: "Skill definition with SKILL.md content", mimeType: "application/json" },
    async (uri, { name }) => {
      const skill = await client.getSkill(name as string);
      return {
        contents: [{ uri: uri.href, text: JSON.stringify(skill, null, 2) }],
      };
    },
  );

  // Dynamic: run result
  server.resource(
    "run",
    new ResourceTemplate("zerohand://runs/{id}", {
      list: async () => {
        const runs = await client.listRuns();
        return {
          resources: runs.slice(0, 20).map((r) => ({
            uri: `zerohand://runs/${r.id}`,
            name: `Run ${r.id} (${r.status})`,
          })),
        };
      },
    }),
    { description: "Run result with step outputs", mimeType: "application/json" },
    async (uri, { id }) => {
      const [run, steps] = await Promise.all([
        client.getRun(id as string),
        client.getStepRuns(id as string),
      ]);
      return {
        contents: [{ uri: uri.href, text: JSON.stringify({ ...run, steps }, null, 2) }],
      };
    },
  );
}
