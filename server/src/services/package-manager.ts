/**
 * GitHub-based package manager for Zerohand.
 *
 * A "package" is a GitHub repository tagged with the `zerohand-package` topic.
 * It contains a pipeline.yaml at the root and a skills/ directory with all
 * referenced skills bundled.
 *
 * Packages are cloned into DATA_DIR/packages/<repo-name>/ and tracked in the
 * installed_packages DB table. Skills are copied into SKILLS_DIR on install.
 */
import { spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  cpSync,
  readdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { join, resolve, sep, basename, dirname } from "node:path";
import { eq } from "drizzle-orm";
import type { Db } from "@pawn/db";
import { installedPackages, packageSecurityChecks, pipelines } from "@pawn/db";
import { importPipelinePackage } from "./pipeline-import.js";
import { scanPackage, type SecurityReport } from "./security-scanner.js";
import { loadSkillDef } from "./skill-loader.js";
import { getEnvApiKey } from "@mariozechner/pi-ai";
import { isOllamaAvailable } from "./ollama-provider.js";

// ── git helpers ────────────────────────────────────────────────────────────────

function git(args: string[], cwd?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, {
      cwd,
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
    child.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
    child.on("close", (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(`git ${args[0]} failed: ${stderr.trim()}`));
    });
    child.on("error", reject);
  });
}

function parseRepoUrl(url: string): { owner: string; repo: string; repoFullName: string } {
  // Handles: https://github.com/owner/repo, https://github.com/owner/repo.git
  const match = url.replace(/\.git$/, "").match(/github\.com\/([^/]+)\/([^/]+)/);
  if (!match) throw new Error(`Invalid GitHub URL: ${url}`);
  return { owner: match[1], repo: match[2], repoFullName: `${match[1]}/${match[2]}` };
}

function getGithubToken(): string | null {
  return process.env.GITHUB_TOKEN ?? null;
}

function buildAuthUrl(repoUrl: string, token: string | null): string {
  if (!token) return repoUrl;
  try {
    const u = new URL(repoUrl);
    u.username = token;
    u.password = "x-oauth-basic";
    return u.toString();
  } catch {
    return repoUrl;
  }
}

async function getCurrentRef(localPath: string): Promise<string> {
  return git(["rev-parse", "HEAD"], localPath);
}

async function getRemoteRef(repoUrl: string, token: string | null): Promise<string> {
  const authUrl = buildAuthUrl(repoUrl, token);
  const output = await git(["ls-remote", authUrl, "HEAD"]);
  const sha = output.split("\t")[0];
  if (!sha || sha.length < 7) throw new Error(`Could not get remote ref for ${repoUrl}`);
  return sha;
}

// ── skill installation ─────────────────────────────────────────────────────────

interface SkillInstallResult {
  added: string[];
  updated: string[];
  skipped: string[];
}

/**
 * Derive a namespace slug from a repo name.
 * "i75Corridor/daily-absurdist" → "daily-absurdist"
 * "my-package" → "my-package"
 */
function repoToNamespace(repoFullName: string): string {
  const parts = repoFullName.split("/");
  const repoName = parts[parts.length - 1] ?? repoFullName;
  return repoName.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/^-|-$/g, "") || "local";
}

function installSkills(packageDir: string, skillsDir: string, namespace: string): SkillInstallResult {
  const packageSkillsDir = join(packageDir, "skills");
  const result: SkillInstallResult = { added: [], updated: [], skipped: [] };

  if (!existsSync(packageSkillsDir)) return result;

  const nsDir = join(skillsDir, namespace);
  mkdirSync(nsDir, { recursive: true });

  const entries = readdirSync(packageSkillsDir, { withFileTypes: true });
  const skillNames = entries.filter((e) => e.isDirectory()).map((e) => e.name);

  for (const name of skillNames) {
    // Guard against path traversal
    const srcDir = join(packageSkillsDir, name);
    const destDir = join(nsDir, name);
    const resolvedSkillsDir = resolve(skillsDir);
    const resolvedDest = resolve(destDir);
    if (!resolvedDest.startsWith(resolvedSkillsDir + sep)) continue;

    const srcSkillMd = join(srcDir, "SKILL.md");
    if (!existsSync(srcSkillMd)) continue;

    const qualifiedName = `${namespace}/${name}`;

    if (existsSync(destDir)) {
      const destSkillMd = join(destDir, "SKILL.md");
      const srcContent = existsSync(srcSkillMd) ? readFileSync(srcSkillMd, "utf-8") : "";
      const destContent = existsSync(destSkillMd) ? readFileSync(destSkillMd, "utf-8") : "";
      if (srcContent === destContent) {
        result.skipped.push(qualifiedName);
        continue;
      }
      cpSync(srcDir, destDir, { recursive: true, force: true });
      result.updated.push(qualifiedName);
    } else {
      mkdirSync(destDir, { recursive: true });
      cpSync(srcDir, destDir, { recursive: true, force: true });
      result.added.push(qualifiedName);
    }
  }

  return result;
}

