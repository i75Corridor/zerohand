import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ApiClient } from "../api-client.js";
import type { ApiBudgetPolicy } from "@zerohand/shared";

function formatBudget(b: ApiBudgetPolicy): string {
  const dollars = (b.amountCents / 100).toFixed(2);
  const lines = [
    `Budget: ${b.id}`,
    `  Scope: ${b.scopeType} / ${b.scopeId}`,
    `  Amount: $${dollars}`,
    `  Window: ${b.windowKind}`,
    `  Warn at: ${b.warnPercent}%`,
    `  Hard stop: ${b.hardStopEnabled ? "yes" : "no"}`,
  ];
  return lines.join("\n");
}

export function registerBudgetTools(server: McpServer, client: ApiClient): void {
  server.tool(
    "list_budgets",
    "List budget policies with optional scope filters",
    {
      scopeType: z.string().optional().describe("Filter by scope type: worker or pipeline"),
      scopeId: z.string().optional().describe("Filter by scope ID"),
    },
    async ({ scopeType, scopeId }) => {
      try {
        const budgets = await client.listBudgets(scopeType, scopeId);
        if (budgets.length === 0) {
          return { content: [{ type: "text", text: "No budget policies found." }] };
        }
        const text = budgets.map(formatBudget).join("\n\n");
        return { content: [{ type: "text", text }] };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Failed to list budgets: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "create_budget",
    "Create a new budget policy for a worker or pipeline",
    {
      scopeType: z.string().describe("Scope type: worker or pipeline"),
      scopeId: z.string().describe("The ID of the worker or pipeline"),
      amountCents: z.number().describe("Budget amount in cents"),
      windowKind: z.string().optional().describe("Budget window: calendar_month or lifetime (default: calendar_month)"),
      warnPercent: z.number().optional().describe("Warning threshold percentage (default: 80)"),
      hardStopEnabled: z.boolean().optional().describe("Whether to hard-stop when budget is exceeded (default: true)"),
    },
    async ({ scopeType, scopeId, amountCents, windowKind, warnPercent, hardStopEnabled }) => {
      try {
        const budget = await client.createBudget({
          scopeType,
          scopeId,
          amountCents,
          windowKind: windowKind ?? "calendar_month",
          warnPercent: warnPercent ?? 80,
          hardStopEnabled: hardStopEnabled ?? true,
        });
        return {
          content: [{ type: "text", text: `Budget created successfully.\n${formatBudget(budget)}` }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Failed to create budget: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "update_budget",
    "Update an existing budget policy",
    {
      budgetId: z.string().describe("Budget policy ID to update"),
      amountCents: z.number().optional().describe("New budget amount in cents"),
      windowKind: z.string().optional().describe("New window kind: calendar_month or lifetime"),
      warnPercent: z.number().optional().describe("New warning threshold percentage"),
      hardStopEnabled: z.boolean().optional().describe("Whether to hard-stop when budget is exceeded"),
    },
    async ({ budgetId, ...updates }) => {
      try {
        const budget = await client.updateBudget(budgetId, updates);
        return {
          content: [{ type: "text", text: `Budget updated successfully.\n${formatBudget(budget)}` }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Failed to update budget: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "delete_budget",
    "Delete a budget policy permanently",
    {
      budgetId: z.string().describe("Budget policy ID to delete"),
    },
    async ({ budgetId }) => {
      try {
        await client.deleteBudget(budgetId);
        return {
          content: [{ type: "text", text: `Budget policy ${budgetId} deleted successfully.` }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Failed to delete budget: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        };
      }
    },
  );
}
