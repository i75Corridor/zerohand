import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "@mariozechner/pi-ai";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentToolContext } from "./context.js";

export function makeListSkills(ctx: AgentToolContext): ToolDefinition {
  return {
    name: "list_skills",
    label: "List Skills",
    description: "List all available skills in the skills directory.",
    parameters: Type.Object({}),
    execute: async () => {
      if (!existsSync(ctx.skillsDir)) return { content: [{ type: "text" as const, text: "[]" }], details: {} };
      const entries = readdirSync(ctx.skillsDir, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => {
          const skillPath = join(ctx.skillsDir, e.name, "SKILL.md");
          if (!existsSync(skillPath)) return null;
          const content = readFileSync(skillPath, "utf-8");
          const fm = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
          const desc = fm?.[1].match(/description:\s*["']?(.+?)["']?\s*$/m)?.[1] ?? "";
          const type = fm?.[1].match(/type:\s*(\S+)/m)?.[1] ?? "pi";
          const hasScripts = existsSync(join(ctx.skillsDir, e.name, "scripts"));
          return { name: e.name, description: desc, type, hasScripts };
        })
        .filter(Boolean);
      return { content: [{ type: "text" as const, text: JSON.stringify(entries, null, 2) }], details: {} };
    },
  };
}