function getPackageSkillNames(packageDir: string, namespace: string): string[] {
  const packageSkillsDir = join(packageDir, "skills");
  if (!existsSync(packageSkillsDir)) return [];
  return readdirSync(packageSkillsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => `${namespace}/${e.name}`);
}

// ── public API ─────────────────────────────────────────────────────────────────

export interface ModelWarning {
  skillName: string;
  provider: string;
  model: string;
  message: string;
}

export function checkModelAvailability(skillNames: string[], skillsDir: string): ModelWarning[] {
  const warnings: ModelWarning[] = [];
  for (const qualifiedName of skillNames) {
    const skill = loadSkillDef(qualifiedName, skillsDir);
    if (skill?.modelProvider) {
      if (skill.modelProvider === "ollama") {
        if (!isOllamaAvailable()) {
          warnings.push({
            skillName: qualifiedName,
            provider: skill.modelProvider,
            model: `${skill.modelProvider}/${skill.modelName ?? ""}`,
            message: `Skill "${qualifiedName}" uses Ollama but Ollama server not reachable.`,
          });
        }
      } else if (!getEnvApiKey(skill.modelProvider)) {
        warnings.push({
          skillName: qualifiedName,
          provider: skill.modelProvider,
          model: `${skill.modelProvider}/${skill.modelName ?? ""}`,
          message: `Skill "${qualifiedName}" requires provider "${skill.modelProvider}" but no API key is set.`,
        });
      }
    }
  }
  return warnings;
}

export interface PackageInstallResult {
  pipelineName: string;
  skills: SkillInstallResult;
  security: SecurityReport;
  modelWarnings: ModelWarning[];
}

export async function installPackage(
  db: Db,
  repoUrl: string,
  packagesDir: string,
  skillsDir: string,
  options: { force?: boolean } = {},
): Promise<PackageInstallResult> {
  const { repo, repoFullName } = parseRepoUrl(repoUrl);

  // Check not already installed
  const existing = await db
    .select()
    .from(installedPackages)
    .where(eq(installedPackages.repoUrl, repoUrl))
    .limit(1);
  if (existing.length > 0) {
    throw new Error(`Package ${repoFullName} is already installed`);
  }

  const token = getGithubToken();
  const authUrl = buildAuthUrl(repoUrl, token);
  const localPath = join(packagesDir, repo);

  mkdirSync(packagesDir, { recursive: true });

  if (existsSync(localPath)) {
    // Directory exists but not in DB (e.g. after DB reset) — remove and re-clone
    rmSync(localPath, { recursive: true, force: true });
  }
  await git(["clone", "--depth", "1", authUrl, localPath]);

  // Validate
  if (!existsSync(join(localPath, "pipeline.yaml"))) {
    throw new Error(`Repository ${repoFullName} does not contain a pipeline.yaml at root`);
  }

  // Security scan — runs before any skills are installed
  const security = scanPackage(localPath);
  if (security.level === "high" && !options.force) {
    rmSync(localPath, { recursive: true, force: true });
    const summary = security.findings
      .map((f) => `  • [${f.level.toUpperCase()}] [${f.file}] ${f.description}`)
      .join("\n");
    throw new Error(
      `Package ${repoFullName} failed security check (high risk):\n${summary}\n\nUse force=true to override.`,
    );
  }

  // Install skills under the package namespace
  const namespace = repoToNamespace(repoFullName);
  mkdirSync(skillsDir, { recursive: true });
  const skillResult = installSkills(localPath, skillsDir, namespace);
  const skillNames = getPackageSkillNames(localPath, namespace);

  // Import pipeline (skill refs get qualified with the package namespace; MCP servers declared in the manifest are auto-registered)
  await importPipelinePackage(db, localPath, namespace, repoUrl);

  // Get created pipeline ID
  const installedRef = await getCurrentRef(localPath);
  const pipelineManifestName = (() => {
    try {
      const yaml = readFileSync(join(localPath, "pipeline.yaml"), "utf-8");
      const match = yaml.match(/^name:\s*(.+)$/m);
      return match?.[1]?.trim() ?? repo;
    } catch { return repo; }
  })();

  // Look up the pipeline by name to get its ID
  const pipelineRows = await db
    .select({ id: pipelines.id })
    .from(pipelines)
    .where(eq(pipelines.name, pipelineManifestName))
    .limit(1);
  const pipelineId = pipelineRows[0]?.id ?? null;

  const [installed] = await db.insert(installedPackages).values({
    repoUrl,
    repoFullName,
    pipelineId,
    installedRef,
    latestRef: installedRef,
    updateAvailable: false,
    localPath,
    skills: skillNames,
    metadata: { description: "", stars: 0 },
  }).returning({ id: installedPackages.id });

  // Persist security scan result
  await db.insert(packageSecurityChecks).values({
    packageId: installed.id,
    repoUrl,
    level: security.level,
    findings: security.findings as unknown as Array<Record<string, unknown>>,
    scannedFiles: security.scannedFiles,
    scannedAt: new Date(security.scannedAt),
  });

  const modelWarnings = checkModelAvailability(skillNames, skillsDir);
  console.log(`[Packages] Installed ${repoFullName}: ${pipelineManifestName} (security: ${security.level})`);
  return { pipelineName: pipelineManifestName, skills: skillResult, security, modelWarnings };
}

