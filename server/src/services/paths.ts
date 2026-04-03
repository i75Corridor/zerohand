import { join } from "node:path";

/** Root data directory — all runtime state lives here */
export function dataDir(): string {
  return process.env.DATA_DIR ?? join(process.cwd(), "..", ".data");
}

/** Where cloned package repos are stored */
export function packagesDir(): string {
  return process.env.PACKAGES_DIR ?? join(dataDir(), "packages");
}

/** Where skill folders (SKILL.md + scripts/) are stored */
export function skillsDir(): string {
  return process.env.SKILLS_DIR ?? join(dataDir(), "skills");
}
