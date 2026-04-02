import { Command } from "commander";
import { ApiClient } from "../api-client.js";
import { formatTable, relativeTime, shortId } from "../formatters.js";
import { streamRunEvents } from "../ws-client.js";

const TERMINAL = new Set(["completed", "failed", "cancelled"]);

export function registerRunsCommand(program: Command, client: ApiClient, serverUrl: string): void {
  const cmd = program.command("runs").description("manage pipeline runs");

  cmd
    .command("list")
    .description("list recent runs")
    .option("--pipeline <name>", "filter by pipeline name")
    .option("--limit <n>", "max results to show", "20")
    .action(async (opts: { pipeline?: string; limit: string }) => {
      let pipelineId: string | undefined;
      if (opts.pipeline) {
        const p = await client.findPipelineByName(opts.pipeline);
        if (!p) {
          console.error(`Pipeline "${opts.pipeline}" not found`);
          process.exit(1);
        }
        pipelineId = p.id;
      }

      const runs = await client.listRuns(pipelineId);
      const limit = parseInt(opts.limit, 10);
      const rows = runs.slice(0, limit).map((r) => ({
        ID: shortId(r.id),
        PIPELINE: r.pipelineName ?? r.pipelineId,
        STATUS: r.status,
        CREATED: relativeTime(r.createdAt),
      }));
      console.log(formatTable(rows, ["ID", "PIPELINE", "STATUS", "CREATED"]));
    });

  cmd
    .command("tail <run-id>")
    .description("stream step events for a run to stdout")
    .action(async (runId: string) => {
      const run = await client.getRun(runId);
      if (TERMINAL.has(run.status)) {
        console.log(`Run already ${run.status}: ${runId}`);
        return;
      }

      console.log(`Tailing run ${shortId(runId)} (${run.status})...`);
      let currentStep = -1;
      await new Promise<void>((resolve) => {
        streamRunEvents(serverUrl, runId, {
          onTextDelta(text, stepIndex) {
            if (stepIndex !== currentStep) {
              if (currentStep !== -1) process.stdout.write("\n");
              process.stdout.write(`\n[step ${stepIndex}] `);
              currentStep = stepIndex;
            }
            process.stdout.write(text);
          },
          onStepStatus(stepIndex, status) {
            if (status !== "queued") {
              process.stderr.write(`\n→ step ${stepIndex} ${status}\n`);
            }
          },
          onRunStatus(status) {
            process.stdout.write("\n");
            console.log(`\nRun ${status}`);
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

  cmd
    .command("cancel <run-id>")
    .description("cancel a run")
    .action(async (runId: string) => {
      const run = await client.cancelRun(runId);
      console.log(`Cancelled run ${shortId(run.id)} (was ${run.status})`);
    });
}
