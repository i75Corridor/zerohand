import { pgTable, uuid, text, boolean, jsonb, timestamp } from "drizzle-orm/pg-core";
import { installedBlueprints } from "./blueprints.js";

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
  source: text("source").notNull().default("manual"), // 'manual' | 'blueprint'
  sourceBlueprintId: uuid("source_blueprint_id").references(() => installedBlueprints.id, { onDelete: "set null" }),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  oauthConfig: jsonb("oauth_config").$type<{ clientId: string; clientSecret?: string; scopes?: string[] }>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
