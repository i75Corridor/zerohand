CREATE TABLE "mcp_servers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "transport" text NOT NULL,
  "command" text,
  "args" jsonb DEFAULT '[]'::jsonb,
  "url" text,
  "headers" jsonb DEFAULT '{}'::jsonb,
  "env" jsonb DEFAULT '{}'::jsonb,
  "enabled" boolean DEFAULT true NOT NULL,
  "source" text DEFAULT 'manual' NOT NULL,
  "source_package_id" uuid,
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "mcp_servers_name_unique" UNIQUE("name")
);

ALTER TABLE "mcp_servers" ADD CONSTRAINT "mcp_servers_source_package_id_installed_packages_id_fk"
  FOREIGN KEY ("source_package_id") REFERENCES "public"."installed_packages"("id") ON DELETE set null ON UPDATE no action;
