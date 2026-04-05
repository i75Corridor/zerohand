import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "@mariozechner/pi-ai";
import { eq, asc } from "drizzle-orm";
import { pipelines, pipelineSteps } from "@zerohand/db";
import { pipelineToYaml } from "@zerohand/shared";
import type { ApiPipeline } from "@zerohand/shared";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentToolContext } from "./context.js";
import { safeSkillDir } from "./skill-utils.js";

export function makeExportPackage(ctx: AgentToolContext): ToolDefinition {
  return {
    name: "export_package",
    label: "Export Package",
    description: "Return the full package structure for a pipeline: pipeline.yaml content, and all bundled skills with their SKILL.md and scripts. Use this to preview what would be published.",
    parameters: Type.Object({
      pipelineId: Type.String({ description: "The pipeline ID to export." }),
    }),
    execute: async (_id, params: { pipelineId: string }) => {
      const pipeline = await ctx.db.query.pipelines.findFirst({ where: eq(pipelines.id, params.pipelineId) });
      if (!pipeline) {
        return { content: [{ type: "text" as const, text: "Pipeline not found." }], details: {} };
      }
      const steps = await ctx.db.query.pipelineSteps.findMany({
        where: eq(pipelineSteps.pipelineId, params.pipelineId),
        orderBy: [asc(pipelineSteps.stepIndex)],
      });

      const apiPipeline: ApiPipeline = {
        id: pipeline.id,
        name: pipeline.name,
        description: pipeline.description,
        status: pipeline.status,
        inputSchema: pipeline.inputSchema as Record<string, unknown> | null,
        systemPrompt: pipeline.systemPrompt,
        modelProvider: pipeline.modelProvider,
        modelName: pipeline.modelName,
        createdAt: pipeline.createdAt.toISOString(),
        steps: steps.map((s) => ({
          id: s.id,
          stepIndex: s.stepIndex,
          name: s.name,
          skillName: s.skillName,
          promptTemplate: s.promptTemplate,
          timeoutSeconds: s.timeoutSeconds,
          approvalRequired: s.approvalRequired,
          retryConfig: s.retryConfig as any ?? null,
          metadata: s.metadata as Record<string, unknown> | null,
        })),
      };

      const yaml = pipelineToYaml(apiPipeline);

      // Collect unique skill names referenced by steps
      const skillNames = [...new Set(steps.map((s) => s.skillName).filter(Boolean) as string[])];

      const skills: Array<{ name: string; qualifiedName: string; skillMd: string; scripts: Array<{ filename: string; content: string }> }> = [];

      for (const qualifiedName of skillNames) {
        const skillDir = safeSkillDir(qualifiedName, ctx.skillsDir);
        if (!skillDir || !existsSync(skillDir)) continue;

        const skillMdPath = join(skillDir, "SKILL.md");
        const skillMd = existsSync(skillMdPath) ? readFileSync(skillMdPath, "utf-8") : "";

        const scripts: Array<{ filename: string; content: string }> = [];
        const scriptsDir = join(skillDir, "scripts");
        if (existsSync(scriptsDir)) {
          for (const file of readdirSync(scriptsDir)) {
            try {
              scripts.push({ filename: file, content: readFileSync(join(scriptsDir, file), "utf-8") });
            } catch { /* skip unreadable files */ }
          }
        }

        // Strip namespace for export (namespace is implied by the package)
        const slashIdx = qualifiedName.indexOf("/");
        const bareName = slashIdx > -1 ? qualifiedName.slice(slashIdx + 1) : qualifiedName;

        skills.push({ name: bareName, qualifiedName, skillMd, scripts });
      }

      const result = { pipelineYaml: yaml, skills };
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        details: {},
      };
    },
  };
}
