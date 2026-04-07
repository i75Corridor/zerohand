---
title: "feat: Add MCP server package for Pawn"
type: feat
status: completed
date: 2026-04-03
---

# feat: Add MCP server package for Pawn

## Overview

Create a new `packages/mcp/` package that exposes Pawn pipelines, skills, and runs as an MCP (Model Context Protocol) server. This enables Claude Desktop, Claude Code, Perplexity, Cursor, and any MCP-compatible client to interact with Pawn programmatically. Phase 1 focuses on local stdio transport; Phase 2 adds remote Streamable HTTP transport.

## Problem Frame

Pawn currently has a REST API and a CLI, but no native integration with AI-powered IDEs and assistants. Users must manually switch between their AI tools and the Pawn UI/CLI to manage pipelines and runs. An MCP server bridges this gap, letting AI assistants directly list pipelines, trigger runs, inspect results, and browse skills — all within the user's existing workflow.

## Requirements Trace

- R1. Expose all 10 tools from issue #23: `list_pipelines`, `create_pipeline`, `execute_pipeline`, `get_run_status`, `modify_pipeline`, `remove_pipeline`, `list_skills`, `get_skill`, `list_runs`, `cancel_run`
- R2. Expose resources: `pawn://pipelines`, `pawn://pipelines/{id}`, `pawn://skills`, `pawn://skills/{name}`, `pawn://runs/{id}`
- R3. Expose prompts: `create-pipeline`, `debug-run`
- R4. Support stdio transport for local clients (Claude Desktop, Claude Code, Perplexity Mac, Cursor)
- R5. Support Streamable HTTP transport for remote clients (Perplexity Web Pro)
- R6. Reuse `packages/cli/src/api-client.ts` for Pawn REST API calls
- R7. Package as `npx @i75corridor/pawn-mcp` runnable
- R8. Never use `console.log()` with stdio transport (corrupts JSON-RPC framing)

## Scope Boundaries

- Phase 1 (this plan): Local stdio server with all tools, resources, and prompts
- Phase 2 (separate plan): Streamable HTTP transport, API key auth, HTTPS deployment
- Phase 3 (separate plan): Resource subscriptions, OAuth 2.0, multi-tenant, rate limiting
- Not in scope: UI changes, CLI changes, server-side schema modifications

## Context & Research

### Relevant Code and Patterns

- `packages/cli/src/api-client.ts` — The `ApiClient` class wraps all Pawn REST API calls. MCP tools will delegate to this same client. It takes `baseUrl` and optional `apiKey`, provides methods for all pipeline, run, skill, and package operations.
- `packages/cli/package.json` — Shows monorepo package pattern: workspace dependency on `@pawn/shared`, esbuild bundling for distribution, `bin` entry for CLI executable.
- `packages/shared/src/index.ts` — All API response types (`ApiPipeline`, `ApiPipelineRun`, `ApiSkill`, etc.) are defined here. The MCP server will reference these types.
- `server/src/routes/pipelines.ts` — Express route pattern showing how pipeline CRUD works. The MCP tools mirror these endpoints through the ApiClient.
- `server/src/routes/skills.ts` — Shows skill listing and retrieval, including SKILL.md content bundling.
- `tsconfig.base.json` — Target ES2023, NodeNext module resolution, strict mode.

### External References

- `@modelcontextprotocol/sdk` — Official MCP TypeScript SDK for server creation
- MCP specification: tools, resources, resource templates, and prompts
- Zod — Used by MCP SDK for tool input schema validation

## Key Technical Decisions

- **Reuse ApiClient rather than direct DB access**: The MCP server runs as a separate process communicating with the Pawn server via HTTP. This maintains separation of concerns and avoids coupling the MCP package to the database layer. The CLI already proves this pattern works.
- **Single entry point with transport selection via env var**: `TRANSPORT=http` selects Streamable HTTP; default is stdio. This keeps one codebase for both transports.
- **esbuild bundling like the CLI**: Follow the CLI's build pattern for distribution — bundle to a single CJS file with a shebang for `npx` execution.
- **Zod schemas for tool params**: The MCP SDK uses Zod for tool input validation. Define schemas alongside tool handlers for co-location.
- **Structured logging to stderr only**: With stdio transport, stdout is reserved for JSON-RPC. All diagnostic logging must go to stderr.

## Open Questions

### Resolved During Planning

- **Should the MCP server access the DB directly or go through the REST API?** Resolution: Go through the REST API via ApiClient. This is the same pattern the CLI uses, keeps the MCP server decoupled, and means it works whether the server is local or remote.
- **How should we handle the `delete_pipeline` vs `remove_pipeline` naming?** Resolution: The issue calls it `remove_pipeline` — use that name for the MCP tool, which internally calls `ApiClient.deletePipeline()` (add this as an alias or just call the existing delete method).

