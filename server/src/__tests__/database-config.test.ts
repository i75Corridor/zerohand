import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  validateDatabaseConfig,
  interpolateEnvVars,
  buildDatabaseUrl,
  loadDatabaseConfig,
  maskDatabaseConfig,
} from "../services/database-config.js";

describe("validateDatabaseConfig", () => {
  it("validates a complete config", () => {
    const result = validateDatabaseConfig({
      host: "localhost",
      port: 5432,
      database: "zerohand",
      username: "user",
      password: "pass",
    });
    expect(result.valid).toBe(true);
    expect(result.config).toBeDefined();
  });

  it("applies defaults for optional fields", () => {
    const result = validateDatabaseConfig({
      host: "localhost",
      database: "zerohand",
      username: "user",
    });
    expect(result.valid).toBe(true);
    expect(result.config!.port).toBe(5432);
    expect(result.config!.password).toBe("");
    expect(result.config!.ssl).toBe(false);
  });

  it("rejects missing host", () => {
    const result = validateDatabaseConfig({
      database: "zerohand",
      username: "user",
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "host")).toBe(true);
  });

  it("rejects invalid port", () => {
    const result = validateDatabaseConfig({
      host: "localhost",
      port: 99999,
      database: "zerohand",
      username: "user",
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "port")).toBe(true);
  });

  it("rejects non-object input", () => {
    expect(validateDatabaseConfig("string").valid).toBe(false);
    expect(validateDatabaseConfig(null).valid).toBe(false);
    expect(validateDatabaseConfig([]).valid).toBe(false);
  });

  it("accepts valid sslMode values", () => {
    const result = validateDatabaseConfig({
      host: "localhost",
      database: "zerohand",
      username: "user",
      ssl: true,
      sslMode: "require",
    });
    expect(result.valid).toBe(true);
  });

  it("rejects invalid sslMode", () => {
    const result = validateDatabaseConfig({
      host: "localhost",
      database: "zerohand",
      username: "user",
      ssl: true,
      sslMode: "bogus",
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "sslMode")).toBe(true);
  });
});

describe("interpolateEnvVars", () => {
  const origEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...origEnv };
  });

  it("resolves ${VAR} from process.env", () => {
    process.env.DB_HOST = "prod.example.com";
    expect(interpolateEnvVars("${DB_HOST}")).toBe("prod.example.com");
  });

  it("resolves embedded refs in a string", () => {
    process.env.DB_USER = "admin";
    process.env.DB_PASS = "secret";
    expect(interpolateEnvVars("${DB_USER}:${DB_PASS}@host")).toBe("admin:secret@host");
  });

  it("leaves unresolved refs as-is", () => {
    delete process.env.MISSING_VAR;
    expect(interpolateEnvVars("${MISSING_VAR}")).toBe("${MISSING_VAR}");
  });

  it("returns plain strings unchanged", () => {
    expect(interpolateEnvVars("plain-string")).toBe("plain-string");
  });
});

