import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { getProviders } from "@mariozechner/pi-ai";
import type { ApiModelEntry } from "@zerohand/shared";
import { dataDir } from "./paths.js";

// ── Types ───────────────────────────────────────────────────────────────────

export interface CustomProviderModelConfig {
  id: string;
  name?: string;
  contextWindow?: number;
  maxTokens?: number;
}

export interface CustomProviderConfig {
  baseUrl: string;
  apiKey?: string;
  models: CustomProviderModelConfig[];
}

export interface CustomProvidersConfig {
  providers: Record<string, CustomProviderConfig>;
}

/** Model shape matching pi-ai's Model<"openai-completions"> */
export interface CustomProviderModel {
  id: string;
  name: string;
  api: "openai-completions";
  provider: string;
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

// ── Module state ────────────────────────────────────────────────────────────

let cachedModels: CustomProviderModel[] = [];
let cachedConfig: CustomProvidersConfig = { providers: {} };

const DEFAULT_CONTEXT_WINDOW = 4096;

// ── Helpers ─────────────────────────────────────────────────────────────────

function configPath(): string {
  return join(dataDir(), "providers.json");
}

function buildModel(
  modelConfig: CustomProviderModelConfig,
  providerName: string,
  baseUrl: string,
): CustomProviderModel {
  const contextWindow = modelConfig.contextWindow ?? DEFAULT_CONTEXT_WINDOW;
  return {
    id: modelConfig.id,
    name: modelConfig.name ?? modelConfig.id,
    api: "openai-completions",
    provider: providerName,
    baseUrl: baseUrl.replace(/\/+$/, ""),
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow,
    maxTokens: modelConfig.maxTokens ?? Math.floor(contextWindow / 2),
    compat: {
      supportsStore: false,
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
    },
  };
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Reads providers.json from DATA_DIR, validates structure, and caches
 * Model objects for each custom provider model.
 */
export function loadCustomProviders(): void {
  const filePath = configPath();

  if (!existsSync(filePath)) {
    cachedModels = [];
    cachedConfig = { providers: {} };
    return;
  }

  let raw: string;
  try {
    raw = readFileSync(filePath, "utf-8");
  } catch (err) {
    console.warn(`[custom-providers] Failed to read ${filePath}:`, err);
    cachedModels = [];
    cachedConfig = { providers: {} };
    return;
  }

  let parsed: CustomProvidersConfig;
  try {
    parsed = JSON.parse(raw) as CustomProvidersConfig;
  } catch {
    console.warn(`[custom-providers] Malformed JSON in ${filePath}`);
    cachedModels = [];
    cachedConfig = { providers: {} };
    return;
  }

  if (!parsed.providers || typeof parsed.providers !== "object") {
    console.warn(`[custom-providers] Missing "providers" key in ${filePath}`);
    cachedModels = [];
    cachedConfig = { providers: {} };
    return;
  }

  const builtInProviders = new Set(getProviders());
  const models: CustomProviderModel[] = [];

  for (const [providerName, providerConfig] of Object.entries(parsed.providers)) {
    if (builtInProviders.has(providerName)) {
      console.warn(
        `[custom-providers] Skipping provider "${providerName}" — conflicts with built-in pi-ai provider`,
      );
      continue;
    }

    if (!providerConfig.baseUrl) {
      console.warn(`[custom-providers] Skipping provider "${providerName}" — missing baseUrl`);
      continue;
    }

    if (!Array.isArray(providerConfig.models)) {
      console.warn(`[custom-providers] Skipping provider "${providerName}" — models is not an array`);
      continue;
    }

    for (const modelConfig of providerConfig.models) {
      if (!modelConfig.id || typeof modelConfig.id !== "string") {
        console.warn(
          `[custom-providers] Skipping model in provider "${providerName}" — missing or invalid "id"`,
        );
        continue;
      }
      models.push(buildModel(modelConfig, providerName, providerConfig.baseUrl));
    }
  }

  cachedModels = models;
  cachedConfig = parsed;
}

/** Returns cached custom provider Model objects (empty array if no config). */
export function getCustomProviderModels(): CustomProviderModel[] {
  return cachedModels;
}

/** Returns the raw parsed config (or empty if no file). */
export function getCustomProviderConfig(): CustomProvidersConfig {
  return cachedConfig;
}

/** Writes config to providers.json and refreshes the cache. */
export function saveCustomProviderConfig(config: CustomProvidersConfig): void {
  const filePath = configPath();
  const dir = dataDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(filePath, JSON.stringify(config, null, 2), "utf-8");
  loadCustomProviders();
}

/** Maps cached custom provider models to ApiModelEntry format. */
export function customProviderModelsToApiEntries(): ApiModelEntry[] {
  return cachedModels.map((m) => ({
    id: m.id,
    fullId: `${m.provider}/${m.id}`,
    name: m.name,
    provider: m.provider,
    contextWindow: m.contextWindow,
    maxTokens: m.maxTokens,
    reasoning: m.reasoning,
    costInputPerM: 0,
    costOutputPerM: 0,
    available: true,
  }));
}
