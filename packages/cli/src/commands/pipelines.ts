import { readFileSync, writeFileSync } from "node:fs";
import { Command } from "commander";
import { parse as parseYaml } from "yaml";
import { ApiClient } from "../api-client.js";
import { formatTable, relativeTime } from "../formatters.js";
import { pipelineToYaml } from "../formatters.js";

interface StepConfig {
  name: string;
  skill?: string;
  promptTemplate: string;
  timeoutSeconds?: number;
  approvalRequired?: boolean;
  metadata?: Record<string, unknown>;
}

interface PipelineManifest {
  name: string;
  description?: string;
  status?: string;
  model?: string;
  systemPrompt?: string;
  systemPromptFile?: string;
  inputSchema?: Record<string, unknown>;
  steps: StepConfig[];
}

function parsePipelineModel(model: string | undefined): { modelProvider?: string; modelName?: string } {
  if (!model) return {};
  const idx = model.indexOf("/");
  if (idx === -1) return {};
  return { modelProvider: model.slice(0, idx), modelName: model.slice(idx + 1) };
}

export function registerPipelinesCommand(program: Command, client: ApiClient): void {
  const cmd = program.command("pipelines").description("manage pipelines");

  cmd
    .command("list")
    .description("list pipelines")
    .action(async () => {
      const pipelines = await client.listPipelines();
      const rows = pipelines.map((p) => ({
        NAME: p.name,
        STATUS: p.status ?? "",
        MODEL: p.modelProvider && p.modelName ? `${p.modelProvider}/${p.modelName}` : "",
        CREATED: relativeTime(p.createdAt),
      }));
      console.log(formatTable(rows, ["NAME", "STATUS", "MODEL", "CREATED"]));
    });

  cmd
    .command("import <file>")
    .description("import a pipeline.yaml into the server")
    .action(async (file: string) => {
      const raw = readFileSync(file, "utf-8");
      const manifest = parseYaml(raw) as PipelineManifest;
      const { modelProvider, modelName } = parsePipelineModel(manifest.model);

      const pipelineData = {
        name: manifest.name,
        description: manifest.description,
        status: manifest.status ?? "active",
        inputSchema: manifest.inputSchema,
        systemPrompt: manifest.systemPrompt ?? null,
        modelProvider: modelProvider ?? null,
        modelName: modelName ?? null,
      };

      const existing = await client.findPipelineByName(manifest.name);

      if (existing) {
        await client.updatePipeline(existing.id, pipelineData);

        // Sync steps: update existing by stepIndex, create new, delete removed
        const existingSteps = existing.steps ?? [];
        const byIndex = new Map(existingSteps.map((s) => [s.stepIndex, s]));
        const yamlIndices = new Set(manifest.steps.map((_, i) => i));

        for (const [index, step] of manifest.steps.entries()) {
          const stepData = {
            stepIndex: index,
            name: step.name,
            skillName: step.skill ?? null,
            promptTemplate: step.promptTemplate,
            timeoutSeconds: step.timeoutSeconds ?? 300,
            approvalRequired: step.approvalRequired ?? false,
            metadata: step.metadata,
          };
          const existingStep = byIndex.get(index);
          if (existingStep) {
            // Use PATCH if it exists, otherwise create
            // The API doesn't have a PATCH for steps, so delete + recreate
            await client.deleteStep(existing.id, existingStep.id);
          }
          await client.createStep(existing.id, stepData);
        }

        // Delete steps that no longer exist
        for (const s of existingSteps) {
          if (!yamlIndices.has(s.stepIndex)) {
            await client.deleteStep(existing.id, s.id);
          }
        }

        console.log(`Updated pipeline "${manifest.name}"`);
      } else {
        const pipeline = await client.createPipeline(pipelineData);
        for (const [index, step] of manifest.steps.entries()) {
          await client.createStep(pipeline.id, {
            stepIndex: index,
            name: step.name,
            skillName: step.skill ?? null,
            promptTemplate: step.promptTemplate,
            timeoutSeconds: step.timeoutSeconds ?? 300,
            approvalRequired: step.approvalRequired ?? false,
            metadata: step.metadata,
          });
        }
        console.log(`Imported pipeline "${manifest.name}" (id: ${pipeline.id})`);
      }
    });

  cmd
    .command("export <name>")
    .description("export a pipeline as pipeline.yaml")
    .option("-o, --output <file>", "write to file instead of stdout")
    .action(async (name: string, opts: { output?: string }) => {
      const pipeline = await client.findPipelineByName(name);
      if (!pipeline) {
        console.error(`Pipeline "${name}" not found`);
        process.exit(1);
      }
      // Fetch full pipeline with steps
      const full = await client.getPipeline(pipeline.id);
      const yaml = pipelineToYaml(full);
      if (opts.output) {
        writeFileSync(opts.output, yaml, "utf-8");
        console.log(`Written to ${opts.output}`);
      } else {
        process.stdout.write(yaml);
      }
    });
}
