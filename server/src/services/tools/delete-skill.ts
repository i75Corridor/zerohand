import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "@mariozechner/pi-ai";
import { existsSync, rmSync } from "node:fs";
import { eq } from "drizzle-orm";
import { pipelineSteps } from "@zerohand/db";
import type { AgentToolContext } from "./context.js";
import { safeSkillDir, normalizeSkillName } from "./skill-utils.js";

export function makeDeleteSkill(ctx: AgentToolContext): ToolDefinition {
  return {
    name: "delete_skill",
    label: "Delete Skill",
    description: "Remove a skill directory from disk. Fails if any pipeline step still references this skill — remove or reassign those steps first.",
    parameters: Type.Object({
      skillName: Type.String({
        description: "Qualified skill name to delete (namespace/skill-name, e.g. 'local/old-skill'). Bare names default to 'local' namespace.",
      }),
    }),
    execute: async (_id, params: { skillName: string }) => {
      const qualifiedName = normalizeSkillName(params.skillName);
      const skillDir = safeSkillDir(qualifiedName, ctx.skillsDir);
      if (!skillDir) return { content: [{ type: "text" as const, text: "Invalid skill name." }], details: {} };
      if (!existsSync(skillDir)) {
        return { content: [{ type: "text" as const, text: `Skill not found: "${qualifiedName}"` }], details: {} };
      }

      // Safety check: find any pipeline steps that reference this skill
      const refs = await ctx.db.query.pipelineSteps.findMany({
        where: eq(pipelineSteps.skillName, qualifiedName),
      });

      if (refs.length > 0) {
        return {
          content: [{
            type: "text" as const,
            text: `Cannot delete "${qualifiedName}" — it is referenced by ${refs.length} pipeline step(s). ` +
              `Remove or reassign those steps first (step IDs: ${refs.map((r) => r.id).join(", ")}).`,
          }],
          details: {},
        };
      }

      rmSync(skillDir, { recursive: true, force: true });
      ctx.broadcastDataChanged("skill", "deleted", qualifiedName);
      return {
        content: [{ type: "text" as const, text: `Deleted skill "${qualifiedName}".` }],
        details: {},
      };
    },
  };
}
