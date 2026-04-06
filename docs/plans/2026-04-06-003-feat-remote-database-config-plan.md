---
title: "feat: Remote database configuration override"
type: feat
status: completed
date: 2026-04-06
origin: GitHub issue #60
---

# Remote Database Configuration Override

## Overview

Allow database connection to be configured via a `database.json` file in `DATA_DIR`, providing visibility and flexibility without requiring env var changes. The existing `DATABASE_URL` env var remains the highest-priority override.

## Problem Frame

Currently the database connection is determined exclusively at startup via `DATABASE_URL`. If not set, an embedded Postgres starts. This cannot be changed without restarting the server with different environment variables. Users deploying with external Postgres want runtime visibility into their database configuration and a file-based alternative to env vars.

The chicken-and-egg problem (settings live in the DB, so we cannot read settings to know how to connect to the DB) is solved by using a file (`database.json` in `DATA_DIR`) as the intermediate config source, not the settings table.

## Requirements Trace

- R1. `database.json` in `DATA_DIR` is read at startup if `DATABASE_URL` is not set
- R2. `${ENV_VAR}` syntax in config values is interpolated at startup using `process.env`
- R3. Config file is validated before use; invalid config fails fast with a descriptive error
- R4. Password is masked as `***` in `GET /settings` and `GET /settings/:key` responses
- R5. `POST /settings/validate` validates a `database_config` payload without persisting
- R6. `settings set database_config` in CLI warns that server restart is required
- R7. MCP `update_setting` tool for `database_config` includes restart warning in response
- R8. Config resolution order: `DATABASE_URL` → `database.json` → embedded Postgres

## Scope Boundaries

- This plan does NOT implement live reconnection — config changes require server restart
- This plan does NOT implement database config stored in the settings table as a runtime override (only `database.json` file is the override source)
- This plan does NOT change how migrations are applied (existing `applyPendingMigrations` flow is preserved)

## Context & Research

### Relevant Code and Patterns

- `server/src/index.ts` `startPostgres()` — existing DB connection logic (lines 47–112)
- `server/src/services/custom-providers.ts` — `providers.json` file pattern to follow in `DATA_DIR`
- `server/src/services/mcp-client.ts` `resolveEnvRefs()` — `${ENV_VAR}` interpolation pattern
- `packages/db/src/schema/settings.ts` — settings table schema
- `server/src/routes/settings.ts` — settings REST API
- `packages/cli/src/commands/settings.ts` — CLI settings commands
- `packages/mcp/src/tools/settings-tools.ts` — MCP settings tools
- `packages/shared/src/index.ts` `ApiSetting` — shared API type

### Institutional Learnings

- `providers.json` pattern: read on startup, warn on malformed JSON, cache in module state, write-back via save function
- `resolveEnvRefs()` only resolves entire-string `${VAR}` values, not embedded refs
- Settings API is a simple key-value CRUD; no built-in validation hooks for specific keys

## Key Technical Decisions

- **File-based config over settings-table config**: Using `database.json` in `DATA_DIR` (like `providers.json`) avoids the chicken-and-egg problem entirely. Settings table is not a config source at startup.
- **`${ENV_VAR}` partial interpolation**: The existing `resolveEnvRefs()` only handles whole-string refs. A new `interpolateEnvVars()` function handles embedded `${VAR}` within strings (e.g., `postgres://${DB_USER}:${DB_PASSWORD}@localhost`).
- **Fail-fast on invalid config**: If `database.json` exists but is invalid, the server logs a clear error and exits rather than falling back silently to embedded Postgres.
- **Masked read, validated write**: Passwords are masked in API reads; writes go through validation before persisting.

## Open Questions

### Resolved During Planning

- **Config file location**: `DATA_DIR/database.json` — consistent with `providers.json` pattern and already on the server's radar at startup.
- **Interpolation scope**: `${VAR}` refs are resolved anywhere in string values (host, port, username, password, database name), not just whole-string values.

### Deferred to Implementation

- Whether to also support `ZEROHAND_DATABASE_CONFIG` env var pointing to an arbitrary file path (extending Option B from the issue) — defer until a concrete use case surfaces
- Whether to expose a `database_config` seed in the settings table on first startup if no `database.json` exists — defer; the file is optional
- **Connection failure behavior**: If `database.json` is valid but the external DB is unreachable, does the server fail-fast (exit with descriptive error) or fall back to embedded Postgres? The issue (Option C) flagged this as an open design question. The current plan assumes fail-fast — server exits if `database.json` exists and the connection throws during `applyPendingMigrations`. This is the safer default for production警觉性, but the implementer should confirm the choice and add a test scenario accordingly.

## Implementation Units

- [x] **Unit 1: Define `DatabaseConfig` schema and interpolation utility**

**Goal:** Create a type-safe config schema and env-var interpolation function used at startup.

**Requirements:** R2, R3

**Dependencies:** None

**Files:**
- Create: `server/src/services/database-config.ts`

