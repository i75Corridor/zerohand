import { eq, asc } from "drizzle-orm";
import type { SnapshotStep } from "./run-factory.js";
import { join, resolve } from "node:path";
import { mkdirSync } from "node:fs";
import type { Db } from "@pawn/db";
import {
  pipelineRuns,
  stepRuns,
  stepRunEvents,
  pipelineSteps,
  pipelines,
  approvals,
  mcpServers,
} from "@pawn/db";
import { McpClientPool } from "./mcp-client.js";
import { mcpToolsToToolDefinitions } from "./mcp-tool-bridge.js";
import type { StepRunEventType, WsIncomingChat, RetryConfig } from "@pawn/shared";
import type { WsManager } from "../ws/index.js";
import { runSkillStep } from "./pi-executor.js";
import { dataDir, skillsDir as getSkillsDir } from "./paths.js";
import { RunLogger } from "./run-logger.js";
import { recordCost } from "./budget-guard.js";
import { SessionRegistry } from "./session-registry.js";
import { readModelSetting } from "./model-utils.js";

export function serializeError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const parts = [err.message];
  if (err.cause instanceof Error) parts.push(`Caused by: ${err.cause.message}`);
  const anyErr = err as unknown as Record<string, unknown>;
  if (anyErr["status"]) parts.push(`Status: ${anyErr["status"]}`);
  if (anyErr["responseBody"]) parts.push(`Response: ${String(anyErr["responseBody"]).slice(0, 500)}`);
  return parts.join(" | ");
}

export function classifyError(err: unknown): "timeout" | "budget_exceeded" | "unknown" {
  const msg = String(err).toLowerCase();
  if (msg.includes("budget exceeded") || msg.includes("budget limit")) return "budget_exceeded";
  if (msg.includes("timed out") || msg.includes("timeout")) return "timeout";
  return "unknown";
}

export function isRetryable(err: unknown, config: RetryConfig | null | undefined): boolean {
  if (classifyError(err) === "budget_exceeded") return false;
  if (!config?.retryOnErrors?.length) return true;
  const category = classifyError(err);
  return config.retryOnErrors.includes(category);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Strip markdown code fences from LLM output and attempt to normalize to clean JSON.
 * Used when a skill declares an outputSchema — the LLM is instructed to output JSON
 * but often wraps it in ```json ... ``` or adds preamble text.
 *
 * If the cleaned text is valid JSON, it is re-serialized as compact JSON.
 * If not parseable, the raw output is returned unchanged (never throws).
 */
export function cleanJsonOutput(raw: string): string {
  let text = raw.trim();
  // Strip markdown code fences: ```json ... ``` or ``` ... ```
  const fenceMatch = text.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/);
  if (fenceMatch) text = fenceMatch[1].trim();
  // If the text doesn't start with { or [, try to find the first JSON object
  if (!text.startsWith("{") && !text.startsWith("[")) {
    const objIdx = text.indexOf("{");
    const arrIdx = text.indexOf("[");
    const startIdx = objIdx === -1 ? arrIdx : arrIdx === -1 ? objIdx : Math.min(objIdx, arrIdx);
    if (startIdx > -1) text = text.slice(startIdx).trim();
  }
  try {
    return JSON.stringify(JSON.parse(text));
  } catch {
    return raw; // return original if not valid JSON
  }
}

export function resolvePrompt(
  template: string,
  inputParams: Record<string, unknown>,
  stepOutputs: Map<number, string>,
): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_, path: string) => {
    const parts = path.trim().split(".");

    if (parts[0] === "input" && parts.length === 2) {
      return String(inputParams[parts[1]] ?? "");
    }

    if (parts[0] === "secret" && parts.length === 2) {
      return process.env[parts[1]] ?? `{{${path}}}`;
    }

    if (parts[0] === "steps" && parts.length >= 3) {
      const tokenIndex = parseInt(parts[1], 10);
      // Template step indices are 1-based: {{steps.1.output}} = first step, {{steps.2.output}} = second.
      // Index 0 is accepted for backward compatibility and maps to the first step (stepIndex 0).
      const stepIndex = tokenIndex >= 1 ? tokenIndex - 1 : 0;
      const output = stepOutputs.get(stepIndex) ?? "";
      if (parts[2] === "output" && parts.length === 3) return output;
      if (parts[2] === "output" && parts.length > 3) {
        try {
          const parsed = JSON.parse(output) as Record<string, unknown>;
          let value: unknown = parsed;
          for (let i = 3; i < parts.length; i++) {
            value = value && typeof value === "object"
              ? (value as Record<string, unknown>)[parts[i]]
              : undefined;
          }
          return String(value ?? "");
        } catch {
          return output;
        }
      }
    }

    return `{{${path}}}`;
  });
}

