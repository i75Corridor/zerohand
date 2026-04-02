import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "@mariozechner/pi-ai";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentToolContext } from "./context.js";
import { safeSkillDir, buildSkillMd } from "./skill-utils.js";

export function makeCreateSkill(ctx: AgentToolContext): ToolDefinition {
  return {
    name: "create_skill",
    label: "Create Skill",
    description: "Create a new skill by writing a SKILL.md file to the skills directory.",
    parameters: Type.Object({
      skillName: Type.String({ description: "Folder name for the skill (lowercase, hyphens ok)" }),
      description: Type.String({ description: "One-line description of what the skill does" }),
      type: Type.String({ description: "Skill type: pi (LLM agent), imagen, or publish" }),
      body: Type.String({ description: "The system prompt body — the main instructions for this skill" }),
      model: Type.Optional(Type.String({ description: "Model override in provider/name format, e.g. google/gemini-2.5-flash" })),
      network: Type.Optional(Type.Boolean({ description: "Whether scripts in this skill need network access (default false)" })),
    }),
    execute: async (_id, params: { skillName: string; description: string; type: string; body: string; model?: string; network?: boolean }) => {
      const skillDir = safeSkillDir(params.skillName, ctx.skillsDir);
      if (!skillDir) return { content: [{ type: "text" as const, text: "Invalid skill name — must not contain path separators." }], details: {} };
      if (existsSync(skillDir)) return { content: [{ type: "text" as const, text: `Skill "${params.skillName}" already exists. Use update_skill to modify it.` }], details: {} };
      mkdirSync(skillDir, { recursive: true });
      const content = buildSkillMd({ name: params.skillName, ...params });
      writeFileSync(join(skillDir, "SKILL.md"), content, "utf-8");
      return { content: [{ type: "text" as const, text: `Created skill "${params.skillName}" at ${skillDir}.` }], details: {} };
    },
  };
}
