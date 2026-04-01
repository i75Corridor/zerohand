/**
 * Idempotent pipeline package importer.
 *
 * Each subdirectory under the pipelines directory is a package:
 *   pipelines/<name>/pipeline.yaml   — manifest (workers, steps, inputSchema)
 *   pipelines/<name>/prompts/*.md    — system prompts (referenced by systemPromptFile)
 *   pipelines/<name>/COMPANY.md      — context files (interpolated via {{context.key}})
 *
 * Change detection: a SHA-256 hash of pipeline.yaml is stored in pipeline.metadata.configHash.
 * A worker key → DB ID map is stored in pipeline.metadata.workerKeyMap so updates are stable.
 *
 * On config change: workers and steps are UPSERTED in place — run history is preserved.
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { eq, inArray } from "drizzle-orm";
import type { Db } from "@zerohand/db";
import { workers, pipelines, pipelineSteps } from "@zerohand/db";

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

function loadContext(manifest: PipelineManifest, packageDir: string): Record<string, string> {
  const context: Record<string, string> = {};
  for (const [key, filePath] of Object.entries(manifest.context ?? {})) {
    context[key] = readFileSync(resolve(packageDir, filePath), "utf-8");
  }
  return context;
}

async function createPackage(
  db: Db,
  manifest: PipelineManifest,
  configHash: string,
  packageDir: string,
): Promise<void> {
  const context = loadContext(manifest, packageDir);

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

  // Store configHash + workerKeyMap in metadata for stable future updates
  const workerKeyMap = Object.fromEntries(workerIdMap);
  const [pipeline] = await db
    .insert(pipelines)
    .values({
      name: manifest.name,
      description: manifest.description,
      status: manifest.status ?? "active",
      inputSchema: manifest.inputSchema,
      metadata: { configHash, workerKeyMap },
    })
    .returning();

  // Create steps
  await db.insert(pipelineSteps).values(
    manifest.steps.map((step, index) => {
      const workerId = workerIdMap.get(step.worker);
      if (!workerId) throw new Error(`[Import] Unknown worker key "${step.worker}" in step "${step.name}"`);
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
}

async function updatePackage(
  db: Db,
  existing: typeof pipelines.$inferSelect,
  manifest: PipelineManifest,
  configHash: string,
  packageDir: string,
): Promise<void> {
  const context = loadContext(manifest, packageDir);

  // Retrieve the stable worker key → ID map from stored metadata
  const storedWorkerKeyMap = ((existing.metadata as Record<string, unknown>)?.workerKeyMap ?? {}) as Record<string, string>;

  // Upsert workers: update existing by stored ID, create new ones
  const workerIdMap = new Map<string, string>();
  for (const [key, w] of Object.entries(manifest.workers)) {
    const systemPrompt = resolvePrompt(w.systemPrompt, w.systemPromptFile, packageDir, context);
    const existingWorkerId = storedWorkerKeyMap[key];

    if (existingWorkerId) {
      await db
        .update(workers)
        .set({
          name: w.name,
          description: w.description,
          workerType: w.workerType ?? "pi",
          modelProvider: w.modelProvider,
          modelName: w.modelName,
          systemPrompt: systemPrompt || null,
          skills: w.skills ?? [],
          customTools: w.customTools ?? [],
          metadata: w.metadata,
          updatedAt: new Date(),
        })
        .where(eq(workers.id, existingWorkerId));
      workerIdMap.set(key, existingWorkerId);
    } else {
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
  }

  // Update pipeline metadata with new hash and worker map
  const workerKeyMap = Object.fromEntries(workerIdMap);
  await db
    .update(pipelines)
    .set({
      name: manifest.name,
      description: manifest.description,
      status: manifest.status ?? "active",
      inputSchema: manifest.inputSchema,
      metadata: { configHash, workerKeyMap },
      updatedAt: new Date(),
    })
    .where(eq(pipelines.id, existing.id));

  // Upsert steps by stepIndex
  const existingSteps = await db
    .select()
    .from(pipelineSteps)
    .where(eq(pipelineSteps.pipelineId, existing.id));
  const existingByIndex = new Map(existingSteps.map((s) => [s.stepIndex, s]));
  const yamlIndices = manifest.steps.map((_, i) => i);

  for (const [index, step] of manifest.steps.entries()) {
    const workerId = workerIdMap.get(step.worker);
    if (!workerId) throw new Error(`[Import] Unknown worker key "${step.worker}" in step "${step.name}"`);

    const existingStep = existingByIndex.get(index);
    if (existingStep) {
      await db
        .update(pipelineSteps)
        .set({
          name: step.name,
          workerId,
          promptTemplate: step.promptTemplate,
          timeoutSeconds: step.timeoutSeconds ?? 300,
          approvalRequired: step.approvalRequired ?? false,
          metadata: step.metadata,
          updatedAt: new Date(),
        })
        .where(eq(pipelineSteps.id, existingStep.id));
    } else {
      await db.insert(pipelineSteps).values({
        pipelineId: existing.id,
        stepIndex: index,
        name: step.name,
        workerId,
        promptTemplate: step.promptTemplate,
        timeoutSeconds: step.timeoutSeconds ?? 300,
        approvalRequired: step.approvalRequired ?? false,
        metadata: step.metadata,
      });
    }
  }

  // Delete steps that no longer exist in the YAML
  const stepsToDelete = existingSteps.filter((s) => !yamlIndices.includes(s.stepIndex));
  if (stepsToDelete.length > 0) {
    await db.delete(pipelineSteps).where(
      inArray(pipelineSteps.id, stepsToDelete.map((s) => s.id)),
    );
  }
}

export async function importPipelinePackage(db: Db, packageDir: string): Promise<void> {
  const configPath = join(packageDir, "pipeline.yaml");
  if (!existsSync(configPath)) return;

  const raw = readFileSync(configPath, "utf-8");
  const configHash = hashConfig(raw);
  const manifest = parseYaml(raw) as PipelineManifest;

  const existing = await db
    .select()
    .from(pipelines)
    .where(eq(pipelines.name, manifest.name))
    .limit(1);

  if (existing.length > 0) {
    const storedHash = (existing[0].metadata as Record<string, unknown>)?.configHash as string | undefined;
    if (storedHash === configHash) {
      console.log(`[Import] "${manifest.name}" up to date.`);
      return;
    }
    console.log(`[Import] "${manifest.name}" config changed, updating in place...`);
    await updatePackage(db, existing[0], manifest, configHash, packageDir);
    console.log(`[Import] "${manifest.name}" updated.`);
  } else {
    console.log(`[Import] Importing "${manifest.name}"...`);
    await createPackage(db, manifest, configHash, packageDir);
    console.log(`[Import] "${manifest.name}" imported.`);
  }
}

export async function importAllPackages(db: Db, pipelinesDir: string): Promise<void> {
  if (!existsSync(pipelinesDir)) {
    console.log(`[Import] Pipelines directory not found: ${pipelinesDir}`);
    return;
  }

  const entries = readdirSync(pipelinesDir, { withFileTypes: true });
  const packageDirs = entries.filter((e) => e.isDirectory()).map((e) => join(pipelinesDir, e.name));

  for (const dir of packageDirs) {
    await importPipelinePackage(db, dir);
  }
}
