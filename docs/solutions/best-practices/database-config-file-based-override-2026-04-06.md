---
title: "File-based database config to break chicken-and-egg bootstrap"
date: "2026-04-06"
category: best-practices
module: server
problem_type: best_practice
component: database
severity: medium
related_components:
  - tooling
applies_when:
  - "Application settings are stored in the database but database connection itself needs configuration"
  - "Users need a file-based alternative to environment variables for database config"
  - "A dependency (e.g. Zod) is only available transitively and cannot be used directly"
  - "Secrets in config files need env-var interpolation and masking in API responses"
tags:
  - database
  - configuration
  - chicken-and-egg
  - file-based-config
  - env-var-interpolation
  - config-resolution-chain
  - password-masking
  - validation
---

# File-based database config to break chicken-and-egg bootstrap

## Context

The pawn server connected to PostgreSQL exclusively through a `DATABASE_URL` environment variable or a bundled embedded Postgres instance. Users deploying with external Postgres wanted a file-based configuration alternative with visibility through the settings API, CLI, and MCP tooling.

The core challenge was a **chicken-and-egg problem**: the application's settings table lives inside the database, so you cannot read database connection parameters from settings if you haven't connected to the database yet.

A secondary challenge was that the plan assumed Zod for config validation, but Zod was not a direct dependency of the server package — it was only available transitively through the MCP SDK. Rather than adding a new dependency, plain TypeScript validation was used instead.

## Guidance

### Use a file-based config that loads before the database connection

Place a `database.json` config file in `DATA_DIR` alongside other pre-boot configuration files. The project already had `providers.json` in `DATA_DIR` (via `custom-providers.ts`), so `database.json` follows the same established convention.

### Config resolution chain with strict precedence

```
DATABASE_URL env var  →  database.json in DATA_DIR  →  embedded Postgres
```

The env var always wins. If `database.json` exists, it is used. Otherwise the app falls back to embedded Postgres for local development.

### Plain TypeScript validation instead of a schema library

When a schema library is not a direct dependency of the package that needs validation, write manual validation rather than pulling in a transitive dependency. Return a discriminated result that lets callers branch on `valid`:

```typescript
interface ValidationResult {
  valid: boolean;
  config?: DatabaseConfig;
  errors: ValidationError[];  // { field: string; message: string }
}

function validateDatabaseConfig(value: unknown): ValidationResult
```

This shape serves both the startup sequence (fail-fast on errors) and the API validation endpoint (return 400 with field-level errors).

### Env-var interpolation in string fields

Support `${VAR_NAME}` syntax in config string fields, resolved at startup:

```typescript
function interpolateEnvVars(value: string): string {
  return value.replace(/\$\{([A-Z_][A-Z0-9_]*)\}/gi, (match, varName: string) => {
    const resolved = process.env[varName];
    return resolved !== undefined ? resolved : match;
  });
}
```

Unresolved references are left as literal text. This avoids silent empty-string substitution — the resulting connection URL will fail with a descriptive Postgres error that includes the unresolved `${...}` token, making misconfiguration obvious.

### Fail-fast on invalid config

If `database.json` exists but contains malformed JSON or fails schema validation, `loadDatabaseConfig()` throws. The caller catches it and exits:

```typescript
try {
  const fileConfig = loadDatabaseConfig();
  if (fileConfig) { /* use fileConfig.url */ }
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);  // do NOT fall through to embedded
}
```

This prevents silent fallback to embedded Postgres when the user clearly intended to use an external database.

### Password masking at the API boundary

A single `maskSensitiveSetting()` function in the settings route applies masking before any response leaves the server. Because CLI, MCP, and UI all consume the same REST API, one masking point covers all surfaces:

```typescript
function maskSensitiveSetting(row): ApiSetting {
  const base = { key: row.key, value: row.value, updatedAt: row.updatedAt.toISOString() };
  if (row.key === "database_config" && row.value && typeof row.value === "object") {
    base.value = maskDatabaseConfig(row.value as DatabaseConfig);
  }
  return base;
}
```

### Restart warnings on config change

Both CLI and MCP surfaces append a warning when `database_config` is written through the settings API, since the new config only takes effect after a server restart.

## Why This Matters

- **Production safety**: Fail-fast prevents an app from silently connecting to the wrong database (embedded dev instance) when a config file has a typo. Silent fallback in database selection is a data-loss vector.
- **Credential hygiene**: Password masking at a single API boundary means no consumer can accidentally expose database credentials in logs, terminals, or browser dev tools.
- **Operational flexibility**: File-based config can be managed by configuration management tools (Ansible, Docker secrets, Kubernetes ConfigMaps) without requiring env var injection, while still respecting `DATABASE_URL` when it is set.
- **Debuggability**: Leaving unresolved `${VAR}` tokens in place produces Postgres connection errors that contain the literal token name, making misconfiguration immediately diagnosable.

## When to Apply

- **Chicken-and-egg config**: Any time configuration for a backing service (database, cache, message broker) would need to be read from that same backing service. Move the config to a file that loads before the connection is established.
- **Env-var alternatives**: When users need config files alongside or instead of environment variables — especially in environments where env vars are hard to manage (Docker Compose with many services, systemd units).
- **Sensitive field masking**: Any API that returns configuration containing credentials. Mask at the serialization boundary rather than in individual consumers.
- **Validation endpoints**: When a config change requires a restart, provide a `/validate` endpoint so users can check their config before committing to it and restarting.
- **Transitive dependency avoidance**: When a validation library (Zod, Joi, etc.) is only available transitively through another package, prefer manual validation with typed interfaces over adding a new dependency.

## Examples

**database.json with env-var interpolation:**

```json
{
  "host": "${DB_HOST}",
  "port": 5432,
  "database": "myapp",
  "username": "${DB_USER}",
  "password": "${DB_PASS}",
  "ssl": true,
  "sslMode": "require"
}
```

**startPostgres() integration (from `server/src/index.ts`):**

```typescript
async function startPostgres() {
  // 1. DATABASE_URL env var takes precedence
  if (process.env.DATABASE_URL) { /* use it directly */ }

  // 2. database.json file config
  try {
    const fileConfig = loadDatabaseConfig();
    if (fileConfig) { /* use fileConfig.url */ }
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);  // fail-fast: do NOT fall through to embedded
  }

  // 3. Embedded Postgres for local development
  // ... start embedded instance ...
}
```

**File-based config pattern in this codebase** (three services now use the same `DATA_DIR` + JSON file convention):

| Service | File | Module |
|---------|------|--------|
| Custom AI providers | `providers.json` | `server/src/services/custom-providers.ts` |
| Database connection | `database.json` | `server/src/services/database-config.ts` |
| MCP env resolution | `resolveEnvRefs()` | `server/src/services/mcp-client.ts` |

## Related

- GitHub issue: [#60 — Add remote database configuration override in settings](https://github.com/i75Corridor/pawn/issues/60)
- Plan: `docs/plans/2026-04-06-003-feat-remote-database-config-plan.md`
- Existing pattern: `server/src/services/custom-providers.ts` (`providers.json` file-read + cache pattern)
- Related doc: `docs/solutions/best-practices/adding-agent-tools-dual-system-architecture-2026-04-04.md` (dual-system MCP/in-app architecture for settings tools)
- Related doc: `docs/solutions/best-practices/mcp-oauth-config-propagation-through-all-code-paths-2026-04-12.md` (ensuring new DB fields reach all config consumers — this doc covers config *sourcing*, that doc covers config *consumption*)
