import { asc, eq } from "drizzle-orm";
import type { Db } from "@pawn/db";
import { pipelineRuns, pipelineSteps } from "@pawn/db";

export interface SnapshotStep {
  stepIndex: number;
  name: string;
  skillName: string | null;
  promptTemplate: string | null;
  approvalRequired: boolean;
  retryConfig: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
}

interface CreateRunOptions {
  pipelineId: string;
  inputParams?: Record<string, unknown>;
  triggerType?: string;
  triggerDetail?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Create a pipeline run, snapshotting the current step definitions into
 * `metadata.steps` at trigger time so the execution engine always runs
 * exactly the steps that were present when the run was queued.
 */
export async function createRun(
  db: Db,
  opts: CreateRunOptions,
): Promise<typeof pipelineRuns.$inferSelect> {
  const { pipelineId, inputParams = {}, triggerType = "manual", triggerDetail, metadata = {} } = opts;

  const steps = await db.query.pipelineSteps.findMany({
    where: eq(pipelineSteps.pipelineId, pipelineId),
    orderBy: [asc(pipelineSteps.stepIndex)],
  });

  const stepSnapshot: SnapshotStep[] = steps.map((s) => ({
    stepIndex: s.stepIndex,
    name: s.name,
    skillName: s.skillName ?? null,
    promptTemplate: s.promptTemplate ?? null,
    approvalRequired: s.approvalRequired ?? false,
    retryConfig: (s.retryConfig as Record<string, unknown> | null) ?? null,
    metadata: (s.metadata as Record<string, unknown> | null) ?? null,
  }));

  const [run] = await db
    .insert(pipelineRuns)
    .values({
      pipelineId,
      inputParams,
      triggerType,
      triggerDetail,
      metadata: { ...metadata, steps: stepSnapshot },
    })
    .returning();

  return run;
}
