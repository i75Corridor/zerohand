import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "@mariozechner/pi-ai";
import { eq } from "drizzle-orm";
import { approvals, pipelineRuns, stepRuns } from "@pawn/db";
import type { AgentToolContext } from "./context.js";

export function makeRejectStep(ctx: AgentToolContext): ToolDefinition {
  return {
    name: "reject_step",
    label: "Reject Step",
    description:
      "Reject a pending approval and fail the pipeline run.",
    parameters: Type.Object({
      approvalId: Type.String({ description: "The approval ID to reject" }),
      note: Type.Optional(
        Type.String({ description: "Optional note explaining the rejection" }),
      ),
    }),
    execute: async (_id, params: { approvalId: string; note?: string }) => {
      const [approval] = await ctx.db
        .update(approvals)
        .set({
          status: "rejected",
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

      const reason = params.note
        ? `Step rejected: ${params.note}`
        : "Step rejected by operator";

      // Fail the pipeline run
      await ctx.db
        .update(pipelineRuns)
        .set({
          status: "failed",
          error: reason,
          finishedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(pipelineRuns.id, approval.pipelineRunId));

      // Fail the step run if present
      if (approval.stepRunId) {
        await ctx.db
          .update(stepRuns)
          .set({
            status: "failed",
            error: reason,
            finishedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(stepRuns.id, approval.stepRunId));
      }

      ctx.broadcastDataChanged("approval", "updated", params.approvalId);
      ctx.broadcast({
        type: "run_status",
        pipelineRunId: approval.pipelineRunId,
        status: "failed",
      });

      return {
        content: [
          {
            type: "text" as const,
            text: `Approval ${params.approvalId} rejected. Pipeline run ${approval.pipelineRunId} failed.${params.note ? ` Reason: ${params.note}` : ""}`,
          },
        ],
        details: {},
      };
    },
  };
}
