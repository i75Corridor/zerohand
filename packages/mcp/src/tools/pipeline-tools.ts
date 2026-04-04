import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ApiClient } from "../api-client.js";
import type { ApiPipeline } from "@zerohand/shared";

function formatPipeline(p: ApiPipeline): string {
  const lines = [`Pipeline: ${p.name} (${p.id})`];
  if (p.description) lines.push(`  Description: ${p.description}`);
  lines.push(`  Status: ${p.status}`);
  if (p.modelProvider && p.modelName) lines.push(`  Model: ${p.modelProvider}/${p.modelName}`);
  lines.push(`  Steps: ${p.steps.length}`);
  lines.push(`  Created: ${p.createdAt}`);
  return lines.join("\n");
}

export function registerPipelineTools(server: McpServer, client: ApiClient): void {
  server.tool(
    "list_pipelines",
    "List all pipelines with their status and step count",
    {},
    async () => {
      try {
        const pipelines = await client.listPipelines();
        if (pipelines.length === 0) {
          return { content: [{ type: "text", text: "No pipelines found." }] };
        }
        const text = pipelines.map(formatPipeline).join("\n\n");
        return { content: [{ type: "text", text }] };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Failed to list pipelines: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "create_pipeline",
    "Create a new pipeline with optional steps",
    {
      name: z.string().describe("Pipeline name"),
      description: z.string().optional().describe("Pipeline description"),
      steps: z.array(z.object({
        name: z.string().describe("Step name"),
        promptTemplate: z.string().describe("Prompt template for the step"),
        skillName: z.string().optional().describe("Skill to use for this step"),
      })).optional().describe("Pipeline steps"),
    },
    async ({ name, description, steps }) => {
      try {
        const pipeline = await client.createPipeline({ name, description });

        if (steps && steps.length > 0) {
          const failedSteps: string[] = [];
          for (let i = 0; i < steps.length; i++) {
            try {
              await client.createStep(pipeline.id, {
                name: steps[i].name,
                promptTemplate: steps[i].promptTemplate,
                skillName: steps[i].skillName ?? null,
                stepIndex: i,
              });
            } catch (stepErr) {
              failedSteps.push(`Step ${i} "${steps[i].name}": ${stepErr instanceof Error ? stepErr.message : String(stepErr)}`);
            }
          }

          if (failedSteps.length > 0) {
            return {
              content: [{
                type: "text",
                text: `Pipeline "${name}" created (${pipeline.id}) but some steps failed:\n${failedSteps.join("\n")}\n\nSuccessfully created ${steps.length - failedSteps.length} of ${steps.length} steps.`,
              }],
              isError: true,
            };
          }
        }

        const stepCount = steps?.length ?? 0;
        return {
          content: [{
            type: "text",
            text: `Pipeline "${name}" created successfully.\n  ID: ${pipeline.id}\n  Steps: ${stepCount}`,
          }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Failed to create pipeline: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "modify_pipeline",
    "Update an existing pipeline's configuration",
    {
      pipelineId: z.string().describe("Pipeline ID to update"),
      name: z.string().optional().describe("New pipeline name"),
      description: z.string().optional().describe("New description"),
      status: z.string().optional().describe("New status (active/archived)"),
    },
    async ({ pipelineId, ...updates }) => {
      try {
        const pipeline = await client.updatePipeline(pipelineId, updates);
        return {
          content: [{
            type: "text",
            text: `Pipeline updated successfully.\n${formatPipeline(pipeline)}`,
          }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Failed to update pipeline: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "remove_pipeline",
    "Delete a pipeline permanently",
    {
      pipelineId: z.string().describe("Pipeline ID to delete"),
    },
    async ({ pipelineId }) => {
      try {
        await client.deletePipeline(pipelineId);
        return {
          content: [{ type: "text", text: `Pipeline ${pipelineId} deleted successfully.` }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Failed to delete pipeline: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        };
      }
    },
  );
}
