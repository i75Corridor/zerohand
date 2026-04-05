CREATE TABLE "pipeline_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "pipeline_id" uuid NOT NULL,
  "version_number" integer NOT NULL,
  "snapshot" jsonb NOT NULL,
  "change_summary" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "pipeline_versions_pipeline_id_version_number_unique" UNIQUE("pipeline_id","version_number")
);

ALTER TABLE "pipeline_versions" ADD CONSTRAINT "pipeline_versions_pipeline_id_pipelines_id_fk"
  FOREIGN KEY ("pipeline_id") REFERENCES "public"."pipelines"("id") ON DELETE cascade ON UPDATE no action;
