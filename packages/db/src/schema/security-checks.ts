import { pgTable, uuid, text, jsonb, integer, timestamp } from "drizzle-orm/pg-core";
import { installedPackages } from "./packages.js";

export const packageSecurityChecks = pgTable("package_security_checks", {
  id: uuid("id").primaryKey().defaultRandom(),
  packageId: uuid("package_id").references(() => installedPackages.id, { onDelete: "cascade" }),
  repoUrl: text("repo_url").notNull(),
  level: text("level").notNull(),
  findings: jsonb("findings").$type<Array<Record<string, unknown>>>().notNull().default([]),
  scannedFiles: integer("scanned_files").notNull().default(0),
  scannedAt: timestamp("scanned_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
