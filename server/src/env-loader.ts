/**
 * Load .env file from the repo root before any other module reads process.env.
 * This is a workaround for tsx watch not forwarding --env-file to child processes.
 * Existing env vars (set in shell or by the OS) are NOT overridden.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const envPath = resolve(process.cwd(), "..", ".env");
if (existsSync(envPath)) {
  const lines = readFileSync(envPath, "utf-8").split("\n");
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eqIdx = line.indexOf("=");
    if (eqIdx < 0) continue;
    const key = line.slice(0, eqIdx).trim();
    // Strip trailing carriage return and optional surrounding quotes from value
    let value = line.slice(eqIdx + 1).trim().replace(/\r$/, "");
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
  console.log(`[Env] Loaded ${envPath}`);
}
