import { writeFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { Router } from "express";
import { eq, asc, ne, inArray, desc, max, sql } from "drizzle-orm";
import type { Db } from "@pawn/db";
import { pipelines, pipelineSteps, pipelineRuns, costEvents, installedPackages, pipelineVersions } from "@pawn/db";
import type { ApiPipeline, ApiPipelineStep } from "@pawn/shared";
import { pipelineToYaml } from "@pawn/shared";
import { skillsDir as getSkillsDir } from "../services/paths.js";
import { validatePipeline } from "../services/tools/validate-pipeline.js";

export function toApiStep(row: typeof pipelineSteps.$inferSelect): ApiPipelineStep {
  return {
    id: row.id,
    stepIndex: row.stepIndex,
    name: row.name,
    skillName: row.skillName ?? null,
    promptTemplate: row.promptTemplate,
    timeoutSeconds: row.timeoutSeconds,
    approvalRequired: row.approvalRequired,
    retryConfig: (row.retryConfig as import("@pawn/shared").RetryConfig) ?? null,
    metadata: (row.metadata as Record<string, unknown>) ?? null,
  };
}

export async function loadPipelineWithSteps(db: Db, pipelineId: string): Promise<ApiPipeline | null> {
  const pipeline = await db.query.pipelines.findFirst({ where: eq(pipelines.id, pipelineId) });
  if (!pipeline) return null;

  const steps = await db.query.pipelineSteps.findMany({
    where: eq(pipelineSteps.pipelineId, pipelineId),
    orderBy: [asc(pipelineSteps.stepIndex)],
  });

  const skillsDir = getSkillsDir();

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
    steps: steps.map((s) => {
      const step = toApiStep(s);
      if (step.skillName) {
        step.skillFound = existsSync(join(skillsDir, step.skillName, "SKILL.md"));
      }
      return step;
    }),
  };
}


/** Save a version snapshot before a destructive edit. Idempotent — safe to call on every patch. */
async function snapshotPipeline(db: Db, pipelineId: string, summary?: string): Promise<void> {
  const pipeline = await loadPipelineWithSteps(db, pipelineId);
  if (!pipeline) return;

  const [row] = await db
    .select({ maxVer: max(pipelineVersions.versionNumber) })
    .from(pipelineVersions)
    .where(eq(pipelineVersions.pipelineId, pipelineId));
  const nextVersion = (row?.maxVer ?? 0) + 1;

  await db.insert(pipelineVersions).values({
    pipelineId,
    versionNumber: nextVersion,
    snapshot: pipeline as unknown as Record<string, unknown>,
    changeSummary: summary ?? null,
  });
}

