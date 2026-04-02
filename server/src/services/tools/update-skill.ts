import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "@mariozechner/pi-ai";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentToolContext } from "./context.js";
import { safeSkillDir, buildSkillMd } from "./skill-utils.js";

export function makeUpdateSkill(ctx: AgentToolContext): ToolDefinition {
  return {
    name: "update_skill",
    label: "Update Skill",
    description: "Overwrite the SKILL.md for an existing skill. Provide the full new body — partial updates are not supported.",
    parameters: Type.Object({
      skillName: Type.String({ description: "The skill folder name to update" }),
      description: Type.Optional(Type.String({ description: "Updated description" })),
      type: Type.Optional(Type.String({ description: "Updated type: pi, imagen, or publish" })),
      body: Type.String({ description: "The full new system prompt body" }),
      model: Type.Optional(Type.String({ description: "Model override in provider/name format" })),
      network: Type.Optional(Type.Boolean({ description: "Whether scripts need network access" })),
    }),
    execute: async (_id, params: { skillName: string; description?: string; type?: string; body: string; model?: string; network?: boolean }) => {
      const skillDir = safeSkillDir(params.skillName, ctx.skillsDir);
      if (!skillDir) return { content: [{ type: "text" as const, text: "Invalid skill name." }], details: {} };
      const skillPath = join(skillDir, "SKILL.md");
      if (!existsSync(skillPath)) return { content: [{ type: "text" as const, text: `Skill "${params.skillName}" not found. Use create_skill to create it.` }], details: {} };

      // Merge: read existing frontmatter for fields not provided
      const existing = readFileSync(skillPath, "utf-8");
      const fm = existing.match(/^---\r?\n([\s\S]*?)\r?\n---/);
      const existingDesc = fm?.[1].match(/description:\s*["']?(.+?)["']?\s*$/m)?.[1] ?? "";
      const existingType = fm?.[1].match(/type:\s*(\S+)/m)?.[1] ?? "pi";

      const content = buildSkillMd({
        name: params.skillName,
        description: params.description ?? existingDesc,
        type: params.type ?? existingType,
        body: params.body,
        model: params.model,
        network: params.network,
      });
      writeFileSync(skillPath, content, "utf-8");
      return { content: [{ type: "text" as const, text: `Updated skill "${params.skillName}".` }], details: {} };
    },
  };
}
