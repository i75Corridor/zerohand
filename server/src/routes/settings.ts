import { Router } from "express";
import { eq } from "drizzle-orm";
import type { Db } from "@pawn/db";
import { settings } from "@pawn/db";
import type { ApiSetting } from "@pawn/shared";
import { invalidateModelCostsCache } from "../services/budget-guard.js";
import { validateDatabaseConfig, maskDatabaseConfig } from "../services/database-config.js";
import type { DatabaseConfig } from "../services/database-config.js";

function maskSensitiveSetting(row: typeof settings.$inferSelect): ApiSetting {
  const base: ApiSetting = {
    key: row.key,
    value: row.value,
    updatedAt: row.updatedAt.toISOString(),
  };
  if (row.key === "database_config" && row.value && typeof row.value === "object") {
    base.value = maskDatabaseConfig(row.value as DatabaseConfig);
  }
  return base;
}

function toApi(row: typeof settings.$inferSelect): ApiSetting {
  return maskSensitiveSetting(row);
}

const MODEL_KEYS = new Set(["agent_model", "default_pipeline_model"]);

export function createSettingsRouter(db: Db, onModelChange?: () => void): Router {
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

      // Invalidate caches whenever related settings change
      if (req.params.key === "model_costs") {
        invalidateModelCostsCache();
      }
      if (MODEL_KEYS.has(req.params.key) && onModelChange) {
        onModelChange();
      }

      res.json(toApi(row));
    } catch (err) {
      next(err);
    }
  });

  router.post("/settings/validate", async (req, res, next) => {
    try {
      const { key, value } = req.body as { key: string; value: unknown };
      if (key === "database_config") {
        const result = validateDatabaseConfig(value);
        if (result.valid) {
          res.json({ valid: true });
        } else {
          res.json({ valid: false, errors: result.errors });
        }
      } else {
        res.json({ valid: true });
      }
    } catch (err) {
      next(err);
    }
  });

  return router;
}
