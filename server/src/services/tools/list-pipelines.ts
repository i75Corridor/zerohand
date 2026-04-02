import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "@mariozechner/pi-ai";
import { eq, count } from "drizzle-orm";
import { pipelines, pipelineSteps } from "@zerohand/db";
import type { AgentToolContext } from "./context.js";

export function makeListPipelines(ctx: AgentToolContext): ToolDefinition {
  return {
    name: "list_pipelines",
    label: "List Pipelines",
    description: "List all pipelines in the system with their step counts and status.",
    parameters: Type.Object({}),
    execute: async () => {
      const rows = await ctx.db.select().from(pipelines);
      const withSteps = await Promise.all(
        rows.map(async (p) => {
          const steps = await ctx.db
            .select({ count: count() })
            .from(pipelineSteps)
            .where(eq(pipelineSteps.pipelineId, p.id));
          return {
            id: p.id,
            name: p.name,
            description: p.description,
            status: p.status,
            stepCount: steps[0]?.count ?? 0,
          };
        }),
      );
      return { content: [{ type: "text" as const, text: JSON.stringify(withSteps, null, 2) }], details: {} };
    },
  };
}
