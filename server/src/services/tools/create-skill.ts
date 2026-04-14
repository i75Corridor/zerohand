import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "@mariozechner/pi-ai";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentToolContext } from "./context.js";
import { safeSkillDir, buildSkillMd, validateSkillName, validateDescription, normalizeSkillName, type SkillSchemaField } from "./skill-utils.js";

export function makeCreateSkill(ctx: AgentToolContext): ToolDefinition {
  return {
    name: "create_skill",
    label: "Create Skill",
    description: "Create a new skill by writing a SKILL.md file to the skills directory.",
    parameters: Type.Object({
      skillName: Type.String({
        description: "Folder name for the skill (unqualified — just the skill part, not the namespace). Lowercase letters, numbers, and hyphens only; max 64 characters; must not start/end with or contain consecutive hyphens (e.g. 'web-researcher', 'pdf-extractor').",
      }),
      namespace: Type.Optional(Type.String({
        description: "Namespace for the skill (default: 'local'). Skills created manually use 'local'. Package skills use the package name as namespace. Lowercase letters, numbers, and hyphens only.",
      })),
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
      mcpServers: Type.Optional(Type.Array(Type.String(), {
        description: "Names of registered MCP servers whose tools this skill can access at runtime. Use list_mcp_servers to see available servers, then list_mcp_server_tools to get exact tool names. Tool names will be available as mcp__<serverName>__<toolName> in the skill's execution context.",
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
      inputSchema: Type.Optional(Type.Array(Type.Object({
        name: Type.String({ description: "Field name" }),
        type: Type.Optional(Type.Union([Type.Literal("string"), Type.Literal("number"), Type.Literal("boolean")], { description: "Field type (default: string)" })),
        description: Type.Optional(Type.String({ description: "What this field is" })),
        required: Type.Optional(Type.Boolean({ description: "Whether this field is required" })),
      }), {
        description: "Advisory: the input fields this skill is designed to receive. Shown in the pipeline editor when this skill is selected for a step — helps authors write correct prompt templates. Not enforced at runtime.",
      })),
      outputSchema: Type.Optional(Type.Array(Type.Object({
        name: Type.String({ description: "Field name" }),
        type: Type.Optional(Type.Union([Type.Literal("string"), Type.Literal("number"), Type.Literal("boolean")], { description: "Field type (default: string)" })),
        description: Type.Optional(Type.String({ description: "What this field contains" })),
        required: Type.Optional(Type.Boolean({ description: "Whether this field is always present in the output" })),
      }), {
        description: "Structured output fields this skill produces. When present: (1) output format instructions are automatically appended to the system prompt; (2) the LLM output is JSON-cleaned before storage; (3) downstream steps can reference individual fields via {{steps.N.output.fieldName}}; (4) pipeline validation checks that field references are valid.",
      })),
    }),
    execute: async (_id, params: {
      skillName: string;
      namespace?: string;
      description: string;
      body: string;
      model?: string;
      network?: boolean;
      secrets?: string[];
      mcpServers?: string[];
      license?: string;
      compatibility?: string;
      allowedTools?: string;
      metadata?: Record<string, string>;
      inputSchema?: SkillSchemaField[];
      outputSchema?: SkillSchemaField[];
    }) => {
      const nameErr = validateSkillName(params.skillName);
      if (nameErr) return { content: [{ type: "text" as const, text: `Invalid skill name: ${nameErr}` }], details: {} };

      const namespace = params.namespace ?? "local";
      const nsErr = validateSkillName(namespace);
      if (nsErr) return { content: [{ type: "text" as const, text: `Invalid namespace: ${nsErr}` }], details: {} };

      const descErr = validateDescription(params.description);
      if (descErr) return { content: [{ type: "text" as const, text: `Invalid description: ${descErr}` }], details: {} };

      if (params.compatibility && params.compatibility.length > 500) {
        return { content: [{ type: "text" as const, text: "compatibility field exceeds 500 characters" }], details: {} };
      }

      // Qualified name: "namespace/skill-name"
      const qualifiedName = `${namespace}/${params.skillName}`;
      const skillDir = safeSkillDir(qualifiedName, ctx.skillsDir);
      if (!skillDir) return { content: [{ type: "text" as const, text: "Invalid skill name — must not contain path separators." }], details: {} };
      if (existsSync(skillDir)) return { content: [{ type: "text" as const, text: `Skill "${qualifiedName}" already exists. Use update_skill to modify it.` }], details: {} };

      mkdirSync(skillDir, { recursive: true });
      const content = buildSkillMd({
        name: params.skillName,
        description: params.description,
        body: params.body,
        model: params.model,
        network: params.network,
        secrets: params.secrets,
        mcpServers: params.mcpServers,
        license: params.license,
        compatibility: params.compatibility,
        allowedTools: params.allowedTools,
        metadata: params.metadata,
        inputSchema: params.inputSchema,
        outputSchema: params.outputSchema,
      });
      writeFileSync(join(skillDir, "SKILL.md"), content, "utf-8");
      ctx.broadcastDataChanged("skill", "created", qualifiedName);
      return { content: [{ type: "text" as const, text: `Created skill "${qualifiedName}" at ${skillDir}.` }], details: {} };
    },
  };
}
