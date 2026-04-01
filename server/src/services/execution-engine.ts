import { eq, asc } from "drizzle-orm";
import { join, resolve } from "node:path";
import { mkdirSync } from "node:fs";
import type { Db } from "@zerohand/db";
import {
  pipelineRuns,
  stepRuns,
  stepRunEvents,
  pipelineSteps,
  pipelines,
  approvals,
} from "@zerohand/db";
import type { StepRunEventType, WsIncomingChat } from "@zerohand/shared";
import type { WsManager } from "../ws/index.js";
import { runSkillStep } from "./pi-executor.js";
import { runImagenWorker, runPublishWorker } from "./builtin-workers.js";
import { recordCost } from "./budget-guard.js";
import { SessionRegistry } from "./session-registry.js";

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

    if (parts[0] === "steps" && parts.length >= 3) {
      const stepIndex = parseInt(parts[1], 10);
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
    this.sessionsDir = resolve(
      process.env.DATA_DIR ?? join(process.cwd(), ".data"),
      "sessions",
    );
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
          .set({ status: "failed", error: String(err), finishedAt: new Date(), updatedAt: new Date() })
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
    const pipelineModelProvider = pipeline?.modelProvider ?? "google";
    const pipelineModelName = pipeline?.modelName ?? "gemini-2.5-flash";

    const steps = await this.db.query.pipelineSteps.findMany({
      where: eq(pipelineSteps.pipelineId, run.pipelineId),
      orderBy: [asc(pipelineSteps.stepIndex)],
    });

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

      const resolvedPrompt = resolvePrompt(step.promptTemplate, run.inputParams, stepOutputs);

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
      };

      // ── Dispatch ───────────────────────────────────────────────────────────
      let output = "";
      let usage: Record<string, unknown> = {};

      try {
        if (!step.skillName) {
          throw new Error(`Step "${step.name}" has no skillName configured`);
        }

        const skillsDir = process.env.SKILLS_DIR ?? join(process.cwd(), "..", "skills");
        const { loadSkillDef } = await import("./skill-loader.js");
        const skill = loadSkillDef(step.skillName, skillsDir);
        if (!skill) throw new Error(`Skill not found: ${step.skillName}`);

        if (skill.type === "pi") {
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
          );
          this.sessionRegistry.unregister(stepRun.id);
          output = result.output;
          usage = result.usage;
          await recordCost(this.db, stepRun.id, step.skillName, runId, pipelineModelProvider, pipelineModelName, usage);
        } else if (skill.type === "imagen") {
          const outputDir = process.env.OUTPUT_DIR ?? join(process.cwd(), "..", "output");
          const slug = `${run.id.slice(0, 8)}-step${step.stepIndex}`;
          const modelName = skill.modelName ?? "imagen-4.0-generate-001";
          const aspectRatio = (skill.metadata?.aspectRatio as string | undefined) ?? "16:9";
          const personGeneration = (skill.metadata?.personGeneration as string | undefined) ?? "allow_all";
          output = await runImagenWorker(resolvedPrompt, modelName, outputDir, slug, (msg) => onEvent("text_delta", msg), aspectRatio, personGeneration);
        } else if (skill.type === "publish") {
          const outputDir = process.env.OUTPUT_DIR ?? join(process.cwd(), "..", "output");
          const imageStepIndex = step.metadata?.imageStepIndex as number | undefined;
          const imagePath = imageStepIndex !== undefined ? (stepOutputs.get(imageStepIndex) ?? "") : "";
          output = await runPublishWorker(resolvedPrompt, imagePath, outputDir, (msg) => onEvent("text_delta", msg));
        }

        stepOutputs.set(step.stepIndex, output);

        await this.db
          .update(stepRuns)
          .set({ status: "completed", output: { text: output }, usageJson: usage, finishedAt: new Date(), updatedAt: new Date() })
          .where(eq(stepRuns.id, stepRun.id));

        onEvent("status_change", "completed", { status: "completed" });
        this.ws.broadcast({
          type: "step_status",
          pipelineRunId: runId,
          stepRunId: stepRun.id,
          stepIndex: step.stepIndex,
          status: "completed",
        });
      } catch (err) {
        this.sessionRegistry.unregister(stepRun.id);
        const errMsg = String(err);
        await this.db
          .update(stepRuns)
          .set({ status: "failed", error: errMsg, finishedAt: new Date(), updatedAt: new Date() })
          .where(eq(stepRuns.id, stepRun.id));
        onEvent("error", errMsg);
        this.ws.broadcast({
          type: "step_status",
          pipelineRunId: runId,
          stepRunId: stepRun.id,
          stepIndex: step.stepIndex,
          status: "failed",
        });
        throw err;
      }
    }

    const lastOutput = steps.length > 0 ? stepOutputs.get(steps[steps.length - 1].stepIndex) : undefined;
    await this.db
      .update(pipelineRuns)
      .set({ status: "completed", output: lastOutput ? { text: lastOutput } : {}, finishedAt: new Date(), updatedAt: new Date() })
      .where(eq(pipelineRuns.id, runId));
    this.ws.broadcast({ type: "run_status", pipelineRunId: runId, status: "completed" });
    this.activeRunIds.delete(runId);
  }
}
