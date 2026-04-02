import { Command } from "commander";
import { ApiClient } from "../api-client.js";
import { streamRunEvents } from "../ws-client.js";

function parseInputs(inputs: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const item of inputs) {
    const eq = item.indexOf("=");
    if (eq === -1) {
      console.error(`Invalid --input format: "${item}" (expected key=value)`);
      process.exit(1);
    }
    result[item.slice(0, eq)] = item.slice(eq + 1);
  }
  return result;
}

export function registerRunCommand(program: Command, client: ApiClient, serverUrl: string): void {
  program
    .command("run <pipeline-name>")
    .description("trigger a pipeline run")
    .option("--input <key=value>", "input parameter (repeatable)", (v, prev: string[]) => [...prev, v], [] as string[])
    .option("--watch", "stream step output to stdout until run completes")
    .action(async (pipelineName: string, opts: { input: string[]; watch?: boolean }) => {
      const pipeline = await client.findPipelineByName(pipelineName);
      if (!pipeline) {
        console.error(`Pipeline "${pipelineName}" not found`);
        process.exit(1);
      }

      const inputParams = parseInputs(opts.input);
      const run = await client.createRun(pipeline.id, inputParams);
      console.log(`Run created: ${run.id}`);

      if (!opts.watch) return;

      let currentStep = -1;
      await new Promise<void>((resolve) => {
        streamRunEvents(serverUrl, run.id, {
          onTextDelta(text, stepIndex) {
            if (stepIndex !== currentStep) {
              if (currentStep !== -1) process.stdout.write("\n");
              process.stdout.write(`\n[step ${stepIndex}] `);
              currentStep = stepIndex;
            }
            process.stdout.write(text);
          },
          onStepStatus(stepIndex, status) {
            if (status === "running") {
              process.stderr.write(`\n→ step ${stepIndex} running\n`);
            } else if (status !== "queued") {
              process.stderr.write(`\n→ step ${stepIndex} ${status}\n`);
            }
          },
          onRunStatus(status) {
            process.stdout.write("\n");
            console.log(`\nRun ${status}: ${run.id}`);
            resolve();
          },
          onError(err) {
            console.error(`\nWebSocket error: ${err.message}`);
            resolve();
          },
          onClose: resolve,
        });
      });
    });
}
