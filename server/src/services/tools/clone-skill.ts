import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "@mariozechner/pi-ai";
import { existsSync, mkdirSync, cpSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentToolContext } from "./context.js";
import { safeSkillDir, validateSkillName, normalizeSkillName } from "./skill-utils.js";

export function makeCloneSkill(ctx: AgentToolContext): ToolDefinition {
  return {
    name: "clone_skill",
    label: "Clone Skill",
    description: "Copy an existing skill to a new name and/or namespace. Useful for creating a variant of an existing skill without starting from scratch.",
    parameters: Type.Object({
      sourceSkillName: Type.String({
        description: "Qualified source skill name (namespace/skill-name, e.g. 'local/researcher'). Bare names default to 'local' namespace.",
      }),
      targetName: Type.String({
        description: "New skill name (unqualified — just the skill part). Lowercase letters, numbers, and hyphens only.",
      }),
      targetNamespace: Type.Optional(Type.String({
        description: "Namespace for the new skill (default: 'local').",
      })),
    }),
    execute: async (_id, params: { sourceSkillName: string; targetName: string; targetNamespace?: string }) => {
      const sourceQualified = normalizeSkillName(params.sourceSkillName);
      const sourceDir = safeSkillDir(sourceQualified, ctx.skillsDir);
      if (!sourceDir || !existsSync(sourceDir)) {
        return { content: [{ type: "text" as const, text: `Source skill not found: "${sourceQualified}"` }], details: {} };
      }

      const nameErr = validateSkillName(params.targetName);
      if (nameErr) return { content: [{ type: "text" as const, text: `Invalid target name: ${nameErr}` }], details: {} };

      const targetNamespace = params.targetNamespace ?? "local";
      const nsErr = validateSkillName(targetNamespace);
      if (nsErr) return { content: [{ type: "text" as const, text: `Invalid namespace: ${nsErr}` }], details: {} };

      const targetQualified = `${targetNamespace}/${params.targetName}`;
      const targetDir = safeSkillDir(targetQualified, ctx.skillsDir);
      if (!targetDir) return { content: [{ type: "text" as const, text: "Invalid target skill name." }], details: {} };
      if (existsSync(targetDir)) {
        return { content: [{ type: "text" as const, text: `Skill "${targetQualified}" already exists.` }], details: {} };
      }

      mkdirSync(targetDir, { recursive: true });
      cpSync(sourceDir, targetDir, { recursive: true });

      // Update the name field in SKILL.md frontmatter
      const skillMdPath = join(targetDir, "SKILL.md");
      if (existsSync(skillMdPath)) {
        const content = readFileSync(skillMdPath, "utf-8");
        const updated = content.replace(/^name:\s*.+$/m, `name: ${params.targetName}`);
        writeFileSync(skillMdPath, updated, "utf-8");
      }

      ctx.broadcastDataChanged("skill", "created", targetQualified);
      return {
        content: [{ type: "text" as const, text: `Cloned "${sourceQualified}" → "${targetQualified}" at ${targetDir}.` }],
        details: {},
      };
    },
  };
}
