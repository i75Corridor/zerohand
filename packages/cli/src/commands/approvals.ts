import { Command } from "commander";
import { ApiClient } from "../api-client.js";
import { formatTable, relativeTime } from "../formatters.js";

export function registerApprovalsCommand(program: Command, client: ApiClient): void {
  const cmd = program.command("approvals").description("manage pipeline approvals");

  cmd
    .command("list")
    .description("list approvals")
    .option("--status <status>", "filter by status", "pending")
    .action(async (opts: { status: string }) => {
      const approvals = await client.listApprovals(opts.status);
      const rows = approvals.map((a) => ({
        ID: a.id.slice(0, 8),
        PIPELINE: a.pipelineName ?? "\u2014",
        STATUS: a.status,
        CREATED: relativeTime(a.createdAt),
      }));
      console.log(formatTable(rows, ["ID", "PIPELINE", "STATUS", "CREATED"]));
    });

  cmd
    .command("approve <id>")
    .description("approve a pending step")
    .option("--note <text>", "optional decision note")
    .action(async (id: string, opts: { note?: string }) => {
      await client.approveStep(id, opts.note);
      console.log(`Approved ${id}`);
    });

  cmd
    .command("reject <id>")
    .description("reject a pending step")
    .option("--note <text>", "optional decision note")
    .action(async (id: string, opts: { note?: string }) => {
      await client.rejectStep(id, opts.note);
      console.log(`Rejected ${id}`);
    });
}