**Approach:**
Define `DatabaseConfig` as a Zod schema. Implement `interpolateEnvVars(value: string): string` which replaces `${VAR}` patterns using `process.env`, leaving unresolved refs as-is (not an error). Implement `buildDatabaseUrl(config: DatabaseConfig): string` which assembles a `postgresql://` URL from the config fields.

**Technical design:**
```typescript
// Interpolate ${VAR} anywhere in a string
function interpolateEnvVars(value: string): string {
  return value.replace(/\$\{([A-Z_][A-Z0-9_]*)\}/gi, (_, varName) =>
    process.env[varName] ?? `\${${varName}}`, // leave unresolved refs as-is
  );
}

// Build postgresql:// URL from config
function buildDatabaseUrl(config: DatabaseConfig): string {
  const host = interpolateEnvVars(config.host);
  const port = config.port ?? 5432;
  const database = interpolateEnvVars(config.database);
  const user = interpolateEnvVars(config.username);
  const password = interpolateEnvVars(config.password);
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${encodeURIComponent(host)}:${port}/${encodeURIComponent(database)}`;
}
```

**Patterns to follow:**
- `server/src/services/custom-providers.ts` for file-read + warn-on-error pattern
- `server/src/services/mcp-client.ts` `resolveEnvRefs()` for interpolation style

**Test scenarios:**
- Happy path: `{ host: "localhost", port: 5432, database: "zerohand", username: "user", password: "pass" }` → valid `postgresql://` URL
- Happy path: password containing special chars (`@`, `/`, `:`, `%`) are URI-encoded
- Edge case: `${DB_HOST}` is resolved from `process.env.DB_HOST`
- Edge case: `${MISSING_VAR}` is left as-is in the resulting URL (not an error at build time)
- Edge case: config with `ssl: true` and `sslMode: "require"` adds `?sslmode=require` to URL
- Edge case: missing optional `port` defaults to 5432
- Edge case: `ssl: true` with `sslMode: "require"` → URL includes `?sslmode=require` query param

**Verification:**
- `buildDatabaseUrl()` produces a valid `postgresql://` URL for all valid inputs
- Invalid config (e.g., missing required `host`) throws a descriptive `ZodError`

---

- [x] **Unit 2: Update `startPostgres()` to read `database.json`**

**Goal:** Check for `database.json` in `DATA_DIR` as the second priority after `DATABASE_URL`.

**Requirements:** R1, R3, R8

**Dependencies:** Unit 1

**Files:**
- Modify: `server/src/index.ts`

**Approach:**
In `startPostgres()`, between the `DATABASE_URL` check and the embedded Postgres block, add a step that reads `DATA_DIR/database.json` if it exists. Validate with the schema from Unit 1. If valid, build the URL and use it. If the file exists but is invalid, log a clear error and `process.exit(1)` rather than falling back silently.

**Execution note:** Characterization-first — the existing behavior with only `DATABASE_URL` or embedded Postgres must be preserved. Add characterization tests before changing behavior.

**Patterns to follow:**
- `server/src/index.ts` `startPostgres()` structure (lines 47–112)
- `custom-providers.ts` file-read + warn pattern

**Test scenarios:**
- Happy path: `database.json` present with valid config → external Postgres used
- Happy path: `DATABASE_URL` set + `database.json` exists → `DATABASE_URL` takes priority
- Happy path: neither env var nor file → embedded Postgres starts (existing behavior)
- Error path: `database.json` malformed JSON → server exits with descriptive error
- Error path: `database.json` valid JSON but invalid schema → server exits with descriptive error
- Edge case: `database.json` has `${DB_PASSWORD}` in password field → resolved from env at startup
- Error path: `database.json` valid but external DB is unreachable → `applyPendingMigrations` throws → server exits with descriptive error (fail-fast; see deferred question on fallback behavior)

**Verification:**
- Server starts successfully with valid `database.json`
- Server exits with error when `database.json` is present but invalid
- `DATABASE_URL` env var always takes precedence when set

---

- [x] **Unit 3: Add `database_config` validation endpoint and mask passwords in settings API**

**Goal:** Allow config validation without persisting, and prevent password exposure in API responses.

**Requirements:** R4, R5

**Dependencies:** Unit 1

**Files:**
- Modify: `server/src/routes/settings.ts`

**Approach:**
Add a `POST /settings/validate` route that accepts `{ key: "database_config", value: unknown }`, validates the value against the `DatabaseConfig` Zod schema, and returns `{ valid: true }` or `{ valid: false, errors: [...] }`.

Modify `toApi()` (or add a `maskSensitiveSetting()` helper) so that when `key === "database_config"`, the `password` field inside the JSON value is replaced with `"***"` before sending the response. Apply this to both `GET /settings` and `GET /settings/:key`.

**Patterns to follow:**
- `server/src/routes/settings.ts` existing route patterns
- Zod validation error format used in other routes (check `packages/mcp/src/tools/` for zod error shaping)

