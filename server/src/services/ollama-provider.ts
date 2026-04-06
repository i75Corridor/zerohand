import type { ApiModelEntry } from "@zerohand/shared";

/**
 * Ollama provider — discovers locally-running models via polling and
 * constructs pi-ai-compatible Model objects for the openai-completions API.
 */

// ── Types matching pi-ai's Model<"openai-completions"> shape ─────────────────

export interface OllamaModel {
  id: string;
  name: string;
  api: "openai-completions";
  provider: "ollama";
  baseUrl: string;
  reasoning: boolean;
  input: ("text" | "image")[];
  cost: { input: number; output: number; cacheRead: number; cacheWrite: number };
  contextWindow: number;
  maxTokens: number;
  compat: {
    supportsStore: boolean;
    supportsDeveloperRole: boolean;
    supportsReasoningEffort: boolean;
  };
}

interface OllamaTagsResponse {
  models?: Array<{
    name: string;
    size: number;
    modified_at: string;
    details?: {
      parameter_size?: string;
      quantization_level?: string;
      family?: string;
    };
  }>;
}

// ── Module state ─────────────────────────────────────────────────────────────

let cachedModels: OllamaModel[] = [];
let available = false;
let pollTimer: ReturnType<typeof setInterval> | null = null;

const DEFAULT_CONTEXT_WINDOW = 4096;
const DEFAULT_MAX_TOKENS = 2048;
const POLL_INTERVAL_MS = 30_000;

// ── Core functions ───────────────────────────────────────────────────────────

function getOllamaHost(): string | undefined {
  return process.env.OLLAMA_HOST;
}

function buildModel(name: string, host: string): OllamaModel {
  return {
    id: name,
    name,
    api: "openai-completions",
    provider: "ollama",
    baseUrl: `${host.replace(/\/+$/, "")}/v1`,
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: DEFAULT_CONTEXT_WINDOW,
    maxTokens: DEFAULT_MAX_TOKENS,
    compat: {
      supportsStore: false,
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
    },
  };
}

async function pollOllama(): Promise<void> {
  const host = getOllamaHost();
  if (!host) return;

  try {
    const res = await fetch(`${host.replace(/\/+$/, "")}/api/tags`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) {
      available = false;
      return;
    }
    const data = (await res.json()) as OllamaTagsResponse;
    const models = data.models ?? [];
    cachedModels = models.map((m) => buildModel(m.name, host));
    available = true;
  } catch {
    available = false;
    // Keep stale cache — better to show last-known models than nothing
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

export function getOllamaModels(): OllamaModel[] {
  return cachedModels;
}

export function isOllamaAvailable(): boolean {
  return available;
}

export async function startOllamaPolling(): Promise<void> {
  if (!getOllamaHost()) return;
  // Initial poll immediately
  await pollOllama();
  pollTimer = setInterval(() => void pollOllama(), POLL_INTERVAL_MS);
}

export function stopOllamaPolling(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  cachedModels = [];
  available = false;
}

/** Map cached Ollama models to ApiModelEntry format for the /models endpoint */
export function ollamaModelsToApiEntries(): ApiModelEntry[] {
  const ollamaAvailable = isOllamaAvailable();
  return getOllamaModels().map((m) => ({
    id: m.id,
    fullId: `ollama/${m.id}`,
    name: m.name,
    provider: "ollama",
    contextWindow: m.contextWindow,
    maxTokens: m.maxTokens,
    reasoning: m.reasoning,
    costInputPerM: 0,
    costOutputPerM: 0,
    available: ollamaAvailable,
  }));
}
