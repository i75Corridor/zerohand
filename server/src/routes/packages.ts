import { Router } from "express";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { basename } from "node:path";
import { tmpdir } from "node:os";
import { desc, eq } from "drizzle-orm";
import type { Db } from "@zerohand/db";
import { installedPackages, packageSecurityChecks, pipelines } from "@zerohand/db";
import {
  installPackage,
  updatePackage,
  uninstallPackage,
  discoverPackages,
  checkForUpdates,
} from "../services/package-manager.js";
import { importPipelinePackage } from "../services/pipeline-import.js";
import { scanPackage } from "../services/security-scanner.js";
import { packagesDir as getPackagesDir, skillsDir as getSkillsDir } from "../services/paths.js";

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

  // POST /api/packages/install — { repoUrl, force? }
  router.post("/packages/install", async (req, res, next) => {
    try {
      const { repoUrl, force } = req.body as { repoUrl?: string; force?: boolean };
      if (!repoUrl || typeof repoUrl !== "string") {
        res.status(400).json({ error: "repoUrl is required" });
        return;
      }
      const result = await installPackage(db, repoUrl, getPackagesDir(), getSkillsDir(), { force: force === true });
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  });

  // POST /api/packages/scan — { repoUrl } — preview security scan without installing
  router.post("/packages/scan", async (req, res, next) => {
    let tempDir: string | null = null;
    try {
      const { repoUrl } = req.body as { repoUrl?: string };
      if (!repoUrl || typeof repoUrl !== "string") {
        res.status(400).json({ error: "repoUrl is required" });
        return;
      }

      // Clone to a temp directory, scan, then delete
      tempDir = mkdtempSync(join(tmpdir(), "zerohand-scan-"));
      const { spawn } = await import("node:child_process");
      await new Promise<void>((resolve, reject) => {
        const child = spawn("git", ["clone", "--depth", "1", repoUrl, tempDir!], {
          stdio: ["ignore", "pipe", "pipe"],
        });
        child.on("close", (code) => {
          if (code === 0) resolve();
          else reject(new Error(`git clone failed for ${repoUrl}`));
        });
        child.on("error", reject);
      });

      const report = scanPackage(tempDir);
      res.json(report);
    } catch (err) {
      next(err);
    } finally {
      if (tempDir && existsSync(tempDir)) {
        rmSync(tempDir, { recursive: true, force: true });
      }
    }
  });

  // POST /api/packages/:id/update — pull latest
  router.post("/packages/:id/update", async (req, res, next) => {
    try {
      const { force } = req.body as { force?: boolean };
      const result = await updatePackage(db, req.params.id, getSkillsDir(), { force: force === true });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // GET /api/packages/:id/security — latest security report for a package
  router.get("/packages/:id/security", async (req, res, next) => {
    try {
      const rows = await db
        .select()
        .from(packageSecurityChecks)
        .where(eq(packageSecurityChecks.packageId, req.params.id))
        .orderBy(desc(packageSecurityChecks.scannedAt))
        .limit(1);

      if (rows.length === 0) {
        res.status(404).json({ error: "No security scan found for this package" });
        return;
      }

      const row = rows[0];
      res.json({
        level: row.level,
        findings: row.findings,
        scannedFiles: row.scannedFiles,
        scannedAt: row.scannedAt?.toISOString() ?? null,
      });
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
