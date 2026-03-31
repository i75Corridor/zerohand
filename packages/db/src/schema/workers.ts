import { pgTable, uuid, text, integer, jsonb, timestamp, index } from "drizzle-orm/pg-core";

export const workers = pgTable(
  "workers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    description: text("description"),
    // "pi" = pi.dev session, "function" = TypeScript function, "api" = external API call
    workerType: text("worker_type").notNull().default("pi"),
    modelProvider: text("model_provider").notNull().default("google"),
    modelName: text("model_name").notNull().default("gemini-2.5-flash"),
    systemPrompt: text("system_prompt"),
    // Array of skill names to load (e.g. ["research", "writer"])
    skills: jsonb("skills").$type<string[]>().notNull().default([]),
    // Custom tool configs registered with the pi session
    customTools: jsonb("custom_tools").$type<string[]>().notNull().default([]),
    status: text("status").notNull().default("idle"), // idle, active, paused, error
    budgetMonthlyCents: integer("budget_monthly_cents").notNull().default(0),
    spentMonthlyCents: integer("spent_monthly_cents").notNull().default(0),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    statusIdx: index("workers_status_idx").on(t.status),
  }),
);
