import { Router } from "express";
import { eq } from "drizzle-orm";
import type { Db } from "@zerohand/db";
import { workers } from "@zerohand/db";
import type { ApiWorker } from "@zerohand/shared";

function toApiWorker(row: typeof workers.$inferSelect): ApiWorker {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    workerType: row.workerType as ApiWorker["workerType"],
    modelProvider: row.modelProvider,
    modelName: row.modelName,
    status: row.status as ApiWorker["status"],
    skills: row.skills as string[],
    budgetMonthlyCents: row.budgetMonthlyCents,
    spentMonthlyCents: row.spentMonthlyCents,
  };
}

export function createWorkersRouter(db: Db): Router {
  const router = Router();

  router.get("/workers", async (_req, res, next) => {
    try {
      const rows = await db.select().from(workers).orderBy(workers.name);
      res.json(rows.map(toApiWorker));
    } catch (err) {
      next(err);
    }
  });

  router.get("/workers/:id", async (req, res, next) => {
    try {
      const row = await db.query.workers.findFirst({ where: eq(workers.id, req.params.id) });
      if (!row) return res.status(404).json({ error: "Worker not found" });
      res.json(toApiWorker(row));
    } catch (err) {
      next(err);
    }
  });

  router.post("/workers", async (req, res, next) => {
    try {
      const body = req.body as Partial<typeof workers.$inferInsert>;
      const [row] = await db
        .insert(workers)
        .values({
          name: body.name ?? "Unnamed Worker",
          description: body.description,
          workerType: body.workerType ?? "pi",
          modelProvider: body.modelProvider ?? "google",
          modelName: body.modelName ?? "gemini-2.5-flash",
          systemPrompt: body.systemPrompt,
          skills: body.skills ?? [],
          customTools: body.customTools ?? [],
          budgetMonthlyCents: body.budgetMonthlyCents ?? 0,
        })
        .returning();
      res.status(201).json(toApiWorker(row));
    } catch (err) {
      next(err);
    }
  });

  router.patch("/workers/:id", async (req, res, next) => {
    try {
      const body = req.body as Partial<typeof workers.$inferInsert>;
      const [row] = await db
        .update(workers)
        .set({ ...body, updatedAt: new Date() })
        .where(eq(workers.id, req.params.id))
        .returning();
      if (!row) return res.status(404).json({ error: "Worker not found" });
      res.json(toApiWorker(row));
    } catch (err) {
      next(err);
    }
  });

  router.delete("/workers/:id", async (req, res, next) => {
    try {
      const deleted = await db.delete(workers).where(eq(workers.id, req.params.id)).returning();
      if (deleted.length === 0) return res.status(404).json({ error: "Worker not found" });
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  return router;
}
