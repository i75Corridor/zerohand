import { Router } from "express";
import { eq, desc, asc } from "drizzle-orm";
import type { Db } from "@pawn/db";
import { pipelineRuns, stepRuns, stepRunEvents, pipelines } from "@pawn/db";
import { createRun } from "../services/run-factory.js";
import type { ApiPipelineRun, ApiStepRun, RunStepSnapshot } from "@pawn/shared";

function toApiRun(row: typeof pipelineRuns.$inferSelect, pipelineName?: string): ApiPipelineRun {
  const meta = (row.metadata as Record<string, unknown> | null) ?? {};
  const stepSnapshot = Array.isArray(meta.steps) ? (meta.steps as RunStepSnapshot[]) : undefined;
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
    stepSnapshot,
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
      const { pipelineId, inputParams = {}, triggerType = "manual", executionMode } = req.body as {
        pipelineId: string;
        inputParams?: Record<string, unknown>;
        triggerType?: string;
        executionMode?: "step_by_step";
      };

      const pipeline = await db.query.pipelines.findFirst({ where: eq(pipelines.id, pipelineId) });
      if (!pipeline) return res.status(404).json({ error: "Pipeline not found" });

      const run = await createRun(db, {
        pipelineId,
        inputParams,
        triggerType,
        metadata: executionMode ? { executionMode } : {},
      });

      res.status(201).json(toApiRun(run, pipeline.name));
    } catch (err) {
      next(err);
    }
  });

  // Resume a paused run (step-by-step or approval)
  router.post("/runs/:id/resume", async (req, res, next) => {
    try {
      const [row] = await db
        .update(pipelineRuns)
        .set({ status: "queued", updatedAt: new Date() })
        .where(eq(pipelineRuns.id, req.params.id))
        .returning();
      if (!row) return res.status(404).json({ error: "Run not found" });
      res.json(toApiRun(row));
    } catch (err) {
      next(err);
    }
  });

  // Re-run a specific step: reset it to queued and re-queue the whole run
  router.post("/runs/:id/steps/:stepRunId/rerun", async (req, res, next) => {
    try {
      const stepRun = await db.query.stepRuns.findFirst({ where: eq(stepRuns.id, req.params.stepRunId) });
      if (!stepRun) return res.status(404).json({ error: "Step run not found" });

      await db.update(stepRuns).set({
        status: "queued",
        output: null,
        error: null,
        startedAt: null,
        finishedAt: null,
        updatedAt: new Date(),
      }).where(eq(stepRuns.id, req.params.stepRunId));

      const [run] = await db
        .update(pipelineRuns)
        .set({ status: "queued", error: null, finishedAt: null, updatedAt: new Date() })
        .where(eq(pipelineRuns.id, req.params.id))
        .returning();
      if (!run) return res.status(404).json({ error: "Run not found" });

      res.json(toApiRun(run));
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
