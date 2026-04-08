/**
 * Idempotent pipeline package importer.
 *
 * Each subdirectory under the pipelines directory is a package:
 *   pipelines/<name>/pipeline.yaml   — manifest (steps, inputSchema)
 *   pipelines/<name>/prompts/*.md    — system prompts (referenced by systemPromptFile)
 *   pipelines/<name>/COMPANY.md      — context files (interpolated via {{context.key}})
 *
 * Change detection: a SHA-256 hash of pipeline.yaml is stored in pipeline.metadata.configHash.
 *
 * On config change: steps are UPSERTED in place — run history is preserved.
 *
 * Skill-based format: steps reference a skill by name via `skill:`.
 * Pipelines can define a top-level `model:` and `systemPrompt:`/`systemPromptFile:`.
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { eq, inArray } from "drizzle-orm";
import type { Db } from "@pawn/db";
import { pipelines, pipelineSteps, mcpServers, installedBlueprints } from "@pawn/db";

interface StepConfig {
  name: string;
  skill?: string;
  promptTemplate: string;
  timeoutSeconds?: number;
  approvalRequired?: boolean;
  metadata?: Record<string, unknown>;
}

interface McpServerDeclaration {
  transport: "stdio" | "sse" | "streamable-http";
  command?: string;
  args?: string[];
  url?: string;
  headers?: Record<string, string>;
  env?: Record<string, string>;
}

interface PipelineManifest {
  name: string;
  description?: string;
  status?: string;
  model?: string;
  systemPrompt?: string;
  systemPromptFile?: string;
  inputSchema?: Record<string, unknown>;
  context?: Record<string, string>;
  steps: StepConfig[];
  mcpServers?: Record<string, McpServerDeclaration>;
}

export function hashConfig(raw: string): string {
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

export function parsePipelineModel(model: string | undefined): { modelProvider?: string; modelName?: string } {
  if (!model) return {};
  const idx = model.indexOf("/");
  if (idx === -1) return {};
  return {
    modelProvider: model.slice(0, idx),
    modelName: model.slice(idx + 1),
  };
}

/**
 * Qualify a skill reference from a pipeline.yaml.
 * If the ref already has a "/" it's already qualified (pass through).
 * Otherwise prefix with the package namespace.
 * If no namespace provided, prefix with "local".
 */
function qualifySkillRef(skillRef: string | undefined, namespace: string): string | null {
  if (!skillRef) return null;
  if (skillRef.includes("/")) return skillRef;
  return `${namespace}/${skillRef}`;
}

/**
 * Upsert MCP server declarations from a pipeline.yaml into the mcp_servers table.
 * Skips servers whose name already exists (logs warning).
 * Links newly-inserted servers to the installed blueprint via sourceBlueprintId.
 */
async function registerMcpServers(
  db: Db,
  mcpServerDeclarations: Record<string, McpServerDeclaration>,
  packageRepoUrl: string,
): Promise<void> {
  const pkg = await db.query.installedBlueprints.findFirst({
    where: eq(installedBlueprints.repoUrl, packageRepoUrl),
  });

  for (const [name, decl] of Object.entries(mcpServerDeclarations)) {
    const existing = await db.query.mcpServers.findFirst({
      where: eq(mcpServers.name, name),
    });
    if (existing) {
      console.log(`[Import] MCP server "${name}" already registered — skipping.`);
      continue;
    }
    await db.insert(mcpServers).values({
      name,
      transport: decl.transport,
      command: decl.command ?? null,
      args: decl.args ?? [],
      url: decl.url ?? null,
      headers: decl.headers ?? {},
      env: decl.env ?? {},
      source: "blueprint",
      sourceBlueprintId: pkg?.id ?? null,
    });
    console.log(`[Import] Registered MCP server "${name}" from blueprint.`);
  }
}

