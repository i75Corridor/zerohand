-- Create secrets table for encrypted key-value storage
CREATE TABLE IF NOT EXISTS "secrets" (
  "key" text PRIMARY KEY NOT NULL,
  "encrypted_value" text NOT NULL,
  "iv" text NOT NULL,
  "auth_tag" text NOT NULL,
  "description" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

-- Create installed_packages table for GitHub-based package tracking
CREATE TABLE IF NOT EXISTS "installed_packages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "repo_url" text NOT NULL UNIQUE,
  "repo_full_name" text NOT NULL,
  "pipeline_id" uuid REFERENCES "pipelines"("id") ON DELETE SET NULL,
  "installed_ref" text,
  "latest_ref" text,
  "update_available" boolean NOT NULL DEFAULT false,
  "local_path" text NOT NULL,
  "skills" jsonb,
  "metadata" jsonb,
  "installed_at" timestamp with time zone NOT NULL DEFAULT now(),
  "last_checked_at" timestamp with time zone,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
