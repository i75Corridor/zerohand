import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "@mariozechner/pi-ai";
import { existsSync, rmSync } from "node:fs";
import { join, basename } from "node:path";
import type { AgentToolContext } from "./context.js";
import { safeSkillDir } from "./skill-utils.js";

export function makeDeleteSkillScript(ctx: AgentToolContext): ToolDefinition {
  return {
    name: "delete_skill_script",
    label: "Delete Skill Script",
    description: "Delete a script file from a skill's scripts/ directory.",
    parameters: Type.Object({
      skillName: Type.String({ description: "The skill folder name" }),
      filename: Type.String({ description: "Script filename to delete, e.g. web_search.py" }),
    }),
    execute: async (_id, params: { skillName: string; filename: string }) => {
      const skillDir = safeSkillDir(params.skillName, ctx.skillsDir);
      if (!skillDir) return { content: [{ type: "text" as const, text: "Invalid skill name." }], details: {} };

      const base = basename(params.filename);
      if (base !== params.filename) {
        return { content: [{ type: "text" as const, text: "Invalid filename — must not contain path separators." }], details: {} };
      }

      const scriptPath = join(skillDir, "scripts", base);
      if (!existsSync(scriptPath)) {
        return { content: [{ type: "text" as const, text: `Script "${params.filename}" not found in skill "${params.skillName}".` }], details: {} };
      }

      rmSync(scriptPath);
      ctx.broadcastDataChanged("skill", "updated", params.skillName);
      return { content: [{ type: "text" as const, text: `Deleted script "${params.filename}" from skill "${params.skillName}".` }], details: {} };
    },
  };
}
