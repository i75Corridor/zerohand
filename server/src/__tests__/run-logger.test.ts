import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { RunLogger } from "../services/run-logger.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "run-logger-test-"));
  process.env.DATA_DIR = tmpDir;
});

afterEach(() => {
  delete process.env.LOG_LEVEL;
  delete process.env.DATA_DIR;
  rmSync(tmpDir, { recursive: true, force: true });
});

function readLog(runId: string): Record<string, unknown>[] {
  const logPath = join(tmpDir, "logs", "runs", `${runId}.jsonl`);
  if (!existsSync(logPath)) return [];
  return readFileSync(logPath, "utf-8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Record<string, unknown>);
}

describe("RunLogger — off (default)", () => {
  it("creates no log file", () => {
    process.env.LOG_LEVEL = "off";
    const logger = new RunLogger("run-1");
    logger.info("run_start", { pipelineName: "test" });
    logger.debug("prompt", { payload: "hello" });
    logger.close();

    expect(existsSync(join(tmpDir, "logs", "runs", "run-1.jsonl"))).toBe(false);
  });
});

describe("RunLogger — info", () => {
  it("creates a log file and writes info entries", () => {
    process.env.LOG_LEVEL = "info";
    const logger = new RunLogger("run-2");
    logger.info("run_start", { pipelineName: "my-pipeline" });
    logger.info("step_start", { stepIndex: 0, skillName: "researcher" });
    logger.close();

    const entries = readLog("run-2");
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ event: "run_start", pipelineName: "my-pipeline" });
    expect(entries[1]).toMatchObject({ event: "step_start", stepIndex: 0 });
  });

  it("omits debug-only entries", () => {
    process.env.LOG_LEVEL = "info";
    const logger = new RunLogger("run-3");
    logger.info("step_start", { stepIndex: 0 });
    logger.debug("prompt", { payload: "secret prompt text" });
    logger.close();

    const entries = readLog("run-3");
    expect(entries).toHaveLength(1);
    expect(entries[0].event).toBe("step_start");
  });

  it("each entry has a valid ISO ts field", () => {
    process.env.LOG_LEVEL = "info";
    const logger = new RunLogger("run-4");
    logger.info("run_start", {});
    logger.close();

    const entries = readLog("run-4");
    expect(entries).toHaveLength(1);
    expect(entries[0].ts).toBeDefined();
    expect(() => new Date(entries[0].ts as string).toISOString()).not.toThrow();
  });
});

describe("RunLogger — debug", () => {
  it("writes both info and debug entries", () => {
    process.env.LOG_LEVEL = "debug";
    const logger = new RunLogger("run-5");
    logger.info("step_start", { stepIndex: 0 });
    logger.debug("prompt", { payload: "full prompt text" });
    logger.debug("llm_output", { output: "the answer" });
    logger.close();

    const entries = readLog("run-5");
    expect(entries).toHaveLength(3);
    expect(entries.map((e) => e.event)).toEqual(["step_start", "prompt", "llm_output"]);
    expect(entries[1]).toMatchObject({ event: "prompt", payload: "full prompt text" });
  });
});
