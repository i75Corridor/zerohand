---
title: "feat: Inject dynamic DashboardContext into global agent messages"
type: feat
status: completed
date: 2026-04-05
---

# feat: Inject dynamic DashboardContext into global agent messages

## Overview

Add a `DashboardContext` system that pre-fetches key system state (active runs, costs, pending approvals, recent failures, navigation context) and injects it as a compact text block prepended to every user message in the global agent. This replaces the existing minimal `[Context: viewing ...]` injection with a richer, token-efficient context block. The system prompt is updated to reference the context schema so the agent knows how to interpret it.

## Problem Frame

The agent-native audit scored Context Injection at 20% (3/15). The global agent only receives page path, pipeline name, and run ID. It has no awareness of system state without making explicit tool calls — meaning it starts every conversation blind to active runs, costs, approvals, and failures. This forces unnecessary tool-call round trips and makes the agent less helpful on first response.

GitHub issue: i75Corridor/pawn#31

## Requirements Trace

- R1. Pre-fetch system stats (active runs, cost this month, runs this month), pending approval count, and recent failures before each agent message
- R2. Inject enriched context block into agent messages, replacing the existing `[Context: viewing ...]` injection
- R3. Cache context for 10-30s (TTL-based) to avoid query storms on rapid messages
- R4. Update system prompt to reference context structure so the agent can interpret it
- R5. Token cost impact < 1000 tokens per message

## Scope Boundaries

- No new agent tools — this is passive context injection only
- No UI changes — the context block is invisible to the user
- No MCP server changes — MCP tools use HTTP APIs, not the global agent message path
- Budget/trigger/settings state excluded from context to stay within token budget
- No changes to `AgentToolContext` interface — context building uses `Db` directly

## Context & Research

### Relevant Code and Patterns

- `server/src/services/global-agent.ts` — `handleMessage()` at line 112 is the injection point; existing context injection at lines 117-128 will be replaced
- `server/src/services/tools/get-system-stats.ts` — existing query pattern for active runs, runs this month, cost this month (reusable)
- `server/src/services/tools/list-approvals.ts` — existing pending approvals query pattern with join to pipeline names
- `server/src/services/budget-guard.ts` — TTL cache pattern (`cachedCosts` + `cacheTime` + `CACHE_TTL_MS`) to follow for DashboardContext cache
- `server/src/services/global-agent.ts:79` — `skillSummaryCache` is the instance-scoped cache pattern to follow
- `packages/shared/src/index.ts:272` — `WsIncomingGlobalChat` interface with `context` field

### Institutional Learnings

- `docs/solutions/best-practices/adding-agent-tools-dual-system-architecture-2026-04-04.md` — do NOT extend `AgentToolContext` for one-off needs; DashboardContext should be built as a standalone module that takes `Db` directly

## Key Technical Decisions

- **Replace existing context injection rather than augmenting**: The current `[Context: viewing /path — pipeline "Name"]` block at lines 117-128 will be removed. Navigation info (path, pipeline, run) is folded into the DashboardContext block. This avoids duplicate pipeline/run references and saves tokens.
- **Compact text format rather than JSON**: A key-value text block like `[Dashboard: 3 active runs | $12.45 cost | ...]` is more token-efficient than JSON serialization. JSON field names, braces, and quotes waste ~30-40% of tokens.
- **Instance-scoped TTL cache on `GlobalAgentService`**: Matches the `skillSummaryCache` pattern already on the class. The cache is a simple `{ data, timestamp }` pair with a 30s TTL check. Instance-scoping means cache is cleared on session reset, which is desirable.
- **Graceful degradation on fetch failure**: If any context queries fail, the message proceeds without context (matching the existing `try/catch { /* ignore */ }` pattern at line 120). The agent works in degraded mode rather than failing entirely.
- **Cap recent failures at 5, truncate errors to 150 chars**: Unbounded failures would blow the token budget. 5 failures with truncated error strings keeps this section to ~200 tokens worst case.
- **On successful fetch, always inject context block; omit empty arrays**: Even when the system is idle, the block is included so the agent can distinguish "idle" (context block present, zero values) from "no context available" (block absent due to fetch failure). Empty arrays (e.g., no failures) are omitted from the text block to save tokens.

## Open Questions

### Resolved During Planning

- **Error handling strategy**: Wrap entire context fetch in try/catch, proceed without context on failure, log error. Matches existing pattern at `global-agent.ts:120`.
- **Cache scope**: Instance-scoped on `GlobalAgentService` (not module-scoped). Cleared on `destroySession()`, matching `skillSummaryCache` lifecycle.
- **Month-start computation**: Reuse the same `new Date(now.getFullYear(), now.getMonth(), 1)` pattern from `get-system-stats.ts`. Not worth extracting a shared utility for this plan — only two existing copies.