export async function updatePackage(
  db: Db,
  packageId: string,
  skillsDir: string,
  options: { force?: boolean } = {},
): Promise<PackageInstallResult> {
  const pkg = await db
    .select()
    .from(installedPackages)
    .where(eq(installedPackages.id, packageId))
    .limit(1);
  if (!pkg[0]) throw new Error(`Package not found: ${packageId}`);

  const { localPath, repoUrl } = pkg[0];

  // Convert shallow clone to full (needed for pull)
  try {
    await git(["fetch", "--unshallow"], localPath);
  } catch {
    // Already a full clone or network error — try pull directly
  }

  const token = getGithubToken();
  if (token) {
    await git(["config", `url.${buildAuthUrl(repoUrl, token)}.insteadOf`, repoUrl], localPath);
  }

  await git(["pull", "--ff-only"], localPath);

  // Security scan after pull
  const security = scanPackage(localPath);
  if (security.level === "high" && !options.force) {
    // Roll back to previous state by resetting to the installed ref
    try { await git(["reset", "--hard", pkg[0].installedRef ?? "HEAD~1"], localPath); } catch { /* best effort */ }
    const summary = security.findings
      .map((f) => `  • [${f.level.toUpperCase()}] [${f.file}] ${f.description}`)
      .join("\n");
    throw new Error(
      `Package ${pkg[0].repoFullName} update failed security check (high risk):\n${summary}\n\nUse force=true to override.`,
    );
  }

  const namespace = repoToNamespace(pkg[0].repoFullName);
  const skillResult = installSkills(localPath, skillsDir, namespace);
  const skillNames = getPackageSkillNames(localPath, namespace);
  await importPipelinePackage(db, localPath, namespace, repoUrl);

  const newRef = await getCurrentRef(localPath);
  await db
    .update(installedPackages)
    .set({
      installedRef: newRef,
      latestRef: newRef,
      updateAvailable: false,
      skills: skillNames,
      updatedAt: new Date(),
    })
    .where(eq(installedPackages.id, packageId));

  // Persist updated security scan result
  await db.insert(packageSecurityChecks).values({
    packageId,
    repoUrl,
    level: security.level,
    findings: security.findings as unknown as Array<Record<string, unknown>>,
    scannedFiles: security.scannedFiles,
    scannedAt: new Date(security.scannedAt),
  });

  const pipelineName = (() => {
    try {
      const yaml = readFileSync(join(localPath, "pipeline.yaml"), "utf-8");
      const match = yaml.match(/^name:\s*(.+)$/m);
      return match?.[1]?.trim() ?? basename(localPath);
    } catch { return basename(localPath); }
  })();

  const modelWarnings = checkModelAvailability(skillNames, skillsDir);
  console.log(`[Packages] Updated ${pkg[0].repoFullName} (security: ${security.level})`);
  return { pipelineName, skills: skillResult, security, modelWarnings };
}