### Deferred to Implementation

- Exact error message formatting for MCP tool failures (depends on how the SDK surfaces errors)
- Whether resource URIs need URL-encoding for pipeline/skill names with special characters (test at runtime)

## Implementation Units

- [x] **Unit 1: Scaffold packages/mcp package**

**Goal:** Create the package structure, tsconfig, dependencies, and build configuration.

**Requirements:** R7

**Dependencies:** None

**Files:**
- Create: `packages/mcp/package.json`
- Create: `packages/mcp/tsconfig.json`
- Create: `packages/mcp/src/index.ts` (entry point stub)

**Approach:**
- Follow the CLI package pattern for `package.json` structure
- Use `@modelcontextprotocol/sdk` and `zod` as dependencies
- Use `@pawn/shared` as workspace dependency for types
- Copy the API client from CLI or import it (decision: copy to avoid cross-package import complexity — the client is small and stable)
- esbuild config: bundle to `dist/mcp.cjs` with shebang `#!/usr/bin/env node`
- Add `bin: { "pawn-mcp": "./dist/mcp.cjs" }` for npx execution
- `"name": "@i75corridor/pawn-mcp"` matching the issue spec

**Patterns to follow:**
- `packages/cli/package.json` for monorepo package structure
- `packages/cli/tsconfig.json` for TypeScript configuration

**Test expectation:** none -- scaffolding only, verified by successful `pnpm install` and `tsc --noEmit`

**Verification:**
- `pnpm install` succeeds with new workspace package
- `tsc --noEmit` passes in `packages/mcp`

- [x] **Unit 2: Create API client and server bootstrap**

**Goal:** Set up the MCP server instance with stdio transport and a working API client connection.

**Requirements:** R4, R6, R8

**Dependencies:** Unit 1

**Files:**
- Create: `packages/mcp/src/api-client.ts`
- Create: `packages/mcp/src/server.ts`
- Modify: `packages/mcp/src/index.ts`
- Test: `packages/mcp/src/__tests__/server.test.ts`

