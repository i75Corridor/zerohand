import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { Command } from "commander";
import { ApiClient } from "../api-client.js";
import { formatTable, relativeTime, shortId } from "../formatters.js";

function isLocalPath(arg: string): boolean {
  return arg.startsWith("./") || arg.startsWith("../") || arg.startsWith("/") || arg.startsWith("~/") || existsSync(arg);
}

export function registerPackagesCommand(program: Command, client: ApiClient): void {
  const cmd = program.command("packages").description("manage pipeline packages");

  cmd
    .command("list")
    .description("list installed packages")
    .action(async () => {
      const pkgs = await client.listPackages();
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

  cmd
    .command("install <repo-url-or-path>")
    .description("install a package from a GitHub repo URL or local directory path")
    .action(async (arg: string) => {
      if (isLocalPath(arg)) {
        const localPath = resolve(arg.replace(/^~/, process.env.HOME ?? "~"));
        if (!existsSync(localPath)) {
          console.error(`Path not found: ${localPath}`);
          process.exit(1);
        }
        console.log(`Loading local package from ${localPath}...`);
        await client.installLocalPackage(localPath);
        console.log("Local package loaded. Open the UI to view and edit it.");
        console.log("Note: UI changes will be saved back to disk at this path.");
      } else {
        console.log(`Installing ${arg}...`);
        await client.installPackage(arg);
        console.log("Package installed");
      }
    });

  cmd
    .command("update <name>")
    .description("update an installed package")
    .action(async (name: string) => {
      const pkg = await client.findPackageByName(name);
      if (!pkg) {
        console.error(`Package "${name}" not found`);
        process.exit(1);
      }
      await client.updatePackage(pkg.id);
      console.log(`Updated ${pkg.repoFullName}`);
    });

  cmd
    .command("uninstall <name>")
    .description("uninstall a package")
    .action(async (name: string) => {
      const pkg = await client.findPackageByName(name);
      if (!pkg) {
        console.error(`Package "${name}" not found`);
        process.exit(1);
      }
      await client.uninstallPackage(pkg.id);
      console.log(`Uninstalled ${pkg.repoFullName}`);
    });

  cmd
    .command("discover [query]")
    .description("search GitHub for zerohand packages")
    .action(async (query?: string) => {
      const results = await client.discoverPackages(query);
      if (results.length === 0) {
        console.log("No packages found");
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
}
