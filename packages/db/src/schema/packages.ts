import { pgTable, uuid, text, boolean, jsonb, timestamp } from "drizzle-orm/pg-core";
import { pipelines } from "./pipelines.js";

export const installedPackages = pgTable("installed_packages", {
  id: uuid("id").primaryKey().defaultRandom(),
  repoUrl: text("repo_url").notNull().unique(),
  repoFullName: text("repo_full_name").notNull(),
  pipelineId: uuid("pipeline_id").references(() => pipelines.id, { onDelete: "set null" }),
  installedRef: text("installed_ref"),
  latestRef: text("latest_ref"),
  updateAvailable: boolean("update_available").notNull().default(false),
  localPath: text("local_path").notNull(),
  skills: jsonb("skills").$type<string[]>(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  installedAt: timestamp("installed_at", { withTimezone: true }).notNull().defaultNow(),
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
