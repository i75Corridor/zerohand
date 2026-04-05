import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "@mariozechner/pi-ai";
import { eq, desc } from "drizzle-orm";
import { approvals, pipelineRuns, pipelines } from "@zerohand/db";
import type { AgentToolContext } from "./context.js";

export function makeListApprovals(ctx: AgentToolContext): ToolDefinition {
  return {
    name: "list_approvals",
    label: "List Approvals",
    description:
      "List approval requests with an optional status filter. Returns pending approvals by default.",
    parameters: Type.Object({
      status: Type.Optional(
        Type.String({
          description:
            "Filter by status: pending, approved, rejected. Default: pending",
        }),
      ),
    }),
    execute: async (_id, params: { status?: string }) => {
      const status = params.status ?? "pending";
      const rows = await ctx.db
        .select({
          approval: approvals,
          pipelineName: pipelines.name,
        })
        .from(approvals)
        .leftJoin(pipelineRuns, eq(approvals.pipelineRunId, pipelineRuns.id))
        .leftJoin(pipelines, eq(pipelineRuns.pipelineId, pipelines.id))
        .where(eq(approvals.status, status))
        .orderBy(desc(approvals.createdAt));

      if (rows.length === 0) {
        return {
          content: [
            { type: "text" as const, text: `No ${status} approvals found.` },
          ],
          details: {},
        };
      }

      const lines = rows.map((r) => {
        const a = r.approval;
        const parts = [`Approval: ${a.id}`];
        if (r.pipelineName) parts.push(`  Pipeline: ${r.pipelineName}`);
        parts.push(`  Run: ${a.pipelineRunId}`);
        parts.push(`  Status: ${a.status}`);
        const stepName = (a.payload as Record<string, unknown>)
          ?.stepName as string | undefined;
        if (stepName) parts.push(`  Step: ${stepName}`);
        if (a.decisionNote) parts.push(`  Note: ${a.decisionNote}`);
        parts.push(`  Created: ${a.createdAt.toISOString()}`);
        return parts.join("\n");
      });

      return {
        content: [
          {
            type: "text" as const,
            text: `Found ${rows.length} ${status} approval(s):\n\n${lines.join("\n\n")}`,
          },
        ],
        details: {},
      };
    },
  };
}
