import { pgTable, uuid, text, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { pipelineRuns, stepRuns } from "./pipeline-runs.js";

export const approvals = pgTable(
  "approvals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pipelineRunId: uuid("pipeline_run_id").notNull().references(() => pipelineRuns.id, { onDelete: "cascade" }),
    stepRunId: uuid("step_run_id").references(() => stepRuns.id, { onDelete: "set null" }),
    // pending, approved, rejected
    status: text("status").notNull().default("pending"),
    // Context for the human reviewer (what is being approved, why)
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    decisionNote: text("decision_note"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    statusIdx: index("approvals_status_idx").on(t.status),
    pipelineRunIdx: index("approvals_pipeline_run_idx").on(t.pipelineRunId),
  }),
);
