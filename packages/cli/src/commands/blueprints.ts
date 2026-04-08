import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { Command } from "commander";
import { ApiClient } from "../api-client.js";
import { formatTable, relativeTime, shortId, pipelineToYaml } from "../formatters.js";

function isLocalPath(arg: string): boolean {
  return arg.startsWith("./") || arg.startsWith("../") || arg.startsWith("/") || arg.startsWith("~/") || existsSync(arg);
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function ghAvailable(): boolean {
  const result = spawnSync("gh", ["--version"], { stdio: "ignore" });
  return result.status === 0;
}

function gitExec(args: string[], cwd: string): { ok: boolean; stdout: string; stderr: string } {
  const result = spawnSync("git", args, { cwd, encoding: "utf-8" });
  return { ok: result.status === 0, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

function parseRepoFromRemote(remoteUrl: string): string {
  // Handles: https://github.com/owner/repo(.git) and git@github.com:owner/repo(.git)
  const m = remoteUrl.replace(/\.git$/, "").match(/github\.com[/:]([\w-]+\/[\w-]+)/);
  return m ? m[1] : "";
}

export function registerBlueprintsCommand(program: Command, client: ApiClient): void {
  const cmd = program.command("blueprints").description("manage pipeline blueprints");

  // ── list ──────────────────────────────────────────────────────────────────

  cmd
    .command("list")
    .description("list installed blueprints")
    .action(async () => {
      const pkgs = await client.listBlueprints();
      const rows = pkgs.map((p) => ({
        ID: shortId(p.id),
        REPO: p.repoFullName,
        TYPE: (p.metadata as Record<string, unknown> | null)?.isLocal ? "local" : "remote",
        SKILLS: (p.skills ?? []).join(", ") || "(none)",
        UPDATE: p.updateAvailable ? "yes" : "no",
        INSTALLED: p.installedAt ? relativeTime(p.installedAt) : "",
      }));
      console.log(formatTable(rows, ["ID", "REPO", "TYPE", "SKILLS", "UPDATE", "INSTALLED"]));
    });

  // ── install ───────────────────────────────────────────────────────────────

  cmd
    .command("install <repo-url-or-path>")
    .description("install a blueprint from a GitHub repo URL or local directory path")
    .action(async (arg: string) => {
      if (isLocalPath(arg)) {
        const localPath = resolve(arg.replace(/^~/, process.env.HOME ?? "~"));
        if (!existsSync(localPath)) {
          console.error(`Path not found: ${localPath}`);
          process.exit(1);
        }
        console.log(`Loading local blueprint from ${localPath}...`);
        await client.installLocalBlueprint(localPath);
        console.log("Local blueprint loaded. Open the UI to view and edit it.");
        console.log("Note: UI changes will be saved back to disk at this path.");
      } else {
        console.log(`Installing ${arg}...`);
        await client.installBlueprint(arg);
        console.log("Blueprint installed");
      }
    });

  // ── update ────────────────────────────────────────────────────────────────

  cmd
    .command("update <name>")
    .description("update an installed blueprint")
    .action(async (name: string) => {
      const pkg = await client.findBlueprintByName(name);
      if (!pkg) {
        console.error(`Blueprint "${name}" not found`);
        process.exit(1);
      }
      await client.updateBlueprint(pkg.id);
      console.log(`Updated ${pkg.repoFullName}`);
    });

  // ── uninstall ─────────────────────────────────────────────────────────────

  cmd
    .command("uninstall <name>")
    .description("uninstall a blueprint")
    .action(async (name: string) => {
      const pkg = await client.findBlueprintByName(name);
      if (!pkg) {
        console.error(`Blueprint "${name}" not found`);
        process.exit(1);
      }
      await client.uninstallBlueprint(pkg.id);
      console.log(`Uninstalled ${pkg.repoFullName}`);
    });

  // ── discover ──────────────────────────────────────────────────────────────

  cmd
    .command("discover [query]")
    .description("search GitHub for pawn blueprints")
    .action(async (query?: string) => {
      const results = await client.discoverBlueprints(query);
      if (results.length === 0) {
        console.log("No blueprints found");
        return;
      }
      const rows = results.map((r) => ({
        REPO: r.fullName,
        STARS: String(r.stars ?? 0),
        INSTALLED: r.installed ? "yes" : "no",
        DESCRIPTION: (r.description ?? "").slice(0, 50),
      }));
      console.log(formatTable(rows, ["REPO", "STARS", "INSTALLED", "DESCRIPTION"]));
    });

  // ── export ────────────────────────────────────────────────────────────────

  cmd
    .command("export <pipeline-name> [output-dir]")
    .description("export a pipeline from the server as a local blueprint directory")
    .option("-f, --force", "overwrite output directory if it already exists")
    .action(async (pipelineName: string, outputDir: string | undefined, opts: { force?: boolean }) => {
      // 1. Fetch pipeline
      const pipeline = await client.findPipelineByName(pipelineName);
      if (!pipeline) {
        console.error(`Pipeline "${pipelineName}" not found`);
        process.exit(1);
      }
      const full = await client.getPipeline(pipeline.id);

      // 2. Resolve output directory
      const dirName = outputDir ?? slugify(full.name);
      const outDir = resolve(dirName);

      if (existsSync(outDir)) {
        if (!opts.force) {
          console.error(`Directory already exists: ${outDir}`);
          console.error("Use --force to overwrite.");
          process.exit(1);
        }
        rmSync(outDir, { recursive: true, force: true });
      }
      mkdirSync(outDir, { recursive: true });

      // 3. Write pipeline.yaml
      writeFileSync(join(outDir, "pipeline.yaml"), pipelineToYaml(full), "utf-8");

      // 4. Export each referenced skill
      const skillNames = [
        ...new Set(full.steps.map((s) => s.skillName).filter((n): n is string => !!n)),
      ];

      for (const skillName of skillNames) {
        let bundle;
        try {
          bundle = await client.getSkillBundle(skillName);
        } catch {
          console.warn(`  Warning: skill "${skillName}" not found on server — skipping`);
          continue;
        }

        const skillDir = join(outDir, "skills", skillName);
        mkdirSync(join(skillDir, "scripts"), { recursive: true });
        writeFileSync(join(skillDir, "SKILL.md"), bundle.skillMd, "utf-8");

        for (const script of bundle.scripts) {
          writeFileSync(join(skillDir, "scripts", script.filename), script.content, "utf-8");
        }
        console.log(`  Exported skill: ${skillName} (${bundle.scripts.length} scripts)`);
      }

      // 5. README
      const inputParam = (() => {
        const schema = full.inputSchema as Record<string, unknown> | null;
        const props = (schema?.properties as Record<string, unknown> | undefined) ?? {};
        return Object.keys(props)[0] ?? "";
      })();

      const readme = [
        `# ${full.name}`,
        "",
        full.description || "",
        "",
        "## Install",
        "",
        "```bash",
        `pawn blueprints install https://github.com/YOUR_ORG/${dirName}`,
        "```",
        "",
        "## Usage",
        "",
        "```bash",
        inputParam
          ? `pawn run "${full.name}" --input ${inputParam}="..." --watch`
          : `pawn run "${full.name}" --watch`,
        "```",
      ].join("\n");
      writeFileSync(join(outDir, "README.md"), readme + "\n", "utf-8");

      // 6. .gitignore
      writeFileSync(join(outDir, ".gitignore"), "node_modules/\n.env\n", "utf-8");

      console.log(`\nBlueprint exported to ./${dirName}/`);
      console.log(`\nNext steps:`);
      console.log(`  cd ${dirName}`);
      console.log(`  git init && git add . && git commit -m "Export ${full.name}"`);
      console.log(`  pawn blueprints publish . --repo YOUR_ORG/${dirName}`);
    });

  // ── publish ───────────────────────────────────────────────────────────────

  cmd
    .command("publish <path>")
    .description("publish a local blueprint to GitHub and tag it as a pawn-blueprint")
    .option("--repo <owner/repo>", "GitHub repository to publish to (required if no git remote)")
    .option("--private", "create the GitHub repo as private (default: public)")
    .option("--description <text>", "GitHub repo description (defaults to pipeline description)")
    .action(async (pkgPath: string, opts: { repo?: string; private?: boolean; description?: string }) => {
      // 1. Validate path
      const absPath = resolve(pkgPath.replace(/^~/, process.env.HOME ?? "~"));
      if (!existsSync(absPath)) {
        console.error(`Path not found: ${absPath}`);
        process.exit(1);
      }
      if (!existsSync(join(absPath, "pipeline.yaml"))) {
        console.error(`No pipeline.yaml found at ${absPath}`);
        console.error("Run 'pawn blueprints export <name>' first.");
        process.exit(1);
      }

      // 2. Check gh CLI
      if (!ghAvailable()) {
        console.error("The 'gh' CLI is required to publish blueprints.");
        console.error("Install it from: https://cli.github.com");
        process.exit(1);
      }

      // 3. Get pipeline name for defaults
      let pipelineDescription = opts.description ?? "";
      try {
        const raw = require("node:fs").readFileSync(join(absPath, "pipeline.yaml"), "utf-8");
        const manifest = parseYaml(raw) as { name?: string; description?: string };
        if (!pipelineDescription && manifest.description) {
          pipelineDescription = manifest.description;
        }
      } catch { /* ignore */ }

      // 4. Init git if needed
      const isGitRepo = gitExec(["rev-parse", "--is-inside-work-tree"], absPath).ok;
      if (!isGitRepo) {
        console.log("Initializing git repository...");
        gitExec(["init"], absPath);
        gitExec(["add", "."], absPath);
        gitExec(["commit", "-m", "Initial blueprint"], absPath);
      } else {
        // Commit any uncommitted changes
        const statusResult = gitExec(["status", "--porcelain"], absPath);
        if (statusResult.stdout.trim()) {
          console.log("Committing local changes...");
          gitExec(["add", "."], absPath);
          gitExec(["commit", "-m", "Update blueprint"], absPath);
        }
      }

      // 5. Determine repo identifier
      let repoFullName = opts.repo ?? "";
      const remoteResult = gitExec(["remote", "get-url", "origin"], absPath);

      if (remoteResult.ok) {
        // Remote already exists — derive owner/repo from it
        const derived = parseRepoFromRemote(remoteResult.stdout.trim());
        if (derived) repoFullName = derived;

        // Push to existing remote
        console.log(`Pushing to ${repoFullName}...`);
        const pushResult = gitExec(["push", "-u", "origin", "HEAD"], absPath);
        if (!pushResult.ok) {
          console.error(`git push failed: ${pushResult.stderr}`);
          process.exit(1);
        }
      } else {
        // No remote — need --repo
        if (!repoFullName) {
          console.error("No git remote found. Specify a repository with --repo owner/repo");
          process.exit(1);
        }

        // Create and push via gh
        const visibility = opts.private ? "--private" : "--public";
        console.log(`Creating GitHub repository ${repoFullName}...`);
        const ghArgs = [
          "repo", "create", repoFullName,
          "--source", absPath,
          "--push",
          visibility,
        ];
        if (pipelineDescription) ghArgs.push("--description", pipelineDescription);

        const result = spawnSync("gh", ghArgs, { stdio: "inherit", cwd: absPath });
        if (result.status !== 0) {
          console.error("Failed to create GitHub repository.");
          process.exit(1);
        }
      }

      // 6. Add pawn-blueprint topic
      console.log("Adding pawn-blueprint topic...");
      const topicResult = spawnSync(
        "gh", ["repo", "edit", repoFullName, "--add-topic", "pawn-blueprint"],
        { stdio: "inherit" },
      );
      if (topicResult.status !== 0) {
        console.warn("Warning: could not add pawn-blueprint topic automatically.");
        console.warn(`Add it manually at: https://github.com/${repoFullName}`);
      }

      console.log(`\nPublished to https://github.com/${repoFullName}`);
      console.log("Blueprint is now discoverable via:");
      console.log(`  pawn blueprints discover`);
    });
}
