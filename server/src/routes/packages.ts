import { Router } from "express";
import { existsSync } from "node:fs";
import { basename, join } from "node:path";
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
import { importPipelinePackage } from "../services/pipeline-import.js";

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

  // POST /api/packages/install-local — { localPath }
  router.post("/packages/install-local", async (req, res, next) => {
    try {
      const { localPath } = req.body as { localPath?: string };
      if (!localPath || typeof localPath !== "string") {
        res.status(400).json({ error: "localPath is required" });
        return;
      }
      if (!existsSync(localPath)) {
        res.status(400).json({ error: `Path not found: ${localPath}` });
        return;
      }
      if (!existsSync(join(localPath, "pipeline.yaml"))) {
        res.status(400).json({ error: `No pipeline.yaml found at ${localPath}` });
        return;
      }

      // Import the pipeline into DB (idempotent)
      await importPipelinePackage(db, localPath);

      // Find the pipeline that was just imported (match by name from yaml)
      const { parse: parseYaml } = await import("yaml");
      const { readFileSync } = await import("node:fs");
      const raw = readFileSync(join(localPath, "pipeline.yaml"), "utf-8");
      const manifest = parseYaml(raw) as { name: string };

      const [pipeline] = await db
        .select()
        .from(pipelines)
        .where(eq(pipelines.name, manifest.name))
        .limit(1);

      const repoUrl = `local:${localPath}`;
      const dirName = basename(localPath);

      // Upsert the installed_packages record
      const existing = await db
        .select()
        .from(installedPackages)
        .where(eq(installedPackages.repoUrl, repoUrl))
        .limit(1);

      let pkg;
      if (existing.length > 0) {
        [pkg] = await db
          .update(installedPackages)
          .set({
            localPath,
            pipelineId: pipeline?.id ?? null,
            repoFullName: dirName,
            updatedAt: new Date(),
          })
          .where(eq(installedPackages.repoUrl, repoUrl))
          .returning();
      } else {
        [pkg] = await db
          .insert(installedPackages)
          .values({
            repoUrl,
            repoFullName: dirName,
            localPath,
            pipelineId: pipeline?.id ?? null,
            skills: [],
            updateAvailable: false,
            metadata: { isLocal: true },
          })
          .returning();
      }

      res.status(201).json({
        id: pkg.id,
        repoUrl: pkg.repoUrl,
        repoFullName: pkg.repoFullName,
        localPath: pkg.localPath,
        pipelineId: pkg.pipelineId,
        metadata: pkg.metadata,
        installedAt: pkg.installedAt?.toISOString() ?? null,
      });
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
