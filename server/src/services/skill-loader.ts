import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, extname, basename, resolve, sep, dirname } from "node:path";
import { spawn } from "node:child_process";
import { parse as parseYaml } from "yaml";
import { Type } from "@mariozechner/pi-ai";
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { isDockerAvailable, runInSandbox } from "./script-sandbox.js";

const SCRIPT_TIMEOUT_MS = 30_000;
const STDOUT_SIZE_LIMIT = 1 * 1024 * 1024; // 1 MB

// Env vars stripped from child process environment
const REDACTED_ENV_PREFIXES = ["GEMINI_API_KEY", "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "DATABASE_URL"];

function safeChildEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (!REDACTED_ENV_PREFIXES.some((prefix) => k.startsWith(prefix))) {
      env[k] = v;
    }
  }
  // Scripts run from the skills directory and can't resolve monorepo packages
  // without help. Point NODE_PATH at the server's node_modules so imports like
  // @google/genai resolve correctly regardless of where the script lives.
  env.NODE_PATH = [
    join(process.cwd(), "node_modules"),       // server/node_modules
    join(process.cwd(), "..", "node_modules"), // monorepo root node_modules
  ].join(":");
  return env;
}

export interface SkillDef {
  name: string;
  version: string;
  description: string;
  type: "pi" | "imagen" | "publish";
  modelProvider?: string;
  modelName?: string;
  systemPrompt: string;
  scriptPaths: string[];
  metadata?: Record<string, unknown>;
  /** Whether scripts in this skill need outbound network access (default false) */
  network?: boolean;
  /** Secret keys from the secrets store to inject as env vars when running scripts */
  secrets?: string[];
}

export function loadSkillDef(skillName: string, skillsDir: string): SkillDef | null {
  const skillDir = join(skillsDir, skillName);

  // Guard against path traversal (e.g. skillName = "../../etc")
  const resolvedSkillsDir = resolve(skillsDir);
  const resolvedSkillDir = resolve(skillDir);
  if (!resolvedSkillDir.startsWith(resolvedSkillsDir + sep)) return null;
  const skillPath = join(skillDir, "SKILL.md");
  if (!existsSync(skillPath)) return null;

  const content = readFileSync(skillPath, "utf-8");
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)/);
  if (!fmMatch) return null;

  let fm: Record<string, unknown>;
  try { fm = parseYaml(fmMatch[1]) as Record<string, unknown>; } catch { return null; }

  const body = fmMatch[2].trim();

  let modelProvider: string | undefined;
  let modelName: string | undefined;
  const modelStr = fm.model as string | undefined;
  if (modelStr) {
    const slashIdx = modelStr.indexOf("/");
    if (slashIdx > -1) {
      modelProvider = modelStr.slice(0, slashIdx);
      modelName = modelStr.slice(slashIdx + 1);
    }
  }

  const scriptsDir = join(skillDir, "scripts");
  const scriptPaths: string[] = [];
  if (existsSync(scriptsDir)) {
    const files = readdirSync(scriptsDir).filter((f) => /\.(js|cjs|ts|py|sh)$/.test(f));
    scriptPaths.push(...files.map((f) => join(scriptsDir, f)));
  }

  const skillMetadata = fm.metadata as Record<string, unknown> | undefined;
  const skillNetwork = (fm.network as boolean | undefined) ?? false;
  const skillSecrets = (fm.secrets as string[] | undefined) ?? [];

  return {
    name: String(fm.name ?? skillName),
    version: String(fm.version ?? "0.0.0"),
    description: String(fm.description ?? ""),
    type: (fm.type as "pi" | "imagen" | "publish") ?? "pi",
    modelProvider,
    modelName,
    systemPrompt: body,
    scriptPaths,
    metadata: skillMetadata,
    network: skillNetwork,
    secrets: skillSecrets,
  };
}

interface ExecScriptOpts {
  networkEnabled?: boolean;
  secretEnv?: Record<string, string>;
  timeoutMs?: number;
}

