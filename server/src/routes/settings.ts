import { Router } from "express";
import { eq } from "drizzle-orm";
import type { Db } from "@zerohand/db";
import { settings } from "@zerohand/db";
import type { ApiSetting } from "@zerohand/shared";
import { invalidateModelCostsCache } from "../services/budget-guard.js";

function toApi(row: typeof settings.$inferSelect): ApiSetting {
  return {
    key: row.key,
    value: row.value,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function createSettingsRouter(db: Db): Router {
  const router = Router();

  router.get("/settings", async (_req, res, next) => {
    try {
      const rows = await db.select().from(settings);
      res.json(rows.map(toApi));
    } catch (err) {
      next(err);
    }
  });

  router.get("/settings/:key", async (req, res, next) => {
    try {
      const row = await db.query.settings.findFirst({
        where: eq(settings.key, req.params.key),
      });
      if (!row) return res.status(404).json({ error: "Setting not found" });
      res.json(toApi(row));
    } catch (err) {
      next(err);
    }
  });

  router.put("/settings/:key", async (req, res, next) => {
    try {
      const { value } = req.body as { value: unknown };
      const [row] = await db
        .insert(settings)
        .values({ key: req.params.key, value, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: settings.key,
          set: { value, updatedAt: new Date() },
        })
        .returning();

      // Invalidate the model costs cache whenever pricing is updated
      if (req.params.key === "model_costs") {
        invalidateModelCostsCache();
      }

      res.json(toApi(row));
    } catch (err) {
      next(err);
    }
  });

  return router;
}
