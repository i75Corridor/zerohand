import { pgTable, uuid, text, integer, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { pipelines } from "./pipelines.js";
import { workers } from "./workers.js";

export const pipelineRuns = pgTable(
  "pipeline_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pipelineId: uuid("pipeline_id").notNull().references(() => pipelines.id),
    // queued, running, paused, completed, failed, cancelled
    status: text("status").notNull().default("queued"),
    inputParams: jsonb("input_params").$type<Record<string, unknown>>().notNull().default({}),
    output: jsonb("output").$type<Record<string, unknown>>(),
    triggerType: text("trigger_type").notNull().default("manual"), // manual, cron, webhook, channel
    triggerDetail: text("trigger_detail"),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pipelineStatusIdx: index("pipeline_runs_pipeline_status_idx").on(t.pipelineId, t.status),
    createdAtIdx: index("pipeline_runs_created_at_idx").on(t.createdAt),
  }),
);

export const stepRuns = pgTable(
  "step_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pipelineRunId: uuid("pipeline_run_id").notNull().references(() => pipelineRuns.id, { onDelete: "cascade" }),
    stepIndex: integer("step_index").notNull(),
    workerId: uuid("worker_id").notNull().references(() => workers.id),
    // queued, running, awaiting_approval, completed, failed, cancelled
    status: text("status").notNull().default("queued"),
    input: jsonb("input").$type<Record<string, unknown>>(),
    output: jsonb("output").$type<Record<string, unknown>>(),
    sessionIdBefore: text("session_id_before"),
    sessionIdAfter: text("session_id_after"),
    usageJson: jsonb("usage_json").$type<Record<string, unknown>>(),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    runStepIdx: index("step_runs_run_step_idx").on(t.pipelineRunId, t.stepIndex),
  }),
);