async function createPackage(
  db: Db,
  manifest: PipelineManifest,
  configHash: string,
  packageDir: string,
  namespace: string,
): Promise<void> {
  const context = loadContext(manifest, packageDir);

  const { modelProvider, modelName } = parsePipelineModel(manifest.model);
  const systemPrompt = resolvePrompt(manifest.systemPrompt, manifest.systemPromptFile, packageDir, context);

  const [pipeline] = await db
    .insert(pipelines)
    .values({
      name: manifest.name,
      description: manifest.description,
      status: manifest.status ?? "active",
      inputSchema: manifest.inputSchema,
      systemPrompt: systemPrompt || null,
      modelProvider: modelProvider ?? null,
      modelName: modelName ?? null,
      metadata: { configHash, context },
    })
    .returning();

  // Create steps — qualify bare skill refs with the package namespace
  await db.insert(pipelineSteps).values(
    manifest.steps.map((step, index) => ({
      pipelineId: pipeline.id,
      stepIndex: index,
      name: step.name,
      skillName: qualifySkillRef(step.skill, namespace),
      promptTemplate: step.promptTemplate,
      timeoutSeconds: step.timeoutSeconds ?? 300,
      approvalRequired: step.approvalRequired ?? false,
      metadata: step.metadata,
    })),
  );
}

async function updatePackage(
  db: Db,
  existing: typeof pipelines.$inferSelect,
  manifest: PipelineManifest,
  configHash: string,
  packageDir: string,
  namespace: string,
): Promise<void> {
  const context = loadContext(manifest, packageDir);

  const { modelProvider, modelName } = parsePipelineModel(manifest.model);
  const systemPrompt = resolvePrompt(manifest.systemPrompt, manifest.systemPromptFile, packageDir, context);

  await db
    .update(pipelines)
    .set({
      name: manifest.name,
      description: manifest.description,
      status: manifest.status ?? "active",
      inputSchema: manifest.inputSchema,
      systemPrompt: systemPrompt || null,
      modelProvider: modelProvider ?? null,
      modelName: modelName ?? null,
      metadata: { configHash, context },
      updatedAt: new Date(),
    })
    .where(eq(pipelines.id, existing.id));

  // Upsert steps by stepIndex — qualify bare skill refs with the package namespace
  const existingSteps = await db
    .select()
    .from(pipelineSteps)
    .where(eq(pipelineSteps.pipelineId, existing.id));
  const existingByIndex = new Map(existingSteps.map((s) => [s.stepIndex, s]));
  const yamlIndices = manifest.steps.map((_, i) => i);

  for (const [index, step] of manifest.steps.entries()) {
    const qualifiedSkill = qualifySkillRef(step.skill, namespace);
    const existingStep = existingByIndex.get(index);
    if (existingStep) {
      await db
        .update(pipelineSteps)
        .set({
          name: step.name,
          skillName: qualifiedSkill,
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
        skillName: qualifiedSkill,
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

export async function importPipelinePackage(
  db: Db,
  packageDir: string,
  namespace = "local",
  repoUrl?: string,
): Promise<void> {
  const configPath = join(packageDir, "pipeline.yaml");
  if (!existsSync(configPath)) return;

  const raw = readFileSync(configPath, "utf-8");
  const configHash = hashConfig(raw);
  const manifest = parseYaml(raw) as PipelineManifest;

  // Register any MCP server declarations from the manifest
  if (repoUrl && manifest.mcpServers && Object.keys(manifest.mcpServers).length > 0) {
    await registerMcpServers(db, manifest.mcpServers, repoUrl);
  }

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
    await updatePackage(db, existing[0], manifest, configHash, packageDir, namespace);
    console.log(`[Import] "${manifest.name}" updated.`);
  } else {
    console.log(`[Import] Importing "${manifest.name}"...`);
    await createPackage(db, manifest, configHash, packageDir, namespace);
    console.log(`[Import] "${manifest.name}" imported.`);
  }
}

export async function importAllBlueprints(db: Db, pipelinesDir: string): Promise<void> {
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
