import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "@mariozechner/pi-ai";
import { eq } from "drizzle-orm";
import { pipelineSteps } from "@zerohand/db";
import type { AgentToolContext } from "./context.js";

export function makeUpdatePipelineStep(ctx: AgentToolContext): ToolDefinition {
  return {
    name: "update_pipeline_step",
    label: "Update Pipeline Step",
    description: "Update an existing pipeline step.",
    parameters: Type.Object({
      stepId: Type.String({ description: "The step ID" }),
      name: Type.Optional(Type.String()),
      skillName: Type.Optional(Type.String()),
      promptTemplate: Type.Optional(Type.String()),
      timeoutSeconds: Type.Optional(Type.Number()),
      approvalRequired: Type.Optional(Type.Boolean()),
    }),
    execute: async (_id, params: { stepId: string; name?: string; skillName?: string; promptTemplate?: string; timeoutSeconds?: number; approvalRequired?: boolean }) => {
      const { stepId, ...fields } = params;
      const [row] = await ctx.db
        .update(pipelineSteps)
        .set({ ...fields, updatedAt: new Date() })
        .where(eq(pipelineSteps.id, stepId))
        .returning();
      if (!row) return { content: [{ type: "text" as const, text: "Step not found." }], details: {} };
      ctx.broadcastDataChanged("step", "updated", row.id);
      ctx.broadcastDataChanged("pipeline", "updated", row.pipelineId);
      return { content: [{ type: "text" as const, text: `Updated step "${row.name}".` }], details: {} };
    },
  };
}
