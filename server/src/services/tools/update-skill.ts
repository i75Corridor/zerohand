import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "@mariozechner/pi-ai";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import type { AgentToolContext } from "./context.js";
import { safeSkillDir, buildSkillMd, validateDescription, validateQualifiedSkillName } from "./skill-utils.js";

export function makeUpdateSkill(ctx: AgentToolContext): ToolDefinition {
  return {
    name: "update_skill",
    label: "Update Skill",
    description: "Update the SKILL.md for an existing skill. Only the fields you provide are changed — all others are preserved from the existing file.",
    parameters: Type.Object({
      skillName: Type.String({ description: "The fully-qualified skill name in 'namespace/skill-name' format (e.g. 'local/researcher'). Use list_skills to find available skills." }),
      description: Type.Optional(Type.String({
        description: "Updated description: what the skill does AND when to use it. Max 1024 characters.",
      })),
      body: Type.String({
        description: `The full replacement system prompt body. Structure:
1. Role line: "You are the X responsible for Y."
2. Inputs: what fields to expect from pipeline params or prior step outputs.
3. Numbered, sequential instructions. If scripts are attached, name the tool (filename minus ext), specify arguments, and describe what to do with the result.
4. Output format: exact structure — JSON keys, markdown sections, plain text.
5. Gotchas: edge cases and failure conditions.
Replaces the existing body entirely. Keep under 500 lines.`,
      }),
      model: Type.Optional(Type.String({
        description: "Updated model override in provider/name format, e.g. google/gemini-2.5-flash. Pass empty string to remove.",
      })),
      network: Type.Optional(Type.Boolean({
        description: "Whether scripts need outbound network access.",
      })),
      secrets: Type.Optional(Type.Array(Type.String(), {
        description: "Updated list of secret keys to inject. Replaces the existing secrets list.",
      })),
      mcpServers: Type.Optional(Type.Array(Type.String(), {
        description: "Updated list of registered MCP server names this skill can access at runtime. Replaces the existing mcpServers list. Pass an empty array to remove all MCP server references.",
      })),
      license: Type.Optional(Type.String({
        description: "Updated license identifier or reference, e.g. 'MIT'.",
      })),
      compatibility: Type.Optional(Type.String({
        description: "Updated environment requirements. Max 500 characters.",
      })),
      allowedTools: Type.Optional(Type.String({
        description: "Updated space-delimited list of pre-approved tools.",
      })),
      metadata: Type.Optional(Type.Record(Type.String(), Type.String(), {
        description: "Arbitrary key-value pairs in the metadata block. NOT automatically passed to scripts — to use a value at runtime, the skill body must tell the agent to pass it as a tool argument explicitly. Merged with existing metadata — keys you provide are updated, keys you omit are preserved. Values must be strings.",
      })),
    }),
    execute: async (_id, params: {
      skillName: string;
      description?: string;
      body: string;
      model?: string;
      network?: boolean;
      secrets?: string[];
      mcpServers?: string[];
      license?: string;
      compatibility?: string;
      allowedTools?: string;
      metadata?: Record<string, string>;
    }) => {
      const nameErr = validateQualifiedSkillName(params.skillName);
      if (nameErr) return { content: [{ type: "text" as const, text: `Invalid skill name: ${nameErr}` }], details: {} };

      const skillDir = safeSkillDir(params.skillName, ctx.skillsDir);
      if (!skillDir) return { content: [{ type: "text" as const, text: "Invalid skill name." }], details: {} };

      const skillPath = join(skillDir, "SKILL.md");
      if (!existsSync(skillPath)) {
        return { content: [{ type: "text" as const, text: `Skill "${params.skillName}" not found. Use create_skill to create it.` }], details: {} };
      }

      if (params.description !== undefined) {
        const descErr = validateDescription(params.description);
        if (descErr) return { content: [{ type: "text" as const, text: `Invalid description: ${descErr}` }], details: {} };
      }

      if (params.compatibility !== undefined && params.compatibility.length > 500) {
        return { content: [{ type: "text" as const, text: "compatibility field exceeds 500 characters" }], details: {} };
      }

      // Parse existing file to preserve all fields not explicitly overridden
      const existing = readFileSync(skillPath, "utf-8");
      const fmMatch = existing.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)/);
      if (!fmMatch) {
        return { content: [{ type: "text" as const, text: `SKILL.md for "${params.skillName}" has no valid frontmatter.` }], details: {} };
      }

      let existingFm: Record<string, unknown> = {};
      try {
        existingFm = parseYaml(fmMatch[1]) as Record<string, unknown>;
      } catch {
        return { content: [{ type: "text" as const, text: "Could not parse existing SKILL.md frontmatter." }], details: {} };
      }

      // Merge: use provided value, fall back to existing, then default
      const description = params.description ?? String(existingFm.description ?? "");
      const model = params.model !== undefined ? (params.model || undefined) : (existingFm.model as string | undefined);
      const network = params.network !== undefined ? params.network : (existingFm.network as boolean | undefined);
      const secrets = params.secrets !== undefined ? params.secrets : (existingFm.secrets as string[] | undefined);
      const mcpServers = params.mcpServers !== undefined ? params.mcpServers : (existingFm.mcpServers as string[] | undefined);
      const license = params.license !== undefined ? params.license : (existingFm.license as string | undefined);
      const compatibility = params.compatibility !== undefined ? params.compatibility : (existingFm.compatibility as string | undefined);
      const allowedTools = params.allowedTools !== undefined ? params.allowedTools : (existingFm["allowed-tools"] as string | undefined);

      // Merge metadata: existing keys preserved, provided keys override
      const existingMeta = (existingFm.metadata as Record<string, string> | undefined) ?? {};
      const mergedMeta = params.metadata ? { ...existingMeta, ...params.metadata } : existingMeta;

      // Use only the base name (after the namespace slash) — never write "local/foo" into name:
      const slashIdx = params.skillName.indexOf("/");
      const baseName = slashIdx > -1 ? params.skillName.slice(slashIdx + 1) : params.skillName;

      const content = buildSkillMd({
        name: baseName,
        description,
        body: params.body,
        model,
        network,
        secrets,
        mcpServers,
        license,
        compatibility,
        allowedTools,
        metadata: mergedMeta,
      });

      writeFileSync(skillPath, content, "utf-8");
      ctx.broadcastDataChanged("skill", "updated", params.skillName);
      return { content: [{ type: "text" as const, text: `Updated skill "${params.skillName}".` }], details: {} };
    },
  };
}
