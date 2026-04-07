import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "@mariozechner/pi-ai";
import { existsSync, writeFileSync } from "node:fs";
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
  return null;
}

const SCRIPT_CONTENT_DESCRIPTION = `Full replacement script source code.

The script filename (minus extension) is the tool name the agent calls (e.g. web_search.js → web_search). Contract:
- stdin: a single JSON line with the tool input fields
- stdout: a single JSON object with results, OR plain text
- stderr: captured and surfaced as a tool error; exit non-zero = failure

Always include a header comment documenting stdin/stdout fields.

IMPORTANT: .js files run as ES modules (import/export). Never use require() in .js files — use import instead. Use .cjs only if a dependency forces CommonJS.

Node.js ESM (.js):
  /**
   * stdin:  { field1, field2 }
   * stdout: { result }
   */
  import { createInterface } from "readline";
  const rl = createInterface({ input: process.stdin, terminal: false });
  let raw = "";
  rl.on("line", (l) => (raw += l));
  rl.on("close", async () => {
    const { field1 } = JSON.parse(raw);
    process.stdout.write(JSON.stringify({ result: field1 }) + "\\n");
  });

NODE_PATH = server/node_modules — import installed packages (e.g. @google/genai, axios) without a separate install.

Python (.py):
  import sys, json
  data = json.loads(sys.stdin.read())
  print(json.dumps({"result": data["field1"]}))`;

export function makeUpdateSkillScript(ctx: AgentToolContext): ToolDefinition {
  return {
    name: "update_skill_script",
    label: "Update Skill Script",
    description: "Replace the full content of an existing script in a skill's scripts/ directory. The script filename (minus extension) is the tool name the agent calls at runtime.",
    parameters: Type.Object({
      skillName: Type.String({ description: "The fully-qualified skill name in 'namespace/skill-name' format (e.g. 'local/researcher')." }),
      filename: Type.String({ description: "Script filename to replace, e.g. web_search.js" }),
      content: Type.String({ description: SCRIPT_CONTENT_DESCRIPTION }),
    }),
    execute: async (_id, params: { skillName: string; filename: string; content: string }) => {
      const nameErr = validateQualifiedSkillName(params.skillName);
      if (nameErr) return { content: [{ type: "text" as const, text: `Invalid skill name: ${nameErr}` }], details: {} };
      const skillDir = safeSkillDir(params.skillName, ctx.skillsDir);
      if (!skillDir) return { content: [{ type: "text" as const, text: "Invalid skill name." }], details: {} };

      const fnErr = validateFilename(params.filename);
      if (fnErr) return { content: [{ type: "text" as const, text: `Invalid filename: ${fnErr}` }], details: {} };

      const scriptPath = join(skillDir, "scripts", params.filename);
      if (!existsSync(scriptPath)) {
        return { content: [{ type: "text" as const, text: `Script "${params.filename}" not found in skill "${params.skillName}". Use create_skill_script to create it.` }], details: {} };
      }

      writeFileSync(scriptPath, params.content, "utf-8");
      ctx.broadcastDataChanged("skill", "updated", params.skillName);
      return { content: [{ type: "text" as const, text: `Updated script "${params.filename}" in skill "${params.skillName}".` }], details: {} };
    },
  };
}