describe("buildDatabaseUrl", () => {
  const origEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...origEnv };
  });

  it("builds a valid postgresql:// URL", () => {
    const url = buildDatabaseUrl({
      host: "localhost",
      port: 5432,
      database: "zerohand",
      username: "user",
      password: "pass",
      ssl: false,
    });
    expect(url).toBe("postgresql://user:pass@localhost:5432/zerohand");
  });

  it("URI-encodes special characters in password", () => {
    const url = buildDatabaseUrl({
      host: "localhost",
      port: 5432,
      database: "zerohand",
      username: "user",
      password: "p@ss:w/rd%",
      ssl: false,
    });
    expect(url).toContain("p%40ss%3Aw%2Frd%25");
  });

  it("appends sslmode query param when ssl is true with sslMode", () => {
    const url = buildDatabaseUrl({
      host: "db.example.com",
      port: 5432,
      database: "zerohand",
      username: "user",
      password: "pass",
      ssl: true,
      sslMode: "require",
    });
    expect(url).toBe("postgresql://user:pass@db.example.com:5432/zerohand?sslmode=require");
  });

  it("does not append sslmode when ssl is false", () => {
    const url = buildDatabaseUrl({
      host: "localhost",
      port: 5432,
      database: "zerohand",
      username: "user",
      password: "pass",
      ssl: false,
    });
    expect(url).not.toContain("sslmode");
  });

  it("interpolates ${VAR} refs in config fields", () => {
    process.env.TEST_DB_HOST = "remote.db.com";
    process.env.TEST_DB_PASS = "s3cret";
    const url = buildDatabaseUrl({
      host: "${TEST_DB_HOST}",
      port: 5432,
      database: "zerohand",
      username: "admin",
      password: "${TEST_DB_PASS}",
      ssl: false,
    });
    expect(url).toBe("postgresql://admin:s3cret@remote.db.com:5432/zerohand");
  });

  it("leaves unresolved ${VAR} refs as-is in the URL", () => {
    delete process.env.NONEXISTENT;
    const url = buildDatabaseUrl({
      host: "${NONEXISTENT}",
      port: 5432,
      database: "zerohand",
      username: "user",
      password: "pass",
      ssl: false,
    });
    // Host is not URI-encoded, so the literal ${NONEXISTENT} appears
    expect(url).toContain("${NONEXISTENT}");
  });

  it("uses default port 5432 from validated config", () => {
    const result = validateDatabaseConfig({
      host: "localhost",
      database: "zerohand",
      username: "user",
    });
    const url = buildDatabaseUrl(result.config!);
    expect(url).toContain(":5432/");
  });
});

describe("maskDatabaseConfig", () => {
  it("replaces password with ***", () => {
    const masked = maskDatabaseConfig({
      host: "localhost",
      port: 5432,
      database: "zerohand",
      username: "user",
      password: "supersecret",
      ssl: false,
    });
    expect(masked.password).toBe("***");
    expect(masked.host).toBe("localhost");
  });
});

describe("loadDatabaseConfig", () => {
  let tmpDir: string;
  let origDataDir: string | undefined;
  const origEnv = { ...process.env };

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "db-config-test-"));
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
    } catch {
      // ignore cleanup errors
    }
  });

  it("returns null when database.json does not exist", () => {
    expect(loadDatabaseConfig()).toBeNull();
  });

  it("returns config and URL for valid database.json", () => {
    writeFileSync(
      join(tmpDir, "database.json"),
      JSON.stringify({
        host: "localhost",
        port: 5432,
        database: "mydb",
        username: "admin",
        password: "secret",
      }),
    );
    const result = loadDatabaseConfig();
    expect(result).not.toBeNull();
    expect(result!.config.host).toBe("localhost");
    expect(result!.url).toBe("postgresql://admin:secret@localhost:5432/mydb");
  });

  it("throws on malformed JSON", () => {
    writeFileSync(join(tmpDir, "database.json"), "not valid json {{{");
    expect(() => loadDatabaseConfig()).toThrow("malformed JSON");
  });

  it("throws on invalid schema (missing required fields)", () => {
    writeFileSync(
      join(tmpDir, "database.json"),
      JSON.stringify({ port: 5432 }),
    );
    expect(() => loadDatabaseConfig()).toThrow("invalid configuration");
  });

  it("interpolates env vars in config values", () => {
    process.env.TEST_LOAD_HOST = "prod.db.com";
    process.env.TEST_LOAD_PASS = "prodpass";
    writeFileSync(
      join(tmpDir, "database.json"),
      JSON.stringify({
        host: "${TEST_LOAD_HOST}",
        database: "zerohand",
        username: "deploy",
        password: "${TEST_LOAD_PASS}",
      }),
    );
    const result = loadDatabaseConfig();
    expect(result).not.toBeNull();
    expect(result!.url).toContain("prod.db.com");
    expect(result!.url).toContain("prodpass");
  });
});
