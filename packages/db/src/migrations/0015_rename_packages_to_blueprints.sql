ALTER TABLE "installed_packages" RENAME TO "installed_blueprints";
ALTER TABLE "package_security_checks" RENAME TO "blueprint_security_checks";
ALTER TABLE "blueprint_security_checks" RENAME COLUMN "package_id" TO "blueprint_id";
ALTER TABLE "mcp_servers" RENAME COLUMN "source_package_id" TO "source_blueprint_id";
UPDATE "mcp_servers" SET "source" = 'blueprint' WHERE "source" = 'package';
