import { Router } from "express";
import { sql, gte, lte, and, inArray, eq } from "drizzle-orm";
import type { Db } from "@pawn/db";
import { pipelineRuns, costEvents, pipelines } from "@pawn/db";

export function createStatsRouter(db: Db): Router {
  const router = Router();

  router.get("/stats", async (_req, res, next) => {
    try {
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      const [runsThisMonthResult, activeRunsResult, costResult] = await Promise.all([
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(pipelineRuns)
          .where(gte(pipelineRuns.createdAt, monthStart)),

        db
          .select({ count: sql<number>`count(*)::int` })
          .from(pipelineRuns)
          .where(inArray(pipelineRuns.status, ["queued", "running", "paused"])),

        db
          .select({ total: sql<number>`coalesce(sum(cost_cents), 0)::int` })
          .from(costEvents)
          .where(gte(costEvents.occurredAt, monthStart)),
      ]);

      res.json({
        runsThisMonth: runsThisMonthResult[0]?.count ?? 0,
        activeRuns: activeRunsResult[0]?.count ?? 0,
        costCentsThisMonth: costResult[0]?.total ?? 0,
      });
    } catch (err) {
      next(err);
    }
  });

  router.get("/stats/costs", async (req, res, next) => {
    try {
      const now = new Date();
      const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1);
      const fromDate = req.query.from ? new Date(req.query.from as string) : defaultFrom;
      const toDate = req.query.to
        ? new Date((req.query.to as string) + "T23:59:59.999Z")
        : now;

      const rangeFilter = and(
        gte(costEvents.occurredAt, fromDate),
        lte(costEvents.occurredAt, toDate),
      );

      const [dailyRows, skillRows, pipelineRows] = await Promise.all([
        // Daily aggregation
        db
          .select({
            date: sql<string>`DATE(occurred_at AT TIME ZONE 'UTC')::text`,
            costCents: sql<number>`coalesce(sum(cost_cents), 0)::int`,
          })
          .from(costEvents)
          .where(rangeFilter)
          .groupBy(sql`DATE(occurred_at AT TIME ZONE 'UTC')`)
          .orderBy(sql`DATE(occurred_at AT TIME ZONE 'UTC')`),

        // By skill
        db
          .select({
            skillName: sql<string>`coalesce(skill_name, '(unknown)')`,
            costCents: sql<number>`coalesce(sum(cost_cents), 0)::int`,
          })
          .from(costEvents)
          .where(rangeFilter)
          .groupBy(costEvents.skillName)
          .orderBy(sql`sum(cost_cents) desc`),

        // By pipeline (join pipeline_runs → pipelines)
        db
          .select({
            pipelineName: sql<string>`coalesce(${pipelines.name}, '(unknown)')`,
            costCents: sql<number>`coalesce(sum(${costEvents.costCents}), 0)::int`,
          })
          .from(costEvents)
          .leftJoin(pipelineRuns, eq(costEvents.pipelineRunId, pipelineRuns.id))
          .leftJoin(pipelines, eq(pipelineRuns.pipelineId, pipelines.id))
          .where(rangeFilter)
          .groupBy(pipelines.name)
          .orderBy(sql`sum(${costEvents.costCents}) desc`),
      ]);

      // Summary stats
      const totalThisMonth = dailyRows.reduce((s, r) => s + r.costCents, 0);
      const daysElapsed = Math.max(1, Math.ceil((now.getTime() - fromDate.getTime()) / 86_400_000));
      const dailyAverage = Math.round(totalThisMonth / daysElapsed);
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const projectedMonthEnd = Math.round(dailyAverage * daysInMonth);

      res.json({
        daily: dailyRows,
        bySkill: skillRows,
        byPipeline: pipelineRows,
        summary: {
          totalThisMonth,
          dailyAverage,
          projectedMonthEnd,
          topSkill: skillRows[0]?.skillName ?? null,
          topPipeline: pipelineRows[0]?.pipelineName ?? null,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