export class ExecutionEngine {
  private polling = false;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private activeRunIds = new Map<string, AbortController>();
  private sessionRegistry = new SessionRegistry();
  private sessionsDir: string;

  constructor(
    private db: Db,
    private ws: WsManager,
  ) {
    this.sessionsDir = resolve(dataDir(), "sessions");
    mkdirSync(this.sessionsDir, { recursive: true });
  }

  start(): void {
    this.polling = true;
    this.pollTimer = setInterval(() => void this.tick(), 2000);
    void this.tick();
  }

  stop(): void {
    this.polling = false;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private async tick(): Promise<void> {
    if (!this.polling) return;
    try {
      const run = await this.db.query.pipelineRuns.findFirst({
        where: eq(pipelineRuns.status, "queued"),
        orderBy: [asc(pipelineRuns.createdAt)],
      });
      if (!run) return;
      if (this.activeRunIds.has(run.id)) return;

      const abortController = new AbortController();
      this.activeRunIds.set(run.id, abortController);
      await this.db
        .update(pipelineRuns)
        .set({ status: "running", startedAt: new Date(), updatedAt: new Date() })
        .where(eq(pipelineRuns.id, run.id));
      this.ws.broadcast({ type: "run_status", pipelineRunId: run.id, status: "running" });

      this.executeRun(run.id, abortController.signal).catch(async (err) => {
        console.error(`[ExecutionEngine] Run ${run.id} failed:`, err);
        await this.db
          .update(pipelineRuns)
          .set({ status: "failed", error: serializeError(err), finishedAt: new Date(), updatedAt: new Date() })
          .where(eq(pipelineRuns.id, run.id));
        this.ws.broadcast({ type: "run_status", pipelineRunId: run.id, status: "failed" });
        this.activeRunIds.delete(run.id);
      });
    } catch (err) {
      console.error("[ExecutionEngine] Tick error:", err);
    }
  }

  handleChatMessage(msg: WsIncomingChat): void {
    const entry = this.sessionRegistry.get(msg.stepRunId);
    if (!entry) {
      this.ws.broadcast({ type: "chat_ack", stepRunId: msg.stepRunId, accepted: false, error: "No active session for this step" });
      return;
    }
    const { session } = entry;
    if (msg.action === "abort") {
      void session.abort();
    } else if (msg.action === "steer" && msg.message) {
      void session.steer(msg.message);
    } else if (msg.action === "followUp" && msg.message) {
      void session.followUp(msg.message);
    }
    this.ws.broadcast({ type: "chat_ack", stepRunId: msg.stepRunId, accepted: true });
  }

  cancelRun(runId: string): void {
    const controller = this.activeRunIds.get(runId);
    if (controller) controller.abort();
    // Also abort any active sessions for this run
    for (const { session } of this.sessionRegistry.getByRunId(runId)) {
      void session.abort();
    }
  }

  private async executeRun(runId: string, signal?: AbortSignal): Promise<void> {
    const logger = new RunLogger(runId);
    const runStartMs = Date.now();
    const mcpPool = new McpClientPool();
    mcpPool.setDb(this.db);

    const run = await this.db.query.pipelineRuns.findFirst({
      where: eq(pipelineRuns.id, runId),
    });
    if (!run) throw new Error(`Run not found: ${runId}`);

    // Load pipeline for skill-based execution
    const pipeline = await this.db.query.pipelines.findFirst({
      where: eq(pipelines.id, run.pipelineId),
    });
    const pipelineContext = ((pipeline?.metadata as Record<string, unknown>)?.context ?? {}) as Record<string, string>;
    const pipelineSystemPrompt = pipeline?.systemPrompt ?? null;
    const defaultModel = await readModelSetting(this.db, "default_pipeline_model", "google/gemini-2.5-flash");
    const pipelineModelProvider = pipeline?.modelProvider ?? defaultModel.provider;
    const pipelineModelName = pipeline?.modelName ?? defaultModel.modelId;

    // Prefer steps snapshotted at trigger time; fall back to live DB query for
    // runs created before snapshotting was introduced.
    const snapshotSteps = (run.metadata as Record<string, unknown> | null)?.steps as SnapshotStep[] | undefined;
    const steps: SnapshotStep[] = snapshotSteps?.length
      ? snapshotSteps
      : (await this.db.query.pipelineSteps.findMany({
          where: eq(pipelineSteps.pipelineId, run.pipelineId),
          orderBy: [asc(pipelineSteps.stepIndex)],
        })).map((s) => ({
          stepIndex: s.stepIndex,
          name: s.name,
          skillName: s.skillName ?? null,
          promptTemplate: s.promptTemplate ?? null,
          approvalRequired: s.approvalRequired ?? false,
          retryConfig: (s.retryConfig as Record<string, unknown> | null) ?? null,
          metadata: (s.metadata as Record<string, unknown> | null) ?? null,
        }));

    logger.info("run_start", { pipelineId: run.pipelineId, pipelineName: pipeline?.name ?? run.pipelineId, inputs: run.inputParams });

    // Validate all env vars declared in skill secrets fields exist before starting
    const { loadSkillDef: loadSkillDefForValidation } = await import("./skill-loader.js");
    const skillsDir = getSkillsDir();
    const missing: string[] = [];
    for (const step of steps) {
      if (!step.skillName) continue;
      const skill = loadSkillDefForValidation(step.skillName, skillsDir);
      if (!skill) continue;
      for (const key of skill.secrets ?? []) {
        if (!process.env[key] && !missing.includes(key)) missing.push(key);
      }
    }
    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
    }

    // Load completed step outputs for resume support
    const existingStepRuns = await this.db.query.stepRuns.findMany({
      where: eq(stepRuns.pipelineRunId, runId),
    });
    const stepOutputs = new Map<number, string>();
    const existingByIndex = new Map<number, typeof stepRuns.$inferSelect>();
    for (const sr of existingStepRuns) {
      existingByIndex.set(sr.stepIndex, sr);
      if (sr.status === "completed") {
        stepOutputs.set(sr.stepIndex, (sr.output as { text?: string })?.text ?? "");
      }
    }

    for (const step of steps) {
      // Stop immediately if the run was cancelled between steps
      if (signal?.aborted) break;

      const existingSR = existingByIndex.get(step.stepIndex);

      // Already completed — skip and continue
      if (existingSR?.status === "completed") continue;

      // ── Approval gate ──────────────────────────────────────────────────────
      if (step.approvalRequired) {
        let stepRunId = existingSR?.id;

        if (!stepRunId) {
          const [sr] = await this.db
            .insert(stepRuns)
            .values({
              pipelineRunId: runId,
              stepIndex: step.stepIndex,
              status: "awaiting_approval",
              input: run.inputParams,
            })
            .returning();
          stepRunId = sr.id;
          this.ws.broadcast({
            type: "step_status",
            pipelineRunId: runId,
            stepRunId,
            stepIndex: step.stepIndex,
            status: "awaiting_approval",
          });
        }

        const approval = await this.db.query.approvals.findFirst({
          where: eq(approvals.stepRunId, stepRunId),
        });

        if (!approval) {
          await this.db.insert(approvals).values({
            pipelineRunId: runId,
            stepRunId,
            payload: { stepName: step.name, stepIndex: step.stepIndex },
          });
          await this.db
            .update(pipelineRuns)
            .set({ status: "paused", updatedAt: new Date() })
            .where(eq(pipelineRuns.id, runId));
          this.ws.broadcast({ type: "run_status", pipelineRunId: runId, status: "paused" });
          this.activeRunIds.delete(runId);
          return;
        }

        if (approval.status === "pending") {
          // Still waiting — re-pause (handles edge case of engine picking up too soon)
          await this.db
            .update(pipelineRuns)
            .set({ status: "paused", updatedAt: new Date() })
            .where(eq(pipelineRuns.id, runId));
          this.ws.broadcast({ type: "run_status", pipelineRunId: runId, status: "paused" });
          this.activeRunIds.delete(runId);
          return;
        }

        if (approval.status === "rejected") {
          throw new Error(
            `Step "${step.name}" rejected: ${approval.decisionNote ?? "no reason given"}`,
          );
        }
        // status === "approved" → fall through to execute
      }

      // ── Create/reuse step_run ──────────────────────────────────────────────
      let stepRun: typeof stepRuns.$inferSelect;
      if (existingSR && existingSR.status !== "awaiting_approval") {
        stepRun = existingSR;
      } else if (existingSR?.status === "awaiting_approval") {
        const [updated] = await this.db
          .update(stepRuns)
          .set({ status: "queued", updatedAt: new Date() })
          .where(eq(stepRuns.id, existingSR.id))
          .returning();
        stepRun = updated;
      } else {
        const [created] = await this.db
          .insert(stepRuns)
          .values({
            pipelineRunId: runId,
            stepIndex: step.stepIndex,
            status: "queued",
            input: run.inputParams,
          })
          .returning();
        stepRun = created;
      }

      this.ws.broadcast({
        type: "step_status",
        pipelineRunId: runId,
        stepRunId: stepRun.id,
        stepIndex: step.stepIndex,
        status: "queued",
      });

      const resolvedPrompt = resolvePrompt(step.promptTemplate ?? "", run.inputParams, stepOutputs);

      await this.db
        .update(stepRuns)
        .set({ status: "running", startedAt: new Date(), updatedAt: new Date() })
        .where(eq(stepRuns.id, stepRun.id));
      this.ws.broadcast({
        type: "step_status",
        pipelineRunId: runId,
        stepRunId: stepRun.id,
        stepIndex: step.stepIndex,
        status: "running",
      });

      const stepStartMs = Date.now();
      logger.info("step_start", { stepIndex: step.stepIndex, skillName: step.skillName ?? "" });
      logger.debug("prompt", { stepIndex: step.stepIndex, payload: resolvedPrompt });

      let seq = 0;
      const onEvent = (
        eventType: StepRunEventType,
        message?: string,
        payload?: Record<string, unknown>,
      ) => {
        const currentSeq = seq++;
        this.db
          .insert(stepRunEvents)
          .values({ stepRunId: stepRun.id, seq: currentSeq, eventType, message: message ?? null, payload: payload ?? null })
          .catch((e) => console.error("[ExecutionEngine] Event insert failed:", e));
        this.ws.broadcast({
          type: "step_event",
          pipelineRunId: runId,
          stepRunId: stepRun.id,
          stepIndex: step.stepIndex,
          eventType,
          message,
          payload,
        });
        if (eventType === "tool_call_start") {
          logger.info("tool_call", { stepIndex: step.stepIndex, tool: payload?.toolName ?? message, input: payload?.input });
        } else if (eventType === "tool_call_end") {
          logger.debug("tool_result", { stepIndex: step.stepIndex, tool: payload?.toolCallId ?? message });
        } else if (eventType === "text_delta") {
          logger.debug("llm_delta", { stepIndex: step.stepIndex, delta: message });
        }
      };

      // ── Dispatch (with retry) ──────────────────────────────────────────────
      let output = "";
      let usage: Record<string, unknown> = {};
      const retryConfig = (step.retryConfig as RetryConfig | null) ?? null;
      const maxRetries = retryConfig?.maxRetries ?? 0;
      let attempt = 0;

      // eslint-disable-next-line no-constant-condition
      while (true) {
        try {
          if (!step.skillName) {
            throw new Error(`Step "${step.name}" has no skillName configured`);
          }

          const { loadSkillDef } = await import("./skill-loader.js");
          const skill = loadSkillDef(step.skillName, skillsDir);
          if (!skill) throw new Error(`Skill not found: ${step.skillName}`);

          // Inject only the env vars declared in the skill's secrets field
          const scriptSecretEnv: Record<string, string> = {};
          for (const key of skill.secrets ?? []) {
            const val = process.env[key];
            if (val !== undefined) scriptSecretEnv[key] = val;
          }
          const scriptExecOpts = {
            networkEnabled: true,
            secretEnv: scriptSecretEnv,
          };

          // Resolve MCP tools for this skill
          let mcpToolDefs: import("@mariozechner/pi-coding-agent").ToolDefinition[] = [];
          if (skill.mcpServers && skill.mcpServers.length > 0) {
            const serverRows = await this.db.query.mcpServers.findMany({
              where: (t, { and, inArray: _inArray, eq: _eq }) =>
                and(_inArray(t.name, skill.mcpServers!), _eq(t.enabled, true)),
            });
            for (const row of serverRows) {
              try {
                const tools = await mcpPool.connect({
                  id: row.id,
                  name: row.name,
                  transport: row.transport as "stdio" | "sse" | "streamable-http",
                  command: row.command ?? undefined,
                  args: (row.args as string[] | null) ?? [],
                  url: row.url ?? undefined,
                  headers: (row.headers as Record<string, string> | null) ?? {},
                  env: (row.env as Record<string, string> | null) ?? {},
                });
                mcpToolDefs.push(...mcpToolsToToolDefinitions(tools, mcpPool));
                console.log(`[ExecutionEngine] MCP server "${row.name}" connected — ${tools.length} tool(s) available`);
              } catch (err) {
                console.warn(`[ExecutionEngine] MCP server "${row.name}" connection failed: ${String(err)}`);
                logger.info("mcp_connect_error", { server: row.name, error: String(err) });
              }
            }
          }

          const sessionDir = join(this.sessionsDir, "skills", runId, step.skillName + "-" + step.stepIndex);
          mkdirSync(sessionDir, { recursive: true });
          const result = await runSkillStep(
            skill,
            pipelineSystemPrompt,
            pipelineModelProvider,
            pipelineModelName,
            resolvedPrompt,
            pipelineContext,
            onEvent,
            sessionDir,
            signal,
            (session) => {
              this.sessionRegistry.register(stepRun.id, {
                session,
                pipelineRunId: runId,
              });
            },
            scriptExecOpts,
            mcpToolDefs,
          );
          this.sessionRegistry.unregister(stepRun.id);

          // If abort fired during the step, stop here — don't mark as completed
          if (signal?.aborted) {
            await this.db
              .update(stepRuns)
              .set({ status: "cancelled", finishedAt: new Date(), updatedAt: new Date() })
              .where(eq(stepRuns.id, stepRun.id));
            this.ws.broadcast({ type: "step_status", pipelineRunId: runId, stepRunId: stepRun.id, stepIndex: step.stepIndex, status: "cancelled" });
            break;
          }

          output = result.output;
          usage = result.usage;
          if (!output) {
            console.warn(`[ExecutionEngine] Step ${step.stepIndex} ("${step.name}") completed with empty output. Skill: ${step.skillName}`);
          }
          // When the skill declares an outputSchema, clean the output (strip markdown fences,
          // normalize JSON) so downstream {{steps.N.output.field}} references work reliably.
          if (skill.outputSchema && skill.outputSchema.length > 0 && output) {
            const cleaned = cleanJsonOutput(output);
            if (cleaned !== output) {
              logger.debug("json_output_cleaned", { stepIndex: step.stepIndex, originalLength: output.length, cleanedLength: cleaned.length });
            }
            output = cleaned;
          }
          const effectiveProvider = skill.modelProvider ?? pipelineModelProvider;
          const effectiveModel = skill.modelName ?? pipelineModelName;
          await recordCost(this.db, stepRun.id, step.skillName, runId, effectiveProvider, effectiveModel, usage);
          this.ws.broadcast({ type: "data_changed", entity: "cost", action: "created", id: stepRun.id });

          stepOutputs.set(step.stepIndex, output);

          await this.db
            .update(stepRuns)
            .set({ status: "completed", output: { text: output }, usageJson: usage, finishedAt: new Date(), updatedAt: new Date() })
            .where(eq(stepRuns.id, stepRun.id));

          logger.info("step_end", { stepIndex: step.stepIndex, status: "completed", durationMs: Date.now() - stepStartMs, usage, attempt });
          logger.debug("llm_output", { stepIndex: step.stepIndex, output });
          onEvent("status_change", "completed", { status: "completed" });
          this.ws.broadcast({
            type: "step_status",
            pipelineRunId: runId,
            stepRunId: stepRun.id,
            stepIndex: step.stepIndex,
            status: "completed",
          });

          // Step-by-step mode: pause after each step so the user can inspect before continuing
          const runMeta = (run.metadata as Record<string, unknown> | null) ?? {};
          if (runMeta.executionMode === "step_by_step") {
            const isLastStep = step.stepIndex === steps[steps.length - 1].stepIndex;
            if (!isLastStep) {
              await this.db
                .update(pipelineRuns)
                .set({ status: "paused", updatedAt: new Date() })
                .where(eq(pipelineRuns.id, runId));
              this.ws.broadcast({ type: "run_status", pipelineRunId: runId, status: "paused" });
              logger.info("step_by_step_pause", { stepIndex: step.stepIndex });
              this.activeRunIds.delete(runId);
              void mcpPool.disconnectAll();
              logger.close();
              return;
            }
          }

          break;
        } catch (err) {
          this.sessionRegistry.unregister(stepRun.id);

          // Abort — cancel the step and stop the loop, don't treat as a failure
          if (signal?.aborted) {
            await this.db
              .update(stepRuns)
              .set({ status: "cancelled", finishedAt: new Date(), updatedAt: new Date() })
              .where(eq(stepRuns.id, stepRun.id));
            this.ws.broadcast({ type: "step_status", pipelineRunId: runId, stepRunId: stepRun.id, stepIndex: step.stepIndex, status: "cancelled" });
            break;
          }

          if (attempt < maxRetries && isRetryable(err, retryConfig)) {
            attempt++;
            const backoffMs = (retryConfig?.backoffMs ?? 1000) * Math.pow(2, attempt - 1);
            logger.info("step_retry", { stepIndex: step.stepIndex, attempt, backoffMs, error: String(err) });
            await this.db
              .update(stepRuns)
              .set({ status: "retrying", updatedAt: new Date() })
              .where(eq(stepRuns.id, stepRun.id));
            this.ws.broadcast({
              type: "step_status",
              pipelineRunId: runId,
              stepRunId: stepRun.id,
              stepIndex: step.stepIndex,
              status: "retrying",
            });
            await sleep(backoffMs);
            await this.db
              .update(stepRuns)
              .set({ status: "running", updatedAt: new Date() })
              .where(eq(stepRuns.id, stepRun.id));
            this.ws.broadcast({
              type: "step_status",
              pipelineRunId: runId,
              stepRunId: stepRun.id,
              stepIndex: step.stepIndex,
              status: "running",
            });
            continue;
          }

          const errMsg = serializeError(err);
          await this.db
            .update(stepRuns)
            .set({ status: "failed", error: errMsg, finishedAt: new Date(), updatedAt: new Date() })
            .where(eq(stepRuns.id, stepRun.id));
          logger.info("step_end", { stepIndex: step.stepIndex, status: "failed", durationMs: Date.now() - stepStartMs, error: errMsg, attempt });
          onEvent("error", errMsg);
          this.ws.broadcast({
            type: "step_status",
            pipelineRunId: runId,
            stepRunId: stepRun.id,
            stepIndex: step.stepIndex,
            status: "failed",
          });
          logger.info("run_end", { status: "failed", durationMs: Date.now() - runStartMs });
          logger.close();
          void mcpPool.disconnectAll();
          throw err;
        }
      }
    }

    // If cancelled, the route already wrote "cancelled" to the DB — just clean up
    if (signal?.aborted) {
      logger.info("run_end", { status: "cancelled", durationMs: Date.now() - runStartMs });
      logger.close();
      this.ws.broadcast({ type: "run_status", pipelineRunId: runId, status: "cancelled" });
      this.activeRunIds.delete(runId);
      void mcpPool.disconnectAll();
      return;
    }

    const lastOutput = steps.length > 0 ? stepOutputs.get(steps[steps.length - 1].stepIndex) : undefined;
    await this.db
      .update(pipelineRuns)
      .set({ status: "completed", output: lastOutput ? { text: lastOutput } : {}, finishedAt: new Date(), updatedAt: new Date() })
      .where(eq(pipelineRuns.id, runId));
    logger.info("run_end", { status: "completed", durationMs: Date.now() - runStartMs });
    logger.close();
    this.ws.broadcast({ type: "run_status", pipelineRunId: runId, status: "completed" });
    this.activeRunIds.delete(runId);
    void mcpPool.disconnectAll();
  }
}
