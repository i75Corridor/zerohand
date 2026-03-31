import { eq, asc } from "drizzle-orm";
import type { Db } from "@zerohand/db";
import { pipelineRuns, stepRuns, stepRunEvents, pipelineSteps, workers } from "@zerohand/db";
import type { StepRunEventType } from "@zerohand/shared";
import type { WsManager } from "../ws/index.js";
import { join, resolve } from "node:path";
import { runWorkerStep } from "./pi-executor.js";
import { runImagenWorker, runPublishWorker } from "./builtin-workers.js";

function resolvePrompt(
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
      if (parts[2] === "output" && parts.length === 3) {
        return output;
      }
      if (parts[2] === "output" && parts.length > 3) {
        try {
          const parsed = JSON.parse(output) as Record<string, unknown>;
          let value: unknown = parsed;
          for (let i = 3; i < parts.length; i++) {
            if (value && typeof value === "object") {
              value = (value as Record<string, unknown>)[parts[i]];
            } else {
              value = undefined;
              break;
            }
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
  private activeRunIds = new Set<string>();

  constructor(
    private db: Db,
    private ws: WsManager,
  ) {}

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

      if (!run || this.activeRunIds.has(run.id)) return;

      this.activeRunIds.add(run.id);
      await this.db
        .update(pipelineRuns)
        .set({ status: "running", startedAt: new Date(), updatedAt: new Date() })
        .where(eq(pipelineRuns.id, run.id));

      this.ws.broadcast({ type: "run_status", pipelineRunId: run.id, status: "running" });

      this.executeRun(run.id).catch(async (err) => {
        console.error(`[ExecutionEngine] Run ${run.id} failed:`, err);
        await this.db
          .update(pipelineRuns)
          .set({
            status: "failed",
            error: String(err),
            finishedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(pipelineRuns.id, run.id));
        this.ws.broadcast({ type: "run_status", pipelineRunId: run.id, status: "failed" });
        this.activeRunIds.delete(run.id);
      });
    } catch (err) {
      console.error("[ExecutionEngine] Tick error:", err);
    }
  }

  private async executeRun(runId: string): Promise<void> {
    const run = await this.db.query.pipelineRuns.findFirst({
      where: eq(pipelineRuns.id, runId),
    });
    if (!run) throw new Error(`Run not found: ${runId}`);

    const steps = await this.db.query.pipelineSteps.findMany({
      where: eq(pipelineSteps.pipelineId, run.pipelineId),
      orderBy: [asc(pipelineSteps.stepIndex)],
    });

    const stepOutputs = new Map<number, string>();

    for (const step of steps) {
      const worker = await this.db.query.workers.findFirst({
        where: eq(workers.id, step.workerId),
      });
      if (!worker) throw new Error(`Worker not found: ${step.workerId}`);

      // Create step_run record
      const [stepRun] = await this.db
        .insert(stepRuns)
        .values({
          pipelineRunId: runId,
          stepIndex: step.stepIndex,
          workerId: step.workerId,
          status: "queued",
          input: run.inputParams,
        })
        .returning();

      this.ws.broadcast({
        type: "step_status",
        pipelineRunId: runId,
        stepRunId: stepRun.id,
        stepIndex: step.stepIndex,
        status: "queued",
      });

      // Resolve prompt template
      const resolvedPrompt = resolvePrompt(step.promptTemplate, run.inputParams, stepOutputs);

      // Update to running
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

      const onEvent = (eventType: StepRunEventType, message?: string, payload?: Record<string, unknown>) => {
        const currentSeq = seq++;
        // Fire-and-forget DB insert for events
        this.db
          .insert(stepRunEvents)
          .values({
            stepRunId: stepRun.id,
            seq: currentSeq,
            eventType,
            message: message ?? null,
            payload: payload ?? null,
          })
          .catch((err) => console.error("[ExecutionEngine] Event insert failed:", err));

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

      let output = "";
      let usage: Record<string, unknown> = {};

      try {
        if (worker.workerType === "pi") {
          const result = await runWorkerStep(
            {
              id: worker.id,
              modelProvider: worker.modelProvider,
              modelName: worker.modelName,
              systemPrompt: worker.systemPrompt,
              skills: worker.skills as string[],
              customTools: worker.customTools as string[],
            },
            resolvedPrompt,
            onEvent,
          );
          output = result.output;
          usage = result.usage;
        } else if (worker.workerType === "imagen") {
          const outputDir =
            (worker.metadata?.outputDir as string | undefined) ??
            process.env.OUTPUT_DIR ??
            join(process.cwd(), "..", "output");
          // Derive slug from run id + step index for uniqueness
          const slug = `${run.id.slice(0, 8)}-step${step.stepIndex}`;
          output = await runImagenWorker(
            resolvedPrompt,
            worker.modelName,
            outputDir,
            slug,
            (msg) => onEvent("text_delta", msg),
          );
        } else if (worker.workerType === "publish") {
          const outputDir =
            (worker.metadata?.outputDir as string | undefined) ??
            process.env.OUTPUT_DIR ??
            join(process.cwd(), "..", "output");
          const imageStepIndex = step.metadata?.imageStepIndex as number | undefined;
          const imagePath = imageStepIndex !== undefined ? (stepOutputs.get(imageStepIndex) ?? "") : "";
          output = await runPublishWorker(
            resolvedPrompt,
            imagePath,
            outputDir,
            (msg) => onEvent("text_delta", msg),
          );
        } else {
          throw new Error(`Worker type "${worker.workerType}" not yet implemented`);
        }

        stepOutputs.set(step.stepIndex, output);

        await this.db
          .update(stepRuns)
          .set({
            status: "completed",
            output: { text: output },
            usageJson: usage,
            finishedAt: new Date(),
            updatedAt: new Date(),
          })
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
        const errMsg = String(err);

        await this.db
          .update(stepRuns)
          .set({
            status: "failed",
            error: errMsg,
            finishedAt: new Date(),
            updatedAt: new Date(),
          })
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

    // All steps done
    const lastOutput = steps.length > 0 ? stepOutputs.get(steps[steps.length - 1].stepIndex) : undefined;

    await this.db
      .update(pipelineRuns)
      .set({
        status: "completed",
        output: lastOutput ? { text: lastOutput } : {},
        finishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(pipelineRuns.id, runId));

    this.ws.broadcast({ type: "run_status", pipelineRunId: runId, status: "completed" });
    this.activeRunIds.delete(runId);
  }
}
