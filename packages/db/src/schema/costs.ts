import { pgTable, uuid, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { stepRuns, pipelineRuns } from "./pipeline-runs.js";

export const costEvents = pgTable(
  "cost_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    stepRunId: uuid("step_run_id").references(() => stepRuns.id),
    skillName: text("skill_name"),
    pipelineRunId: uuid("pipeline_run_id").notNull().references(() => pipelineRuns.id),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    costCents: integer("cost_cents").notNull().default(0),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    skillDateIdx: index("cost_events_skill_date_idx").on(t.skillName, t.occurredAt),
    pipelineRunIdx: index("cost_events_pipeline_run_idx").on(t.pipelineRunId),
  }),
);