async function execScript(
  scriptPath: string,
  input: Record<string, unknown>,
  opts: ExecScriptOpts = {},
): Promise<string> {
  const timeoutMs = opts.timeoutMs ?? SCRIPT_TIMEOUT_MS;

  // Use Docker sandbox if available
  if (isDockerAvailable()) {
    try {
      return await runInSandbox({
        scriptPath,
        input,
        networkEnabled: opts.networkEnabled ?? false,
        timeoutMs,
        maxStdout: STDOUT_SIZE_LIMIT,
        secretEnv: opts.secretEnv,
      });
    } catch (err) {
      // If it's a Docker-specific failure (image missing, etc.), fall through to subprocess
      const msg = String(err);
      if (msg.includes("Unable to find image") || msg.includes("No such image")) {
        console.warn("[Sandbox] Docker image not found, falling back to subprocess");
      } else {
        throw err;
      }
    }
  }

  return new Promise((resolve, reject) => {
    const ext = extname(scriptPath);
    let cmd: string;
    let args: string[];

    if (ext === ".js" || ext === ".cjs") { cmd = "node"; args = [scriptPath]; }
    else if (ext === ".ts") { cmd = "npx"; args = ["tsx", scriptPath]; }
    else if (ext === ".py") { cmd = "python3"; args = [scriptPath]; }
    else if (ext === ".sh") { cmd = "bash"; args = [scriptPath]; }
    else { reject(new Error(`Unsupported script type: ${ext}`)); return; }

    const child = spawn(cmd, args, {
      env: safeChildEnv(),
      cwd: dirname(scriptPath), // cwd = script's own directory, not server root
    });

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`Script timed out after ${timeoutMs / 1000}s: ${scriptPath}`));
    }, timeoutMs);

    child.stdin.write(JSON.stringify(input));
    child.stdin.end();

    let stdout = "";
    let stderr = "";
    let truncated = false;

    child.stdout.on("data", (d: Buffer) => {
      if (truncated) return;
      stdout += d.toString();
      if (stdout.length > STDOUT_SIZE_LIMIT) {
        truncated = true;
        stdout = stdout.slice(0, STDOUT_SIZE_LIMIT);
        child.kill("SIGKILL");
        reject(new Error(`Script stdout exceeded ${STDOUT_SIZE_LIMIT / 1024}KB limit: ${scriptPath}`));
      }
    });
    child.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (truncated) return; // already rejected
      if (code === 0) resolve(stdout);
      else reject(new Error(`Script exited ${code}: ${stderr}`));
    });
    child.on("error", (err) => { clearTimeout(timer); reject(err); });
  });
}

export function makeScriptTools(scriptPaths: string[], execOpts: ExecScriptOpts = {}): ToolDefinition[] {
  return scriptPaths.map((scriptPath) => {
    const toolName = basename(scriptPath, extname(scriptPath));
    return {
      name: toolName,
      label: toolName.replace(/_/g, " "),
      description: `Run the ${toolName} tool`,
      parameters: Type.Object({
        query: Type.Optional(Type.String({ description: "Search query or input text" })),
        maxResults: Type.Optional(Type.Number({ description: "Maximum results" })),
      }),
      execute: async (_id: string, params: Record<string, unknown>) => {
        const stdout = await execScript(scriptPath, params, execOpts);
        return { content: [{ type: "text" as const, text: stdout.trim() }], details: {} };
      },
    } as ToolDefinition;
  });
}

/**
 * Run a skill's primary script directly (not as an LLM tool).
 * Looks for a script named "generate" first, then falls back to the first script.
 * Input is passed as JSON on stdin; stdout is returned as a string.
 */
export async function runPrimaryScript(
  skill: SkillDef,
  input: Record<string, unknown>,
  execOpts: ExecScriptOpts = {},
): Promise<string> {
  if (skill.scriptPaths.length === 0) {
    throw new Error(`Skill "${skill.name}" has no scripts in its scripts/ directory`);
  }
  const primary =
    skill.scriptPaths.find((p) => basename(p, extname(p)) === "generate") ??
    skill.scriptPaths[0];
  return execScript(primary, input, execOpts);
}

export function interpolateContext(text: string, context: Record<string, string>): string {
  for (const [key, value] of Object.entries(context)) {
    text = text.replaceAll(`{{context.${key}}}`, value);
  }
  return text;
}