**Test scenarios:**
- Happy path: `POST /settings/validate` with valid `database_config` returns `{ valid: true }`
- Happy path: `GET /settings` with `database_config` present → password masked as `"***"`
- Happy path: `GET /settings/database_config` → password masked as `"***"`
- Error path: `POST /settings/validate` with invalid config returns `{ valid: false, errors: [...] }`
- Edge case: `database_config` with `ssl: true` and `sslMode: "verify-full"` → preserved in masked response

**Verification:**
- Password field never appears unmasked in API responses
- Validation endpoint rejects configs missing required fields

---

- [x] **Unit 4: Add restart warning to CLI settings command**

**Goal:** Warn users that changing `database_config` requires a server restart.

**Requirements:** R6

**Dependencies:** Unit 3

**Files:**
- Modify: `packages/cli/src/commands/settings.ts`

**Approach:**
In the `settings set` action, after a successful upsert, check if `key === "database_config"`. If so, append a warning message: `"Warning: Database configuration changes require a server restart to take effect."`

**Patterns to follow:**
- `packages/cli/src/commands/settings.ts` existing command structure

**Test scenarios:**
- Happy path: `settings set database_config {...}` → prints success + restart warning
- Edge case: setting a non-database key → no warning (existing behavior unchanged)

**Verification:**
- Warning appears after setting `database_config`, not for other keys

---

- [x] **Unit 5: Add restart warning to MCP settings tools**

**Goal:** Include restart warning in MCP tool response when updating `database_config`.

**Requirements:** R7

**Dependencies:** Unit 3

**Files:**
- Modify: `packages/mcp/src/tools/settings-tools.ts`

**Approach:**
In `registerSettingsTools`, after the `update_setting` tool calls `client.updateSetting()`, check if the returned `ApiSetting.key === "database_config"`. If so, append the restart warning to the response text.

**Patterns to follow:**
- `packages/mcp/src/tools/settings-tools.ts` existing tool structure

**Test scenarios:**
- Happy path: `update_setting` for `database_config` → response includes restart warning
- Edge case: `update_setting` for other key → response unchanged

**Verification:**
- MCP tool response for `database_config` includes restart warning

---

- [x] **Unit 6: Add `DatabaseConfig` to shared types**

**Goal:** Export the config type so server and other packages can reference it without duplication.

**Requirements:** (Supporting type, no direct requirement)

**Dependencies:** None

**Files:**
- Modify: `packages/shared/src/index.ts`

**Approach:**
Add `DatabaseConfig` interface (matching the Zod schema from Unit 1) and `DatabaseConfigInput` (the parsed-and-interpolated output type) to `packages/shared/src/index.ts`. These are the same types used for validation and URL building.

**Patterns to follow:**
- `packages/shared/src/index.ts` existing `ApiSetting` and other shared types

**Test scenarios:**
- Test expectation: none — pure type-only change

**Verification:**
- Type is importable from `@zerohand/shared` in server and other packages

---

- [x] **Unit 7: Document `database.json` in `docs/env.md`**

**Goal:** Add `DATABASE_CONFIG_FILE` (or the file location) to the environment documentation.

**Requirements:** R1 (docs)

**Dependencies:** Units 1–2

**Approach:**
Add a section to `docs/env.md` describing the `database.json` file format, the config resolution order, the `${VAR}` interpolation syntax, and the SSL options. Note that `DATABASE_URL` takes precedence over the file.

**Patterns to follow:**
- Existing `docs/env.md` table format and structure

**Test scenarios:**
- Test expectation: none — documentation-only change

**Verification:**
- `docs/env.md` includes the new `database.json` configuration section

## System-Wide Impact

- **Interaction graph:** `startPostgres()` is called once at startup before any routes are registered. The settings API (`settings.ts`) is unaffected in its existing behavior — only `database_config` reads are masked and validated differently.
- **Error propagation:** If `database.json` is invalid, the server exits immediately with a descriptive error. This prevents a broken config from masking real startup failures.
- **State lifecycle risks:** No live reconnection is implemented — the DB connection is set at startup and the process must restart to pick up config changes.
- **API surface parity:** `GET /settings` and `GET /settings/:key` now mask `database_config` passwords. `POST /settings/validate` is a new endpoint. No existing endpoints change behavior.
- **Integration coverage:** The interaction between `DATABASE_URL` env var and `database.json` file (priority ordering) requires an integration test that exercises both paths.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Invalid `database.json` causes silent fallback to embedded Postgres (breaking for prod users who expect external DB) | Fail fast — exit with descriptive error if file exists but is invalid |
| Password appears in logs during URL construction | `buildDatabaseUrl()` uses `encodeURIComponent`; logging in `startPostgres()` redacts credentials (existing pattern on line 51) |
| Users set `database_config` in settings without restarting server | Restart warning added to CLI and MCP tool responses |
| `${VAR}` in config file refers to unset env var | Left as-is in URL (not an error); will cause a connection failure with a clear Postgres error message |

## Documentation / Operational Notes

- `docs/env.md` must be updated to document the `database.json` file format and resolution order
- Migration guide: users switching from `DATABASE_URL` env var to `database.json` should set `DATABASE_URL` to empty/unset and create `DATA_DIR/database.json`
