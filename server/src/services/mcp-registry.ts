import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// ── Types ──────────────────────────────────────────────────────────────────

export interface RegistryEnvVar {
  name: string;
  description: string;
  required: boolean;
  docsUrl?: string;
}

export interface RegistryEntry {
  packageName: string;
  envVars: RegistryEnvVar[];
}

// ── Registry data ──────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const registryData: Record<string, { envVars: RegistryEnvVar[] }> = JSON.parse(
  readFileSync(join(__dirname, "../data/mcp-registry.json"), "utf-8"),
);

// ── Flags to skip when extracting package name from args ───────────────────

const SKIP_FLAGS = new Set(["-y", "--yes", "-p", "--package"]);

/**
 * Extract an npm package name from an args array (npx-style invocation).
 *
 * Scoped packages: `@scope/name` or `@scope/name@1.2.3`
 * Unscoped packages: `name` or `name@1.2.3`
 *
 * Skips common npx flags like `-y`, `--yes`, `-p`, `--package`.
 */
function extractPackageName(args: string[]): string | null {
  for (const arg of args) {
    // Skip flags
    if (SKIP_FLAGS.has(arg) || arg.startsWith("--")) continue;
    if (arg.startsWith("-") && !arg.startsWith("@")) continue;

    // Scoped package: @scope/name or @scope/name@version
    if (arg.startsWith("@")) {
      const slashIdx = arg.indexOf("/");
      if (slashIdx === -1) continue; // malformed scope
      // Strip version suffix: @scope/name@1.2.3 → @scope/name
      const afterSlash = arg.slice(slashIdx + 1);
      const versionIdx = afterSlash.indexOf("@");
      if (versionIdx > 0) {
        return arg.slice(0, slashIdx + 1 + versionIdx);
      }
      return arg;
    }

    // Unscoped package: name or name@version
    const versionIdx = arg.indexOf("@");
    if (versionIdx > 0) {
      return arg.slice(0, versionIdx);
    }
    return arg;
  }
  return null;
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Look up MCP server env requirements by command + args.
 *
 * Extracts the npm package name from the args array (handles npx flags,
 * version suffixes, scoped packages) and looks it up in the registry.
 */
export function lookupRegistry(
  _command: string,
  args: string[],
): RegistryEntry | null {
  const packageName = extractPackageName(args);
  if (!packageName) return null;

  const entry = registryData[packageName];
  if (!entry) return null;

  return { packageName, envVars: entry.envVars };
}

/**
 * Fuzzy match a server name against registry keys.
 *
 * e.g. name="brave-search" matches "@anthropic/brave-search-mcp"
 * because the registry key contains "brave-search".
 */
export function lookupRegistryByName(name: string): RegistryEntry | null {
  const lowerName = name.toLowerCase();

  for (const [packageName, entry] of Object.entries(registryData)) {
    const lowerKey = packageName.toLowerCase();
    if (lowerKey.endsWith(`/${lowerName}`) || lowerKey.includes(lowerName)) {
      return { packageName, envVars: entry.envVars };
    }
  }

  return null;
}
