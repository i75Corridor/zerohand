/**
 * Seeds pipelines from config files found in the pipelines directory.
 *
 * Each subdirectory is a pipeline package:
 *   pipelines/<name>/pipeline.yaml   — manifest (workers, steps, inputSchema)
 *   pipelines/<name>/prompts/*.md    — system prompts (referenced by systemPromptFile)
 *   pipelines/<name>/COMPANY.md      — context files (interpolated via {{context.key}})
 *
 * Change detection: a SHA-256 hash of pipeline.yaml is stored in pipeline.metadata.configHash.
 * On startup, if the hash differs the pipeline, its workers, and all run history are torn
 * down and re-seeded from the current config file.
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { eq, inArray } from "drizzle-orm";
import type { Db } from "@zerohand/db";
import { workers, pipelines, pipelineSteps, pipelineRuns } from "@zerohand/db";

interface WorkerConfig {
  name: string;
  description?: string;
  workerType?: string;
  modelProvider: string;
  modelName: string;
  systemPrompt?: string;
  systemPromptFile?: string;
  skills?: string[];
  customTools?: string[];
  metadata?: Record<string, unknown>;
}

interface StepConfig {
  name: string;
  worker: string;
  promptTemplate: string;
  timeoutSeconds?: number;
  approvalRequired?: boolean;
  metadata?: Record<string, unknown>;
}

interface PipelineManifest {
  name: string;
  description?: string;
  status?: string;
  inputSchema?: Record<string, unknown>;
  context?: Record<string, string>;
  workers: Record<string, WorkerConfig>;
  steps: StepConfig[];
}

function hashConfig(raw: string): string {
  return createHash("sha256").update(raw).digest("hex").slice(0, 16);
}

function resolvePrompt(
  inline: string | undefined,
  file: string | undefined,
  packageDir: string,
  context: Record<string, string>,
): string {
  let text = "";
  if (file) {
    text = readFileSync(resolve(packageDir, file), "utf-8");
  } else if (inline) {
    text = inline;
  }
  for (const [key, value] of Object.entries(context)) {
    text = text.replaceAll(`{{context.${key}}}`, value);
  }
  return text.trim();
}

async function teardown(db: Db, pipelineId: string): Promise<void> {
  // Collect worker IDs before cascade-deleting the pipeline
  const steps = await db
    .select({ workerId: pipelineSteps.workerId })
    .from(pipelineSteps)
    .where(eq(pipelineSteps.pipelineId, pipelineId));
  const workerIds = [...new Set(steps.map((s) => s.workerId))];

  // pipeline_runs has no cascade from pipelines — delete manually (cascades to step_runs → events)
  await db.delete(pipelineRuns).where(eq(pipelineRuns.pipelineId, pipelineId));
  // Delete pipeline (cascades to pipeline_steps)
  await db.delete(pipelines).where(eq(pipelines.id, pipelineId));
  // Delete workers (step_runs referencing them are already gone)
  if (workerIds.length > 0) {
    await db.delete(workers).where(inArray(workers.id, workerIds));
  }
}

async function seedPackage(db: Db, packageDir: string): Promise<void> {
  const configPath = join(packageDir, "pipeline.yaml");
  if (!existsSync(configPath)) return;

  const raw = readFileSync(configPath, "utf-8");
  const configHash = hashConfig(raw);
  const manifest = parseYaml(raw) as PipelineManifest;

  const existing = await db.select().from(pipelines).where(eq(pipelines.name, manifest.name)).limit(1);

  if (existing.length > 0) {
    const storedHash = existing[0].metadata?.configHash as string | undefined;
    if (storedHash === configHash) {
      console.log(`[Seed] "${manifest.name}" up to date.`);
      return;
    }
    console.log(`[Seed] "${manifest.name}" config changed, re-seeding...`);
    await teardown(db, existing[0].id);
  } else {
    console.log(`[Seed] Seeding "${manifest.name}"...`);
  }

  // Load context files
  const context: Record<string, string> = {};
  for (const [key, filePath] of Object.entries(manifest.context ?? {})) {
    context[key] = readFileSync(resolve(packageDir, filePath), "utf-8");
  }

  // Create workers, tracking key → DB id
  const workerIdMap = new Map<string, string>();
  for (const [key, w] of Object.entries(manifest.workers)) {
    const systemPrompt = resolvePrompt(w.systemPrompt, w.systemPromptFile, packageDir, context);
    const [row] = await db
      .insert(workers)
      .values({
        name: w.name,
        description: w.description,
        workerType: w.workerType ?? "pi",
        modelProvider: w.modelProvider,
        modelName: w.modelName,
        systemPrompt: systemPrompt || null,
        skills: w.skills ?? [],
        customTools: w.customTools ?? [],
        metadata: w.metadata,
      })
      .returning();
    workerIdMap.set(key, row.id);
  }

  // Create pipeline — store configHash so we can detect future changes
  const [pipeline] = await db
    .insert(pipelines)
    .values({
      name: manifest.name,
      description: manifest.description,
      status: manifest.status ?? "active",
      inputSchema: manifest.inputSchema,
      metadata: { configHash },
    })
    .returning();

  // Create steps
  await db.insert(pipelineSteps).values(
    manifest.steps.map((step, index) => {
      const workerId = workerIdMap.get(step.worker);
      if (!workerId) throw new Error(`[Seed] Unknown worker key "${step.worker}" in step "${step.name}"`);
      return {
        pipelineId: pipeline.id,
        stepIndex: index,
        name: step.name,
        workerId,
        promptTemplate: step.promptTemplate,
        timeoutSeconds: step.timeoutSeconds ?? 300,
        approvalRequired: step.approvalRequired ?? false,
        metadata: step.metadata,
      };
    }),
  );

  console.log(`[Seed] "${manifest.name}" seeded successfully.`);
}

export async function seedFromConfigs(db: Db, pipelinesDir: string): Promise<void> {
  if (!existsSync(pipelinesDir)) {
    console.log(`[Seed] Pipelines directory not found: ${pipelinesDir}`);
    return;
  }

  const entries = readdirSync(pipelinesDir, { withFileTypes: true });
  const packageDirs = entries.filter((e) => e.isDirectory()).map((e) => join(pipelinesDir, e.name));

  for (const dir of packageDirs) {
    await seedPackage(db, dir);
  }
}
