import { Command } from "commander";
import { ApiClient } from "../api-client.js";
import { formatTable, relativeTime } from "../formatters.js";

export function registerSettingsCommand(program: Command, client: ApiClient): void {
  const cmd = program.command("settings").description("manage application settings");

  cmd
    .command("list")
    .description("list settings")
    .action(async () => {
      const settings = await client.listSettings();
      const rows = settings.map((s) => ({
        KEY: s.key,
        VALUE: typeof s.value === "object" ? JSON.stringify(s.value) : String(s.value),
        UPDATED: relativeTime(s.updatedAt),
      }));
      console.log(formatTable(rows, ["KEY", "VALUE", "UPDATED"]));
    });

  cmd
    .command("set <key> <value>")
    .description("set a configuration value")
    .action(async (key: string, value: string) => {
      let parsedValue: unknown;
      try {
        parsedValue = JSON.parse(value);
      } catch {
        parsedValue = value;
      }
      await client.updateSetting(key, parsedValue);
      console.log(`Set ${key} = ${JSON.stringify(parsedValue)}`);
      if (key === "database_config") {
        console.log("Warning: Database configuration changes require a server restart to take effect.");
      }
    });
}
