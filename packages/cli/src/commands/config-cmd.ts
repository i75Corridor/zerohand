import { Command } from "commander";
import { loadConfig, saveConfig } from "../config.js";

export function registerConfigCommand(program: Command): void {
  const config = program.command("config").description("manage CLI configuration");

  config
    .command("show")
    .description("show current config")
    .action(() => {
      const c = loadConfig();
      console.log(`server:  ${c.serverUrl}`);
      console.log(`api-key: ${c.apiKey ? "***" + c.apiKey.slice(-4) : "(not set)"}`);
    });

  config
    .command("set <key> <value>")
    .description("set a config value (keys: server, api-key)")
    .action((key: string, value: string) => {
      if (key === "server") {
        saveConfig({ serverUrl: value });
        console.log(`server set to ${value}`);
      } else if (key === "api-key") {
        saveConfig({ apiKey: value });
        console.log("api-key saved");
      } else {
        console.error(`Unknown config key: ${key}. Valid keys: server, api-key`);
        process.exit(1);
      }
    });
}
