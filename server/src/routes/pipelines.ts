import { Router } from "express";
import { eq, asc } from "drizzle-orm";
import type { Db } from "@zerohand/db";
import { pipelines, pipelineSteps } from "@zerohand/db";
import type { ApiPipeline, ApiPipelineStep } from "@zerohand/shared";

function toApiStep(row: typeof pipelineSteps.$inferSelect): ApiPipelineStep {
  return {
    id: row.id,
    stepIndex: row.stepIndex,
    name: row.name,
    skillName: row.skillName ?? null,
    promptTemplate: row.promptTemplate,
    timeoutSeconds: row.timeoutSeconds,
    approvalRequired: row.approvalRequired,
    metadata: (row.metadata as Record<string, unknown>) ?? null,
  };
}

async function loadPipelineWithSteps(db: Db, pipelineId: string): Promise<ApiPipeline | null> {
  const pipeline = await db.query.pipelines.findFirst({ where: eq(pipelines.id, pipelineId) });
  if (!pipeline) return null;

  const steps = await db.query.pipelineSteps.findMany({
    where: eq(pipelineSteps.pipelineId, pipelineId),
    orderBy: [asc(pipelineSteps.stepIndex)],
  });

  return {
    id: pipeline.id,
    name: pipeline.name,
    description: pipeline.description,
    status: pipeline.status,
    inputSchema: (pipeline.inputSchema as Record<string, unknown>) ?? null,
    systemPrompt: pipeline.systemPrompt ?? null,
    modelProvider: pipeline.modelProvider ?? null,
    modelName: pipeline.modelName ?? null,
    createdAt: pipeline.createdAt.toISOString(),
    steps: steps.map((s) => toApiStep(s)),
  };
}

export function createPipelinesRouter(db: Db): Router {
  const router = Router();

  router.get("/pipelines", async (_req, res, next) => {
    try {
      const rows = await db.select().from(pipelines).orderBy(pipelines.name);
      // Return without steps for list view (cheaper)
      res.json(
        rows.map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description,
          status: p.status,
          inputSchema: (p.inputSchema as Record<string, unknown>) ?? null,
          systemPrompt: p.systemPrompt ?? null,
          modelProvider: p.modelProvider ?? null,
          modelName: p.modelName ?? null,
          createdAt: p.createdAt.toISOString(),
          steps: [],
        })),
      );
    } catch (err) {
      next(err);
    }
  });

  router.get("/pipelines/:id", async (req, res, next) => {
    try {
      const result = await loadPipelineWithSteps(db, req.params.id);
      if (!result) return res.status(404).json({ error: "Pipeline not found" });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  router.post("/pipelines", async (req, res, next) => {
    try {
      const body = req.body as Partial<typeof pipelines.$inferInsert>;
      const [row] = await db
        .insert(pipelines)
        .values({
          name: body.name ?? "Unnamed Pipeline",
          description: body.description,
          status: body.status ?? "active",
          inputSchema: body.inputSchema,
        })
        .returning();
      const result = await loadPipelineWithSteps(db, row.id);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  });

  router.patch("/pipelines/:id", async (req, res, next) => {
    try {
      const body = req.body as Partial<typeof pipelines.$inferInsert>;
      const [row] = await db
        .update(pipelines)
        .set({ ...body, updatedAt: new Date() })
        .where(eq(pipelines.id, req.params.id))
        .returning();
      if (!row) return res.status(404).json({ error: "Pipeline not found" });
      const result = await loadPipelineWithSteps(db, row.id);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  router.delete("/pipelines/:id", async (req, res, next) => {
    try {
      const deleted = await db.delete(pipelines).where(eq(pipelines.id, req.params.id)).returning();
      if (deleted.length === 0) return res.status(404).json({ error: "Pipeline not found" });
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  // Steps sub-resource
  router.get("/pipelines/:id/steps", async (req, res, next) => {
    try {
      const steps = await db.query.pipelineSteps.findMany({
        where: eq(pipelineSteps.pipelineId, req.params.id),
        orderBy: [asc(pipelineSteps.stepIndex)],
      });
      res.json(steps.map((s) => toApiStep(s)));
    } catch (err) {
      next(err);
    }
  });

  router.post("/pipelines/:id/steps", async (req, res, next) => {
    try {
      const body = req.body as Partial<typeof pipelineSteps.$inferInsert>;
      const [row] = await db
        .insert(pipelineSteps)
        .values({
          pipelineId: req.params.id,
          stepIndex: body.stepIndex ?? 0,
          name: body.name ?? "Unnamed Step",
          skillName: body.skillName ?? null,
          promptTemplate: body.promptTemplate ?? "",
          timeoutSeconds: body.timeoutSeconds ?? 300,
          approvalRequired: body.approvalRequired ?? false,
        })
        .returning();
      res.status(201).json(toApiStep(row));
    } catch (err) {
      next(err);
    }
  });

  router.patch("/pipelines/:pipelineId/steps/:stepId", async (req, res, next) => {
    try {
      const body = req.body as Partial<typeof pipelineSteps.$inferInsert>;
      const [row] = await db
        .update(pipelineSteps)
        .set({ ...body, updatedAt: new Date() })
        .where(eq(pipelineSteps.id, req.params.stepId))
        .returning();
      if (!row) return res.status(404).json({ error: "Step not found" });
      res.json(toApiStep(row));
    } catch (err) {
      next(err);
    }
  });

  router.delete("/pipelines/:pipelineId/steps/:stepId", async (req, res, next) => {
    try {
      const deleted = await db
        .delete(pipelineSteps)
        .where(eq(pipelineSteps.id, req.params.stepId))
        .returning();
      if (deleted.length === 0) return res.status(404).json({ error: "Step not found" });
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  return router;
}
