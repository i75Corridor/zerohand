import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "@mariozechner/pi-ai";
import { eq, asc } from "drizzle-orm";
import { pipelines, pipelineSteps } from "@pawn/db";
import type { AgentToolContext } from "./context.js";
import { loadSkillDef } from "../skill-loader.js";
import { resolvePrompt } from "../execution-engine.js";
import { readModelSetting } from "../model-utils.js";

export function makeTestStep(ctx: AgentToolContext): ToolDefinition {
  return {
    name: "test_step",
    label: "Test Step",
    description:
      "Execute a single pipeline step in isolation with provided mock inputs. Runs the skill's LLM agent and returns the output text. Useful for iterating on a step without running the full pipeline.",
    parameters: Type.Object({
      pipelineId: Type.String({ description: "The pipeline ID." }),
      stepIndex: Type.Number({ description: "0-based index of the step to test." }),
      mockInputs: Type.Optional(
        Type.Record(Type.String(), Type.String(), {
          description: "Mock values for {{input.X}} template tokens, keyed by field name.",
        }),
      ),
      previousOutputs: Type.Optional(
        Type.Record(Type.String(), Type.String(), {
          description: "Mock outputs for earlier steps, keyed by step index as a string (e.g. {'0': 'step 0 output'}).",
        }),
      ),
    }),
    execute: async (_id, params: {
      pipelineId: string;
      stepIndex: number;
      mockInputs?: Record<string, string>;
      previousOutputs?: Record<string, string>;
    }) => {
      if (!ctx.runSkillStep) {
        return { content: [{ type: "text" as const, text: "test_step is not available in this context." }], details: {} };
      }

      const pipeline = await ctx.db.query.pipelines.findFirst({ where: eq(pipelines.id, params.pipelineId) });
      if (!pipeline) return { content: [{ type: "text" as const, text: "Pipeline not found." }], details: {} };

      const steps = await ctx.db.query.pipelineSteps.findMany({
        where: eq(pipelineSteps.pipelineId, params.pipelineId),
        orderBy: [asc(pipelineSteps.stepIndex)],
      });

      const step = steps.find((s) => s.stepIndex === params.stepIndex);
      if (!step) {
        return { content: [{ type: "text" as const, text: `Step ${params.stepIndex} not found in pipeline.` }], details: {} };
      }
      if (!step.skillName) {
        return { content: [{ type: "text" as const, text: `Step ${params.stepIndex} has no skill assigned.` }], details: {} };
      }

      const skill = loadSkillDef(step.skillName, ctx.skillsDir);
      if (!skill) {
        return { content: [{ type: "text" as const, text: `Skill not found: "${step.skillName}"` }], details: {} };
      }

      // Build step outputs map from previousOutputs
      const stepOutputs = new Map<number, string>();
      for (const [k, v] of Object.entries(params.previousOutputs ?? {})) {
        const idx = parseInt(k, 10);
        if (!isNaN(idx)) stepOutputs.set(idx, v);
      }

      const resolvedPrompt = resolvePrompt(
        step.promptTemplate,
        params.mockInputs ?? {},
        stepOutputs,
      );

      const defaultModel = await readModelSetting(ctx.db, "default_pipeline_model", "google/gemini-2.5-flash");
      const modelProvider = pipeline.modelProvider ?? defaultModel.provider;
      const modelName = pipeline.modelName ?? defaultModel.modelId;
      const pipelineContext = ((pipeline.metadata as Record<string, unknown>)?.context ?? {}) as Record<string, string>;

      const events: string[] = [];
      try {
        const result = await ctx.runSkillStep(
          skill,
          pipeline.systemPrompt ?? null,
          modelProvider,
          modelName,
          resolvedPrompt,
          pipelineContext,
          (eventType, message) => {
            if (eventType === "tool_call_start") events.push(`[tool] ${message}`);
          },
        );
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({ output: result.output, toolCalls: events, usage: result.usage }, null, 2),
          }],
          details: {},
        };
      } catch (err) {
        return { content: [{ type: "text" as const, text: `Step execution failed: ${String(err)}` }], details: {} };
      }
    },
  };
}
