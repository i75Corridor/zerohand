ALTER TABLE "pipeline_steps" ALTER COLUMN "worker_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "pipeline_steps" ADD COLUMN "skill_name" text;--> statement-breakpoint
ALTER TABLE "pipelines" ADD COLUMN "system_prompt" text;--> statement-breakpoint
ALTER TABLE "pipelines" ADD COLUMN "model_provider" text;--> statement-breakpoint
ALTER TABLE "pipelines" ADD COLUMN "model_name" text;