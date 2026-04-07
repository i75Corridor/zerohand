import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { loadDatabaseConfig } from "../services/database-config.js";

/**
 * Tests the config resolution priority: DATABASE_URL → database.json → embedded.
 * The actual startPostgres() function cannot be unit-tested (it starts a real Postgres),
 * so we test the loadDatabaseConfig() layer that feeds into it.
 */
describe("database config resolution", () => {
  let tmpDir: string;
  let origDataDir: string | undefined;
  const origEnv = { ...process.env };

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "db-startup-test-"));
    origDataDir = process.env.DATA_DIR;
    process.env.DATA_DIR = tmpDir;
  });

  afterEach(() => {
    if (origDataDir === undefined) {
      delete process.env.DATA_DIR;
    } else {
      process.env.DATA_DIR = origDataDir;
    }
    for (const key of Object.keys(process.env)) {
      if (!(key in origEnv)) delete process.env[key];
    }
    Object.assign(process.env, origEnv);
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  it("returns null when no database.json exists (triggers embedded fallback)", () => {
    const result = loadDatabaseConfig();
    expect(result).toBeNull();
  });

  it("returns config when valid database.json exists", () => {
    writeFileSync(
      join(tmpDir, "database.json"),
      JSON.stringify({
        host: "db.prod.example.com",
        port: 5432,
        database: "zerohand",
        username: "deploy",
        password: "secret",
      }),
    );
    const result = loadDatabaseConfig();
    expect(result).not.toBeNull();
    expect(result!.url).toBe("postgresql://deploy:secret@db.prod.example.com:5432/zerohand");
  });

  it("fails fast on malformed JSON", () => {
    writeFileSync(join(tmpDir, "database.json"), "{{bad json");
    expect(() => loadDatabaseConfig()).toThrow("malformed JSON");
  });

  it("fails fast on valid JSON but missing required fields", () => {
    writeFileSync(join(tmpDir, "database.json"), JSON.stringify({ ssl: true }));
    expect(() => loadDatabaseConfig()).toThrow("invalid configuration");
  });

  it("resolves ${VAR} references at load time", () => {
    process.env.STARTUP_DB_HOST = "resolved.host.com";
    process.env.STARTUP_DB_PASS = "resolvedpass";
    writeFileSync(
      join(tmpDir, "database.json"),
      JSON.stringify({
        host: "${STARTUP_DB_HOST}",
        database: "zerohand",
        username: "admin",
        password: "${STARTUP_DB_PASS}",
      }),
    );
    const result = loadDatabaseConfig();
    expect(result!.url).toContain("resolved.host.com");
    expect(result!.url).toContain("resolvedpass");
  });

  it("includes sslmode in URL when configured", () => {
    writeFileSync(
      join(tmpDir, "database.json"),
      JSON.stringify({
        host: "ssl.db.com",
        database: "zerohand",
        username: "user",
        password: "pass",
        ssl: true,
        sslMode: "verify-full",
      }),
    );
    const result = loadDatabaseConfig();
    expect(result!.url).toContain("?sslmode=verify-full");
  });
});
