import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ApiClient } from "../api-client.js";
import type { ApiInstalledPackage } from "@pawn/shared";

function formatPackage(pkg: ApiInstalledPackage): string {
  const lines = [`Package: ${pkg.repoFullName} (${pkg.id})`];
  lines.push(`  Repo: ${pkg.repoUrl}`);
  if (pkg.pipelineName) lines.push(`  Pipeline: ${pkg.pipelineName}`);
  if (pkg.skills.length > 0) lines.push(`  Skills: ${pkg.skills.join(", ")}`);
  lines.push(`  Update available: ${pkg.updateAvailable ? "yes" : "no"}`);
  if (pkg.installedAt) lines.push(`  Installed: ${pkg.installedAt}`);
  return lines.join("\n");
}

export function registerPackageTools(server: McpServer, client: ApiClient): void {
  server.tool(
    "list_packages",
    "List all installed packages with their pipeline names, skills, and update status",
    {},
    async () => {
      try {
        const packages = await client.listPackages();
        if (packages.length === 0) {
          return { content: [{ type: "text", text: "No packages installed." }] };
        }
        const text = packages.map(formatPackage).join("\n\n");
        return { content: [{ type: "text", text }] };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Failed to list packages: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "install_package",
    "Install a pawn package from a GitHub repository URL",
    {
      repoUrl: z.string().describe("GitHub repository URL, e.g. https://github.com/owner/repo"),
      force: z.boolean().optional().describe("If true, install even when security scan reports high risk"),
    },
    async ({ repoUrl, force }) => {
      try {
        const result = await client.installPackage(repoUrl, force);
        return {
          content: [{ type: "text", text: `Package installed successfully.\n${JSON.stringify(result, null, 2)}` }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Failed to install package: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "update_package",
    "Update an installed package to the latest version from its remote repository",
    {
      packageId: z.string().describe("ID of the installed package to update"),
      force: z.boolean().optional().describe("If true, keep update even when security scan reports high risk"),
    },
    async ({ packageId, force }) => {
      try {
        const result = await client.updatePackage(packageId, force);
        return {
          content: [{ type: "text", text: `Package updated successfully.\n${JSON.stringify(result, null, 2)}` }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Failed to update package: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "uninstall_package",
    "Uninstall a package — removes the cloned repo, its pipeline, and any skills it installed",
    {
      packageId: z.string().describe("ID of the installed package to uninstall"),
    },
    async ({ packageId }) => {
      try {
        await client.uninstallPackage(packageId);
        return {
          content: [{ type: "text", text: `Package ${packageId} uninstalled successfully.` }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Failed to uninstall package: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "discover_packages",
    "Search GitHub for pawn packages (repos with the pawn-package topic)",
    {
      query: z.string().optional().describe("Optional search query to filter packages by keyword"),
    },
    async ({ query }) => {
      try {
        const results = await client.discoverPackages(query);
        if (results.length === 0) {
          return { content: [{ type: "text", text: "No packages found." }] };
        }
        const text = (results as Array<Record<string, unknown>>)
          .map((r) => {
            const lines = [`${r.fullName} (${r.stars ?? 0} stars)`];
            if (r.description) lines.push(`  ${r.description}`);
            lines.push(`  URL: ${r.url}`);
            if (r.installed) lines.push(`  [INSTALLED]`);
            return lines.join("\n");
          })
          .join("\n\n");
        return { content: [{ type: "text", text }] };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Failed to discover packages: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "scan_package",
    "Clone a package repository and run a security scan without installing it",
    {
      repoUrl: z.string().describe("GitHub repository URL to scan, e.g. https://github.com/owner/repo"),
    },
    async ({ repoUrl }) => {
      try {
        const report = await client.scanPackage(repoUrl);
        return {
          content: [{ type: "text", text: JSON.stringify(report, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Failed to scan package: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        };
      }
    },
  );
}
