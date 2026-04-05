import { count, eq, sql, gte, desc, and } from "drizzle-orm";
import type { Db } from "@zerohand/db";
import { pipelineRuns, pipelines, approvals, costEvents } from "@zerohand/db";

export interface DashboardContext {
  activeRuns: number;
  runsThisMonth: number;
  costCentsThisMonth: number;
  pendingApprovals: number;
  recentFailures: { pipeline: string; error: string; createdAt: Date }[];
  navigation?: { path: string; pipelineName?: string; runStatus?: string; runStepIndex?: number; runTotalSteps?: number };
}

export async function buildDashboardContext(
  db: Db,
  navigation?: { path: string; pipelineId?: string; runId?: string },
): Promise<DashboardContext> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const [activeRunsResult, runsThisMonthResult, costResult, pendingApprovalsResult, failuresResult, navResult] =
    await Promise.all([
      // Active runs
      db.select({ count: count() })
        .from(pipelineRuns)
        .where(sql`${pipelineRuns.status} IN ('running', 'queued', 'paused')`),

      // Runs this month
      db.select({ count: count() })
        .from(pipelineRuns)
        .where(gte(pipelineRuns.createdAt, monthStart)),

      // Cost this month
      db.select({ total: sql<number>`coalesce(sum(${costEvents.costCents}), 0)` })
        .from(costEvents)
        .where(gte(costEvents.occurredAt, monthStart)),

      // Pending approvals count
      db.select({ count: count() })
        .from(approvals)
        .where(eq(approvals.status, "pending")),

      // Recent failures (last 24h, limit 5)
      db.query.pipelineRuns.findMany({
        where: and(
          eq(pipelineRuns.status, "failed"),
          gte(pipelineRuns.createdAt, oneDayAgo),
        ),
        orderBy: [desc(pipelineRuns.createdAt)],
        limit: 5,
        with: { pipeline: { columns: { name: true } } } as any,
      }),

      // Navigation context (pipeline name + run status)
      resolveNavigation(db, navigation),
    ]);

  return {
    activeRuns: activeRunsResult[0]?.count ?? 0,
    runsThisMonth: runsThisMonthResult[0]?.count ?? 0,
    costCentsThisMonth: Number(costResult[0]?.total ?? 0),
    pendingApprovals: pendingApprovalsResult[0]?.count ?? 0,
    recentFailures: (failuresResult as any[]).map((r) => ({
      pipeline: r.pipeline?.name ?? "Unknown",
      error: truncate(r.error ?? "", 150),
      createdAt: r.createdAt,
    })),
    navigation: navResult,
  };
}

async function resolveNavigation(
  db: Db,
  navigation?: { path: string; pipelineId?: string; runId?: string },
): Promise<DashboardContext["navigation"]> {
  if (!navigation?.path) return undefined;

  const result: NonNullable<DashboardContext["navigation"]> = { path: navigation.path };

  if (navigation.pipelineId) {
    try {
      const p = await db.query.pipelines.findFirst({ where: eq(pipelines.id, navigation.pipelineId) });
      if (p) result.pipelineName = p.name;
    } catch { /* ignore */ }
  }

  if (navigation.runId) {
    try {
      const r = await db.query.pipelineRuns.findFirst({ where: eq(pipelineRuns.id, navigation.runId) });
      if (r) result.runStatus = r.status;
    } catch { /* ignore */ }
  }

  return result;
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 3) + "..." : s;
}

export function formatDashboardContext(ctx: DashboardContext): string {
  const costDollars = (ctx.costCentsThisMonth / 100).toFixed(2);
  const parts: string[] = [
    `${ctx.activeRuns} active runs`,
    `$${costDollars} cost this month`,
    `${ctx.runsThisMonth} runs this month`,
    `${ctx.pendingApprovals} pending approvals`,
  ];

  let block = `[Dashboard: ${parts.join(" | ")}`;

  if (ctx.recentFailures.length > 0) {
    const failures = ctx.recentFailures
      .map((f) => `"${f.pipeline}": ${f.error}`)
      .join("; ");
    block += ` | Recent failures: ${failures}`;
  }

  block += "]";

  if (ctx.navigation) {
    let nav = `[Navigation: ${ctx.navigation.path}`;
    if (ctx.navigation.pipelineName) nav += ` — pipeline "${ctx.navigation.pipelineName}"`;
    if (ctx.navigation.runStatus) nav += ` — run status: ${ctx.navigation.runStatus}`;
    nav += "]";
    block += `\n${nav}`;
  }

  return block;
}