export async function uninstallPackage(
  db: Db,
  packageId: string,
  skillsDir: string,
): Promise<void> {
  const pkg = await db
    .select()
    .from(installedPackages)
    .where(eq(installedPackages.id, packageId))
    .limit(1);
  if (!pkg[0]) throw new Error(`Package not found: ${packageId}`);

  const { localPath, pipelineId, skills: pkgSkills } = pkg[0];

  // Remove pipeline from DB (cascade deletes steps; runs are preserved via set null on package)
  if (pipelineId) {
    await db.delete(pipelines).where(eq(pipelines.id, pipelineId));
  }

  // Remove skills installed by this package (skills are stored as qualified "namespace/name")
  if (Array.isArray(pkgSkills)) {
    const { rmSync } = await import("node:fs");
    for (const skillName of pkgSkills as string[]) {
      // skillName may be "namespace/name" (new) or bare "name" (legacy)
      const skillDir = join(skillsDir, skillName);
      if (existsSync(skillDir)) {
        rmSync(skillDir, { recursive: true, force: true });
        console.log(`[Packages] Removed skill: ${skillName}`);
        // If namespace dir is now empty, clean it up
        const nsDir = dirname(skillDir);
        if (nsDir !== skillsDir && existsSync(nsDir)) {
          try {
            const remaining = readdirSync(nsDir);
            if (remaining.length === 0) rmSync(nsDir, { recursive: true, force: true });
          } catch { /* ignore */ }
        }
      }
    }
  }

  // Remove cloned directory
  if (existsSync(localPath)) {
    const { rmSync } = await import("node:fs");
    rmSync(localPath, { recursive: true, force: true });
  }

  await db.delete(installedPackages).where(eq(installedPackages.id, packageId));
  console.log(`[Packages] Uninstalled ${pkg[0].repoFullName}`);
}

export async function checkForUpdates(db: Db): Promise<void> {
  const pkgs = await db.select().from(installedPackages);
  const token = getGithubToken();

  for (const pkg of pkgs) {
    try {
      const latestRef = await getRemoteRef(pkg.repoUrl, token);
      const updateAvailable = latestRef !== pkg.installedRef;
      await db
        .update(installedPackages)
        .set({
          latestRef,
          updateAvailable,
          repoNotFound: false,
          lastCheckedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(installedPackages.id, pkg.id));

      if (updateAvailable) {
        console.log(`[Packages] Update available for ${pkg.repoFullName}`);
      }
    } catch (err) {
      const msg = String(err);
      const isNotFound = msg.includes("Repository not found") || msg.includes("not found");
      await db
        .update(installedPackages)
        .set({ repoNotFound: isNotFound, lastCheckedAt: new Date(), updatedAt: new Date() })
        .where(eq(installedPackages.id, pkg.id));
      if (isNotFound) {
        console.warn(`[Packages] ${pkg.repoFullName} — repository no longer exists or is inaccessible`);
      } else {
        console.warn(`[Packages] Could not check updates for ${pkg.repoFullName}: ${msg.split("\n")[0]}`);
      }
    }
  }
}

export interface DiscoveredPackage {
  fullName: string;
  description: string;
  url: string;
  stars: number;
  topics: string[];
  installed: boolean;
}

export async function discoverPackages(
  db: Db,
  query?: string,
): Promise<DiscoveredPackage[]> {
  const token = getGithubToken();
  const q = `topic:zerohand-package${query ? `+${encodeURIComponent(query)}` : ""}`;
  const url = `https://api.github.com/search/repositories?q=${q}&sort=stars&per_page=30`;

  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`GitHub API error: ${res.status} ${res.statusText}`);

  const data = await res.json() as {
    items: Array<{
      full_name: string;
      description: string | null;
      html_url: string;
      stargazers_count: number;
      topics: string[];
    }>;
  };

  const installed = await db.select({ repoUrl: installedPackages.repoUrl }).from(installedPackages);
  const installedUrls = new Set(installed.map((p) => p.repoUrl.replace(/\.git$/, "")));

  return data.items.map((item) => ({
    fullName: item.full_name,
    description: item.description ?? "",
    url: item.html_url,
    stars: item.stargazers_count,
    topics: item.topics ?? [],
    installed: installedUrls.has(item.html_url.replace(/\.git$/, "")),
  }));
}
