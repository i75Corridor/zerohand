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
import { getModel, Type } from "@mariozechner/pi-ai";
import type { StepRunEventType } from "@zerohand/shared";
import { mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const AUTH_DIR = "/tmp/zerohand";
mkdirSync(AUTH_DIR, { recursive: true });

function makeAuthStorage(): AuthStorage {
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

function makeResourceLoader(systemPrompt: string, skillNames: string[]): ResourceLoader {
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

function makeWebSearchTool(): ToolDefinition {
  return {
    name: "web_search",
    label: "Web Search",
    description: "Search the web using DuckDuckGo. Returns an array of { title, url, snippet } objects.",
    parameters: Type.Object({
      query: Type.String({ description: "The search query" }),
      maxResults: Type.Optional(Type.Number({ description: "Maximum results to return (default 8)" })),
    }),
    execute: async (_toolCallId, params: { query: string; maxResults?: number }, _signal, _onUpdate, _ctx) => {
      const maxResults = params.maxResults ?? 8;
      const url = "https://html.duckduckgo.com/html/?" + new URLSearchParams({ q: params.query });
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; Zerohand-Research/1.0)",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });
      const html = await res.text();
      const items: { title: string; url: string; snippet: string }[] = [];
      const resultPattern =
        /class="result__title"[^>]*>.*?<a[^>]+href="([^"]+)"[^>]*>(.*?)<\/a>.*?class="result__snippet"[^>]*>(.*?)<\/span>/gs;
      const stripTags = (s: string) =>
        s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').trim();
      let match;
      while ((match = resultPattern.exec(html)) !== null && items.length < maxResults) {
        let [, href, titleHtml, snippetHtml] = match;
        if (href.startsWith("//duckduckgo.com/l/?")) {
          const uddg = href.match(/uddg=([^&]+)/);
          if (uddg) href = decodeURIComponent(uddg[1]);
        }
        if (href.startsWith("//")) href = "https:" + href;
        items.push({ title: stripTags(titleHtml), url: href, snippet: stripTags(snippetHtml) });
      }
      if (items.length === 0) {
        items.push({ title: "No results", url: "", snippet: `No web results found for: ${params.query}` });
      }
      return {
        content: [{ type: "text" as const, text: JSON.stringify(items, null, 2) }],
        details: { resultCount: items.length },
      };
    },
  };
}

export interface WorkerConfig {
  id: string;
  modelProvider: string;
  modelName: string;
  systemPrompt: string | null;
  skills: string[];
  customTools: string[];
}

export interface PiRunResult {
  output: string;
  usage: Record<string, unknown>;
}

export async function runWorkerStep(
  worker: WorkerConfig,
  prompt: string,
  onEvent: (eventType: StepRunEventType, message?: string, payload?: Record<string, unknown>) => void,
  sessionDir?: string,
  signal?: AbortSignal,
  onSessionCreated?: (session: AgentSession) => void,
): Promise<PiRunResult> {
  const model = getModel(worker.modelProvider as any, worker.modelName as any);
  if (!model) throw new Error(`Model not found: ${worker.modelProvider}/${worker.modelName}`);

  const authStorage = makeAuthStorage();
  const modelRegistry = ModelRegistry.inMemory(authStorage);
  const resourceLoader = makeResourceLoader(
    worker.systemPrompt ?? "You are a helpful assistant.",
    worker.skills ?? [],
  );

  const customTools: ToolDefinition[] = [];
  if (worker.customTools.includes("web_search")) {
    customTools.push(makeWebSearchTool());
  }

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

  // Wire abort signal to session
  const abortHandler = () => { void session.abort(); };
  signal?.addEventListener("abort", abortHandler);

  // Expose session to caller (e.g. SessionRegistry) before prompt starts
  onSessionCreated?.(session);

  const unsub = session.subscribe((event: any) => {
    if (signal?.aborted) return;

    if (event.type === "message_update") {
      const ae = event.assistantMessageEvent;
      if (!ae) return;

      if (ae.type === "text_delta") {
        onEvent("text_delta", ae.delta as string);
      } else if (ae.type === "tool_use") {
        onEvent("tool_call_start", ae.name as string, {
          toolCallId: ae.id as string,
          toolName: ae.name as string,
          input: ae.input ?? {},
        });
      } else if (ae.type === "tool_result") {
        onEvent("tool_call_end", undefined, {
          toolCallId: ae.tool_use_id as string,
        });
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
