import { pgTable, uuid, text, boolean, jsonb, timestamp } from "drizzle-orm/pg-core";
import { installedPackages } from "./packages.js";

export const mcpServers = pgTable("mcp_servers", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  transport: text("transport").notNull(), // 'stdio' | 'sse' | 'streamable-http'
  command: text("command"),               // stdio: command to run
  args: jsonb("args").$type<string[]>().default([]),
  url: text("url"),                       // http/sse: server URL
  headers: jsonb("headers").$type<Record<string, string>>().default({}),
  env: jsonb("env").$type<Record<string, string>>().default({}),
  enabled: boolean("enabled").notNull().default(true),
  source: text("source").notNull().default("manual"), // 'manual' | 'package'
  sourcePackageId: uuid("source_package_id").references(() => installedPackages.id, { onDelete: "set null" }),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
