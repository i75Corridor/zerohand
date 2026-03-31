import { and, eq, gte, sum } from "drizzle-orm";
import type { Db } from "@zerohand/db";
import { budgetPolicies, costEvents } from "@zerohand/db";

// Rough cost estimates in cents per 1M tokens
const MODEL_COST: Record<string, { inputPerM: number; outputPerM: number }> = {
  "gemini-2.5-flash": { inputPerM: 7.5, outputPerM: 30 },
  "gemini-2.5-pro": { inputPerM: 125, outputPerM: 500 },
  "gemini-2.0-flash": { inputPerM: 7.5, outputPerM: 30 },
  "claude-sonnet-4-6": { inputPerM: 300, outputPerM: 1500 },
  "claude-opus-4-6": { inputPerM: 1500, outputPerM: 7500 },
  "gpt-4o": { inputPerM: 250, outputPerM: 1000 },
};

export function estimateCostCents(
  modelName: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const rates = MODEL_COST[modelName] ?? { inputPerM: 50, outputPerM: 150 };
  return Math.ceil(
    (inputTokens * rates.inputPerM + outputTokens * rates.outputPerM) / 1_000_000,
  );
}

function startOfMonth(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

async function spentCents(
  db: Db,
  scopeType: string,
  scopeId: string,
  windowKind: string,
): Promise<number> {
  const conditions = [
    eq(costEvents.workerId, scopeId),
  ];

  if (scopeType === "pipeline") {
    conditions[0] = eq(costEvents.pipelineRunId, scopeId);
  }

  if (windowKind === "calendar_month") {
    conditions.push(gte(costEvents.occurredAt, startOfMonth()));
  }

  const [row] = await db
    .select({ total: sum(costEvents.costCents) })
    .from(costEvents)
    .where(and(...conditions));

  return Number(row?.total ?? 0);
}

export async function checkBudget(
  db: Db,
  workerId: string,
  pipelineRunId: string,
): Promise<void> {
  const policies = await db
    .select()
    .from(budgetPolicies)
    .where(
      and(
        eq(budgetPolicies.scopeType, "worker"),
        eq(budgetPolicies.scopeId, workerId),
      ),
    );

  for (const policy of policies) {
    const spent = await spentCents(db, "worker", workerId, policy.windowKind);
    const pct = policy.amountCents > 0 ? (spent / policy.amountCents) * 100 : 0;

    if (pct >= policy.warnPercent) {
      console.warn(
        `[BudgetGuard] Worker ${workerId} at ${pct.toFixed(0)}% of budget ` +
          `($${(spent / 100).toFixed(2)} / $${(policy.amountCents / 100).toFixed(2)})`,
      );
    }

    if (policy.hardStopEnabled && spent >= policy.amountCents) {
      throw new Error(
        `Budget exceeded for worker ${workerId}: ` +
          `$${(spent / 100).toFixed(2)} spent of $${(policy.amountCents / 100).toFixed(2)} limit`,
      );
    }
  }
}

export async function recordCost(
  db: Db,
  stepRunId: string,
  workerId: string,
  pipelineRunId: string,
  provider: string,
  modelName: string,
  usage: Record<string, unknown>,
): Promise<void> {
  const inputTokens = Number(usage.input_tokens ?? usage.inputTokens ?? 0);
  const outputTokens = Number(usage.output_tokens ?? usage.outputTokens ?? 0);
  if (inputTokens === 0 && outputTokens === 0) return;

  const costCents = estimateCostCents(modelName, inputTokens, outputTokens);

  await db.insert(costEvents).values({
    stepRunId,
    workerId,
    pipelineRunId,
    provider,
    model: modelName,
    inputTokens,
    outputTokens,
    costCents,
  });
}
