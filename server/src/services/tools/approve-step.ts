import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "@mariozechner/pi-ai";
import { eq } from "drizzle-orm";
import { approvals, pipelineRuns } from "@zerohand/db";
import type { AgentToolContext } from "./context.js";

export function makeApproveStep(ctx: AgentToolContext): ToolDefinition {
  return {
    name: "approve_step",
    label: "Approve Step",
    description: "Approve a pending approval and re-queue the pipeline run.",
    parameters: Type.Object({
      approvalId: Type.String({ description: "The approval ID to approve" }),
      note: Type.Optional(
        Type.String({ description: "Optional note for the approval decision" }),
      ),
    }),
    execute: async (_id, params: { approvalId: string; note?: string }) => {
      const [approval] = await ctx.db
        .update(approvals)
        .set({
          status: "approved",
          decisionNote: params.note ?? null,
          decidedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(approvals.id, params.approvalId))
        .returning();

      if (!approval) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Approval ${params.approvalId} not found.`,
            },
          ],
          details: {},
        };
      }

      // Re-queue the pipeline run so the engine picks it up
      await ctx.db
        .update(pipelineRuns)
        .set({ status: "queued", updatedAt: new Date() })
        .where(eq(pipelineRuns.id, approval.pipelineRunId));

      ctx.broadcastDataChanged("approval", "updated", params.approvalId);
      ctx.broadcast({
        type: "run_status",
        pipelineRunId: approval.pipelineRunId,
        status: "queued",
      });

      return {
        content: [
          {
            type: "text" as const,
            text: `Approval ${params.approvalId} approved. Pipeline run ${approval.pipelineRunId} re-queued.`,
          },
        ],
        details: {},
      };
    },
  };
}
