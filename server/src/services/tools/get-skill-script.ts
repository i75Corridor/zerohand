import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "@mariozechner/pi-ai";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, basename, extname } from "node:path";
import type { AgentToolContext } from "./context.js";
import { safeSkillDir, validateQualifiedSkillName } from "./skill-utils.js";

const ALLOWED_EXTS = new Set([".js", ".ts", ".py", ".sh"]);

export function makeGetSkillScript(ctx: AgentToolContext): ToolDefinition {
  return {
    name: "get_skill_script",
    label: "Get Skill Script",
    description: "Read the full source code of a script in a skill's scripts/ directory. Use list_skills or get_skill to find available skill names, then use this to inspect or debug a specific script before modifying it with update_skill_script.",
    parameters: Type.Object({
      skillName: Type.String({ description: "The fully-qualified skill name in 'namespace/skill-name' format (e.g. 'local/trending-topic-selector')." }),
      filename: Type.String({ description: "Script filename including extension, e.g. fetch_rss.js. If unsure of the filename, call get_skill first — it lists available scripts." }),
    }),
    execute: async (_id, params: { skillName: string; filename: string }) => {
      const nameErr = validateQualifiedSkillName(params.skillName);
      if (nameErr) return { content: [{ type: "text" as const, text: `Invalid skill name: ${nameErr}` }], details: {} };

      const skillDir = safeSkillDir(params.skillName, ctx.skillsDir);
      if (!skillDir) return { content: [{ type: "text" as const, text: "Invalid skill name." }], details: {} };

      const scriptsDir = join(skillDir, "scripts");
      if (!existsSync(scriptsDir)) {
        return { content: [{ type: "text" as const, text: `Skill "${params.skillName}" has no scripts/ directory.` }], details: {} };
      }

      // Reject path traversal
      const filename = basename(params.filename);
      if (filename !== params.filename) {
        return { content: [{ type: "text" as const, text: "filename must not contain path separators." }], details: {} };
      }
      if (!ALLOWED_EXTS.has(extname(filename))) {
        return { content: [{ type: "text" as const, text: `Unsupported extension — readable extensions: ${[...ALLOWED_EXTS].join(", ")}` }], details: {} };
      }

      const scriptPath = join(scriptsDir, filename);
      if (!existsSync(scriptPath)) {
        const available = readdirSync(scriptsDir)
          .filter((f) => ALLOWED_EXTS.has(extname(f)))
          .join(", ");
        return {
          content: [{ type: "text" as const, text: `Script "${filename}" not found in skill "${params.skillName}". Available scripts: ${available || "(none)"}` }],
          details: {},
        };
      }

      const content = readFileSync(scriptPath, "utf-8");
      return {
        content: [{ type: "text" as const, text: `// ${params.skillName}/scripts/${filename}\n${content}` }],
        details: {},
      };
    },
  };
}
