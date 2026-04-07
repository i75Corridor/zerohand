/**
 * Docker-based sandbox for skill script execution.
 *
 * When Docker is available, scripts run inside a restricted container:
 * - No network by default (unless skill declares network: true)
 * - Non-root user (uid 1000)
 * - 256 MB memory cap, 64 process limit
 * - Read-only script mount
 * - Only explicitly declared secrets injected via environment
 *
 * Falls back to the existing subprocess approach when Docker is not available.
 */

import { spawn } from "node:child_process";
import { extname, dirname, basename } from "node:path";

const DOCKER_IMAGE = "pawn/skill-runner:latest";
let dockerAvailable: boolean | null = null;

export function isDockerAvailable(): boolean {
  return dockerAvailable === true;
}

/**
 * Run a one-shot check: `docker info`. Caches the result.
 */
export async function detectDocker(): Promise<boolean> {
  if (dockerAvailable !== null) return dockerAvailable;
  return new Promise((resolve) => {
    const child = spawn("docker", ["info"], {
      stdio: ["ignore", "ignore", "ignore"],
      timeout: 5000,
    });
    child.on("close", (code) => {
      dockerAvailable = code === 0;
      resolve(dockerAvailable);
    });
    child.on("error", () => {
      dockerAvailable = false;
      resolve(false);
    });
  });
}

export interface SandboxOpts {
  scriptPath: string;
  input: Record<string, unknown>;
  networkEnabled: boolean;
  timeoutMs: number;
  maxStdout: number;
  secretEnv?: Record<string, string>;
  /** Host path for the output directory. Mounted at the same path inside the container so scripts can write files that persist to the host. */
  outputDir?: string;
}

export async function runInSandbox(opts: SandboxOpts): Promise<string> {
  if (!isDockerAvailable()) {
    // Fallback: plain subprocess (existing behavior, called from skill-loader)
    throw new Error("Docker not available — caller should use subprocess fallback");
  }

  const { scriptPath, input, networkEnabled, timeoutMs, maxStdout, secretEnv = {}, outputDir } = opts;

  const ext = extname(scriptPath);
  let entrypoint: string;
  let scriptArgs: string[];

  if (ext === ".js" || ext === ".cjs") { entrypoint = "node"; scriptArgs = ["/scripts/" + basename(scriptPath)]; }
  else if (ext === ".py") { entrypoint = "python3"; scriptArgs = ["/scripts/" + basename(scriptPath)]; }
  else if (ext === ".sh") { entrypoint = "bash"; scriptArgs = ["/scripts/" + basename(scriptPath)]; }
  else { throw new Error(`Unsupported script type for sandbox: ${ext}`); }

  const dockerArgs = [
    "run", "--rm", "--init",
    "--network", networkEnabled ? "bridge" : "none",
    "-v", `${dirname(scriptPath)}:/scripts:ro`,
    "--tmpfs", "/tmp:rw,size=64m",
    "--user", "1000:1000",
    "--memory", "256m",
    "--pids-limit", "64",
    "--entrypoint", entrypoint,
    "-i", // stdin
  ];

  // Mount output directory at the same host path so scripts can write files that
  // persist to the host and report the correct absolute path in their output.
  if (outputDir) {
    dockerArgs.push("-v", `${outputDir}:${outputDir}:rw`);
    dockerArgs.push("-e", `OUTPUT_DIR=${outputDir}`);
  }

  // Inject only declared secrets
  for (const [key, value] of Object.entries(secretEnv)) {
    dockerArgs.push("-e", `${key}=${value}`);
  }

  dockerArgs.push(DOCKER_IMAGE, ...scriptArgs);

  return new Promise((resolve, reject) => {
    const child = spawn("docker", dockerArgs, {
      stdio: ["pipe", "pipe", "pipe"],
    });

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`Sandbox script timed out after ${timeoutMs / 1000}s: ${scriptPath}`));
    }, timeoutMs);

    child.stdin.write(JSON.stringify(input));
    child.stdin.end();

    let stdout = "";
    let stderr = "";
    let truncated = false;

    child.stdout.on("data", (d: Buffer) => {
      if (truncated) return;
      stdout += d.toString();
      if (stdout.length > maxStdout) {
        truncated = true;
        stdout = stdout.slice(0, maxStdout);
        child.kill("SIGKILL");
        reject(new Error(`Sandbox stdout exceeded ${maxStdout / 1024}KB limit: ${scriptPath}`));
      }
    });
    child.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (truncated) return;
      if (code === 0) resolve(stdout);
      else reject(new Error(`Sandbox script exited ${code}: ${stderr.trim()}`));
    });
    child.on("error", (err) => { clearTimeout(timer); reject(err); });
  });
}
