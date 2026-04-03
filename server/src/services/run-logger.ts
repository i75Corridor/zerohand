import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { logsDir } from "./paths.js";

type LogLevel = "off" | "info" | "debug";

function parseLogLevel(): LogLevel {
  const val = process.env.LOG_LEVEL?.toLowerCase();
  if (val === "info" || val === "debug") return val;
  return "off";
}

export class RunLogger {
  private level: LogLevel;
  private logPath: string | null = null;

  constructor(runId: string) {
    this.level = parseLogLevel();
    if (this.level === "off") return;

    const dir = logsDir();
    mkdirSync(dir, { recursive: true });
    this.logPath = join(dir, `${runId}.jsonl`);
  }

  private write(entry: Record<string, unknown>): void {
    if (!this.logPath) return;
    appendFileSync(this.logPath, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + "\n");
  }

  /** Log at info level (written for both info and debug) */
  info(event: string, data: Record<string, unknown> = {}): void {
    if (this.level === "off") return;
    this.write({ event, ...data });
  }

  /** Log at debug level only */
  debug(event: string, data: Record<string, unknown> = {}): void {
    if (this.level !== "debug") return;
    this.write({ event, ...data });
  }

  close(): void {
    this.logPath = null;
  }
}
