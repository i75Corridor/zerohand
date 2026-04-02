-- Create package_security_checks table for tracking security scan results
CREATE TABLE IF NOT EXISTS "package_security_checks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "package_id" uuid REFERENCES "installed_packages"("id") ON DELETE CASCADE,
  "repo_url" text NOT NULL,
  "level" text NOT NULL,
  "findings" jsonb NOT NULL DEFAULT '[]',
  "scanned_files" integer NOT NULL DEFAULT 0,
  "scanned_at" timestamp with time zone NOT NULL DEFAULT now(),
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
