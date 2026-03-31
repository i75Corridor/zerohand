import { pgTable, bigserial, uuid, text, integer, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { stepRuns } from "./pipeline-runs.js";

export const stepRunEvents = pgTable(
  "step_run_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    stepRunId: uuid("step_run_id").notNull().references(() => stepRuns.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    // text_delta, tool_call_start, tool_call_end, tool_result, status_change, error
    eventType: text("event_type").notNull(),
    message: text("message"),
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    stepSeqIdx: index("step_run_events_step_seq_idx").on(t.stepRunId, t.seq),
  }),
);
