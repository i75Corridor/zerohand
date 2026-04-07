import { describe, it, expect } from "vitest";
import {
  validateDatabaseConfig,
  maskDatabaseConfig,
} from "../services/database-config.js";
import type { DatabaseConfig } from "../services/database-config.js";

/**
 * Tests the settings API behavior for `database_config`:
 * - Password masking via maskDatabaseConfig (used by toApi in settings.ts)
 * - Validation via validateDatabaseConfig (used by POST /settings/validate)
 *
 * The route layer is a thin wrapper around these functions.
 */
describe("settings — database_config password masking", () => {
  it("masks password with *** for API responses", () => {
    const config: DatabaseConfig = {
      host: "db.example.com",
      port: 5432,
      database: "pawn",
      username: "admin",
      password: "supersecret",
      ssl: false,
    };
    const masked = maskDatabaseConfig(config);
    expect(masked.password).toBe("***");
    expect(masked.host).toBe("db.example.com");
    expect(masked.username).toBe("admin");
  });

  it("preserves SSL config in masked output", () => {
    const config: DatabaseConfig = {
      host: "db.example.com",
      port: 5432,
      database: "pawn",
      username: "admin",
      password: "topsecret",
      ssl: true,
      sslMode: "verify-full",
    };
    const masked = maskDatabaseConfig(config);
    expect(masked.password).toBe("***");
    expect(masked.ssl).toBe(true);
    expect(masked.sslMode).toBe("verify-full");
  });

  it("does not modify the original config object", () => {
    const config: DatabaseConfig = {
      host: "localhost",
      port: 5432,
      database: "pawn",
      username: "user",
      password: "secret",
      ssl: false,
    };
    maskDatabaseConfig(config);
    expect(config.password).toBe("secret");
  });
});

describe("settings — POST /settings/validate behavior", () => {
  it("validates valid database_config", () => {
    const result = validateDatabaseConfig({
      host: "localhost",
      port: 5432,
      database: "pawn",
      username: "user",
      password: "pass",
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects invalid database_config with field-level errors", () => {
    const result = validateDatabaseConfig({ port: 5432 });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e) => e.field === "host")).toBe(true);
    expect(result.errors.some((e) => e.field === "database")).toBe(true);
    expect(result.errors.some((e) => e.field === "username")).toBe(true);
  });

  it("rejects non-object values", () => {
    const result = validateDatabaseConfig("just-a-string");
    expect(result.valid).toBe(false);
    expect(result.errors[0].field).toBe("(root)");
  });
});
