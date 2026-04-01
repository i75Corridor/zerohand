import {
  AuthStorage,
  ModelRegistry,
  SessionManager,
  createAgentSession,
  createExtensionRuntime,
  loadSkillsFromDir,
  type AgentSession,
  type ToolDefinition,
  type ResourceLoader,
  type Skill,
} from "@mariozechner/pi-coding-agent";
import { getModel } from "@mariozechner/pi-ai";
import type { StepRunEventType } from "@zerohand/shared";
import { mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const AUTH_DIR = "/tmp/zerohand";
mkdirSync(AUTH_DIR, { recursive: true });

export function makeAuthStorage(): AuthStorage {
  const auth = AuthStorage.create(`${AUTH_DIR}/auth.json`);
  if (process.env.GEMINI_API_KEY) auth.setRuntimeApiKey("google", process.env.GEMINI_API_KEY);
  if (process.env.ANTHROPIC_API_KEY) auth.setRuntimeApiKey("anthropic", process.env.ANTHROPIC_API_KEY);
  if (process.env.OPENAI_API_KEY) auth.setRuntimeApiKey("openai", process.env.OPENAI_API_KEY);
  return auth;
}

function loadWorkerSkills(skillNames: string[]): Skill[] {
  if (skillNames.length === 0) return [];
  const skillsDir = process.env.SKILLS_DIR ?? join(process.cwd(), "..", "skills");
  if (!existsSync(skillsDir)) return [];
  const { skills } = loadSkillsFromDir({ dir: skillsDir, source: "zerohand" });
  return skillNames.length > 0
    ? skills.filter((s) => skillNames.includes(s.name))
    : skills;
}

export function makeResourceLoader(systemPrompt: string, skillNames: string[]): ResourceLoader {
  const skills = loadWorkerSkills(skillNames);
  return {
    getExtensions: () => ({ extensions: [], errors: [], runtime: createExtensionRuntime() }),
    getSkills: () => ({ skills, diagnostics: [] }),
    getPrompts: () => ({ prompts: [], diagnostics: [] }),
    getThemes: () => ({ themes: [], diagnostics: [] }),
    getAgentsFiles: () => ({ agentsFiles: [] }),
    getSystemPrompt: () => systemPrompt,
    getAppendSystemPrompt: () => [],
    extendResources: () => {},
    reload: async () => {},
  };
}

export interface PiRunResult {
  output: string;
  usage: Record<string, unknown>;
}

export async function runSkillStep(
  skill: import("./skill-loader.js").SkillDef,
  pipelineSystemPrompt: string | null,
  modelProvider: string,
  modelName: string,
  prompt: string,
  context: Record<string, string>,
  onEvent: (eventType: StepRunEventType, message?: string, payload?: Record<string, unknown>) => void,
  sessionDir?: string,
  signal?: AbortSignal,
  onSessionCreated?: (session: AgentSession) => void,
): Promise<PiRunResult> {
  const provider = skill.modelProvider ?? modelProvider;
  const name = skill.modelName ?? modelName;

  const model = getModel(provider as any, name as any);
  if (!model) throw new Error(`Model not found: ${provider}/${name}`);

  const { interpolateContext, makeScriptTools } = await import("./skill-loader.js");
  const skillBody = interpolateContext(skill.systemPrompt, context);
  const fullSystemPrompt = [pipelineSystemPrompt, skillBody].filter(Boolean).join("\n\n---\n\n");

  const authStorage = makeAuthStorage();
  const modelRegistry = ModelRegistry.inMemory(authStorage);
  const resourceLoader = makeResourceLoader(fullSystemPrompt, []);

  const customTools: ToolDefinition[] = makeScriptTools(skill.scriptPaths);

  const sessionManager = sessionDir
    ? SessionManager.create(sessionDir)
    : SessionManager.inMemory();

  const { session } = await createAgentSession({
    model,
    thinkingLevel: "off",
    authStorage,
    modelRegistry,
    resourceLoader,
    tools: [],
    customTools,
    sessionManager,
  });

  const abortHandler = () => { void session.abort(); };
  signal?.addEventListener("abort", abortHandler);
  onSessionCreated?.(session);

  const unsub = session.subscribe((event: any) => {
    if (signal?.aborted) return;
    if (event.type === "message_update") {
      const ae = event.assistantMessageEvent;
      if (!ae) return;
      if (ae.type === "text_delta") {
        onEvent("text_delta", ae.delta as string);
      } else if (ae.type === "tool_use") {
        onEvent("tool_call_start", ae.name as string, { toolCallId: ae.id, toolName: ae.name, input: ae.input ?? {} });
      } else if (ae.type === "tool_result") {
        onEvent("tool_call_end", undefined, { toolCallId: ae.tool_use_id });
      }
    }
  });

  try {
    await session.prompt(prompt);
  } finally {
    unsub();
    signal?.removeEventListener("abort", abortHandler);
  }

  const output = getLastAssistantText(session.messages);
  const usage = extractUsage(session.messages);
  return { output, usage };
}

function getLastAssistantText(messages: any[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === "assistant") {
      return (m.content as any[])
        .filter((c: any) => c.type === "text")
        .map((c: any) => c.text as string)
        .join("");
    }
  }
  return "";
}

function extractUsage(messages: any[]): Record<string, unknown> {
  // Collect usage from message metadata if available
  const usage: Record<string, unknown> = {};
  for (const m of messages) {
    if (m.usage) {
      Object.assign(usage, m.usage);
    }
  }
  return usage;
}
