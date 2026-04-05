import { Router } from "express";
import { asc, eq } from "drizzle-orm";
import type { Db } from "@zerohand/db";
import { triggers } from "@zerohand/db";
import type { ApiTrigger } from "@zerohand/shared";
import { computeNextRun } from "../services/trigger-manager.js";
import type { WsManager } from "../ws/index.js";

function toApi(row: typeof triggers.$inferSelect): ApiTrigger {
  return {
    id: row.id,
    pipelineId: row.pipelineId,
    type: row.type as "cron" | "webhook" | "channel",
    enabled: row.enabled,
    cronExpression: row.cronExpression,
    timezone: row.timezone,
    defaultInputs: (row.defaultInputs as Record<string, unknown>) ?? {},
    nextRunAt: row.nextRunAt?.toISOString() ?? null,
    lastFiredAt: row.lastFiredAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    channelType: row.channelType ?? null,
    channelConfig: row.channelConfig ?? null,
  };
}

export function createTriggersRouter(db: Db, ws: WsManager): Router {
  const router = Router();

  router.get("/pipelines/:pipelineId/triggers", async (req, res, next) => {
    try {
      const rows = await db
        .select()
        .from(triggers)
        .where(eq(triggers.pipelineId, req.params.pipelineId))
        .orderBy(asc(triggers.createdAt));
      res.json(rows.map(toApi));
    } catch (err) {
      next(err);
    }
  });

  router.post("/pipelines/:pipelineId/triggers", async (req, res, next) => {
    try {
      const body = req.body as Partial<typeof triggers.$inferInsert> & {
        channelType?: string;
        channelConfig?: Record<string, unknown>;
      };
      const type = body.type ?? "cron";
      const tz = body.timezone ?? "UTC";

      if (type === "channel") {
        const [row] = await db
          .insert(triggers)
          .values({
            pipelineId: req.params.pipelineId,
            type: "channel",
            enabled: body.enabled ?? true,
            channelType: body.channelType,
            channelConfig: body.channelConfig,
            timezone: tz,
            defaultInputs: body.defaultInputs,
          })
          .returning();
        res.status(201).json(toApi(row));
        ws.broadcast({ type: "data_changed", entity: "trigger", action: "created", id: row.id });
        return;
      }

      const nextRunAt = body.cronExpression ? computeNextRun(body.cronExpression, tz) : null;
      const [row] = await db
        .insert(triggers)
        .values({
          pipelineId: req.params.pipelineId,
          type,
          enabled: body.enabled ?? true,
          cronExpression: body.cronExpression,
          timezone: tz,
          nextRunAt,
          defaultInputs: body.defaultInputs,
        })
        .returning();
      res.status(201).json(toApi(row));
      ws.broadcast({ type: "data_changed", entity: "trigger", action: "created", id: row.id });
    } catch (err) {
      next(err);
    }
  });

  router.patch("/triggers/:id", async (req, res, next) => {
    try {
      const body = req.body as Partial<typeof triggers.$inferInsert>;
      const updates: Record<string, unknown> = { ...body, updatedAt: new Date() };
      if (body.cronExpression) {
        updates.nextRunAt = computeNextRun(body.cronExpression, (body.timezone as string) ?? "UTC");
      }
      const [row] = await db
        .update(triggers)
        .set(updates)
        .where(eq(triggers.id, req.params.id))
        .returning();
      if (!row) return res.status(404).json({ error: "Trigger not found" });
      res.json(toApi(row));
      ws.broadcast({ type: "data_changed", entity: "trigger", action: "updated", id: row.id });
    } catch (err) {
      next(err);
    }
  });

  router.delete("/triggers/:id", async (req, res, next) => {
    try {
      const deleted = await db
        .delete(triggers)
        .where(eq(triggers.id, req.params.id))
        .returning();
      if (deleted.length === 0) return res.status(404).json({ error: "Trigger not found" });
      res.status(204).send();
      ws.broadcast({ type: "data_changed", entity: "trigger", action: "deleted", id: req.params.id });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
