/**
 * One-time, idempotent filesystem migration for skill namespacing.
 *
 * Before namespacing: SKILLS_DIR/<skill-name>/SKILL.md
 * After namespacing:  SKILLS_DIR/<namespace>/<skill-name>/SKILL.md
 *
 * Skills that exist at depth-1 (flat) are moved to the "local" namespace.
 * Skills that already have a namespace (depth-2) are left untouched.
 * Safe to run multiple times.
 */
import { existsSync, readdirSync, mkdirSync, renameSync } from "node:fs";
import { join } from "node:path";

export function migrateSkillsToNamespaces(skillsDir: string): void {
  if (!existsSync(skillsDir)) return;

  const entries = readdirSync(skillsDir, { withFileTypes: true });
  const toMigrate: string[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const name = entry.name;

    // Skip the "local" namespace directory itself (already migrated or created fresh)
    // A namespace directory contains skill dirs, not SKILL.md directly
    const skillMdPath = join(skillsDir, name, "SKILL.md");
    if (existsSync(skillMdPath)) {
      // This is a flat skill directory — needs migration
      toMigrate.push(name);
    }
    // Otherwise it's already a namespace directory — skip
  }

  if (toMigrate.length === 0) return;

  const localDir = join(skillsDir, "local");
  mkdirSync(localDir, { recursive: true });

  for (const skillName of toMigrate) {
    const src = join(skillsDir, skillName);
    const dest = join(localDir, skillName);

    if (existsSync(dest)) {
      console.log(`[SkillMigrator] Skipping "${skillName}" — local/${skillName} already exists`);
      continue;
    }

    renameSync(src, dest);
    console.log(`[SkillMigrator] Moved ${skillName} → local/${skillName}`);
  }

  if (toMigrate.length > 0) {
    console.log(`[SkillMigrator] Migrated ${toMigrate.length} skill(s) to "local" namespace`);
  }
}
