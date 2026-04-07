import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ApiClient } from "../api-client.js";
import type { ApiApproval } from "@pawn/shared";

function formatApproval(a: ApiApproval): string {
  const lines = [`Approval: ${a.id}`];
  if (a.pipelineName) lines.push(`  Pipeline: ${a.pipelineName}`);
  lines.push(`  Run: ${a.pipelineRunId}`);
  lines.push(`  Status: ${a.status}`);
  if (a.stepName) lines.push(`  Step: ${a.stepName}`);
  if (a.decisionNote) lines.push(`  Note: ${a.decisionNote}`);
  if (a.decidedAt) lines.push(`  Decided: ${a.decidedAt}`);
  lines.push(`  Created: ${a.createdAt}`);
  return lines.join("\n");
}

export function registerApprovalTools(server: McpServer, client: ApiClient): void {
  server.tool(
    "list_approvals",
    "List approval requests with optional status filter (default: pending)",
    {
      status: z
        .string()
        .optional()
        .describe("Filter by status: pending, approved, rejected. Default: pending"),
    },
    async ({ status }) => {
      try {
        const approvals = await client.listApprovals(status ?? "pending");
        if (approvals.length === 0) {
          return {
            content: [
              { type: "text", text: `No ${status ?? "pending"} approvals found.` },
            ],
          };
        }
        const text = approvals.map(formatApproval).join("\n\n");
        return { content: [{ type: "text", text }] };
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: `Failed to list approvals: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "approve_step",
    "Approve a pending approval and re-queue the pipeline run",
    {
      approvalId: z.string().describe("The approval ID to approve"),
      note: z.string().optional().describe("Optional note for the approval decision"),
    },
    async ({ approvalId, note }) => {
      try {
        const approval = await client.approveStep(approvalId, note);
        return {
          content: [
            {
              type: "text",
              text: `Approval ${approvalId} approved.\n  Run ${approval.pipelineRunId} re-queued.`,
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: `Failed to approve step: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "reject_step",
    "Reject a pending approval and fail the pipeline run",
    {
      approvalId: z.string().describe("The approval ID to reject"),
      note: z.string().optional().describe("Optional note explaining the rejection"),
    },
    async ({ approvalId, note }) => {
      try {
        const approval = await client.rejectStep(approvalId, note);
        return {
          content: [
            {
              type: "text",
              text: `Approval ${approvalId} rejected.\n  Run ${approval.pipelineRunId} failed.${note ? `\n  Reason: ${note}` : ""}`,
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: `Failed to reject step: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
