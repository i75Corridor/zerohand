import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ApiClient } from "../api-client.js";
import type { ApiPipelineRun, ApiStepRun } from "@zerohand/shared";

function formatRun(run: ApiPipelineRun): string {
  const lines = [`Run: ${run.id}`];
  if (run.pipelineName) lines.push(`  Pipeline: ${run.pipelineName}`);
  lines.push(`  Status: ${run.status}`);
  lines.push(`  Trigger: ${run.triggerType}`);
  if (run.startedAt) lines.push(`  Started: ${run.startedAt}`);
  if (run.finishedAt) lines.push(`  Finished: ${run.finishedAt}`);
  if (run.error) lines.push(`  Error: ${run.error}`);
  return lines.join("\n");
}

function formatStepRun(step: ApiStepRun): string {
  const lines = [`  Step ${step.stepIndex}: ${step.status}`];
  if (step.error) lines.push(`    Error: ${step.error}`);
  if (step.startedAt) lines.push(`    Started: ${step.startedAt}`);
  if (step.finishedAt) lines.push(`    Finished: ${step.finishedAt}`);
  return lines.join("\n");
}

export function registerRunTools(server: McpServer, client: ApiClient): void {
  server.tool(
    "execute_pipeline",
    "Trigger a pipeline run",
    {
      pipelineId: z.string().describe("Pipeline ID to execute"),
      inputParams: z.record(z.unknown()).optional().describe("Input parameters for the run"),
    },
    async ({ pipelineId, inputParams }) => {
      try {
        const run = await client.createRun(pipelineId, inputParams as Record<string, unknown> | undefined);
        return {
          content: [{
            type: "text",
            text: `Pipeline run started.\n  Run ID: ${run.id}\n  Status: ${run.status}`,
          }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Failed to execute pipeline: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "get_run_status",
    "Get the status of a pipeline run including step details",
    {
      runId: z.string().describe("Run ID to check"),
    },
    async ({ runId }) => {
      try {
        const [run, steps] = await Promise.all([
          client.getRun(runId),
          client.getStepRuns(runId),
        ]);
        const runText = formatRun(run);
        const stepsText = steps.length > 0
          ? "\n\nSteps:\n" + steps.map(formatStepRun).join("\n")
          : "\n\nNo steps executed yet.";
        return {
          content: [{ type: "text", text: runText + stepsText }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Failed to get run status: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "list_runs",
    "List recent pipeline runs",
    {
      pipelineId: z.string().optional().describe("Filter by pipeline ID"),
    },
    async ({ pipelineId }) => {
      try {
        const runs = await client.listRuns(pipelineId);
        if (runs.length === 0) {
          return { content: [{ type: "text", text: "No runs found." }] };
        }
        const text = runs.map(formatRun).join("\n\n");
        return { content: [{ type: "text", text }] };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Failed to list runs: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "cancel_run",
    "Cancel an active pipeline run",
    {
      runId: z.string().describe("Run ID to cancel"),
    },
    async ({ runId }) => {
      try {
        const run = await client.cancelRun(runId);
        return {
          content: [{
            type: "text",
            text: `Run ${runId} cancelled.\n  Status: ${run.status}`,
          }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Failed to cancel run: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        };
      }
    },
  );
}
