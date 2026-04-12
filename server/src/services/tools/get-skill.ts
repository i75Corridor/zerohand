import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "@mariozechner/pi-ai";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, extname } from "node:path";
import type { AgentToolContext } from "./context.js";
import { safeSkillDir, validateQualifiedSkillName } from "./skill-utils.js";

export function makeGetSkill(ctx: AgentToolContext): ToolDefinition {
  return {
    name: "get_skill",
    label: "Get Skill",
    description: "Read the full SKILL.md content for a skill.",
    parameters: Type.Object({
      skillName: Type.String({ description: "The fully-qualified skill name in 'namespace/skill-name' format (e.g. 'local/researcher', 'daily-absurdist/writer'). Use list_skills to find available skill names." }),
    }),
    execute: async (_id, params: { skillName: string }) => {
      const err = validateQualifiedSkillName(params.skillName);
      if (err) return { content: [{ type: "text" as const, text: `Invalid skill name: ${err}` }], details: {} };
      const skillDir = safeSkillDir(params.skillName, ctx.skillsDir);
      if (!skillDir) return { content: [{ type: "text" as const, text: "Invalid skill name." }], details: {} };
      const skillPath = join(skillDir, "SKILL.md");
      if (!existsSync(skillPath)) return { content: [{ type: "text" as const, text: `Skill "${params.skillName}" not found.` }], details: {} };
      const skillMd = readFileSync(skillPath, "utf-8");

      const scriptsDir = join(skillDir, "scripts");
      const scriptFiles = existsSync(scriptsDir)
        ? readdirSync(scriptsDir).filter((f) => [".js", ".ts", ".py", ".sh"].includes(extname(f)))
        : [];

      const scriptsList = scriptFiles.length > 0
        ? `\n\n---\nScripts (use get_skill_script to read contents):\n${scriptFiles.map((f) => `  - ${f}`).join("\n")}`
        : "\n\n---\nScripts: (none)";

      return { content: [{ type: "text" as const, text: skillMd + scriptsList }], details: {} };
    },
  };
}
