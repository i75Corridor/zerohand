import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "@mariozechner/pi-ai";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentToolContext } from "./context.js";

export function makeListSkills(ctx: AgentToolContext): ToolDefinition {
  return {
    name: "list_skills",
    label: "List Skills",
    description: "List all available skills. Skills are returned with their fully-qualified name (namespace/skill-name). Use this before creating a pipeline step to find the right skill to reference.",
    parameters: Type.Object({}),
    execute: async () => {
      if (!existsSync(ctx.skillsDir)) return { content: [{ type: "text" as const, text: "[]" }], details: {} };

      const results: Array<{
        name: string;
        namespace: string;
        qualifiedName: string;
        description: string;
        hasScripts: boolean;
      }> = [];

      // Scan two levels: SKILLS_DIR/<namespace>/<skill>/SKILL.md
      const nsEntries = readdirSync(ctx.skillsDir, { withFileTypes: true });
      for (const nsEntry of nsEntries) {
        if (!nsEntry.isDirectory()) continue;
        const namespace = nsEntry.name;
        const nsDir = join(ctx.skillsDir, namespace);

        const skillEntries = readdirSync(nsDir, { withFileTypes: true });
        for (const skillEntry of skillEntries) {
          if (!skillEntry.isDirectory()) continue;
          const skillName = skillEntry.name;
          const skillPath = join(nsDir, skillName, "SKILL.md");
          if (!existsSync(skillPath)) continue;

          const content = readFileSync(skillPath, "utf-8");
          const fm = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
          const desc = fm?.[1].match(/description:\s*["']?(.+?)["']?\s*$/m)?.[1] ?? "";
          const hasScripts = existsSync(join(nsDir, skillName, "scripts"));
          results.push({
            name: skillName,
            namespace,
            qualifiedName: `${namespace}/${skillName}`,
            description: desc,
            hasScripts,
          });
        }
      }

      return { content: [{ type: "text" as const, text: JSON.stringify(results, null, 2) }], details: {} };
    },
  };
}
