/**
 * Database configuration — reads `database.json` from DATA_DIR,
 * validates it, interpolates ${ENV_VAR} references, and builds
 * a postgresql:// connection URL.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { dataDir } from "./paths.js";

// ── Types ──────────────────────────────────────────────────────────────────

const VALID_SSL_MODES = ["disable", "allow", "prefer", "require", "verify-ca", "verify-full"] as const;
type SslMode = (typeof VALID_SSL_MODES)[number];

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl: boolean;
  sslMode?: SslMode;
}

// ── Validation ─────────────────────────────────────────────────────────────

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  config?: DatabaseConfig;
  errors: ValidationError[];
}

/**
 * Validates a raw object against the DatabaseConfig schema.
 * Returns a typed config with defaults applied, or a list of errors.
 */
export function validateDatabaseConfig(value: unknown): ValidationResult {
  const errors: ValidationError[] = [];

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { valid: false, errors: [{ field: "(root)", message: "must be a JSON object" }] };
  }

  const obj = value as Record<string, unknown>;

  // Required string fields
  if (typeof obj.host !== "string" || obj.host.length === 0) {
    errors.push({ field: "host", message: "host is required and must be a non-empty string" });
  }
  if (typeof obj.database !== "string" || obj.database.length === 0) {
    errors.push({ field: "database", message: "database is required and must be a non-empty string" });
  }
  if (typeof obj.username !== "string" || obj.username.length === 0) {
    errors.push({ field: "username", message: "username is required and must be a non-empty string" });
  }

  // Optional fields with defaults
  const port = obj.port === undefined ? 5432 : obj.port;
  if (typeof port !== "number" || !Number.isInteger(port) || port < 1 || port > 65535) {
    errors.push({ field: "port", message: "port must be an integer between 1 and 65535" });
  }

  const password = obj.password === undefined ? "" : obj.password;
  if (typeof password !== "string") {
    errors.push({ field: "password", message: "password must be a string" });
  }

  const ssl = obj.ssl === undefined ? false : obj.ssl;
  if (typeof ssl !== "boolean") {
    errors.push({ field: "ssl", message: "ssl must be a boolean" });
  }

  if (obj.sslMode !== undefined && !VALID_SSL_MODES.includes(obj.sslMode as SslMode)) {
    errors.push({
      field: "sslMode",
      message: `sslMode must be one of: ${VALID_SSL_MODES.join(", ")}`,
    });
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    config: {
      host: obj.host as string,
      port: port as number,
      database: obj.database as string,
      username: obj.username as string,
      password: password as string,
      ssl: ssl as boolean,
      sslMode: obj.sslMode as SslMode | undefined,
    },
    errors: [],
  };
}

// ── Env-var interpolation ──────────────────────────────────────────────────

/**
 * Replaces `${VAR_NAME}` patterns in a string with the corresponding
 * `process.env` value.  Unresolved refs are left as-is (not an error).
 */
export function interpolateEnvVars(value: string): string {
  return value.replace(/\$\{([A-Z_][A-Z0-9_]*)\}/gi, (match, varName: string) => {
    const resolved = process.env[varName];
    return resolved !== undefined ? resolved : match;
  });
}

// ── URL builder ────────────────────────────────────────────────────────────

/**
 * Assembles a `postgresql://` connection URL from a validated config,
 * interpolating env-var refs in string fields and URI-encoding user/password.
 */
export function buildDatabaseUrl(config: DatabaseConfig): string {
  const host = interpolateEnvVars(config.host);
  const port = config.port;
  const database = interpolateEnvVars(config.database);
  const user = encodeURIComponent(interpolateEnvVars(config.username));
  const password = encodeURIComponent(interpolateEnvVars(config.password));

  let url = `postgresql://${user}:${password}@${host}:${port}/${database}`;

  if (config.ssl && config.sslMode) {
    url += `?sslmode=${config.sslMode}`;
  }

  return url;
}

// ── Masking ────────────────────────────────────────────────────────────────

/**
 * Returns a copy of the config with the password replaced by `***`.
 */
export function maskDatabaseConfig(config: DatabaseConfig): DatabaseConfig {
  return { ...config, password: "***" };
}

// ── File reader ────────────────────────────────────────────────────────────

export interface DatabaseConfigResult {
  config: DatabaseConfig;
  url: string;
}

/**
 * Reads and validates `database.json` from `DATA_DIR`.
 * Returns `null` if the file does not exist.
 * Throws on malformed JSON or invalid schema (caller should treat as fatal).
 */
export function loadDatabaseConfig(): DatabaseConfigResult | null {
  const filePath = join(dataDir(), "database.json");

  if (!existsSync(filePath)) {
    return null;
  }

  let raw: string;
  try {
    raw = readFileSync(filePath, "utf-8");
  } catch (err) {
    throw new Error(
      `[Postgres] Failed to read database.json: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      `[Postgres] database.json contains malformed JSON. Fix or remove the file at: ${filePath}`,
    );
  }

  const result = validateDatabaseConfig(parsed);
  if (!result.valid) {
    const issues = result.errors
      .map((e) => `  - ${e.field}: ${e.message}`)
      .join("\n");
    throw new Error(
      `[Postgres] database.json has invalid configuration:\n${issues}\n  File: ${filePath}`,
    );
  }

  const config = result.config!;
  const url = buildDatabaseUrl(config);
  return { config, url };
}
