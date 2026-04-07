---
title: "feat: AI-assisted MCP server environment variable detection and configuration"
type: feat
status: completed
date: 2026-04-06
deepened: 2026-04-06
---

# feat: AI-assisted MCP server environment variable detection and configuration

## Overview

Add intelligent environment variable detection, guided configuration, and validation for MCP servers. When a user adds an MCP server, the system can auto-detect required env vars via a built-in registry or dry-run stderr parsing, show them with descriptions and docs links, and warn when required vars are missing. Also adds `${ENV_VAR}` syntax so secrets reference system environment variables instead of being stored in plaintext.

## Problem Frame

Adding an MCP server (especially stdio-based ones like `@anthropic/brave-search-mcp`) requires users to already know which environment variables are needed, where to get API keys, and how to configure them correctly. The current flow is a blank `KEY=VALUE` textarea with no guidance, no detection, and no validation beyond "Test Connection" which gives opaque errors. This creates friction for onboarding new MCP servers. (See [Issue #62](https://github.com/i75Corridor/pawn/issues/62))

## Requirements Trace

- R1. System can detect required env vars for MCP servers via built-in registry lookup
- R2. System can detect required env vars via dry-run stderr parsing for unknown stdio servers
- R3. UI shows detected env vars with descriptions and documentation links
- R4. `${ENV_VAR}` syntax allows referencing system environment variables (resolved at connection time)
- R5. Warning indicator shown when enabling a server with missing required env vars
- R6. Agent has a `detect_mcp_env` tool for programmatic env detection
- R7. Works for stdio, SSE, and streamable-http transports (registry for all; dry-run for stdio only)
- R8. Custom/private MCP servers supported via manual env var entry (existing behavior preserved)

## Scope Boundaries

- No AI chat interface for guided configuration (future work — the issue mentions an "Ask AI to Help Configure" button but that requires agent-in-UI capabilities not yet built)
- No remote registry API — the registry is a static JSON file shipped with the server
- No encryption-at-rest for env var values in the database — `${ENV_VAR}` syntax is the recommended path for secrets
- No header template expansion for HTTP transports — `env` remains a stdio concept; HTTP servers use literal header values
- No edit-in-place UI for existing MCP server env vars — users can delete and re-add (matching current behavior)

## Context & Research

### Relevant Code and Patterns

- `server/src/routes/mcp-servers.ts` — existing CRUD routes, `POST /:id/test` connection test pattern
- `server/src/services/mcp-client.ts` — `McpClientPool`, `buildTransport()` merges `config.env` into `process.env` for stdio (line 105)
- `ui/src/pages/Settings.tsx` — `AddMcpServerForm` (line 203), `McpServerRow` (line 74), `McpServersSection` (line 361), `parseKV()` helper (line 347)
- `ui/src/lib/api.ts` — `api.createMcpServer()`, `api.testMcpServer()` etc. (lines 261-270)
- `server/src/services/tools/register-mcp-server.ts` — agent tool pattern with `makeXxxTool(ctx)` returning `ToolDefinition`
- `server/src/services/tools/index.ts` — `makeAllTools()` registration array
- `packages/db/src/schema/mcp-servers.ts` — `metadata` jsonb column exists but is unused
- `packages/shared/src/index.ts` — `ApiMcpServer`, `ApiMcpTool` interfaces (line 260)
- `server/src/services/tools/validate-pipeline.ts` — validation pattern with `{ valid, errors, warnings }` and secrets checking from `process.env`

### Institutional Learnings

- Dual-system tool architecture: MCP tools should delegate to HTTP API rather than duplicating logic (see `docs/solutions/best-practices/adding-agent-tools-dual-system-architecture-2026-04-04.md`)
- Direct import for one-off dependencies rather than extending `AgentToolContext`

## Key Technical Decisions

- **Static JSON registry**: A `server/src/data/mcp-registry.json` file ships with the server. Simpler than DB seeding, easy to version, works offline. Updated by editing the file.
- **Dry-run with 5s timeout and process group kill**: For unknown stdio servers, spawn the process with expanded minimal env (PATH, HOME, TMPDIR, USER, node version manager vars), capture stderr for up to 5 seconds, then kill the entire process group via `kill(-pid, SIGKILL)`. Concurrency limited to 2 simultaneous dry-runs via semaphore. Parse common error patterns, filter to `/^[A-Z][A-Z0-9_]*$/`.
- **`${ENV_VAR}` resolved at connection time (whole-value only)**: Literal `${BRAVE_API_KEY}` stored in DB, resolved from `process.env` in `buildTransport()`. Only exact-match values (`^${VAR}$`) are resolved — substring replacement is NOT performed, avoiding corruption of base64 tokens or other values containing `${`. Unresolvable references are omitted (key not included in result), preserving the MCP server's own error messages.
- **Warning indicator on enable (not blocking)**: Client-side check when toggling enable. Show yellow badge on the server row. No API changes needed. User can still enable and test connection.
- **Separate `detect_mcp_env` agent tool**: Not bundled into `register_mcp_server` to avoid latency on every registration. Agent calls detect after registering if needed.
- **`metadata` column for detected env requirements**: Store `{ envRequirements: Array<{ name, description?, required, docsUrl? }> }` in the existing unused `metadata` jsonb column after detection runs.

## Open Questions

### Resolved During Planning

- **Where does the registry live?** Static JSON file at `server/src/data/mcp-registry.json`. Easy to maintain, no DB migration needed.
- **Dry-run security concern?** Acceptable — user already executes arbitrary commands via "Test Connection" and the command field itself. 5s timeout + SIGKILL limits exposure.
- **Enable validation behavior?** Warning indicator (yellow badge), not blocking. Client-side check in UI.
- **HTTP transport env support?** `env` remains stdio-only. HTTP servers configure auth via headers directly.

### Deferred to Implementation

- Exact stderr parsing regex patterns — will be refined based on testing with popular MCP servers (brave-search, github, filesystem, etc.)
- Whether `metadata.envRequirements` should be refreshed on subsequent detections or preserved
- Exact error message format from the dry-run detector when parsing fails

## Implementation Units

- [x] **Unit 1: `${ENV_VAR}` resolution in buildTransport**

**Goal:** Add env var reference resolution so `${BRAVE_API_KEY}` in the env field resolves to `process.env.BRAVE_API_KEY` at connection time.

**Requirements:** R4

**Dependencies:** None

**Files:**
- Modify: `server/src/services/mcp-client.ts`
- Test: `server/src/__tests__/mcp-env-resolution.test.ts`

**Approach:**
- Add a `resolveEnvRefs(env: Record<string, string>): Record<string, string>` function that resolves values matching the exact pattern `^${VAR_NAME}$` (whole-value only, not substring replacement — avoids corrupting base64 tokens or other values that happen to contain `${`)
- Only match `${` followed by `[A-Z_][A-Z0-9_]*` followed by `}` as the entire value
- Call it in `buildTransport()`: `env: { ...process.env, ...resolveEnvRefs(config.env, process.env) }`
- Unresolvable references (missing from `process.env`) should be **omitted from the result** (key not included), so the child process inherits whatever `process.env` has for that key. This preserves the MCP server's own "missing variable" error messages rather than sending an empty string

**Patterns to follow:**
- `buildTransport()` in `mcp-client.ts` — modify the existing env merge line

**Test scenarios:**
- Happy path: env value `${FOO}` resolves to `process.env.FOO` value
- Happy path: literal value `my-key` passes through unchanged
- Happy path: value containing `${` as substring (e.g., a base64 token `abc${def}ghi`) is NOT treated as a reference — passed through unchanged
- Edge case: `${MISSING_VAR}` where var is not set → key omitted from result, child process inherits from `process.env`
- Edge case: env key `FOO` with value `${BAR}` correctly resolves FOO to the value of BAR, overriding any process.env.FOO
- Edge case: malformed syntax like `${` or `${}` or `${foo}` (lowercase) passes through unchanged

**Verification:**
- Tests pass, existing `POST /:id/test` endpoint works with both literal and `${...}` env values

---

- [x] **Unit 2: MCP server registry data file**

**Goal:** Create a static JSON registry of popular MCP servers with their required/optional env vars, descriptions, and documentation links.

**Requirements:** R1, R3

**Dependencies:** None

**Files:**
- Create: `server/src/data/mcp-registry.json`
- Create: `server/src/services/mcp-registry.ts`
- Test: `server/src/__tests__/mcp-registry.test.ts`

**Approach:**
- JSON file contains an object keyed by package name (e.g., `@anthropic/brave-search-mcp`) with `envVars` array of `{ name, description, required, docsUrl? }`
- TypeScript service exports `lookupRegistry(command: string, args: string[]): RegistryEntry | null` — matches by extracting the npm package name from args (e.g., `npx -y @anthropic/brave-search-mcp` → `@anthropic/brave-search-mcp`)
- Also export `lookupRegistryByName(serverName: string)` for fuzzy matching
- Start with 5-10 popular servers: brave-search, github, filesystem, slack, postgres, sqlite, puppeteer

**Patterns to follow:**
- Service module pattern from `server/src/services/` — plain exported functions, no class needed

**Test scenarios:**
- Happy path: `lookupRegistry("npx", ["-y", "@anthropic/brave-search-mcp"])` returns brave-search entry with `BRAVE_API_KEY` marked required
- Happy path: `lookupRegistry("npx", ["-y", "@modelcontextprotocol/server-github"])` returns github entry
- Edge case: args with extra flags like `["--yes", "@anthropic/brave-search-mcp"]` still match
- Edge case: unknown package returns null
- Edge case: non-npx command with matching package name in args still matches

**Verification:**
- Registry loads without errors, lookup returns correct entries for known packages

---

- [x] **Unit 3: Dry-run env var detector service**

**Goal:** Create a service that spawns an MCP server process with minimal env, captures stderr for up to 5 seconds, and parses error messages for missing environment variable names.

**Requirements:** R2

**Dependencies:** Unit 2 (registry for fallback/enrichment)

**Files:**
- Create: `server/src/services/mcp-env-detector.ts`
- Test: `server/src/__tests__/mcp-env-detector.test.ts`

**Approach:**
- Export `detectEnvVars(config: { command: string, args: string[], transport: string }): Promise<DetectedEnvVar[]>`
- **Concurrency semaphore**: limit to max 2 simultaneous dry-run spawns. Return a clear "detection busy" error when the limit is reached, so the endpoint can return 429
- For stdio transport: first check registry; if no match, spawn the process with expanded minimal env: `{ PATH, HOME, TMPDIR, TEMP, USER, LOGNAME, SHELL, NVM_DIR, VOLTA_HOME, FNM_DIR }` from `process.env` (filtered to only keys that exist). This covers npm/npx infrastructure needs and Node version managers
- **Process group kill**: spawn with `detached: true`, then use `process.kill(-pid, 'SIGKILL')` after 5s to kill the entire process group, not just the direct child. This prevents grandchild processes from surviving the timeout
- Parse stderr with regex patterns for common formats: `Error: SOME_VAR is not set`, `Missing environment variable: SOME_VAR`, `SOME_VAR is required`, `SOME_VAR must be defined`, etc. Filter detected names to match `/^[A-Z][A-Z0-9_]*$/` to avoid false positives from arbitrary stderr
- For non-stdio transports: registry-only lookup (no dry-run possible)
- Merge dry-run results with registry data to enrich with descriptions and docs URLs
- Return `Array<{ name: string, required: boolean, description?: string, docsUrl?: string, detectedFrom: "registry" | "dry-run" | "both" }>`
- When command fails with ENOENT (exit code 127), return a specific error distinguishing "command not found" from "no env vars detected"

**Patterns to follow:**
- `child_process.spawn` with timeout pattern
- Validation result structure from `validate-pipeline.ts`

**Test scenarios:**
- Happy path: stdio server that prints "Error: BRAVE_API_KEY is not set" → detects `BRAVE_API_KEY`
- Happy path: registry match enriches dry-run results with descriptions
- Happy path: non-stdio transport falls back to registry-only
- Edge case: server exits immediately with no useful stderr → returns empty array
- Edge case: server hangs → killed after 5s timeout via process group kill, returns whatever was captured
- Error path: command not found (ENOENT) → returns specific error, not empty array
- Edge case: duplicate variable names from both registry and dry-run → deduplicated, merged
- Edge case: concurrent detection requests beyond semaphore limit → "detection busy" error
- Edge case: adversarial stderr with non-env-var-like names → filtered out by `/^[A-Z][A-Z0-9_]*$/` pattern

**Verification:**
- Tests pass with mocked child process, detector handles all timeout, concurrency, and error cases gracefully

---

- [x] **Unit 4: Detect env vars REST endpoint**

**Goal:** Add a `POST /api/mcp-servers/detect-env` endpoint that accepts server config and returns detected env var requirements.

**Requirements:** R1, R2, R3

**Dependencies:** Unit 2, Unit 3

**Files:**
- Modify: `server/src/routes/mcp-servers.ts`
- Test: `server/src/__tests__/mcp-env-detect-route.test.ts`

**Approach:**
- `POST /api/mcp-servers/detect-env` accepts `{ transport, command?, args?, url?, name? }`
- Calls `detectEnvVars()` from the detector service
- Returns `{ detected: DetectedEnvVar[], detectedFrom: string }`
- If an `id` query param is provided, also stores results in `metadata.envRequirements` on the existing server row
- When the detector returns a "detection busy" error (semaphore full), return `429 Too Many Requests`

**Patterns to follow:**
- `POST /:id/test` endpoint pattern in the same file — similar structure of temporary resource creation and cleanup

**Test scenarios:**
- Happy path: POST with brave-search config → returns detected BRAVE_API_KEY with description
- Happy path: POST with unknown stdio server → dry-run runs and returns parsed results
- Happy path: POST with SSE transport → registry-only lookup
- Error path: POST with missing transport field → 400 error
- Edge case: POST with stdio but no command → 400 error
- Edge case: concurrent requests exceed semaphore → 429 response

**Verification:**
- Endpoint responds correctly for known and unknown servers, handles errors and rate limiting gracefully

---

- [x] **Unit 5: UI env detection in AddMcpServerForm**

**Goal:** Add a "Detect Required Environment" button to the Add MCP Server form that calls the detect endpoint and displays discovered env vars with descriptions and pre-populated fields.

**Requirements:** R3, R7, R8

**Dependencies:** Unit 4

**Files:**
- Modify: `ui/src/pages/Settings.tsx`
- Modify: `ui/src/lib/api.ts`

**Approach:**
- Add `api.detectMcpEnv(body)` method to the API client
- In `AddMcpServerForm`, add a "Detect Required Environment" button below the command/args fields
- On click, call the detect endpoint with current form values
- Display results as a list of env var fields: name (read-only label), description text, input field pre-filled with `${NAME}` for required vars
- User can edit values, then detected + manual entries merge into the env textarea (or replace the textarea with structured fields)
- Show detection source badge: **"verified"** for registry results, **"detected"** for dry-run results — makes it clear that dry-run results come from the server process itself and may not be authoritative
- Loading state while detection runs (can take up to 5s for dry-run)
- Handle 429 response from endpoint with "Detection is busy, try again in a moment" message

**Patterns to follow:**
- `AddMcpServerForm` component structure and styling conventions in `Settings.tsx`
- `useMutation` pattern for the detect call
- Dark theme: `bg-slate-800` inputs, `text-sky-400` for links, `text-amber-400` for warnings

**Test scenarios:**
- Happy path: click Detect → loading spinner → results appear with env var fields pre-filled with `${...}` syntax
- Happy path: user modifies detected values and submits form → server created with correct env
- Edge case: detection returns empty array → "No required environment variables detected" message
- Error path: detection endpoint fails → error message displayed, form still usable
- Edge case: user already typed env vars manually before clicking Detect → detected results merge with existing entries

**Verification:**
- Detection button triggers API call, results render as structured env fields, form submission includes all env vars

---

- [x] **Unit 6: Enable-with-warning validation in UI**

**Goal:** When toggling a server's enable state, check for missing required env vars and show a warning indicator if any are missing.

**Requirements:** R5

**Dependencies:** Unit 4 (for stored metadata), Unit 5 (for detection flow)

**Files:**
- Modify: `ui/src/pages/Settings.tsx`
- Modify: `packages/shared/src/index.ts`

**Approach:**
- Extend `ApiMcpServer` to include optional `metadata?: { envRequirements?: Array<{ name: string, required: boolean, description?: string }> }`
- Update `rowToApi()` in the routes file to include metadata in the response
- **Exclude `metadata` from the PATCH endpoint's accepted fields** — metadata is only writable by the detect-env flow, preventing accidental clobbering via PATCH requests
- In `McpServerRow`, when the server has `metadata.envRequirements`, check which required var **keys** are present in `server.env` (simple key-presence check — the UI has no access to `process.env` so cannot verify `${...}` resolution)
- If any required var keys are missing from `server.env`, show an amber warning badge with tooltip listing missing vars
- Warning is informational — enable toggle still works

**Patterns to follow:**
- `AlertCircle` icon from lucide-react (already imported)
- Tooltip/hover patterns used elsewhere in the UI
- `text-amber-400` for warning state

**Test scenarios:**
- Happy path: server with all required env var keys present in `server.env` → no warning badge
- Happy path: server missing `BRAVE_API_KEY` key entirely → amber warning badge with "Missing: BRAVE_API_KEY" tooltip
- Edge case: server with `BRAVE_API_KEY: "${BRAVE_API_KEY}"` → key is present, no warning (resolution happens server-side at connection time)
- Edge case: server with no metadata (never ran detection) → no warning badge
- Edge case: server with empty envRequirements array → no warning badge
- Edge case: PATCH request with metadata field → metadata field ignored, existing envRequirements preserved

**Verification:**
- Warning badge appears only when required env var keys are absent from server.env, does not block enable, metadata cannot be clobbered by PATCH

---

- [x] **Unit 7: Agent tool for env detection**

**Goal:** Add a `detect_mcp_env` agent tool that the AI can call to discover required env vars for an MCP server.

**Requirements:** R6

**Dependencies:** Unit 4 (delegates to the HTTP endpoint)

**Files:**
- Create: `server/src/services/tools/detect-mcp-env.ts`
- Modify: `server/src/services/tools/index.ts`
- Test: `server/src/__tests__/detect-mcp-env-tool.test.ts`

**Approach:**
- Follow the `makeXxxTool(ctx)` pattern
- Parameters: `{ transport, command?, args?, url?, name? }` — same as the REST endpoint
- Tool delegates to the detect service (import directly, not via HTTP) per the dual-system architecture guidance
- Returns detected env vars in structured text format the agent can act on
- Register in `makeAllTools()` array

**Patterns to follow:**
- `server/src/services/tools/register-mcp-server.ts` — tool structure
- Direct import for the detector service rather than extending `AgentToolContext`

**Test scenarios:**
- Happy path: tool called with brave-search config → returns structured list of required env vars
- Happy path: tool called with unknown server → dry-run results returned
- Error path: invalid transport → clear error message in tool response

**Verification:**
- Tool registered in `makeAllTools()`, returns useful detection results the agent can present to the user

## System-Wide Impact

- **Interaction graph:** `buildTransport()` is called by `McpClientPool.connect()`, which is used by the test endpoint, tools endpoint, and pipeline execution. The `${ENV_VAR}` resolution affects all these paths.
- **Error propagation:** Unresolvable `${ENV_VAR}` references resolve to empty string with a console warning — they do not throw. This means the server will attempt to connect with empty values and fail at the MCP server level, which surfaces through the existing test/connect error handling.
- **State lifecycle risks:** Detection results stored in `metadata` may go stale if the MCP server's requirements change. No auto-refresh — user can re-run detection.
- **API surface parity:** The detect endpoint is new (`POST /api/mcp-servers/detect-env`). The agent tool calls the service directly. Both return the same data shape.
- **Unchanged invariants:** All existing MCP server CRUD operations, test connection, tool listing, and pipeline execution remain unchanged. The `env` field semantics are extended (now supports `${...}`) but existing literal values continue to work identically.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Dry-run stderr parsing is fragile across different MCP servers | Registry is the primary detection method; dry-run is a best-effort fallback. Filter detected names to `/^[A-Z][A-Z0-9_]*$/`. UI labels dry-run results as "detected" (vs "verified" for registry). |
| Dry-run spawns user-controlled commands | Concurrency semaphore (max 2), process group kill (prevents grandchild orphans), 5s timeout. Trust model aligned with existing Test Connection which also runs user commands. |
| 5s dry-run timeout may be too short for uncached npx packages | 5s captures most startup failures. Cold npm cache may cause detection to return empty. Users can re-run after package is cached, or manually enter env vars. |
| `metadata` column schema conflicts with future uses | Define a clear TypeScript interface now. Exclude metadata from PATCH endpoint to prevent accidental clobbering. Other features can add sibling keys to the metadata object. |
| Stale metadata.envRequirements after MCP server updates | No auto-refresh. User can re-run detection. Detection results are guidance, not enforcement. |

## Sources & References

- Related issue: [#62](https://github.com/i75Corridor/pawn/issues/62)
- Related issue: [#61](https://github.com/i75Corridor/pawn/issues/61) (Custom models — similar AI-assisted configuration pattern)
- Existing pattern: `server/src/services/tools/validate-pipeline.ts` (secrets validation from `process.env`)
- Institutional learning: `docs/solutions/best-practices/adding-agent-tools-dual-system-architecture-2026-04-04.md`