### Deferred to Implementation

- **Exact token count of worst-case context block**: Need to serialize a realistic max-state scenario and count. The 1000-token budget should hold with the 5-failure cap and 150-char truncation, but verify during implementation.
- **Pipeline name resolution for deleted pipelines in failures**: The join from `pipelineRuns` to `pipelines` may return null for deleted pipelines. Implementation should use `pipeline.name ?? "Unknown"` fallback.

## Implementation Units

- [x] **Unit 1: Add DashboardContext type and builder module**

  **Goal:** Create the context-building function that fetches all needed state from the DB and returns a structured object.

  **Requirements:** R1

  **Dependencies:** None

  **Files:**
  - Create: `server/src/services/dashboard-context.ts`
  - Test: `server/src/services/dashboard-context.test.ts`

  **Approach:**
  - Export a `DashboardContext` interface and an async `buildDashboardContext(db: Db, navigation?: { path: string; pipelineId?: string; runId?: string })` function
  - Run all queries in parallel via `Promise.all`: active runs count, runs this month, cost this month, pending approval count, recent failures (5, last 24h), and optionally pipeline name + current run status from navigation context
  - Reuse query patterns from `get-system-stats.ts` (lines 14-36) for system stats; for pending approval count, use a simple `SELECT COUNT(*) FROM approvals WHERE status = 'pending'` (no joins needed — the `list-approvals.ts` join pattern is only for fetching pipeline names)
  - New query for recent failures: `pipelineRuns WHERE status = 'failed' AND createdAt > now() - interval '24 hours' ORDER BY createdAt DESC LIMIT 5` with join to `pipelines` for name. The 24h window ensures the agent only sees relevant recent failures, not ancient history
  - Export a `formatDashboardContext(ctx: DashboardContext): string` function that produces the compact text block
  - Truncate failure error strings to 150 characters

  **Patterns to follow:**
  - Query patterns from `server/src/services/tools/get-system-stats.ts`
  - Join pattern from `server/src/services/tools/list-approvals.ts`

  **Test scenarios:**
  - Happy path: all queries return data — verify structured object has correct fields and types
  - Happy path: formatDashboardContext produces expected compact text block with all fields populated
  - Edge case: zero active runs, zero approvals, empty failures — verify block is produced with zero values, no failures section
  - Edge case: failure with deleted pipeline (null join) — verify fallback name used
  - Edge case: error string longer than 150 chars — verify truncation
  - Edge case: 10+ failures in DB — verify only 5 returned
  - Error path: DB query throws — verify function throws (caller handles graceful degradation)

  **Verification:**
  - `buildDashboardContext` returns a well-typed object with all fields
  - `formatDashboardContext` produces a single-line or compact multi-line text block
  - Tests pass

- [x] **Unit 2: Add TTL cache to GlobalAgentService**

  **Goal:** Add an instance-scoped TTL cache for DashboardContext on the `GlobalAgentService` class to avoid query storms on rapid messages.

  **Requirements:** R3

  **Dependencies:** Unit 1

  **Files:**
  - Modify: `server/src/services/global-agent.ts`

  **Approach:**
  - Add private fields: `private contextCache: { data: DashboardContext; timestamp: number; navigationKey: string } | null = null` and a `CONTEXT_CACHE_TTL_MS = 30_000` constant
  - Add a private method `getDashboardContext(navigation?)` that checks cache validity: both TTL freshness AND matching navigation key (`path + pipelineId + runId`). If the user navigates to a different page within the cache window, the navigation key changes and forces a re-fetch. System stats (counts, costs) benefit from the 30s TTL even when navigation changes, but since the queries run in parallel via `Promise.all` the marginal cost is low
  - Clear `contextCache` in `destroySession()` alongside `skillSummaryCache`

  **Patterns to follow:**
  - `budget-guard.ts` TTL pattern (lines 23-50): check `if (cache && now - cache.timestamp < TTL) return cache.data`
  - `skillSummaryCache` lifecycle: cleared in `destroySession()`

  **Test scenarios:**
  - Happy path: first call fetches from DB, second call within 30s with same navigation returns cached data without DB query
  - Edge case: call after 30s TTL expires — verify fresh DB fetch
  - Edge case: call within 30s but with different navigation key (user changed page) — verify fresh DB fetch
  - Edge case: `destroySession()` called — verify cache is cleared, next call fetches fresh
  - Integration: rapid sequential `handleMessage` calls from same page — verify only one DB fetch occurs

  **Verification:**
  - Cache hit/miss behavior works correctly with 30s TTL and navigation key
  - Navigation change within cache window triggers re-fetch
  - Cache cleared on session reset

