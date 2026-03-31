import { pgTable, uuid, text, boolean, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { pipelines } from "./pipelines.js";

export const triggers = pgTable(
  "triggers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pipelineId: uuid("pipeline_id").notNull().references(() => pipelines.id, { onDelete: "cascade" }),
    // cron, webhook, channel
    type: text("type").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    // Cron fields
    cronExpression: text("cron_expression"),
    timezone: text("timezone").notNull().default("UTC"),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }),
    lastFiredAt: timestamp("last_fired_at", { withTimezone: true }),
    // Webhook fields
    webhookPublicId: text("webhook_public_id").unique(),
    webhookSecret: text("webhook_secret"),
    // Channel fields
    channelType: text("channel_type"), // telegram, slack
    channelConfig: jsonb("channel_config").$type<Record<string, unknown>>(),
    // Default inputs to pass to pipeline run when triggered
    defaultInputs: jsonb("default_inputs").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pipelineIdx: index("triggers_pipeline_idx").on(t.pipelineId),
    enabledTypeIdx: index("triggers_enabled_type_idx").on(t.enabled, t.type),
  }),
);
