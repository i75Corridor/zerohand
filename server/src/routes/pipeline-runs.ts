import { Router } from "express";
import { eq, desc, asc } from "drizzle-orm";
import type { Db } from "@zerohand/db";
import { pipelineRuns, stepRuns, stepRunEvents, pipelines } from "@zerohand/db";
import type { ApiPipelineRun, ApiStepRun } from "@zerohand/shared";

function toApiRun(row: typeof pipelineRuns.$inferSelect, pipelineName?: string): ApiPipelineRun {
  return {
    id: row.id,
    pipelineId: row.pipelineId,
    pipelineName,
    status: row.status as ApiPipelineRun["status"],
    inputParams: row.inputParams as Record<string, unknown>,
    output: (row.output as Record<string, unknown> | null) ?? null,
    triggerType: row.triggerType,
    startedAt: row.startedAt?.toISOString() ?? null,
    finishedAt: row.finishedAt?.toISOString() ?? null,
    error: row.error,
    createdAt: row.createdAt.toISOString(),
  };
}

function toApiStepRun(row: typeof stepRuns.$inferSelect): ApiStepRun {
  return {
    id: row.id,
    pipelineRunId: row.pipelineRunId,
    stepIndex: row.stepIndex,
    status: row.status as ApiStepRun["status"],
    output: row.output as Record<string, unknown> | null,
    error: row.error,
    startedAt: row.startedAt?.toISOString() ?? null,
    finishedAt: row.finishedAt?.toISOString() ?? null,
  };
}

export function createPipelineRunsRouter(db: Db): Router {
  const router = Router();

  router.get("/runs", async (req, res, next) => {
    try {
      const pipelineId = req.query.pipelineId as string | undefined;
      const rows = await db
        .select({
          run: pipelineRuns,
          pipelineName: pipelines.name,
        })
        .from(pipelineRuns)
        .leftJoin(pipelines, eq(pipelineRuns.pipelineId, pipelines.id))
        .where(pipelineId ? eq(pipelineRuns.pipelineId, pipelineId) : undefined)
        .orderBy(desc(pipelineRuns.createdAt))
        .limit(100);

      res.json(rows.map((r) => toApiRun(r.run, r.pipelineName ?? undefined)));
    } catch (err) {
      next(err);
    }
  });

  router.get("/runs/:id", async (req, res, next) => {
    try {
      const rows = await db
        .select({ run: pipelineRuns, pipelineName: pipelines.name })
        .from(pipelineRuns)
        .leftJoin(pipelines, eq(pipelineRuns.pipelineId, pipelines.id))
        .where(eq(pipelineRuns.id, req.params.id));

      if (rows.length === 0) return res.status(404).json({ error: "Run not found" });
      const { run, pipelineName } = rows[0];
      res.json(toApiRun(run, pipelineName ?? undefined));
    } catch (err) {
      next(err);
    }
  });

  router.post("/runs", async (req, res, next) => {
    try {
      const { pipelineId, inputParams = {}, triggerType = "manual" } = req.body as {
        pipelineId: string;
        inputParams?: Record<string, unknown>;
        triggerType?: string;
      };

      const pipeline = await db.query.pipelines.findFirst({ where: eq(pipelines.id, pipelineId) });
      if (!pipeline) return res.status(404).json({ error: "Pipeline not found" });

      const [run] = await db
        .insert(pipelineRuns)
        .values({ pipelineId, inputParams, triggerType })
        .returning();

      res.status(201).json(toApiRun(run, pipeline.name));
    } catch (err) {
      next(err);
    }
  });

  router.post("/runs/:id/cancel", async (req, res, next) => {
    try {
      const [row] = await db
        .update(pipelineRuns)
        .set({ status: "cancelled", finishedAt: new Date(), updatedAt: new Date() })
        .where(eq(pipelineRuns.id, req.params.id))
        .returning();
      if (!row) return res.status(404).json({ error: "Run not found" });
      res.json(toApiRun(row));
    } catch (err) {
      next(err);
    }
  });

  router.get("/runs/:id/steps", async (req, res, next) => {
    try {
      const rows = await db
        .select()
        .from(stepRuns)
        .where(eq(stepRuns.pipelineRunId, req.params.id))
        .orderBy(asc(stepRuns.stepIndex));

      res.json(rows.map((r) => toApiStepRun(r)));
    } catch (err) {
      next(err);
    }
  });

  router.get("/runs/:id/steps/:stepRunId/events", async (req, res, next) => {
    try {
      const events = await db
        .select()
        .from(stepRunEvents)
        .where(eq(stepRunEvents.stepRunId, req.params.stepRunId))
        .orderBy(asc(stepRunEvents.seq));

      res.json(events);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
