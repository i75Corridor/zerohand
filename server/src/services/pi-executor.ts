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
import { getProviders, getEnvApiKey } from "@mariozechner/pi-ai";
import { resolveModel } from "./ollama-provider.js";
import type { StepRunEventType } from "@zerohand/shared";
import { mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { skillsDir as getSkillsDir } from "./paths.js";

const AUTH_DIR = "/tmp/zerohand";
mkdirSync(AUTH_DIR, { recursive: true });

export function makeAuthStorage(): AuthStorage {
  const auth = AuthStorage.create(`${AUTH_DIR}/auth.json`);
  for (const provider of getProviders()) {
    const key = getEnvApiKey(provider);
    if (key) auth.setRuntimeApiKey(provider, key);
  }
  if (process.env.OLLAMA_HOST) auth.setRuntimeApiKey("ollama", "ollama");
  return auth;
}

function loadWorkerSkills(skillNames: string[]): Skill[] {
  if (skillNames.length === 0) return [];
  const skillsDir = getSkillsDir();
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
  scriptExecOpts?: { networkEnabled?: boolean; secretEnv?: Record<string, string> },
  mcpTools?: ToolDefinition[],
): Promise<PiRunResult> {
  const provider = skill.modelProvider ?? modelProvider;
  const name = skill.modelName ?? modelName;

  const model = resolveModel(provider, name);

  const { interpolateContext, makeScriptTools } = await import("./skill-loader.js");
  const skillBody = interpolateContext(skill.systemPrompt, context);
  const fullSystemPrompt = [pipelineSystemPrompt, skillBody].filter(Boolean).join("\n\n---\n\n");

  console.log("[pi-executor] systemPrompt length:", fullSystemPrompt.length, "| preview:", fullSystemPrompt.slice(0, 300));
  const authStorage = makeAuthStorage();
  const modelRegistry = ModelRegistry.inMemory(authStorage);
  const resourceLoader = makeResourceLoader(fullSystemPrompt, []);

  const scriptTools: ToolDefinition[] = makeScriptTools(skill.scriptPaths, scriptExecOpts ?? {}, skill.scriptParameters);
  const customTools: ToolDefinition[] = [...scriptTools, ...(mcpTools ?? [])];
  console.log("[pi-executor] customTools schemas:", JSON.stringify(customTools.map((t) => ({ name: t.name, parameters: t.parameters })), null, 2).slice(0, 3000));

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

  console.log("[pi-executor] prompt length:", prompt.length, "| preview:", prompt.slice(0, 500));
  try {
    await session.prompt(prompt);
  } finally {
    unsub();
    signal?.removeEventListener("abort", abortHandler);
  }

  // Check if the last assistant message ended with an error (e.g. UNEXPECTED_TOOL_CALL,
  // MALFORMED_FUNCTION_CALL, SAFETY) — these map to stopReason:"error" in pi-ai/google.js
  const lastAssistant = [...session.messages].reverse().find((m: any) => m.role === "assistant") as any | undefined;
  if (lastAssistant?.stopReason === "error") {
    const errMsg = lastAssistant.errorMessage as string | undefined;
    console.error("[pi-executor] Model error stop. Full last assistant message:", JSON.stringify(lastAssistant, null, 2).slice(0, 2000));
    throw new Error(errMsg ?? "Model returned an error stop reason (UNEXPECTED_TOOL_CALL / SAFETY / MALFORMED_FUNCTION_CALL). Check that all tools referenced in the skill system prompt are registered and available.");
  }

  const output = getLastAssistantText(session.messages);
  const usage = extractUsage(session.messages);

  if (!output) {
    const msgSummary = session.messages.map((m: any) => ({
      role: m.role,
      stopReason: m.stopReason,
      types: (m.content as any[])?.map((c: any) => c.type),
    }));
    console.warn("[pi-executor] LLM produced no text output. Messages:", JSON.stringify(msgSummary, null, 2));
  }

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
