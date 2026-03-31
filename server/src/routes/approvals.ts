import { Router } from "express";
import { eq, desc } from "drizzle-orm";
import type { Db } from "@zerohand/db";
import { approvals, pipelineRuns, stepRuns, pipelines } from "@zerohand/db";
import type { ApiApproval } from "@zerohand/shared";
import type { WsManager } from "../ws/index.js";

function toApi(
  row: typeof approvals.$inferSelect,
  extra?: { pipelineName?: string; stepName?: string },
): ApiApproval {
  return {
    id: row.id,
    pipelineRunId: row.pipelineRunId,
    stepRunId: row.stepRunId ?? null,
    status: row.status as "pending" | "approved" | "rejected",
    payload: (row.payload as Record<string, unknown>) ?? {},
    decisionNote: row.decisionNote ?? null,
    decidedAt: row.decidedAt?.toISOString() ?? null,
    pipelineName: extra?.pipelineName,
    stepName: extra?.stepName,
    createdAt: row.createdAt.toISOString(),
  };
}

export function createApprovalsRouter(db: Db, ws: WsManager): Router {
  const router = Router();

  router.get("/approvals", async (req, res, next) => {
    try {
      const status = typeof req.query.status === "string" ? req.query.status : "pending";
      const rows = await db
        .select({
          approval: approvals,
          pipelineName: pipelines.name,
        })
        .from(approvals)
        .leftJoin(pipelineRuns, eq(approvals.pipelineRunId, pipelineRuns.id))
        .leftJoin(pipelines, eq(pipelineRuns.pipelineId, pipelines.id))
        .where(eq(approvals.status, status))
        .orderBy(desc(approvals.createdAt));

      res.json(
        rows.map((r) =>
          toApi(r.approval, {
            pipelineName: r.pipelineName ?? undefined,
            stepName: (r.approval.payload as Record<string, unknown>)?.stepName as string | undefined,
          }),
        ),
      );
    } catch (err) {
      next(err);
    }
  });

  router.get("/approvals/:id", async (req, res, next) => {
    try {
      const row = await db.query.approvals.findFirst({
        where: eq(approvals.id, req.params.id),
      });
      if (!row) return res.status(404).json({ error: "Approval not found" });
      res.json(toApi(row));
    } catch (err) {
      next(err);
    }
  });

  async function decide(
    req: Parameters<Parameters<typeof router.post>[1]>[0],
    res: Parameters<Parameters<typeof router.post>[1]>[1],
    next: Parameters<Parameters<typeof router.post>[1]>[2],
    decision: "approved" | "rejected",
  ) {
    try {
      const { note } = req.body as { note?: string };
      const [approval] = await db
        .update(approvals)
        .set({
          status: decision,
          decisionNote: note ?? null,
          decidedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(approvals.id, String(req.params.id)))
        .returning();

      if (!approval) return res.status(404).json({ error: "Approval not found" });

      // If approved, re-queue the pipeline run so the engine picks it up
      if (decision === "approved") {
        await db
          .update(pipelineRuns)
          .set({ status: "queued", updatedAt: new Date() })
          .where(eq(pipelineRuns.id, approval.pipelineRunId));
        ws.broadcast({ type: "run_status", pipelineRunId: approval.pipelineRunId, status: "queued" });
      }

      // If rejected, fail the run
      if (decision === "rejected") {
        const reason = note ? `Step rejected: ${note}` : "Step rejected by operator";
        await db
          .update(pipelineRuns)
          .set({ status: "failed", error: reason, finishedAt: new Date(), updatedAt: new Date() })
          .where(eq(pipelineRuns.id, approval.pipelineRunId));

        if (approval.stepRunId) {
          await db
            .update(stepRuns)
            .set({ status: "failed", error: reason, finishedAt: new Date(), updatedAt: new Date() })
            .where(eq(stepRuns.id, approval.stepRunId));
        }

        ws.broadcast({ type: "run_status", pipelineRunId: approval.pipelineRunId, status: "failed" });
      }

      res.json(toApi(approval));
    } catch (err) {
      next(err);
    }
  }

  router.post("/approvals/:id/approve", (req, res, next) => decide(req, res, next, "approved"));
  router.post("/approvals/:id/reject", (req, res, next) => decide(req, res, next, "rejected"));

  return router;
}
