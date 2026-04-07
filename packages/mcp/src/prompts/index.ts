import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ApiClient } from "../api-client.js";

export function registerPrompts(server: McpServer, client: ApiClient): void {
  server.prompt(
    "create-pipeline",
    "Guided pipeline creation wizard — helps you create a new pipeline step by step",
    {},
    async () => {
      const skills = await client.listSkills();
      const skillList = skills.length > 0
        ? skills.map((s) => `- ${s.name}: ${s.description}`).join("\n")
        : "No skills available.";

      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: [
                "I want to create a new Pawn pipeline. Help me define it step by step.",
                "",
                "I need to provide:",
                "1. A name for the pipeline",
                "2. A description of what it does",
                "3. One or more steps, each with a name and prompt template",
                "4. Optionally, a skill for each step",
                "",
                "Available skills:",
                skillList,
                "",
                "Please ask me about each of these in order, then use the create_pipeline tool to create it.",
              ].join("\n"),
            },
          },
        ],
      };
    },
  );

  server.prompt(
    "debug-run",
    "Analyze a failed pipeline run and suggest fixes",
    { runId: z.string().describe("ID of the run to debug") },
    async ({ runId }) => {
      try {
        const [run, steps] = await Promise.all([
          client.getRun(runId),
          client.getStepRuns(runId),
        ]);

        const runInfo = [
          `Run ID: ${run.id}`,
          `Pipeline: ${run.pipelineName ?? run.pipelineId}`,
          `Status: ${run.status}`,
          `Trigger: ${run.triggerType}`,
          run.startedAt ? `Started: ${run.startedAt}` : null,
          run.finishedAt ? `Finished: ${run.finishedAt}` : null,
          run.error ? `Error: ${run.error}` : null,
        ].filter(Boolean).join("\n");

        const stepsInfo = steps.map((s) => {
          const lines = [`Step ${s.stepIndex}: ${s.status}`];
          if (s.error) lines.push(`  Error: ${s.error}`);
          if (s.output) lines.push(`  Output: ${JSON.stringify(s.output)}`);
          return lines.join("\n");
        }).join("\n\n");

        return {
          messages: [
            {
              role: "user" as const,
              content: {
                type: "text" as const,
                text: [
                  "Please analyze this pipeline run and help me understand what went wrong and how to fix it.",
                  "",
                  "Run Details:",
                  runInfo,
                  "",
                  "Step Details:",
                  stepsInfo || "No steps executed.",
                  "",
                  "Input Parameters:",
                  JSON.stringify(run.inputParams, null, 2),
                ].join("\n"),
              },
            },
          ],
        };
      } catch (err) {
        return {
          messages: [
            {
              role: "user" as const,
              content: {
                type: "text" as const,
                text: `Failed to fetch run details for ${runId}: ${err instanceof Error ? err.message : String(err)}. Please check that the run ID is correct.`,
              },
            },
          ],
        };
      }
    },
  );
}
