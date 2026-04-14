import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "@mariozechner/pi-ai";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
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
        outputSchema?: Array<{ name: string; type?: string; description?: string; required?: boolean }>;
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
          const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
          const desc = fmMatch?.[1].match(/description:\s*["']?(.+?)["']?\s*$/m)?.[1] ?? "";
          const hasScripts = existsSync(join(nsDir, skillName, "scripts"));

          let outputSchema: Array<{ name: string; type?: string; description?: string; required?: boolean }> | undefined;
          if (fmMatch) {
            try {
              const fm = parseYaml(fmMatch[1]) as Record<string, unknown>;
              if (Array.isArray(fm.outputSchema)) {
                outputSchema = (fm.outputSchema as Array<Record<string, unknown>>).map((p) => ({
                  name: String(p.name ?? ""),
                  type: p.type as string | undefined,
                  description: p.description !== undefined ? String(p.description) : undefined,
                  required: Boolean(p.required ?? false),
                }));
              }
            } catch { /* ignore malformed frontmatter */ }
          }

          results.push({
            name: skillName,
            namespace,
            qualifiedName: `${namespace}/${skillName}`,
            description: desc,
            hasScripts,
            outputSchema,
          });
        }
      }

      return { content: [{ type: "text" as const, text: JSON.stringify(results, null, 2) }], details: {} };
    },
  };
}
