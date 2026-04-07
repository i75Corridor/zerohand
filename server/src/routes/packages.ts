import { Router } from "express";
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { basename, join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { desc, eq } from "drizzle-orm";
import type { Db } from "@zerohand/db";
import { installedPackages, packageSecurityChecks, pipelines } from "@zerohand/db";
import type { WsManager } from "../ws/index.js";
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
import { loadPipelineWithSteps } from "./pipelines.js";
import { pipelineToYaml } from "@zerohand/shared";

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function ghAvailable(): boolean {
  const result = spawnSync("gh", ["--version"], { stdio: "ignore" });
  return result.status === 0;
}

async function buildPackageDir(
  db: Db,
  pipelineId: string,
  outDir: string,
): Promise<{ name: string; slugName: string } | null> {
  const pipeline = await loadPipelineWithSteps(db, pipelineId);
  if (!pipeline) return null;

  const skillsDir = getSkillsDir();
  const slugName = slugify(pipeline.name);

  mkdirSync(outDir, { recursive: true });

  // pipeline.yaml — strip namespace from skill refs so they're portable.
  // "zerohand-daily-absurdist/researcher" → "researcher"
  // "local/localvibe-page-manager"        → "localvibe-page-manager"
  // At install time, qualifySkillRef() re-prefixes bare names with the
  // install namespace so all skills resolve correctly.
  const exportablePipeline = {
    ...pipeline,
    steps: pipeline.steps.map((step) => ({
      ...step,
      skillName: step.skillName?.includes("/")
        ? step.skillName.slice(step.skillName.indexOf("/") + 1)
        : step.skillName ?? null,
    })),
  };
  writeFileSync(join(outDir, "pipeline.yaml"), pipelineToYaml(exportablePipeline), "utf-8");

  // skills — strip namespace prefix in the exported directory structure
  // e.g. "daily-absurdist/researcher" exports as "skills/researcher/"
  const skillNames = [...new Set(pipeline.steps.map((s) => s.skillName).filter((n): n is string => !!n))];
  for (const qualifiedSkillName of skillNames) {
    const skillDir = join(skillsDir, qualifiedSkillName);
    if (!existsSync(skillDir)) continue;
    const skillMdPath = join(skillDir, "SKILL.md");
    if (!existsSync(skillMdPath)) continue;

    // Strip namespace: "local/researcher" → "researcher", "daily-absurdist/writer" → "writer"
    const slashIdx = qualifiedSkillName.indexOf("/");
    const bareSkillName = slashIdx > -1 ? qualifiedSkillName.slice(slashIdx + 1) : qualifiedSkillName;

    const outSkillDir = join(outDir, "skills", bareSkillName);
    const outScriptsDir = join(outSkillDir, "scripts");
    mkdirSync(outScriptsDir, { recursive: true });
    writeFileSync(join(outSkillDir, "SKILL.md"), readFileSync(skillMdPath, "utf-8"), "utf-8");

    const scriptsDir = join(skillDir, "scripts");
    if (existsSync(scriptsDir)) {
      const files = readdirSync(scriptsDir).filter((f) => /\.(js|cjs|ts|py|sh)$/.test(f));
      for (const f of files) {
        writeFileSync(join(outScriptsDir, f), readFileSync(join(scriptsDir, f), "utf-8"), "utf-8");
      }
    }
  }

  // README.md
  const inputParam = (() => {
    const schema = pipeline.inputSchema as Record<string, unknown> | null;
    const props = (schema?.properties as Record<string, unknown> | undefined) ?? {};
    return Object.keys(props)[0] ?? "";
  })();
  const readme = [
    `# ${pipeline.name}`,
    "",
    pipeline.description || "",
    "",
    "## Install",
    "",
    "```bash",
    `zerohand packages install https://github.com/YOUR_ORG/${slugName}`,
    "```",
    "",
    "## Usage",
    "",
    "```bash",
    inputParam
      ? `zerohand run "${pipeline.name}" --input ${inputParam}="..." --watch`
      : `zerohand run "${pipeline.name}" --watch`,
    "```",
  ].join("\n");
  writeFileSync(join(outDir, "README.md"), readme + "\n", "utf-8");
  writeFileSync(join(outDir, ".gitignore"), "node_modules/\n.env\n", "utf-8");

  return { name: pipeline.name, slugName };
}

export function createPackagesRouter(db: Db, ws: WsManager): Router {
  const router = Router();

  // GET /api/packages/gh-status — check if gh CLI is available
  router.get("/packages/gh-status", (_req, res) => {
    res.json({ available: ghAvailable() });
  });

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
            repoNotFound: pkg.repoNotFound,
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
      ws.broadcast({ type: "data_changed", entity: "package", action: "created", id: repoUrl });
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
      ws.broadcast({ type: "data_changed", entity: "package", action: "updated", id: req.params.id });
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
      ws.broadcast({ type: "data_changed", entity: "package", action: "deleted", id: req.params.id });
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
      ws.broadcast({ type: "data_changed", entity: "package", action: "created", id: pkg.id });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/packages/export — bundle pipeline + skills as tar.gz download
  // POST /api/packages/preview — return package contents as JSON without writing to disk
  router.post("/packages/preview", async (req, res, next) => {
    try {
      const { pipelineId } = req.body as { pipelineId?: string };
      if (!pipelineId || typeof pipelineId !== "string") {
        res.status(400).json({ error: "pipelineId is required" });
        return;
      }

      const pipeline = await loadPipelineWithSteps(db, pipelineId);
      if (!pipeline) {
        res.status(404).json({ error: "Pipeline not found" });
        return;
      }

      const skillsDir = getSkillsDir();
      const pipelineYaml = pipelineToYaml(pipeline);
      const skillNames = [...new Set(pipeline.steps.map((s) => s.skillName).filter((n): n is string => !!n))];

      const skills = skillNames.map((qualifiedSkillName) => {
        const skillDir = join(skillsDir, qualifiedSkillName);
        if (!existsSync(skillDir)) return null;
        const skillMdPath = join(skillDir, "SKILL.md");
        if (!existsSync(skillMdPath)) return null;

        const slashIdx = qualifiedSkillName.indexOf("/");
        const bareName = slashIdx > -1 ? qualifiedSkillName.slice(slashIdx + 1) : qualifiedSkillName;

        const scripts: Array<{ filename: string; content: string }> = [];
        const scriptsDir = join(skillDir, "scripts");
        if (existsSync(scriptsDir)) {
          for (const f of readdirSync(scriptsDir).filter((fn) => /\.(js|cjs|ts|py|sh)$/.test(fn))) {
            scripts.push({ filename: f, content: readFileSync(join(scriptsDir, f), "utf-8") });
          }
        }

        return {
          name: bareName,
          qualifiedName: qualifiedSkillName,
          skillMd: readFileSync(skillMdPath, "utf-8"),
          scripts,
        };
      }).filter(Boolean);

      // Run validation inline
      const { validatePipeline } = await import("../services/tools/validate-pipeline.js");
      const validation = await validatePipeline(pipelineId, { db, skillsDir } as any);

      res.json({ pipelineYaml, skills, validation });
    } catch (err) {
      next(err);
    }
  });

  router.post("/packages/export", async (req, res, next) => {
    let tempDir: string | null = null;
    try {
      const { pipelineId } = req.body as { pipelineId?: string };
      if (!pipelineId || typeof pipelineId !== "string") {
        res.status(400).json({ error: "pipelineId is required" });
        return;
      }

      tempDir = mkdtempSync(join(tmpdir(), "zerohand-export-"));
      const result = await buildPackageDir(db, pipelineId, tempDir);
      if (!result) {
        res.status(404).json({ error: "Pipeline not found" });
        return;
      }

      const archiveName = `${result.slugName}.tar.gz`;
      const archivePath = join(tmpdir(), archiveName);

      const tar = spawnSync("tar", ["-czf", archivePath, "."], {
        cwd: tempDir,
        stdio: ["ignore", "pipe", "pipe"],
      });

      if (tar.status !== 0) {
        res.status(500).json({ error: "Failed to create archive" });
        return;
      }

      res.setHeader("Content-Type", "application/gzip");
      res.setHeader("Content-Disposition", `attachment; filename="${archiveName}"`);
      res.sendFile(archivePath, (err) => {
        if (err && !res.headersSent) next(err);
        if (existsSync(archivePath)) rmSync(archivePath, { force: true });
      });
    } catch (err) {
      next(err);
    } finally {
      if (tempDir && existsSync(tempDir)) {
        rmSync(tempDir, { recursive: true, force: true });
      }
    }
  });

  // POST /api/packages/publish — publish to GitHub (create repo or update via PR)
  router.post("/packages/publish", async (req, res, next) => {
    let tempDir: string | null = null;
    try {
      const { pipelineId, repo, private: isPrivate, description } = req.body as {
        pipelineId?: string;
        repo?: string;
        private?: boolean;
        description?: string;
      };

      if (!pipelineId || typeof pipelineId !== "string") {
        res.status(400).json({ error: "pipelineId is required" });
        return;
      }

      if (!ghAvailable()) {
        res.status(400).json({ error: "The 'gh' CLI is required to publish packages. Install from https://cli.github.com" });
        return;
      }

      tempDir = mkdtempSync(join(tmpdir(), "zerohand-publish-"));
      const result = await buildPackageDir(db, pipelineId, tempDir);
      if (!result) {
        res.status(404).json({ error: "Pipeline not found" });
        return;
      }

      const repoName = repo ?? result.slugName;

      // Find a previously-published authored package for this pipeline.
      // Match by pipelineId (set on publish since v1) OR by repoFullName slug
      // (for records created before pipelineId was stored).
      const allAuthored = await db
        .select()
        .from(installedPackages)
        .then((rows) => rows.filter((r) => (r.metadata as Record<string, unknown>)?.origin === "authored"));

      const existingPkg = allAuthored.find(
        (r) =>
          r.pipelineId === pipelineId ||
          r.repoFullName === repoName ||
          r.repoFullName.endsWith(`/${repoName}`),
      ) ?? null;

      /** Clone an existing repo, commit updated package files, push a branch, open a PR. */
      async function pushUpdatePR(repoFullName: string, packageName: string, packageDir: string) {
        const cloneDir = mkdtempSync(join(tmpdir(), "zerohand-clone-"));
        try {
          const cloneResult = spawnSync("gh", ["repo", "clone", repoFullName, cloneDir], { encoding: "utf-8", stdio: "pipe" });
          if (cloneResult.status !== 0) return { error: `Failed to clone repository: ${cloneResult.stderr?.trim()}` };

          spawnSync("bash", ["-c", `cp -r ${packageDir}/. ${cloneDir}/`], { stdio: "ignore" });

          const branch = `update/${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}`;
          spawnSync("git", ["checkout", "-b", branch], { cwd: cloneDir, stdio: "ignore" });
          spawnSync("git", ["add", "."], { cwd: cloneDir, stdio: "ignore" });

          const commitResult = spawnSync("git", ["commit", "-m", `Update ${packageName}`], { cwd: cloneDir, encoding: "utf-8", stdio: "pipe" });
          if (commitResult.status !== 0) return { noChanges: true };

          spawnSync("git", ["push", "origin", branch], { cwd: cloneDir, stdio: "ignore" });

          const prResult = spawnSync(
            "gh", ["pr", "create", "--title", `Update ${packageName}`, "--body", `Automated update from Zerohand — pipeline "${packageName}" was modified.`, "--head", branch, "--base", "main"],
            { cwd: cloneDir, encoding: "utf-8", stdio: "pipe" },
          );
          return { prUrl: prResult.stdout?.trim() ?? `https://github.com/${repoFullName}/pulls` };
        } finally {
          if (existsSync(cloneDir)) rmSync(cloneDir, { recursive: true, force: true });
        }
      }

      if (existingPkg) {
        // ── Update path: clone existing repo, create feature branch, open PR ──
        // If the user supplied an explicit repo name, prefer it over the stored one
        // (covers org transfers, renames, or first-time org publish).
        const targetFullName = repo ?? existingPkg.repoFullName;
        const targetRepoUrl = `https://github.com/${targetFullName}`;
        // Persist the authoritative name for future publishes
        if (targetFullName !== existingPkg.repoFullName) {
          await db.update(installedPackages)
            .set({ repoFullName: targetFullName, repoUrl: targetRepoUrl, pipelineId, updatedAt: new Date() })
            .where(eq(installedPackages.id, existingPkg.id));
        }
        const pr = await pushUpdatePR(targetFullName, result.name, tempDir!);
        if ("error" in pr) { res.status(500).json({ error: pr.error }); return; }
        res.status(200).json({ id: existingPkg.id, repoUrl: targetRepoUrl, repoFullName: targetFullName, ...pr });
        return;
      }

      // ── Create path: new repo ─────────────────────────────────────────────

      // git init + commit
      spawnSync("git", ["init"], { cwd: tempDir, stdio: "ignore" });
      spawnSync("git", ["add", "."], { cwd: tempDir, stdio: "ignore" });
      spawnSync("git", ["commit", "-m", `Export ${result.name}`], { cwd: tempDir, stdio: "ignore" });

      // gh repo create
      const visibility = isPrivate ? "--private" : "--public";
      const ghArgs = ["repo", "create", repoName, "--source", tempDir, "--push", visibility];
      if (description ?? result.name) ghArgs.push("--description", description ?? result.name);

      const createResult = spawnSync("gh", ghArgs, { cwd: tempDir, encoding: "utf-8", stdio: "pipe" });
      if (createResult.status !== 0) {
        const stderr = createResult.stderr?.trim() ?? "";
        // Repo already exists but our DB record was missing — resolve full name and update
        if (stderr.includes("Name already exists") || stderr.includes("already exists")) {
          const viewResult = spawnSync("gh", ["repo", "view", repoName, "--json", "nameWithOwner", "-q", ".nameWithOwner"], { encoding: "utf-8", stdio: "pipe" });
          const resolvedFullName = viewResult.stdout?.trim();
          if (!resolvedFullName) {
            res.status(500).json({ error: `Repository already exists but could not resolve owner: ${stderr}` });
            return;
          }
          const resolvedRepoUrl = `https://github.com/${resolvedFullName}`;
          // Upsert record so future publishes find it by pipelineId
          await db.insert(installedPackages)
            .values({ repoUrl: resolvedRepoUrl, repoFullName: resolvedFullName, pipelineId, localPath: tempDir!, skills: [], updateAvailable: false, metadata: { origin: "authored" } })
            .onConflictDoUpdate({ target: installedPackages.repoUrl, set: { pipelineId, updatedAt: new Date() } });
          const pr = await pushUpdatePR(resolvedFullName, result.name, tempDir!);
          if ("error" in pr) { res.status(500).json({ error: pr.error }); return; }
          res.status(200).json({ repoUrl: resolvedRepoUrl, repoFullName: resolvedFullName, ...pr });
          return;
        }
        res.status(500).json({ error: `Failed to create GitHub repository: ${stderr}` });
        return;
      }

      // Add topic
      spawnSync("gh", ["repo", "edit", repoName, "--add-topic", "zerohand-package"], { stdio: "ignore" });

      const repoFullName = repoName;
      const repoUrl = `https://github.com/${repoFullName}`;

      // Create installed_packages record, storing pipelineId for future re-publishes
      const [pkg] = await db
        .insert(installedPackages)
        .values({
          repoUrl,
          repoFullName,
          pipelineId,
          localPath: tempDir,
          skills: [],
          updateAvailable: false,
          metadata: { origin: "authored" },
        })
        .returning();

      res.status(201).json({
        id: pkg.id,
        repoUrl: pkg.repoUrl,
        repoFullName: pkg.repoFullName,
        metadata: pkg.metadata,
      });
      ws.broadcast({ type: "data_changed", entity: "package", action: "created", id: pkg.id });
    } catch (err) {
      next(err);
    } finally {
      if (tempDir && existsSync(tempDir)) {
        rmSync(tempDir, { recursive: true, force: true });
      }
    }
  });

  // POST /api/packages/check-updates — synchronous update check
  router.post("/packages/check-updates", async (_req, res, next) => {
    try {
      await checkForUpdates(db);
      res.json({ message: "Update check complete" });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
