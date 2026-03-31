import { pgTable, uuid, text, integer, boolean, timestamp, index } from "drizzle-orm/pg-core";

export const budgetPolicies = pgTable(
  "budget_policies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // "worker" | "pipeline"
    scopeType: text("scope_type").notNull(),
    scopeId: uuid("scope_id").notNull(),
    // Monthly spend cap in cents
    amountCents: integer("amount_cents").notNull(),
    // "calendar_month" | "lifetime"
    windowKind: text("window_kind").notNull().default("calendar_month"),
    // Percentage of budget at which to log a warning (0–100)
    warnPercent: integer("warn_percent").notNull().default(80),
    // Block execution when budget is exceeded
    hardStopEnabled: boolean("hard_stop_enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    scopeIdx: index("budget_policies_scope_idx").on(t.scopeType, t.scopeId),
  }),
);
