import { pgTable, uuid, text, integer, jsonb, timestamp, boolean, index, unique } from "drizzle-orm/pg-core";
import { workers } from "./workers.js";

export const pipelines = pgTable("pipelines", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  status: text("status").notNull().default("active"), // active, archived
  inputSchema: jsonb("input_schema").$type<Record<string, unknown>>(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const pipelineSteps = pgTable(
  "pipeline_steps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pipelineId: uuid("pipeline_id").notNull().references(() => pipelines.id, { onDelete: "cascade" }),
    stepIndex: integer("step_index").notNull(),
    name: text("name").notNull(),
    workerId: uuid("worker_id").notNull().references(() => workers.id),
    // Template supports {{input.key}}, {{steps.N.output}}, {{steps.N.output.field}}
    promptTemplate: text("prompt_template").notNull(),
    timeoutSeconds: integer("timeout_seconds").notNull().default(300),
    approvalRequired: boolean("approval_required").notNull().default(false),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pipelineStepIdx: unique("pipeline_steps_pipeline_step_idx").on(t.pipelineId, t.stepIndex),
    pipelineIdx: index("pipeline_steps_pipeline_idx").on(t.pipelineId),
  }),
);
