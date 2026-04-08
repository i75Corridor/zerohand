import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ApiClient } from "../api-client.js";
import type { ApiInstalledBlueprint } from "@pawn/shared";

function formatBlueprint(pkg: ApiInstalledBlueprint): string {
  const lines = [`Blueprint: ${pkg.repoFullName} (${pkg.id})`];
  lines.push(`  Repo: ${pkg.repoUrl}`);
  if (pkg.pipelineName) lines.push(`  Pipeline: ${pkg.pipelineName}`);
  if (pkg.skills.length > 0) lines.push(`  Skills: ${pkg.skills.join(", ")}`);
  lines.push(`  Update available: ${pkg.updateAvailable ? "yes" : "no"}`);
  if (pkg.installedAt) lines.push(`  Installed: ${pkg.installedAt}`);
  return lines.join("\n");
}

export function registerBlueprintTools(server: McpServer, client: ApiClient): void {
  server.tool(
    "list_blueprints",
    "List all installed blueprints with their pipeline names, skills, and update status",
    {},
    async () => {
      try {
        const blueprints = await client.listBlueprints();
        if (blueprints.length === 0) {
          return { content: [{ type: "text", text: "No blueprints installed." }] };
        }
        const text = blueprints.map(formatBlueprint).join("\n\n");
        return { content: [{ type: "text", text }] };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Failed to list blueprints: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "install_blueprint",
    "Install a pawn blueprint from a GitHub repository URL",
    {
      repoUrl: z.string().describe("GitHub repository URL, e.g. https://github.com/owner/repo"),
      force: z.boolean().optional().describe("If true, install even when security scan reports high risk"),
    },
    async ({ repoUrl, force }) => {
      try {
        const result = await client.installBlueprint(repoUrl, force);
        return {
          content: [{ type: "text", text: `Blueprint installed successfully.\n${JSON.stringify(result, null, 2)}` }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Failed to install blueprint: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "update_blueprint",
    "Update an installed blueprint to the latest version from its remote repository",
    {
      blueprintId: z.string().describe("ID of the installed blueprint to update"),
      force: z.boolean().optional().describe("If true, keep update even when security scan reports high risk"),
    },
    async ({ blueprintId, force }) => {
      try {
        const result = await client.updateBlueprint(blueprintId, force);
        return {
          content: [{ type: "text", text: `Blueprint updated successfully.\n${JSON.stringify(result, null, 2)}` }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Failed to update blueprint: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "uninstall_blueprint",
    "Uninstall a blueprint — removes the cloned repo, its pipeline, and any skills it installed",
    {
      blueprintId: z.string().describe("ID of the installed blueprint to uninstall"),
    },
    async ({ blueprintId }) => {
      try {
        await client.uninstallBlueprint(blueprintId);
        return {
          content: [{ type: "text", text: `Blueprint ${blueprintId} uninstalled successfully.` }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Failed to uninstall blueprint: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "discover_blueprints",
    "Search GitHub for pawn blueprints (repos with the pawn-blueprint topic)",
    {
      query: z.string().optional().describe("Optional search query to filter blueprints by keyword"),
    },
    async ({ query }) => {
      try {
        const results = await client.discoverBlueprints(query);
        if (results.length === 0) {
          return { content: [{ type: "text", text: "No blueprints found." }] };
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
          content: [{ type: "text", text: `Failed to discover blueprints: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "scan_blueprint",
    "Clone a blueprint repository and run a security scan without installing it",
    {
      repoUrl: z.string().describe("GitHub repository URL to scan, e.g. https://github.com/owner/repo"),
    },
    async ({ repoUrl }) => {
      try {
        const report = await client.scanBlueprint(repoUrl);
        return {
          content: [{ type: "text", text: JSON.stringify(report, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Failed to scan blueprint: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        };
      }
    },
  );
}
