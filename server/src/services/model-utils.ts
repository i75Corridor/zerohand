import { getProviders, getModels, getEnvApiKey } from "@mariozechner/pi-ai";
import { eq } from "drizzle-orm";
import type { Db } from "@pawn/db";
import { settings } from "@pawn/db";
import type { ApiModelEntry } from "@pawn/shared";
import { ollamaModelsToApiEntries } from "./ollama-provider.js";
import { customProviderModelsToApiEntries } from "./custom-providers.js";

// Providers that require OAuth (no simple env var API key) — skip for now
const OAUTH_ONLY_PROVIDERS = new Set([
  "google-gemini-cli",
  "google-antigravity",
  "google-vertex",
  "github-copilot",
  "openai-codex",
  "amazon-bedrock",
  "azure-openai-responses",
]);

export function listAllModels(): ApiModelEntry[] {
  const result: ApiModelEntry[] = [];
  for (const provider of getProviders()) {
    if (OAUTH_ONLY_PROVIDERS.has(provider)) continue;
    const envKey = getEnvApiKey(provider);
    const available = !!envKey;
    try {
      const models = getModels(provider);
      for (const model of models) {
        result.push({
          id: model.id,
          fullId: `${provider}/${model.id}`,
          name: model.name,
          provider,
          contextWindow: model.contextWindow,
          maxTokens: model.maxTokens,
          reasoning: model.reasoning,
          // pi-ai cost values are in dollars per million tokens → convert to cents
          costInputPerM: Math.round(model.cost.input * 100 * 100) / 100,
          costOutputPerM: Math.round(model.cost.output * 100 * 100) / 100,
          available,
        });
      }
    } catch {
      // Skip providers that fail to enumerate models
    }
  }

  // Append Ollama models from background polling cache
  result.push(...ollamaModelsToApiEntries());

  // Append custom provider models from config
  result.push(...customProviderModelsToApiEntries());

  return result;
}

export function parseModelFullId(fullId: string): { provider: string; modelId: string } {
  const slash = fullId.indexOf("/");
  if (slash === -1) return { provider: "google", modelId: fullId };
  return { provider: fullId.slice(0, slash), modelId: fullId.slice(slash + 1) };
}

export async function readModelSetting(
  db: Db,
  key: string,
  fallback: string,
): Promise<{ provider: string; modelId: string }> {
  try {
    const row = await db.query.settings.findFirst({ where: eq(settings.key, key) });
    const stored = row?.value;
    if (typeof stored === "string" && stored.includes("/")) {
      return parseModelFullId(stored);
    }
  } catch {
    // fall through to default
  }
  return parseModelFullId(fallback);
}
