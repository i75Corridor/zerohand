import { Cron } from "croner";
import { and, eq, lte, isNull, or } from "drizzle-orm";
import type { Db } from "@zerohand/db";
import { triggers, pipelineRuns } from "@zerohand/db";
import { createRun } from "./run-factory.js";
import type { WsManager } from "../ws/index.js";

export function computeNextRun(expression: string, timezone = "UTC"): Date {
  const job = new Cron(expression, { timezone });
  const next = job.nextRun();
  if (!next) throw new Error(`No next run computable for expression: ${expression}`);
  return next;
}

export class TriggerManager {
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private db: Db,
    private ws: WsManager,
  ) {}

  start(): void {
    void this.tick();
    this.pollTimer = setInterval(() => void this.tick(), 30_000);
    console.log("[TriggerManager] Started (polling every 30s).");
  }

  stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  async tick(): Promise<void> {
    try {
      const now = new Date();
      const due = await this.db
        .select()
        .from(triggers)
        .where(
          and(
            eq(triggers.type, "cron"),
            eq(triggers.enabled, true),
            or(isNull(triggers.nextRunAt), lte(triggers.nextRunAt, now)),
          ),
        );

      for (const trigger of due) {
        if (!trigger.cronExpression) continue;

        // First time seen — initialize nextRunAt without firing
        if (!trigger.nextRunAt) {
          const next = computeNextRun(trigger.cronExpression, trigger.timezone);
          await this.db
            .update(triggers)
            .set({ nextRunAt: next, updatedAt: new Date() })
            .where(eq(triggers.id, trigger.id));
          continue;
        }

        await this.fire(trigger);
      }
    } catch (err) {
      console.error("[TriggerManager] Tick error:", err);
    }
  }

  private async fire(trigger: typeof triggers.$inferSelect): Promise<void> {
    try {
      const run = await createRun(this.db, {
        pipelineId: trigger.pipelineId,
        inputParams: (trigger.defaultInputs as Record<string, unknown>) ?? {},
        triggerType: "cron",
        triggerDetail: trigger.cronExpression ?? undefined,
      });

      const next = computeNextRun(trigger.cronExpression!, trigger.timezone);
      await this.db
        .update(triggers)
        .set({ lastFiredAt: new Date(), nextRunAt: next, updatedAt: new Date() })
        .where(eq(triggers.id, trigger.id));

      this.ws.broadcast({ type: "run_status", pipelineRunId: run.id, status: "queued" });
      console.log(
        `[TriggerManager] Fired ${trigger.id} → run ${run.id}, next: ${next.toISOString()}`,
      );
    } catch (err) {
      console.error(`[TriggerManager] Failed to fire trigger ${trigger.id}:`, err);
    }
  }
}
