import { Command } from "commander";
import { ApiClient } from "../api-client.js";
import { formatTable } from "../formatters.js";

export function registerBudgetsCommand(program: Command, client: ApiClient): void {
  const cmd = program.command("budgets").description("manage budget policies");

  cmd
    .command("list")
    .description("list budget policies")
    .action(async () => {
      const budgets = await client.listBudgets();
      const rows = budgets.map((b) => ({
        ID: b.id.slice(0, 8),
        SCOPE: `${b.scopeType}:${b.scopeId}`,
        LIMIT: `$${(b.amountCents / 100).toFixed(2)}`,
        WINDOW: b.windowKind,
        "WARN%": String(b.warnPercent),
        HARD_STOP: b.hardStopEnabled ? "✓" : "✗",
      }));
      console.log(formatTable(rows, ["ID", "SCOPE", "LIMIT", "WINDOW", "WARN%", "HARD_STOP"]));
    });

  cmd
    .command("create")
    .description("create a budget policy")
    .requiredOption("--scope <type:id>", "scope as scopeType:scopeId")
    .requiredOption("--limit <cents>", "budget limit in cents")
    .action(async (opts: { scope: string; limit: string }) => {
      const colonIdx = opts.scope.indexOf(":");
      if (colonIdx === -1) {
        console.error("--scope must be in the format type:id (e.g. worker:abc123)");
        process.exit(1);
      }
      const scopeType = opts.scope.slice(0, colonIdx);
      const scopeId = opts.scope.slice(colonIdx + 1);
      const budget = await client.createBudget({
        scopeType,
        scopeId,
        amountCents: parseInt(opts.limit, 10),
      });
      console.log(`Created budget ${budget.id}`);
    });

  cmd
    .command("delete <id>")
    .description("delete a budget policy")
    .action(async (id: string) => {
      await client.deleteBudget(id);
      console.log(`Deleted budget ${id}`);
    });
}
