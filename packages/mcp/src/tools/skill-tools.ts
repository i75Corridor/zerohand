import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ApiClient } from "../api-client.js";

export function registerSkillTools(server: McpServer, client: ApiClient): void {
  server.tool(
    "list_skills",
    "List all available skills with their descriptions",
    {},
    async () => {
      try {
        const skills = await client.listSkills();
        if (skills.length === 0) {
          return { content: [{ type: "text", text: "No skills found." }] };
        }
        const text = skills
          .map((s) => `${s.name} (v${s.version})\n  ${s.description}`)
          .join("\n\n");
        return { content: [{ type: "text", text }] };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Failed to list skills: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "get_skill",
    "Get a skill's full definition including its SKILL.md content",
    {
      skillName: z.string().describe("Name of the skill to retrieve"),
    },
    async ({ skillName }) => {
      try {
        const skill = await client.getSkill(skillName);
        const lines = [
          `Skill: ${skill.name} (v${skill.version})`,
          `Description: ${skill.description}`,
        ];
        if (skill.allowedTools.length > 0) {
          lines.push(`Allowed Tools: ${skill.allowedTools.join(", ")}`);
        }
        if (skill.scripts.length > 0) {
          lines.push(`Scripts: ${skill.scripts.join(", ")}`);
        }
        if (skill.content) {
          lines.push("", "--- SKILL.md ---", "", skill.content);
        }
        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Failed to get skill: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        };
      }
    },
  );
}