async function syncLocalPackageToDisk(db: Db, pipelineId: string): Promise<void> {
  const pkgs = await db
    .select()
    .from(installedPackages)
    .where(eq(installedPackages.pipelineId, pipelineId));

  const localPkg = pkgs.find((p) => (p.metadata as Record<string, unknown> | null)?.isLocal === true);
  if (!localPkg) return;

  const localPath = localPkg.localPath;
  if (!existsSync(localPath)) {
    console.warn(`[Local Package] Directory no longer exists, skipping disk write: ${localPath}`);
    return;
  }

  const pipeline = await loadPipelineWithSteps(db, pipelineId);
  if (!pipeline) return;

  writeFileSync(join(localPath, "pipeline.yaml"), pipelineToYaml(pipeline), "utf-8");
  console.log(`[Local Package] Wrote pipeline.yaml to ${localPath}`);
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
      await snapshotPipeline(db, req.params.id, "Before patch");
      const body = req.body as Partial<typeof pipelines.$inferInsert>;
      const [row] = await db
        .update(pipelines)
        .set({ ...body, updatedAt: new Date() })
        .where(eq(pipelines.id, req.params.id))
        .returning();
      if (!row) return res.status(404).json({ error: "Pipeline not found" });
      const result = await loadPipelineWithSteps(db, row.id);
      await syncLocalPackageToDisk(db, row.id);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  router.delete("/pipelines/:id", async (req, res, next) => {
    try {
      // Collect skill names used by this pipeline's steps
      const steps = await db
        .select({ skillName: pipelineSteps.skillName })
        .from(pipelineSteps)
        .where(eq(pipelineSteps.pipelineId, req.params.id));

      const skillNames = [...new Set(
        steps.map((s) => s.skillName).filter((n): n is string => !!n),
      )];

      // Delete in FK dependency order — neither cost_events nor pipeline_runs have cascade deletes
      // 1. cost_events → pipeline_runs (no cascade)
      const runIds = await db
        .select({ id: pipelineRuns.id })
        .from(pipelineRuns)
        .where(eq(pipelineRuns.pipelineId, req.params.id));
      if (runIds.length > 0) {
        await db.delete(costEvents).where(inArray(costEvents.pipelineRunId, runIds.map((r) => r.id)));
      }
      // 2. pipeline_runs → pipeline (no cascade); step_runs cascade from pipeline_runs
      await db.delete(pipelineRuns).where(eq(pipelineRuns.pipelineId, req.params.id));

      // Delete the pipeline (cascade deletes steps and versions via FK)
      const deleted = await db.delete(pipelines).where(eq(pipelines.id, req.params.id)).returning();
      if (deleted.length === 0) return res.status(404).json({ error: "Pipeline not found" });

      // Remove skills from disk that are no longer referenced by any other pipeline
      if (skillNames.length > 0) {
        const stillUsed = await db
          .selectDistinct({ skillName: pipelineSteps.skillName })
          .from(pipelineSteps)
          .where(inArray(pipelineSteps.skillName, skillNames));

        const stillUsedSet = new Set(stillUsed.map((r) => r.skillName).filter(Boolean));
        const skillsDir = getSkillsDir();

        for (const name of skillNames) {
          if (stillUsedSet.has(name)) continue;
          const skillDir = join(skillsDir, name);
          if (existsSync(skillDir)) {
            rmSync(skillDir, { recursive: true, force: true });
            console.log(`[Pipeline Delete] Removed orphaned skill: ${name}`);
          }
        }
      }

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
          retryConfig: body.retryConfig ?? null,
        })
        .returning();
      await syncLocalPackageToDisk(db, req.params.id);
      res.status(201).json(toApiStep(row));
    } catch (err) {
      next(err);
    }
  });

  router.patch("/pipelines/:pipelineId/steps/:stepId", async (req, res, next) => {
    try {
      await snapshotPipeline(db, req.params.pipelineId, "Before step patch");
      const body = req.body as Partial<typeof pipelineSteps.$inferInsert>;
      const [row] = await db
        .update(pipelineSteps)
        .set({ ...body, updatedAt: new Date() })
        .where(eq(pipelineSteps.id, req.params.stepId))
        .returning();
      if (!row) return res.status(404).json({ error: "Step not found" });
      await syncLocalPackageToDisk(db, req.params.pipelineId);
      res.json(toApiStep(row));
    } catch (err) {
      next(err);
    }
  });

  router.delete("/pipelines/:pipelineId/steps/:stepId", async (req, res, next) => {
    try {
      await snapshotPipeline(db, req.params.pipelineId, "Before step delete");
      const deleted = await db
        .delete(pipelineSteps)
        .where(eq(pipelineSteps.id, req.params.stepId))
        .returning();
      if (deleted.length === 0) return res.status(404).json({ error: "Step not found" });
      await syncLocalPackageToDisk(db, req.params.pipelineId);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  // ── Validation ────────────────────────────────────────────────────────────────

  router.post("/pipelines/:id/validate", async (req, res, next) => {
    try {
      const ctx = { db, skillsDir: getSkillsDir() } as any;
      const result = await validatePipeline(req.params.id, ctx);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // ── Version history ───────────────────────────────────────────────────────────

  router.get("/pipelines/:id/versions", async (req, res, next) => {
    try {
      const versions = await db
        .select({
          id: pipelineVersions.id,
          versionNumber: pipelineVersions.versionNumber,
          changeSummary: pipelineVersions.changeSummary,
          createdAt: pipelineVersions.createdAt,
        })
        .from(pipelineVersions)
        .where(eq(pipelineVersions.pipelineId, req.params.id))
        .orderBy(desc(pipelineVersions.versionNumber))
        .limit(50);
      res.json(versions.map((v) => ({ ...v, createdAt: v.createdAt.toISOString() })));
    } catch (err) {
      next(err);
    }
  });

  router.get("/pipelines/:id/versions/:version", async (req, res, next) => {
    try {
      const version = await db.query.pipelineVersions.findFirst({
        where: (t, { and, eq: _eq }) =>
          and(_eq(t.pipelineId, req.params.id), _eq(t.versionNumber, parseInt(req.params.version, 10))),
      });
      if (!version) return res.status(404).json({ error: "Version not found" });
      res.json({ ...version, createdAt: version.createdAt.toISOString() });
    } catch (err) {
      next(err);
    }
  });

  router.post("/pipelines/:id/versions/:version/restore", async (req, res, next) => {
    try {
      const version = await db.query.pipelineVersions.findFirst({
        where: (t, { and, eq: _eq }) =>
          and(_eq(t.pipelineId, req.params.id), _eq(t.versionNumber, parseInt(req.params.version, 10))),
      });
      if (!version) return res.status(404).json({ error: "Version not found" });

      const snap = version.snapshot as unknown as ApiPipeline;

      // Snapshot current state before restoring
      await snapshotPipeline(db, req.params.id, `Before restore to v${req.params.version}`);

      // Restore pipeline fields
      await db.update(pipelines).set({
        name: snap.name,
        description: snap.description,
        status: snap.status,
        inputSchema: snap.inputSchema,
        systemPrompt: snap.systemPrompt,
        modelProvider: snap.modelProvider,
        modelName: snap.modelName,
        updatedAt: new Date(),
      }).where(eq(pipelines.id, req.params.id));

      // Replace steps
      await db.delete(pipelineSteps).where(eq(pipelineSteps.pipelineId, req.params.id));
      if (snap.steps?.length > 0) {
        await db.insert(pipelineSteps).values(snap.steps.map((s) => ({
          pipelineId: req.params.id,
          stepIndex: s.stepIndex,
          name: s.name,
          skillName: s.skillName,
          promptTemplate: s.promptTemplate,
          timeoutSeconds: s.timeoutSeconds,
          approvalRequired: s.approvalRequired,
          retryConfig: s.retryConfig,
          metadata: s.metadata,
        })));
      }

      const result = await loadPipelineWithSteps(db, req.params.id);
      await syncLocalPackageToDisk(db, req.params.id);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
