-- Drop worker_id foreign key constraint and column from pipeline_steps
ALTER TABLE "pipeline_steps" DROP COLUMN IF EXISTS "worker_id";
--> statement-breakpoint
-- Drop worker_id foreign key constraint and column from step_runs
ALTER TABLE "step_runs" DROP COLUMN IF EXISTS "worker_id";
--> statement-breakpoint
-- Drop old index on cost_events (worker_id, occurred_at)
DROP INDEX IF EXISTS "cost_events_worker_date_idx";
--> statement-breakpoint
-- Drop worker_id column and add skill_name column to cost_events
ALTER TABLE "cost_events" DROP COLUMN IF EXISTS "worker_id";
--> statement-breakpoint
ALTER TABLE "cost_events" ADD COLUMN IF NOT EXISTS "skill_name" text;
--> statement-breakpoint
-- Add new index on cost_events (skill_name, occurred_at)
CREATE INDEX IF NOT EXISTS "cost_events_skill_date_idx" ON "cost_events" ("skill_name","occurred_at");
--> statement-breakpoint
-- Drop worker_sessions table (depends on workers)
DROP TABLE IF EXISTS "worker_sessions";
--> statement-breakpoint
-- Drop workers table
DROP TABLE IF EXISTS "workers";
