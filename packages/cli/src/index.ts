import { Command } from "commander";
import { loadConfig, getServerUrl } from "./config.js";
import { ApiClient } from "./api-client.js";
import { registerRunCommand } from "./commands/run.js";
import { registerRunsCommand } from "./commands/runs.js";
import { registerPipelinesCommand } from "./commands/pipelines.js";
import { registerPackagesCommand } from "./commands/packages.js";
import { registerTriggersCommand } from "./commands/triggers.js";
import { registerApprovalsCommand } from "./commands/approvals.js";
import { registerBudgetsCommand } from "./commands/budgets.js";
import { registerSettingsCommand } from "./commands/settings.js";
import { registerNewCommand } from "./commands/new.js";
import { registerConfigCommand } from "./commands/config-cmd.js";

const program = new Command()
  .name("zerohand")
  .description("Zerohand CLI — manage pipelines, runs, packages, triggers, approvals, budgets, and settings")
  .version("0.1.0");

const serverUrl = getServerUrl();
const config = loadConfig();
const client = new ApiClient(serverUrl, config.apiKey);

registerRunCommand(program, client, serverUrl);
registerRunsCommand(program, client, serverUrl);
registerPipelinesCommand(program, client);
registerPackagesCommand(program, client);
registerTriggersCommand(program, client);
registerApprovalsCommand(program, client);
registerBudgetsCommand(program, client);
registerSettingsCommand(program, client);
registerNewCommand(program);
registerConfigCommand(program);

program.parseAsync().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Error: ${message}`);
  process.exit(1);
});
