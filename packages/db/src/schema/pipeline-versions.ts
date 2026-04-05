import { pgTable, uuid, integer, text, jsonb, timestamp, unique } from "drizzle-orm/pg-core";
import { pipelines } from "./pipelines.js";

export const pipelineVersions = pgTable("pipeline_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  pipelineId: uuid("pipeline_id").notNull().references(() => pipelines.id, { onDelete: "cascade" }),
  versionNumber: integer("version_number").notNull(),
  snapshot: jsonb("snapshot").notNull().$type<Record<string, unknown>>(),
  changeSummary: text("change_summary"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique().on(t.pipelineId, t.versionNumber)]);
