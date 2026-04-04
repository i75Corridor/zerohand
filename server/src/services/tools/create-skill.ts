import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "@mariozechner/pi-ai";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentToolContext } from "./context.js";
import { safeSkillDir, buildSkillMd, validateSkillName, validateDescription } from "./skill-utils.js";

export function makeCreateSkill(ctx: AgentToolContext): ToolDefinition {
  return {
    name: "create_skill",
    label: "Create Skill",
    description: "Create a new skill by writing a SKILL.md file to the skills directory.",
    parameters: Type.Object({
      skillName: Type.String({
        description: "Folder name for the skill. Lowercase letters, numbers, and hyphens only; max 64 characters; must not start/end with or contain consecutive hyphens (e.g. 'web-researcher', 'pdf-extractor').",
      }),
      description: Type.String({
        description: "What this skill does AND when to use it — include keywords that help identify relevant tasks. Max 1024 characters. Example: 'Extracts text from PDFs and fills forms. Use when handling PDF documents or the user mentions PDFs, forms, or document extraction.'",
      }),
      body: Type.String({
        description: `System prompt body — the full instructions the LLM sees when this skill executes. Structure it as:
1. Role line: "You are the X responsible for Y." — one sentence, sets the persona.
2. Inputs: describe what input fields to expect (from pipeline input params or {{steps.N.output}}).
3. Step-by-step instructions: numbered, sequential, specific. If scripts are attached, name the tool (filename minus ext) and specify exactly what arguments to pass and what to do with the result.
4. Output format: exact structure expected — JSON keys, markdown sections, plain text, etc.
5. Gotchas: edge cases, failure conditions, what to do when inputs are missing or malformed.

Example (skill with a web_search.js script):
  You are the Research Director. Given a topic, perform exactly 3 web searches using the web_search tool.
  1. Search for recent news on the topic.
  2. Search for controversy or criticism related to the topic.
  3. Search for historical context or adjacent facts.
  After all 3 searches, compile findings into a report with sections: ## KEY FACTS, ## NOTABLE QUOTES, ## ANGLES (ranked), ## SOURCES.
  Do not write the final article — only compile raw material.

Keep under 500 lines. Avoid restating general LLM knowledge.`,
      }),
      model: Type.Optional(Type.String({
        description: "Model override in provider/name format, e.g. google/gemini-2.5-flash. Omit to use the pipeline's model.",
      })),
      network: Type.Optional(Type.Boolean({
        description: "Whether scripts in this skill need outbound network access. Sets compatibility field accordingly.",
      })),
      secrets: Type.Optional(Type.Array(Type.String(), {
        description: "Secret keys from the secrets store to inject as env vars when running scripts.",
      })),
      license: Type.Optional(Type.String({
        description: "SPDX license identifier or reference to a bundled license file, e.g. 'MIT' or 'LICENSE.txt'.",
      })),
      compatibility: Type.Optional(Type.String({
        description: "Environment requirements: intended product, required system packages, network needs, etc. Max 500 characters. E.g. 'Requires git, docker, and internet access'. Omit if no specific requirements.",
      })),
      allowedTools: Type.Optional(Type.String({
        description: "Space-delimited list of pre-approved tools this skill may use, e.g. 'Bash(git:*) Read Write'. Experimental.",
      })),
      metadata: Type.Optional(Type.Record(Type.String(), Type.String(), {
        description: "Arbitrary key-value pairs stored in the SKILL.md metadata block. These are NOT automatically passed to scripts — they are documentation. To actually use a metadata value at runtime, the skill body must reference it explicitly and tell the agent to pass it as a tool argument. Example: set metadata { aspectRatio: '16:9' } and then write in the body: 'Call generate with aspectRatio \"16:9\"'. Values must be strings.",
      })),
    }),
    execute: async (_id, params: {
      skillName: string;
      description: string;
      body: string;
      model?: string;
      network?: boolean;
      secrets?: string[];
      license?: string;
      compatibility?: string;
      allowedTools?: string;
      metadata?: Record<string, string>;
    }) => {
      const nameErr = validateSkillName(params.skillName);
      if (nameErr) return { content: [{ type: "text" as const, text: `Invalid skill name: ${nameErr}` }], details: {} };

      const descErr = validateDescription(params.description);
      if (descErr) return { content: [{ type: "text" as const, text: `Invalid description: ${descErr}` }], details: {} };

      if (params.compatibility && params.compatibility.length > 500) {
        return { content: [{ type: "text" as const, text: "compatibility field exceeds 500 characters" }], details: {} };
      }

      const skillDir = safeSkillDir(params.skillName, ctx.skillsDir);
      if (!skillDir) return { content: [{ type: "text" as const, text: "Invalid skill name — must not contain path separators." }], details: {} };
      if (existsSync(skillDir)) return { content: [{ type: "text" as const, text: `Skill "${params.skillName}" already exists. Use update_skill to modify it.` }], details: {} };

      mkdirSync(skillDir, { recursive: true });
      const content = buildSkillMd({
        name: params.skillName,
        description: params.description,
        body: params.body,
        model: params.model,
        network: params.network,
        secrets: params.secrets,
        license: params.license,
        compatibility: params.compatibility,
        allowedTools: params.allowedTools,
        metadata: params.metadata,
      });
      writeFileSync(join(skillDir, "SKILL.md"), content, "utf-8");
      ctx.broadcastDataChanged("skill", "created", params.skillName);
      return { content: [{ type: "text" as const, text: `Created skill "${params.skillName}" at ${skillDir}.` }], details: {} };
    },
  };
}
