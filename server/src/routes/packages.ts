import { Router } from "express";
import { eq } from "drizzle-orm";
import type { Db } from "@zerohand/db";
import { installedPackages, pipelines } from "@zerohand/db";
import {
  installPackage,
  updatePackage,
  uninstallPackage,
  discoverPackages,
  checkForUpdates,
} from "../services/package-manager.js";
import { join } from "node:path";

function getPackagesDir(): string {
  return process.env.PACKAGES_DIR ?? join(process.env.DATA_DIR ?? join(process.cwd(), ".data"), "packages");
}

function getSkillsDir(): string {
  return process.env.SKILLS_DIR ?? join(process.cwd(), "..", "skills");
}

export function createPackagesRouter(db: Db): Router {
  const router = Router();

  // GET /api/packages — list installed packages
  router.get("/packages", async (_req, res, next) => {
    try {
      const pkgs = await db.select().from(installedPackages);

      // Enrich with pipeline name
      const enriched = await Promise.all(
        pkgs.map(async (pkg) => {
          let pipelineName: string | null = null;
          if (pkg.pipelineId) {
            const pipe = await db
              .select({ name: pipelines.name })
              .from(pipelines)
              .where(eq(pipelines.id, pkg.pipelineId))
              .limit(1);
            pipelineName = pipe[0]?.name ?? null;
          }
          return {
            id: pkg.id,
            repoUrl: pkg.repoUrl,
            repoFullName: pkg.repoFullName,
            pipelineId: pkg.pipelineId,
            pipelineName,
            skills: (pkg.skills as string[]) ?? [],
            updateAvailable: pkg.updateAvailable,
            installedRef: pkg.installedRef,
            latestRef: pkg.latestRef,
            metadata: pkg.metadata,
            installedAt: pkg.installedAt?.toISOString() ?? null,
            lastCheckedAt: pkg.lastCheckedAt?.toISOString() ?? null,
            updatedAt: pkg.updatedAt?.toISOString() ?? null,
          };
        }),
      );

      res.json(enriched);
    } catch (err) {
      next(err);
    }
  });

  // GET /api/packages/discover?q= — search GitHub
  router.get("/packages/discover", async (req, res, next) => {
    try {
      const query = typeof req.query.q === "string" ? req.query.q : undefined;
      const results = await discoverPackages(db, query);
      res.json(results);
    } catch (err) {
      next(err);
    }
  });

  // POST /api/packages/install — { repoUrl }
  router.post("/packages/install", async (req, res, next) => {
    try {
      const { repoUrl } = req.body as { repoUrl?: string };
      if (!repoUrl || typeof repoUrl !== "string") {
        res.status(400).json({ error: "repoUrl is required" });
        return;
      }
      const result = await installPackage(db, repoUrl, getPackagesDir(), getSkillsDir());
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  });

  // POST /api/packages/:id/update — pull latest
  router.post("/packages/:id/update", async (req, res, next) => {
    try {
      const result = await updatePackage(db, req.params.id, getSkillsDir());
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // DELETE /api/packages/:id
  router.delete("/packages/:id", async (req, res, next) => {
    try {
      await uninstallPackage(db, req.params.id, getSkillsDir());
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  // POST /api/packages/check-updates — background update check
  router.post("/packages/check-updates", async (_req, res, next) => {
    try {
      // Fire off non-blocking, respond immediately
      void checkForUpdates(db).catch((err) =>
        console.error("[Packages] check-updates failed:", err),
      );
      res.json({ message: "Update check started" });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
