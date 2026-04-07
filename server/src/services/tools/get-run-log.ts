import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "@mariozechner/pi-ai";
import { asc, eq } from "drizzle-orm";
import { pipelineRuns, stepRuns, stepRunEvents } from "@pawn/db";
import type { AgentToolContext } from "./context.js";

const MAX_EVENTS = 500;
const MAX_DELTA_CHARS = 300;

export function makeGetRunLog(ctx: AgentToolContext): ToolDefinition {
  return {
    name: "get_run_log",
    label: "Get Run Debug Log",
    description: "Read the execution trace for a pipeline run: step events (LLM output, tool calls, errors) from the database. Always available regardless of server log settings.",
    parameters: Type.Object({
      runId: Type.String({ description: "The pipeline run ID" }),
    }),
    execute: async (_id, params: { runId: string }) => {
      const run = await ctx.db.query.pipelineRuns.findFirst({
        where: eq(pipelineRuns.id, params.runId),
      });
      if (!run) {
        return { content: [{ type: "text" as const, text: `Run ${params.runId} not found.` }], details: {} };
      }

      // Load all step runs for this pipeline run
      const steps = await ctx.db
        .select()
        .from(stepRuns)
        .where(eq(stepRuns.pipelineRunId, params.runId))
        .orderBy(asc(stepRuns.stepIndex));

      if (steps.length === 0) {
        return { content: [{ type: "text" as const, text: "No step runs found for this run." }], details: {} };
      }

      // Load events for all steps
      const result: Record<string, unknown>[] = [];
      let totalEvents = 0;
      let truncated = false;

      for (const step of steps) {
        if (totalEvents >= MAX_EVENTS) { truncated = true; break; }

        const events = await ctx.db
          .select()
          .from(stepRunEvents)
          .where(eq(stepRunEvents.stepRunId, step.id))
          .orderBy(asc(stepRunEvents.seq));

        result.push({
          stepIndex: step.stepIndex,
          status: step.status,
          error: step.error ?? null,
          events: events.slice(0, MAX_EVENTS - totalEvents).map((e) => {
            // Truncate llm_delta messages to keep output compact
            const msg = e.eventType === "text_delta" && e.message && e.message.length > MAX_DELTA_CHARS
              ? e.message.slice(0, MAX_DELTA_CHARS) + "…"
              : e.message;
            return {
              seq: e.seq,
              type: e.eventType,
              ...(msg ? { message: msg } : {}),
              ...(e.payload ? { payload: e.payload } : {}),
            };
          }),
        });

        totalEvents += events.length;
        if (totalEvents >= MAX_EVENTS) truncated = true;
      }

      const text = JSON.stringify(result, null, 2)
        + (truncated ? `\n\n[Truncated — showing first ${MAX_EVENTS} events]` : "");

      return { content: [{ type: "text" as const, text }], details: {} };
    },
  };
}
