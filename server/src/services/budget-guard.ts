import { eq } from "drizzle-orm";
import type { Db } from "@pawn/db";
import { costEvents, settings } from "@pawn/db";
import type { ModelCostEntry } from "@pawn/shared";
import { listAllModels } from "./model-utils.js";

const SETTINGS_KEY = "model_costs";
const CACHE_TTL_MS = 60_000;

// Build default pricing from the pi-ai registry (cents per 1M tokens)
function buildDefaultModelCosts(): Record<string, ModelCostEntry> {
  const costs: Record<string, ModelCostEntry> = {};
  for (const m of listAllModels()) {
    if (m.costInputPerM > 0 || m.costOutputPerM > 0) {
      costs[`${m.provider}/${m.id}`] = { inputPerM: m.costInputPerM, outputPerM: m.costOutputPerM };
    }
  }
  return costs;
}

const DEFAULT_MODEL_COSTS: Record<string, ModelCostEntry> = buildDefaultModelCosts();

let cachedCosts: Record<string, ModelCostEntry> | null = null;
let cacheTime = 0;

export async function getModelCosts(db: Db): Promise<Record<string, ModelCostEntry>> {
  const now = Date.now();
  if (cachedCosts && now - cacheTime < CACHE_TTL_MS) return cachedCosts;

  const row = await db.query.settings.findFirst({ where: eq(settings.key, SETTINGS_KEY) });

  if (!row?.value) {
    // Seed defaults on first access
    await db
      .insert(settings)
      .values({ key: SETTINGS_KEY, value: DEFAULT_MODEL_COSTS })
      .onConflictDoNothing();
    cachedCosts = DEFAULT_MODEL_COSTS;
  } else {
    cachedCosts = row.value as Record<string, ModelCostEntry>;
  }

  cacheTime = now;
  return cachedCosts;
}

// Invalidate cache (called after settings update)
export function invalidateModelCostsCache(): void {
  cachedCosts = null;
  cacheTime = 0;
}

export function estimateCostCents(
  costs: Record<string, ModelCostEntry>,
  modelName: string,
  inputTokens: number,
  outputTokens: number,
): number {
  // Ollama models are free — short-circuit to avoid the 50/150 fallback
  if (modelName.startsWith("ollama/")) return 0;

  // Look up by bare name, then by any provider/name key ending in /modelName
  const rates =
    costs[modelName] ??
    Object.entries(costs).find(([k]) => k.endsWith(`/${modelName}`))?.[1] ??
    { inputPerM: 50, outputPerM: 150 };
  return (inputTokens * rates.inputPerM + outputTokens * rates.outputPerM) / 1_000_000;
}

export async function recordCost(
  db: Db,
  stepRunId: string,
  skillName: string,
  runId: string,
  provider: string,
  modelName: string,
  usage: Record<string, unknown>,
): Promise<void> {
  const inputTokens = Number(usage.input_tokens ?? usage.inputTokens ?? usage.input ?? 0);
  const outputTokens = Number(usage.output_tokens ?? usage.outputTokens ?? usage.output ?? 0);
  if (inputTokens === 0 && outputTokens === 0) return;

  const costs = await getModelCosts(db);
  const costCents = estimateCostCents(costs, modelName, inputTokens, outputTokens);

  await db.insert(costEvents).values({
    stepRunId,
    skillName,
    pipelineRunId: runId,
    provider,
    model: modelName,
    inputTokens,
    outputTokens,
    costCents,
  });
}
