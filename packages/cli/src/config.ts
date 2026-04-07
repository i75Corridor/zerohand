import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface CliConfig {
  serverUrl: string;
  apiKey?: string;
}

const DEFAULT_CONFIG: CliConfig = {
  serverUrl: "http://localhost:3009",
};

export function getConfigPath(): string {
  const configHome = process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config");
  return join(configHome, "pawn", "config.json");
}

export function loadConfig(): CliConfig {
  const path = getConfigPath();
  if (!existsSync(path)) return { ...DEFAULT_CONFIG };
  try {
    const raw = readFileSync(path, "utf-8");
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) } as CliConfig;
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(updates: Partial<CliConfig>): void {
  const path = getConfigPath();
  const current = loadConfig();
  const merged = { ...current, ...updates };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(merged, null, 2) + "\n", "utf-8");
}

export function getServerUrl(): string {
  return process.env.PAWN_SERVER_URL ?? loadConfig().serverUrl;
}
