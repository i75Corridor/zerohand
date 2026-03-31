import { pgTable, uuid, text, jsonb, timestamp, unique } from "drizzle-orm/pg-core";
import { workers } from "./workers.js";

export const workerSessions = pgTable(
  "worker_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workerId: uuid("worker_id").notNull().references(() => workers.id, { onDelete: "cascade" }),
    // Identifies which task/run this session is for (e.g. pipeline_run_id)
    taskKey: text("task_key").notNull(),
    sessionParamsJson: jsonb("session_params_json").$type<Record<string, unknown>>(),
    // Path to the JSONL session file on disk
    sessionFilePath: text("session_file_path"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    workerTaskKey: unique("worker_sessions_worker_task_key").on(t.workerId, t.taskKey),
  }),
);
