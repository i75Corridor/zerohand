import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "@mariozechner/pi-ai";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, basename, extname } from "node:path";
import type { AgentToolContext } from "./context.js";
import { safeSkillDir, validateQualifiedSkillName } from "./skill-utils.js";

const ALLOWED_EXTS = [".js", ".ts", ".py", ".sh"];

function validateFilename(filename: string): string | null {
  if (!filename) return "filename is required";
  const ext = extname(filename);
  if (!ALLOWED_EXTS.includes(ext)) return `unsupported extension "${ext}" — use .js, .ts, .py, or .sh`;
  const base = basename(filename);
  if (base !== filename) return "filename must not contain path separators";
  if (!/^[a-z0-9_-]+\.[a-z]+$/.test(base)) return "filename must be lowercase letters, numbers, underscores, or hyphens";
  return null;
}

const SCRIPT_CONTENT_DESCRIPTION = `Full script source code.

The script filename (minus extension) becomes the tool name the agent calls at runtime (e.g. web_search.js → web_search tool). Each script must follow this contract:
- stdin: a single JSON line containing the tool input fields the agent passed
- stdout: a single JSON object with result fields, OR plain text if there is no structured result
- stderr: anything written here is captured and shown as a tool error
- Exit code 0 = success; non-zero = failure

Always add a comment header documenting the stdin and stdout fields.

Node.js CJS (.js / .cjs) pattern:
  "use strict";
  /**
   * stdin:  { field1, field2 }
   * stdout: { result }
   */
  const readline = require("readline");
  const rl = readline.createInterface({ input: process.stdin, terminal: false });
  let raw = "";
  rl.on("line", (l) => (raw += l));
  rl.on("close", async () => {
    const { field1, field2 } = JSON.parse(raw);
    // ... do work ...
    process.stdout.write(JSON.stringify({ result }) + "\\n");
  });

NODE_PATH is pre-set to server/node_modules — require any package already installed in the server (e.g. @google/genai, axios, sharp, puppeteer) without a separate install step.

Python (.py) pattern:
  import sys, json
  # stdin:  { field1, field2 }
  # stdout: { result }
  data = json.loads(sys.stdin.read())
  result = ...
  print(json.dumps({"result": result}))

Shell (.sh) pattern:
  #!/usr/bin/env bash
  set -euo pipefail
  # stdin:  { field1 }
  # stdout: { result }
  INPUT=$(cat)
  FIELD=$(echo "$INPUT" | jq -r .field1)
  echo '{"result": "'"$FIELD"'"}'`;

export function makeCreateSkillScript(ctx: AgentToolContext): ToolDefinition {
  return {
    name: "create_skill_script",
    label: "Create Skill Script",
    description: "Create a new executable script in a skill's scripts/ directory. The script filename (minus extension) becomes a callable tool available to the agent when the skill runs. Scripts receive input as JSON on stdin and must write results to stdout.",
    parameters: Type.Object({
      skillName: Type.String({ description: "The fully-qualified skill name in 'namespace/skill-name' format (e.g. 'local/researcher')." }),
      filename: Type.String({ description: "Script filename including extension, e.g. web_search.js or fetch_data.py. The name before the dot becomes the tool name the agent calls." }),
      content: Type.String({ description: SCRIPT_CONTENT_DESCRIPTION }),
    }),
    execute: async (_id, params: { skillName: string; filename: string; content: string }) => {
      const nameErr = validateQualifiedSkillName(params.skillName);
      if (nameErr) return { content: [{ type: "text" as const, text: `Invalid skill name: ${nameErr}` }], details: {} };
      const skillDir = safeSkillDir(params.skillName, ctx.skillsDir);
      if (!skillDir) return { content: [{ type: "text" as const, text: "Invalid skill name." }], details: {} };
      if (!existsSync(skillDir)) return { content: [{ type: "text" as const, text: `Skill "${params.skillName}" not found.` }], details: {} };

      const fnErr = validateFilename(params.filename);
      if (fnErr) return { content: [{ type: "text" as const, text: `Invalid filename: ${fnErr}` }], details: {} };

      const scriptsDir = join(skillDir, "scripts");
      mkdirSync(scriptsDir, { recursive: true });
      const scriptPath = join(scriptsDir, params.filename);

      if (existsSync(scriptPath)) {
        return { content: [{ type: "text" as const, text: `Script "${params.filename}" already exists in skill "${params.skillName}". Use update_skill_script to modify it.` }], details: {} };
      }

      writeFileSync(scriptPath, params.content, "utf-8");
      ctx.broadcastDataChanged("skill", "updated", params.skillName);
      return { content: [{ type: "text" as const, text: `Created script "${params.filename}" in skill "${params.skillName}".` }], details: {} };
    },
  };
}
