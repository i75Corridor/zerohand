DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'installed_packages') THEN
    ALTER TABLE "installed_packages" RENAME TO "installed_blueprints";
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'package_security_checks') THEN
    ALTER TABLE "package_security_checks" RENAME TO "blueprint_security_checks";
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'blueprint_security_checks' AND column_name = 'package_id') THEN
    ALTER TABLE "blueprint_security_checks" RENAME COLUMN "package_id" TO "blueprint_id";
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'mcp_servers' AND column_name = 'source_package_id') THEN
    ALTER TABLE "mcp_servers" RENAME COLUMN "source_package_id" TO "source_blueprint_id";
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "installed_blueprints" DROP CONSTRAINT IF EXISTS "installed_packages_repo_url_unique";
--> statement-breakpoint
ALTER TABLE "installed_blueprints" DROP CONSTRAINT IF EXISTS "installed_packages_pipeline_id_pipelines_id_fk";
--> statement-breakpoint
ALTER TABLE "blueprint_security_checks" DROP CONSTRAINT IF EXISTS "package_security_checks_package_id_installed_packages_id_fk";
--> statement-breakpoint
ALTER TABLE "mcp_servers" DROP CONSTRAINT IF EXISTS "mcp_servers_source_package_id_installed_packages_id_fk";
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_schema = 'public' AND constraint_name = 'installed_blueprints_pipeline_id_pipelines_id_fk') THEN
    ALTER TABLE "installed_blueprints" ADD CONSTRAINT "installed_blueprints_pipeline_id_pipelines_id_fk" FOREIGN KEY ("pipeline_id") REFERENCES "public"."pipelines"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_schema = 'public' AND constraint_name = 'blueprint_security_checks_blueprint_id_installed_blueprints_id_fk') THEN
    ALTER TABLE "blueprint_security_checks" ADD CONSTRAINT "blueprint_security_checks_blueprint_id_installed_blueprints_id_fk" FOREIGN KEY ("blueprint_id") REFERENCES "public"."installed_blueprints"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_schema = 'public' AND constraint_name = 'mcp_servers_source_blueprint_id_installed_blueprints_id_fk') THEN
    ALTER TABLE "mcp_servers" ADD CONSTRAINT "mcp_servers_source_blueprint_id_installed_blueprints_id_fk" FOREIGN KEY ("source_blueprint_id") REFERENCES "public"."installed_blueprints"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_schema = 'public' AND constraint_name = 'installed_blueprints_repo_url_unique') THEN
    ALTER TABLE "installed_blueprints" ADD CONSTRAINT "installed_blueprints_repo_url_unique" UNIQUE("repo_url");
  END IF;
END $$;
