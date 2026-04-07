import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "@mariozechner/pi-ai";
import { createRun } from "../run-factory.js";
import type { AgentToolContext } from "./context.js";

export function makeTriggerPipeline(ctx: AgentToolContext): ToolDefinition {
  return {
    name: "trigger_pipeline",
    label: "Trigger Pipeline",
    description: "Trigger a pipeline run with optional input parameters. Returns the run ID.",
    parameters: Type.Object({
      pipelineId: Type.String({ description: "The pipeline ID to run" }),
      inputParams: Type.Optional(Type.Record(Type.String(), Type.Unknown(), { description: "Input parameters for the pipeline" })),
    }),
    execute: async (_id, params: { pipelineId: string; inputParams?: Record<string, unknown> }) => {
      const run = await createRun(ctx.db, {
        pipelineId: params.pipelineId,
        inputParams: params.inputParams ?? {},
        triggerType: "manual",
      });
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({ runId: run.id, status: "queued", message: "Run created and queued for execution." }, null, 2),
        }],
        details: {},
      };
    },
  };
}
