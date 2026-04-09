import { pgTable, uuid, text, jsonb, timestamp } from "drizzle-orm/pg-core";
import { mcpServers } from "./mcp-servers.js";
import { sql } from "drizzle-orm";

export const oauthConnections = pgTable("oauth_connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  mcpServerId: uuid("mcp_server_id")
    .notNull()
    .unique()
    .references(() => mcpServers.id, { onDelete: "cascade" }),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  scope: text("scope"),
  tokenType: text("token_type").notNull().default("Bearer"),
  status: text("status").notNull().default("active"), // 'active' | 'expired' | 'revoked' | 'error'
  connectedAt: timestamp("connected_at", { withTimezone: true }).notNull().defaultNow(),
  lastRefreshedAt: timestamp("last_refreshed_at", { withTimezone: true }),
  errorMessage: text("error_message"),
  authServerUrl: text("auth_server_url"),
  clientRegistration: jsonb("client_registration"),
  discoveryState: jsonb("discovery_state"),
});

export const oauthPendingFlows = pgTable("oauth_pending_flows", {
  id: uuid("id").primaryKey().defaultRandom(),
  mcpServerId: uuid("mcp_server_id")
    .notNull()
    .references(() => mcpServers.id, { onDelete: "cascade" }),
  state: text("state").unique().notNull(),
  codeVerifier: text("code_verifier").notNull(),
  redirectUri: text("redirect_uri").notNull(),
  scopes: text("scopes"),
  resourceUri: text("resource_uri"),
  authServerMetadata: jsonb("auth_server_metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true })
    .notNull()
    .default(sql`now() + interval '10 minutes'`),
});
