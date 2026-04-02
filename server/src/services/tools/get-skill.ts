import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "@mariozechner/pi-ai";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentToolContext } from "./context.js";
import { safeSkillDir } from "./skill-utils.js";

export function makeGetSkill(ctx: AgentToolContext): ToolDefinition {
  return {
    name: "get_skill",
    label: "Get Skill",
    description: "Read the full SKILL.md content for a skill.",
    parameters: Type.Object({
      skillName: Type.String({ description: "The skill folder name" }),
    }),
    execute: async (_id, params: { skillName: string }) => {
      const skillDir = safeSkillDir(params.skillName, ctx.skillsDir);
      if (!skillDir) return { content: [{ type: "text" as const, text: "Invalid skill name." }], details: {} };
      const skillPath = join(skillDir, "SKILL.md");
      if (!existsSync(skillPath)) return { content: [{ type: "text" as const, text: `Skill "${params.skillName}" not found.` }], details: {} };
      return { content: [{ type: "text" as const, text: readFileSync(skillPath, "utf-8") }], details: {} };
    },
  };
}
