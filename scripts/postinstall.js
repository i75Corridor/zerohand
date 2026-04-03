#!/usr/bin/env node
/**
 * Runs the embedded-postgres postinstall scripts that pnpm blocks by default
 * (build script approval requirement).
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, lstatSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "../../");
const STORE = join(ROOT, "node_modules/.pnpm");

if (!existsSync(STORE)) {
  console.log("[postinstall] No .pnpm store found, skipping.");
  process.exit(0);
}

// Find the darwin-arm64 embedded-postgres package
const entries = readdirSync(STORE);
const epPkg = entries.find((e) => e.startsWith("@embedded-postgres+darwin-arm64@"));

if (!epPkg) {
  // Not on darwin-arm64, nothing to do
  process.exit(0);
}

const pkgDir = join(STORE, epPkg, "node_modules/@embedded-postgres/darwin-arm64");
const script = join(pkgDir, "scripts/hydrate-symlinks.js");

if (!existsSync(script)) {
  console.log("[postinstall] hydrate-symlinks.js not found, skipping.");
  process.exit(0);
}

console.log("[postinstall] Running embedded-postgres hydrate-symlinks...");
const result = spawnSync("node", [script], { cwd: pkgDir, stdio: "inherit" });
if (result.status !== 0) {
  console.error("[postinstall] hydrate-symlinks failed:", result.error);
  process.exit(result.status ?? 1);
}
console.log("[postinstall] Done.");

// Install lefthook git hooks (non-fatal if lefthook isn't available yet)
const lefthook = join(ROOT, "node_modules/.bin/lefthook");
if (existsSync(lefthook)) {
  console.log("[postinstall] Installing lefthook hooks...");
  spawnSync(lefthook, ["install", "--force"], { cwd: ROOT, stdio: "inherit" });
}
