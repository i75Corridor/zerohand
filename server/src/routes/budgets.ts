import { Router } from "express";
import { and, eq } from "drizzle-orm";
import type { Db } from "@zerohand/db";
import { budgetPolicies } from "@zerohand/db";
import type { ApiBudgetPolicy } from "@zerohand/shared";

function toApi(row: typeof budgetPolicies.$inferSelect): ApiBudgetPolicy {
  return {
    id: row.id,
    scopeType: row.scopeType as "worker" | "pipeline",
    scopeId: row.scopeId,
    amountCents: row.amountCents,
    windowKind: row.windowKind as "calendar_month" | "lifetime",
    warnPercent: row.warnPercent,
    hardStopEnabled: row.hardStopEnabled,
    createdAt: row.createdAt.toISOString(),
  };
}

export function createBudgetsRouter(db: Db): Router {
  const router = Router();

  router.get("/budgets", async (req, res, next) => {
    try {
      const { scopeType, scopeId } = req.query as Record<string, string>;
      let rows = await db.select().from(budgetPolicies);
      if (scopeType) rows = rows.filter((r) => r.scopeType === scopeType);
      if (scopeId) rows = rows.filter((r) => r.scopeId === scopeId);
      res.json(rows.map(toApi));
    } catch (err) {
      next(err);
    }
  });

  router.post("/budgets", async (req, res, next) => {
    try {
      const body = req.body as Partial<typeof budgetPolicies.$inferInsert>;
      const [row] = await db
        .insert(budgetPolicies)
        .values({
          scopeType: body.scopeType!,
          scopeId: body.scopeId!,
          amountCents: body.amountCents!,
          windowKind: body.windowKind ?? "calendar_month",
          warnPercent: body.warnPercent ?? 80,
          hardStopEnabled: body.hardStopEnabled ?? true,
        })
        .returning();
      res.status(201).json(toApi(row));
    } catch (err) {
      next(err);
    }
  });

  router.patch("/budgets/:id", async (req, res, next) => {
    try {
      const body = req.body as Partial<typeof budgetPolicies.$inferInsert>;
      const [row] = await db
        .update(budgetPolicies)
        .set({ ...body, updatedAt: new Date() })
        .where(eq(budgetPolicies.id, req.params.id))
        .returning();
      if (!row) return res.status(404).json({ error: "Budget policy not found" });
      res.json(toApi(row));
    } catch (err) {
      next(err);
    }
  });

  router.delete("/budgets/:id", async (req, res, next) => {
    try {
      const deleted = await db
        .delete(budgetPolicies)
        .where(eq(budgetPolicies.id, req.params.id))
        .returning();
      if (deleted.length === 0) return res.status(404).json({ error: "Budget policy not found" });
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  return router;
}