**Approach:**
- Copy `ApiClient` from CLI (it's a single file with no CLI-specific dependencies). Extend with 3 missing methods:
  - `deletePipeline(id: string)` → `DELETE /pipelines/:id`
  - `listSkills()` → `GET /skills` (returns `ApiSkill[]`)
  - `getSkill(name: string)` → `GET /skills/:name` (returns `ApiSkill` with `content` field — distinct from `/skills/:name/bundle`)
- `server.ts` creates `McpServer` instance with name "pawn", version from package.json
- `index.ts` reads `PAWN_URL` env var (default `http://localhost:3009`), validates URL (must be http/https scheme), creates ApiClient, creates server, connects stdio transport
- All logging via `console.error()` (stderr), never `console.log()` (stdout)
- Server setup function takes ApiClient as dependency for testability

**Patterns to follow:**
- `packages/cli/src/api-client.ts` — copy as-is
- `packages/cli/src/index.ts` — env var and client initialization pattern

**Test scenarios:**
- Happy path: Server creates successfully with valid PAWN_URL
- Error path: Server handles missing PAWN_URL by using default localhost:3009

**Verification:**
- Running `node dist/mcp.cjs` connects to stdio and responds to MCP `initialize` handshake

- [x] **Unit 3: Implement pipeline tools**

**Goal:** Register the 4 pipeline CRUD tools: `list_pipelines`, `create_pipeline`, `modify_pipeline`, `remove_pipeline`.

**Requirements:** R1

**Dependencies:** Unit 2

**Files:**
- Create: `packages/mcp/src/tools/pipeline-tools.ts`
- Modify: `packages/mcp/src/server.ts`
- Test: `packages/mcp/src/__tests__/pipeline-tools.test.ts`

**Approach:**
- Each tool defined with Zod input schema and async handler
- `list_pipelines`: optional `status` param (active/archived/all), calls `client.listPipelines()`, returns formatted text
- `create_pipeline`: requires `name`, optional `description`, `inputSchema`, `steps[]` (each with `name`, `promptTemplate`, optional `skillName`). Creates pipeline then adds steps sequentially.
- `modify_pipeline`: requires `pipelineId`, optional fields to update. Calls `client.updatePipeline()`.
- `remove_pipeline`: requires `pipelineId`, calls `client.deletePipeline()` (added to copied ApiClient in Unit 2).
- Return content as `text` type with structured formatting for readability in AI clients
- Wrap API errors in MCP error responses with descriptive messages

**Patterns to follow:**
- `packages/cli/src/commands/pipelines.ts` — shows the CLI's pipeline command patterns
- `packages/cli/src/api-client.ts` — available methods

**Test scenarios:**
- Happy path: `list_pipelines` returns formatted pipeline list
- Happy path: `create_pipeline` with name and steps creates pipeline and returns confirmation
- Happy path: `modify_pipeline` updates pipeline fields
- Happy path: `remove_pipeline` deletes pipeline
- Edge case: `list_pipelines` with no pipelines returns informative empty message
- Error path: `create_pipeline` with missing name returns validation error
- Error path: `remove_pipeline` with non-existent ID returns 404 error

**Verification:**
- All 4 tools register without errors
- Tool handlers return well-formatted text responses

- [x] **Unit 4: Implement run tools**

**Goal:** Register the 4 run tools: `execute_pipeline`, `get_run_status`, `list_runs`, `cancel_run`.

**Requirements:** R1

**Dependencies:** Unit 2

**Files:**
- Create: `packages/mcp/src/tools/run-tools.ts`
- Modify: `packages/mcp/src/server.ts`
- Test: `packages/mcp/src/__tests__/run-tools.test.ts`

**Approach:**
- `execute_pipeline`: requires `pipelineId`, optional `inputParams` object. Calls `client.createRun()`. Returns run ID and initial status.
- `get_run_status`: requires `runId`. Calls `client.getRun()` and `client.getStepRuns()`. Returns run status with step details.
- `list_runs`: optional `pipelineId`, `limit`. Calls `client.listRuns()`.
- `cancel_run`: requires `runId`. Calls `client.cancelRun()`.
- Format run status with clear status indicators and step-by-step breakdown

**Patterns to follow:**
- `packages/cli/src/commands/runs.ts` — run listing and status display
- `packages/cli/src/commands/run.ts` — run execution

**Test scenarios:**
- Happy path: `execute_pipeline` creates run and returns run ID
- Happy path: `get_run_status` returns run with step details
- Happy path: `list_runs` returns recent runs, optionally filtered by pipeline
- Happy path: `cancel_run` cancels an active run
- Edge case: `get_run_status` for completed run shows output
- Error path: `execute_pipeline` with invalid pipeline ID returns error
- Error path: `cancel_run` on already-finished run returns appropriate message

**Verification:**
- All 4 tools register and handle requests correctly
- Run status output is readable and includes step details

- [x] **Unit 5: Implement skill tools**

**Goal:** Register the 2 skill tools: `list_skills`, `get_skill`.

**Requirements:** R1

**Dependencies:** Unit 2

**Files:**
- Create: `packages/mcp/src/tools/skill-tools.ts`
- Modify: `packages/mcp/src/server.ts`
- Test: `packages/mcp/src/__tests__/skill-tools.test.ts`

**Approach:**
- `list_skills`: optional `limit`. Lists available skills with name, version, description. Calls `client.listSkills()` (added in Unit 2).
- `get_skill`: requires `skillName`. Returns full skill definition including SKILL.md content. Calls `client.getSkill(name)` (added in Unit 2) — uses `GET /skills/:name` which returns `ApiSkill` with `content` field, not the `/bundle` endpoint.

**Patterns to follow:**
- `server/src/routes/skills.ts` — available endpoints
- `packages/cli/src/api-client.ts` — `getSkillBundle()` method exists

**Test scenarios:**
- Happy path: `list_skills` returns skill list with names and descriptions
- Happy path: `get_skill` returns full skill definition with SKILL.md content
- Edge case: `list_skills` with no skills returns empty message
- Error path: `get_skill` with non-existent name returns 404

**Verification:**
- Both tools register and return well-formatted skill information

- [x] **Unit 6: Implement resources**

**Goal:** Register MCP resources for pipelines, skills, and runs.

**Requirements:** R2

**Dependencies:** Unit 2

**Files:**
- Create: `packages/mcp/src/resources/pipelines.ts`
- Create: `packages/mcp/src/resources/skills.ts`
- Create: `packages/mcp/src/resources/runs.ts`
- Modify: `packages/mcp/src/server.ts`
- Test: `packages/mcp/src/__tests__/resources.test.ts`

**Approach:**
- Register static resources for catalog endpoints: `pawn://pipelines`, `pawn://skills`
- Register resource templates for parameterized resources: `pawn://pipelines/{id}`, `pawn://skills/{name}`, `pawn://runs/{id}`
- Resources return JSON content with MIME type `application/json`
- Each resource handler calls the appropriate ApiClient method

**Patterns to follow:**
- MCP SDK resource registration API
- `packages/shared/src/index.ts` — response types for shaping resource content

**Test scenarios:**
- Happy path: `pawn://pipelines` returns pipeline list as JSON
- Happy path: `pawn://pipelines/{id}` returns single pipeline with steps
- Happy path: `pawn://skills` returns skill catalog
- Happy path: `pawn://skills/{name}` returns skill definition with content
- Happy path: `pawn://runs/{id}` returns run result with step outputs
- Error path: Resource for non-existent pipeline/skill/run returns appropriate error

**Verification:**
- All 5 resource URIs resolve and return well-structured JSON

- [x] **Unit 7: Implement prompts**

**Goal:** Register the `create-pipeline` and `debug-run` MCP prompts.

**Requirements:** R3

**Dependencies:** Unit 2

**Files:**
- Create: `packages/mcp/src/prompts/create-pipeline.ts`
- Create: `packages/mcp/src/prompts/debug-run.ts`
- Modify: `packages/mcp/src/server.ts`
- Test: `packages/mcp/src/__tests__/prompts.test.ts`

**Approach:**
- `create-pipeline` prompt: Guides the user through pipeline creation. Returns a structured message sequence that helps the AI assistant ask for name, description, steps, and model selection.
- `debug-run` prompt: Takes a `runId` argument, fetches run details and step events, returns a structured analysis prompt with the failure context.
- Prompts return `messages` arrays with role and content.

**Patterns to follow:**
- MCP SDK prompt registration API

**Test scenarios:**
- Happy path: `create-pipeline` prompt returns guided creation messages
- Happy path: `debug-run` prompt with valid runId returns failure analysis context
- Error path: `debug-run` with invalid runId returns error message

**Verification:**
- Both prompts register and return structured message arrays

- [x] **Unit 8: Build, package, and integration test**

**Goal:** Configure esbuild, verify npx execution, and run end-to-end test with a running Pawn server.

**Requirements:** R4, R7

**Dependencies:** Units 3-7

**Files:**
- Modify: `packages/mcp/package.json` (build script)
- Modify: `package.json` (root — add mcp to build pipeline)
- Test: `packages/mcp/src/__tests__/integration.test.ts`

**Approach:**
- Add esbuild build script matching CLI pattern: `esbuild src/index.ts --bundle --platform=node --format=cjs --outfile=dist/mcp.cjs --banner:js="#!/usr/bin/env node" --external:ws`
- Add `packages/mcp` to root build command: append `&& pnpm --filter @i75corridor/pawn-mcp build` to root `package.json` build script (after `@pawn/db` which builds `@pawn/shared`)
- Integration test: start MCP server with stdio, send `initialize` + `tools/list` requests via stdin, verify responses
- Update root `pnpm-workspace.yaml` if needed (already includes `packages/*`)

**Patterns to follow:**
- `packages/cli/package.json` — esbuild configuration

**Test scenarios:**
- Integration: MCP server responds to `initialize` handshake with server info
- Integration: `tools/list` returns all 10 registered tools
- Integration: `resources/list` returns all registered resources
- Integration: `prompts/list` returns both registered prompts
- Happy path: Built `dist/mcp.cjs` is executable and starts without errors

**Verification:**
- `pnpm --filter @i75corridor/pawn-mcp build` produces working `dist/mcp.cjs`
- `npx @i75corridor/pawn-mcp` starts and responds to MCP protocol
- All tools, resources, and prompts are listed in MCP responses

## System-Wide Impact

- **Interaction graph:** The MCP server is a new standalone process that communicates with the Pawn server via REST API only. No server-side code changes needed. No WebSocket consumption in Phase 1.
- **Error propagation:** ApiClient errors (network failures, 4xx/5xx responses) must be caught and translated into MCP-protocol error responses, not process crashes.
- **State lifecycle risks:** None — the MCP server is stateless. All state lives in the Pawn server.
- **API surface parity:** The MCP tools expose a subset of the REST API. No new server endpoints are needed — all required endpoints already exist.
- **Integration coverage:** End-to-end test should verify the MCP protocol flow (initialize → list tools → call tool → receive response) without requiring a running Pawn server (mock the ApiClient).
- **Unchanged invariants:** The REST API, CLI, UI, and WebSocket interfaces are not modified by this change.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| MCP SDK API changes between planning and implementation | Pin SDK version in package.json; check latest docs at implementation time |
| stdio transport corruption from accidental stdout writes | Enforce stderr-only logging; no `console.log()` anywhere in the package |
| ApiClient methods missing for some tools (`deletePipeline`, `listSkills`, `getSkill`) | Add all 3 missing methods to the copied ApiClient in Unit 2 — they map to existing server endpoints |
| esbuild bundling issues with MCP SDK | Test bundling early in Unit 1; add SDK to externals if needed |

## Sources & References

- GitHub issue: i75Corridor/pawn#23
- Related code: `packages/cli/src/api-client.ts`, `packages/shared/src/index.ts`
- External docs: MCP specification, `@modelcontextprotocol/sdk` npm package
