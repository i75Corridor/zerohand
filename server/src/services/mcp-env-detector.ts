import { spawn, type ChildProcess } from "node:child_process";
import {
  lookupRegistry,
  lookupRegistryByName,
  type RegistryEnvVar,
} from "./mcp-registry.js";

// ── Types ──────────────────────────────────────────────────────────────────

export interface DetectedEnvVar {
  name: string;
  required: boolean;
  description?: string;
  docsUrl?: string;
  detectedFrom: "registry" | "dry-run" | "both";
}

export interface DetectionResult {
  detected: DetectedEnvVar[];
  error?: string;
}

// ── Concurrency semaphore ──────────────────────────────────────────────────

const MAX_CONCURRENT_DRY_RUNS = 2;
let activeDryRuns = 0;

/** Visible for testing. */
export function _resetSemaphore(): void {
  activeDryRuns = 0;
}

/** Visible for testing — set semaphore to a specific value. */
export function _setSemaphore(n: number): void {
  activeDryRuns = n;
}

// ── Minimal env keys allowed in the dry-run child process ──────────────────

const MINIMAL_ENV_KEYS = [
  "PATH",
  "HOME",
  "TMPDIR",
  "TEMP",
  "USER",
  "LOGNAME",
  "SHELL",
  "NVM_DIR",
  "VOLTA_HOME",
  "FNM_DIR",
] as const;

function buildMinimalEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of MINIMAL_ENV_KEYS) {
    const val = process.env[key];
    if (val !== undefined) {
      env[key] = val;
    }
  }
  return env;
}

// ── Stderr parsing ─────────────────────────────────────────────────────────

const ENV_VAR_PATTERN = /^[A-Z][A-Z0-9_]*$/;

const STDERR_REGEXES = [
  // "Error: BRAVE_API_KEY is not set", "missing BRAVE_API_KEY", etc.
  /(?:error|missing|required|undefined|not set|not found|must be|must set|provide|need)[:\s]+["`']?([A-Z][A-Z0-9_]+)["`']?/gi,
  // "BRAVE_API_KEY is not set", "BRAVE_API_KEY required", etc.
  /([A-Z][A-Z0-9_]+)\s+(?:is\s+)?(?:not set|required|missing|undefined|must be)/gi,
  // "${BRAVE_API_KEY} is not ...", "$BRAVE_API_KEY must ..."
  /\$\{?([A-Z][A-Z0-9_]+)\}?\s+(?:is\s+)?(?:not|must)/gi,
];

function parseStderr(stderr: string): string[] {
  const found = new Set<string>();
  // Process line-by-line to prevent cross-line false matches
  const lines = stderr.split(/\r?\n/);
  for (const line of lines) {
    for (const regex of STDERR_REGEXES) {
      // Reset lastIndex for each line since we use /g flag
      regex.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = regex.exec(line)) !== null) {
        const name = match[1];
        if (ENV_VAR_PATTERN.test(name)) {
          found.add(name);
        }
      }
    }
  }
  return [...found];
}

// ── Dry-run spawn ──────────────────────────────────────────────────────────

const DRY_RUN_TIMEOUT_MS = 5_000;

function dryRunSpawn(
  command: string,
  args: string[],
): Promise<{ stderrText: string; error?: string }> {
  return new Promise((resolve) => {
    let child: ChildProcess;
    try {
      child = spawn(command, args, {
        env: buildMinimalEnv(),
        detached: true,
        stdio: ["ignore", "ignore", "pipe"],
      });
    } catch {
      resolve({ stderrText: "", error: `command not found: ${command}` });
      return;
    }

    let stderrText = "";
    let settled = false;

    const settle = (result: { stderrText: string; error?: string }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    child.stderr?.on("data", (chunk: Buffer) => {
      // Cap stderr capture to avoid memory issues
      if (stderrText.length < 64_000) {
        stderrText += chunk.toString();
      }
    });

    child.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "ENOENT") {
        settle({ stderrText, error: `command not found: ${command}` });
      } else {
        settle({ stderrText, error: err.message });
      }
    });

    child.on("close", () => {
      settle({ stderrText });
    });

    const timer = setTimeout(() => {
      // Kill the entire process group
      try {
        if (child.pid) {
          process.kill(-child.pid, "SIGKILL");
        }
      } catch {
        // Process may have already exited
      }
      settle({ stderrText });
    }, DRY_RUN_TIMEOUT_MS);
  });
}

// ── Merge helpers ──────────────────────────────────────────────────────────

function registryToDetected(vars: RegistryEnvVar[]): DetectedEnvVar[] {
  return vars.map((v) => ({
    name: v.name,
    required: v.required,
    description: v.description,
    docsUrl: v.docsUrl,
    detectedFrom: "registry" as const,
  }));
}

function mergeResults(
  registryVars: DetectedEnvVar[],
  dryRunNames: string[],
): DetectedEnvVar[] {
  const byName = new Map<string, DetectedEnvVar>();

  // Registry vars first
  for (const v of registryVars) {
    byName.set(v.name, v);
  }

  // Merge dry-run results
  for (const name of dryRunNames) {
    const existing = byName.get(name);
    if (existing) {
      // Both sources found this var
      existing.detectedFrom = "both";
    } else {
      byName.set(name, {
        name,
        required: true,
        detectedFrom: "dry-run",
      });
    }
  }

  return [...byName.values()];
}

// ── Main API ───────────────────────────────────────────────────────────────

export async function detectEnvVars(config: {
  command?: string;
  args?: string[];
  transport: string;
  name?: string;
}): Promise<DetectionResult> {
  // 1. Registry lookup
  let registryVars: DetectedEnvVar[] = [];

  if (config.command && config.args) {
    const entry = lookupRegistry(config.command, config.args);
    if (entry) {
      registryVars = registryToDetected(entry.envVars);
    }
  }

  if (registryVars.length === 0 && config.name) {
    const entry = lookupRegistryByName(config.name);
    if (entry) {
      registryVars = registryToDetected(entry.envVars);
    }
  }

  // 2. For non-stdio transports, return registry-only
  if (config.transport !== "stdio") {
    return { detected: registryVars };
  }

  // 3. stdio: attempt dry-run if we have a command
  if (!config.command) {
    return { detected: registryVars };
  }

  // Check concurrency semaphore
  if (activeDryRuns >= MAX_CONCURRENT_DRY_RUNS) {
    return { detected: registryVars, error: "detection busy" };
  }

  activeDryRuns++;
  try {
    const { stderrText, error } = await dryRunSpawn(
      config.command,
      config.args ?? [],
    );

    if (error) {
      return { detected: registryVars, error };
    }

    const dryRunNames = parseStderr(stderrText);
    const merged = mergeResults(registryVars, dryRunNames);

    return { detected: merged };
  } finally {
    activeDryRuns--;
  }
}
