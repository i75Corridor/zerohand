import type { ApiModelEntry } from "@pawn/shared";
import { getModel } from "@mariozechner/pi-ai";
import { getCustomProviderModels } from "./custom-providers.js";

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

/**
 * Resolve a model by provider and ID.
 * Tries pi-ai's registry first, then falls back to Ollama cache for provider "ollama".
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function resolveModel(provider: string, modelId: string): any {
  const piModel = getModel(provider as any, modelId as any);
  if (piModel) return piModel;

  if (provider === "ollama") {
    const ollamaModels = getOllamaModels();
    const found = ollamaModels.find((m) => m.id === modelId);
    if (found) return found;
    if (ollamaModels.length === 0) {
      throw new Error("Ollama is not available — ensure Ollama is running and OLLAMA_HOST is set");
    }
    throw new Error(`Model not found in Ollama: ${modelId}`);
  }

  // Fallback: check custom provider models
  const customModel = getCustomProviderModels().find((m) => m.provider === provider && m.id === modelId);
  if (customModel) return customModel;

  throw new Error(`Model not found: ${provider}/${modelId}`);
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
