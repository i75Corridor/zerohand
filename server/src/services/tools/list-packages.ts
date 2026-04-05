import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "@mariozechner/pi-ai";
import { eq } from "drizzle-orm";
import { installedPackages, pipelines } from "@zerohand/db";
import type { AgentToolContext } from "./context.js";

export function makeListPackages(ctx: AgentToolContext): ToolDefinition {
  return {
    name: "list_packages",
    label: "List Packages",
    description: "List all installed packages enriched with pipeline names, skills, and update status.",
    parameters: Type.Object({}),
    execute: async () => {
      const pkgs = await ctx.db.select().from(installedPackages);

      const enriched = await Promise.all(
        pkgs.map(async (pkg) => {
          let pipelineName: string | null = null;
          if (pkg.pipelineId) {
            const pipe = await ctx.db
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

      return { content: [{ type: "text" as const, text: JSON.stringify(enriched, null, 2) }], details: {} };
    },
  };
}
