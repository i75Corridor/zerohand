import { Router } from "express";
import { sql, gte, inArray } from "drizzle-orm";
import type { Db } from "@zerohand/db";
import { pipelineRuns, costEvents } from "@zerohand/db";

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

  return router;
}
