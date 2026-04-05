import { Command } from "commander";
import { ApiClient } from "../api-client.js";
import { formatTable, relativeTime } from "../formatters.js";

export function registerTriggersCommand(program: Command, client: ApiClient): void {
  const cmd = program.command("triggers").description("manage pipeline triggers");

  cmd
    .command("list")
    .description("list triggers")
    .option("--pipeline <id>", "filter by pipeline id")
    .action(async (opts: { pipeline?: string }) => {
      try {
        const triggers = opts.pipeline
          ? (await client.listTriggers(opts.pipeline)).map((t) => ({ ...t, pipelineName: undefined }))
          : await client.listAllTriggers();
        const rows = triggers.map((t) => ({
          ID: t.id.slice(0, 8),
          PIPELINE: (t as { pipelineName?: string }).pipelineName ?? t.pipelineId.slice(0, 8),
          TYPE: t.type,
          CRON: t.cronExpression ?? "",
          ENABLED: t.enabled ? "✓" : "✗",
          NEXT_RUN: t.nextRunAt ? relativeTime(t.nextRunAt) : "",
          CREATED: relativeTime(t.createdAt),
        }));
        console.log(formatTable(rows, ["ID", "PIPELINE", "TYPE", "CRON", "ENABLED", "NEXT_RUN", "CREATED"]));
      } catch (err) {
        console.error(String(err));
        process.exit(1);
      }
    });

  cmd
    .command("create <pipeline-id>")
    .description("create a cron trigger for a pipeline")
    .requiredOption("--cron <expr>", "cron expression")
    .option("--timezone <tz>", "timezone (default: UTC)")
    .option("--input <key=value...>", "default input parameters", (val: string, prev: string[]) => {
      prev.push(val);
      return prev;
    }, [] as string[])
    .action(async (pipelineId: string, opts: { cron: string; timezone?: string; input: string[] }) => {
      try {
        const defaultInputs: Record<string, string> = {};
        for (const pair of opts.input) {
          const idx = pair.indexOf("=");
          if (idx === -1) {
            console.error(`Invalid input format: ${pair} (expected key=value)`);
            process.exit(1);
          }
          defaultInputs[pair.slice(0, idx)] = pair.slice(idx + 1);
        }
        const trigger = await client.createTrigger(pipelineId, {
          type: "cron",
          cronExpression: opts.cron,
          timezone: opts.timezone,
          defaultInputs,
        });
        console.log(`Created trigger ${trigger.id} for pipeline ${pipelineId}`);
      } catch (err) {
        console.error(String(err));
        process.exit(1);
      }
    });

  cmd
    .command("toggle <id>")
    .description("toggle a trigger enabled/disabled")
    .action(async (id: string) => {
      try {
        const all = await client.listAllTriggers();
        const current = all.find((t) => t.id === id || t.id.startsWith(id));
        if (!current) {
          console.error(`Trigger ${id} not found`);
          process.exit(1);
        }
        await client.updateTrigger(current.id, { enabled: !current.enabled });
        console.log(`Trigger ${current.id.slice(0, 8)} is now ${current.enabled ? "disabled" : "enabled"}`);
      } catch (err) {
        console.error(String(err));
        process.exit(1);
      }
    });

  cmd
    .command("delete <id>")
    .description("delete a trigger")
    .action(async (id: string) => {
      try {
        await client.deleteTrigger(id);
        console.log(`Deleted trigger ${id}`);
      } catch (err) {
        console.error(String(err));
        process.exit(1);
      }
    });
}