- [x] **Unit 3: Replace context injection in handleMessage**

  **Goal:** Replace the existing `[Context: viewing ...]` injection with the new DashboardContext block, including graceful degradation.

  **Requirements:** R2, R5

  **Dependencies:** Unit 1, Unit 2

  **Files:**
  - Modify: `server/src/services/global-agent.ts`

  **Approach:**
  - In `handleMessage` where `action === "prompt"`, replace lines 117-128 (the existing context injection block) with a call to `getDashboardContext(context)` wrapped in try/catch
  - On success, prepend `formatDashboardContext(result)` + `\n\n` to `fullMessage`
  - On failure, proceed with the raw message (no context) — log the error for debugging
  - Remove the direct pipeline name lookup since it's now handled inside `buildDashboardContext`

  **Patterns to follow:**
  - Existing try/catch pattern at line 120 for graceful degradation

  **Test scenarios:**
  - Happy path: message with context — verify DashboardContext block prepended to message
  - Happy path: message without navigation context — verify context block still injected with system stats (no navigation section)
  - Error path: context fetch throws — verify message sent without context, no crash
  - Edge case: empty message with action "prompt" — verify no injection attempted (existing guard `message` is truthy)

  **Verification:**
  - Agent receives enriched context on every prompt message
  - Agent still works when context fetch fails
  - Old `[Context: viewing ...]` injection is fully removed

- [x] **Unit 4: Update system prompt to reference context structure**

  **Goal:** Add a section to `SYSTEM_PROMPT` that tells the agent about the DashboardContext block it will receive with each message.

  **Requirements:** R4

  **Dependencies:** Unit 1 (needs to know the format)

  **Files:**
  - Modify: `server/src/services/global-agent.ts`

  **Approach:**
  - Add a `## Dashboard Context` section to the `SYSTEM_PROMPT` constant (defined at top of `server/src/services/global-agent.ts`, line 20) explaining:
    - Each message includes a `[Dashboard: ...]` block with live system state
    - The fields: active runs, cost, runs this month, pending approvals, recent failures, navigation context
    - The agent should use this context proactively rather than calling `get_system_stats` or `list_approvals` for basic counts
    - Context is a point-in-time snapshot (10-30s cache); for real-time or detailed data, use the tools
  - Keep the prompt addition concise — target ~100-150 tokens

  **Patterns to follow:**
  - Existing system prompt sections (Concepts, Capabilities, Tool sequencing rules) for voice and formatting

  **Test scenarios:**
  - Test expectation: none — this is a static string change with no behavioral logic to test

  **Verification:**
  - System prompt contains the new section
  - New section is concise and does not exceed ~150 tokens

## System-Wide Impact

- **Interaction graph:** `handleMessage()` is the sole injection point. No callbacks, middleware, or observers are affected. The `ensureSession()` path is unchanged.
- **Error propagation:** Context fetch failures are swallowed with a log — they do not propagate to the agent session or WebSocket. This matches the existing pattern for pipeline name lookup failures.
- **State lifecycle risks:** The TTL cache is instance-scoped and cleared on `destroySession()`. No risk of serving stale context across session boundaries. Within a session, 30s staleness is acceptable — the agent is told it's a snapshot.
- **API surface parity:** MCP server tools are not affected (they use HTTP APIs, not the global agent message path). No other interfaces need this change.
- **Integration coverage:** The key integration to verify is that `handleMessage → getDashboardContext → buildDashboardContext → formatDashboardContext → session.prompt()` works end-to-end with real DB queries.
- **Unchanged invariants:** The `AgentToolContext` interface, tool definitions, WebSocket message types, and `WsIncomingGlobalChat` shape are all unchanged. Existing tools (`get_system_stats`, `list_approvals`) continue to work — they provide detailed data when the agent needs more than the snapshot.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Context queries add latency to every message | Queries are simple counts/sums; `Promise.all` parallelizes them. 30s cache eliminates repeated cost for rapid messages. The failures query (status + createdAt) lacks a composite index but table size is small enough that this is acceptable. If the table grows, add a composite index as a follow-up. |
| Token budget exceeded with many failures | Capped at 5 failures, error strings truncated to 150 chars. Compact text format instead of JSON. |
| Stale context misleads the agent | System prompt tells agent context is a snapshot. 30s TTL keeps data reasonably fresh. Agent can use tools for real-time data. |
| DB connection issues block chat | Graceful degradation: try/catch around entire fetch, message proceeds without context on failure. |

## Sources & References

- GitHub issue: i75Corridor/pawn#31
- Related code: `server/src/services/global-agent.ts`, `server/src/services/tools/get-system-stats.ts`, `server/src/services/budget-guard.ts`
- Institutional learning: `docs/solutions/best-practices/adding-agent-tools-dual-system-architecture-2026-04-04.md`
