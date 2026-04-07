---
title: "feat: Replace Costs page polling with WebSocket cost events"
type: feat
status: completed
date: 2026-04-05
---

# feat: Replace Costs page polling with WebSocket cost events

## Overview

Supplement the Costs page's 60-second polling with real-time WebSocket updates using the existing `WsDataChanged` broadcast pattern, raising the polling interval to 5 minutes as a reconnection fallback. When a pipeline step records a cost, the execution engine broadcasts a `data_changed` event with `entity: "cost"`. The UI's `useDataChangedListener` hook picks this up and invalidates the cost query cache. Polling interval is raised to 5 minutes as a reconnection fallback.

## Problem Frame

The Costs page uses `refetchInterval: 60_000` to poll for cost data. When a run completes and records costs, there's up to a 1-minute delay before the page reflects the change. The rest of the system already uses WebSocket broadcasts for real-time updates — costs is the outlier.

GitHub issue: i75Corridor/pawn#39

## Requirements Trace

- R1. Broadcast a `data_changed` event with `entity: "cost"` when `recordCost()` records a cost event
- R2. Listen for cost `data_changed` events in the UI and invalidate the cost query cache
- R3. Keep a longer polling interval (5 min) as a fallback for WebSocket reconnection
- R4. Cost appears on Costs page within 1 second of run completion

## Scope Boundaries

- No new WebSocket message types — reuse existing `WsDataChanged` pattern
- No changes to `WsManager` or WebSocket infrastructure
- No changes to cost calculation logic or the `/api/stats/costs` endpoint
- The `recordCost()` function itself remains unchanged — the broadcast happens at the call site

## Context & Research

### Relevant Code and Patterns

- `packages/shared/src/index.ts:279` — `WsDataChanged` entity union needs `"cost"` added
- `server/src/services/execution-engine.ts:421` — call site for `recordCost()`, where the broadcast should be added
- `server/src/ws/index.ts` — `WsManager.broadcast()` is already available on the execution engine as `this.ws`
- `ui/src/hooks/useDataChangedListener.ts` — existing hook that handles `data_changed` events, needs `"cost"` case
- `ui/src/pages/Costs.tsx:51` — `refetchInterval: 60_000` to be raised to 300_000
- `server/src/routes/triggers.ts` — existing pattern for broadcasting `data_changed` from server code

## Key Technical Decisions

- **Reuse `WsDataChanged` rather than creating `WsCostEvent`**: The issue suggests a new `WsCostEvent` type, but the codebase convention is `WsDataChanged` with an entity discriminator. Every other entity mutation uses this pattern. Adding a new top-level message type would break the convention for no benefit.
- **Broadcast at the call site, not inside `recordCost()`**: `recordCost()` is a pure DB function that doesn't have WebSocket access. Adding broadcast at the call site in `execution-engine.ts` keeps the function boundaries clean and follows the same pattern as route-level broadcasts.

## Open Questions

### Resolved During Planning

- **New message type vs existing pattern**: Use existing `WsDataChanged` with `entity: "cost"`. Consistent with codebase conventions.
- **Polling removal vs increase**: Keep polling at 5 min (300s) as a reconnection fallback. Removing it entirely would mean stale data if the WebSocket drops.

### Deferred to Implementation

- None — this is straightforward pattern-following.

## Implementation Units

- [ ] **Unit 1: Add "cost" to WsDataChanged entity union**

  **Goal:** Extend the shared type so the type system permits cost broadcasts.

  **Requirements:** R1

  **Dependencies:** None

  **Files:**
  - Modify: `packages/shared/src/index.ts`

  **Approach:**
  - Add `"cost"` to the `WsDataChanged["entity"]` union type alongside the existing entities

  **Patterns to follow:**
  - Existing entity union: `"pipeline" | "step" | "skill" | "trigger" | "approval" | "budget" | "package" | "setting"`

  **Test scenarios:**
  - Test expectation: none — this is a type-only change with no runtime behavior

  **Verification:**
  - TypeScript compiles with `entity: "cost"` in a `WsDataChanged` literal

- [ ] **Unit 2: Broadcast cost event from execution engine**

  **Goal:** After `recordCost()` succeeds, broadcast a `data_changed` event so connected clients know costs have changed.

  **Requirements:** R1, R4

  **Dependencies:** Unit 1

  **Files:**
  - Modify: `server/src/services/execution-engine.ts`

  **Approach:**
  - After the `await recordCost(...)` call at line 421, add `this.ws.broadcast({ type: "data_changed", entity: "cost", action: "created", id: stepRun.id })`
  - This is a single line addition following the exact pattern used in routes for other entities

  **Patterns to follow:**
  - `server/src/routes/triggers.ts:65` — `ws.broadcast({ type: "data_changed", entity: "trigger", action: "created", id: row.id })`

  **Test scenarios:**
  - Test expectation: none — the broadcast is a fire-and-forget side effect on an existing WebSocket. Integration verified manually (R4 acceptance criterion).

  **Verification:**
  - After a pipeline step records cost, a `data_changed` event with `entity: "cost"` appears on the WebSocket

- [ ] **Unit 3: Handle cost events in UI and reduce polling**

  **Goal:** Invalidate cost query cache on cost events, raise polling interval to 5 min fallback.

  **Requirements:** R2, R3, R4

  **Dependencies:** Unit 1, Unit 2

  **Files:**
  - Modify: `ui/src/hooks/useDataChangedListener.ts`
  - Modify: `ui/src/pages/Costs.tsx`

  **Approach:**
  - In `useDataChangedListener`, add a `case "cost":` that invalidates `queryKey: ["costBreakdown"]`
  - In `Costs.tsx`, change `refetchInterval: 60_000` to `refetchInterval: 300_000`

  **Patterns to follow:**
  - Existing `case "pipeline":` handler in `useDataChangedListener.ts` — same invalidation pattern
  - The query key `["costBreakdown", from, to]` in `Costs.tsx:49` — invalidate the prefix `["costBreakdown"]` to cover all date ranges

  **Test scenarios:**
  - Happy path: `data_changed` event with `entity: "cost"` received → `costBreakdown` queries invalidated, Costs page re-renders with new data
  - Edge case: multiple cost events in rapid succession (multi-step pipeline) → React Query deduplicates refetches automatically
  - Integration: run completes → cost recorded → broadcast sent → Costs page updates within 1s

  **Verification:**
  - Costs page updates within 1 second of a run recording cost
  - Polling fallback still works (page eventually updates even without WebSocket)

## System-Wide Impact

- **Interaction graph:** The broadcast is added to the execution engine's step completion path. No callbacks, middleware, or observers are affected beyond the new broadcast line.
- **Error propagation:** The broadcast is fire-and-forget — if no clients are connected, it's a no-op. Cannot fail in a way that affects cost recording.
- **API surface parity:** The MCP server and CLI don't display real-time costs, so no parity concern.
- **Unchanged invariants:** `recordCost()` behavior unchanged. `/api/stats/costs` endpoint unchanged. WebSocket infrastructure unchanged.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| High-frequency broadcasts during long multi-step runs | React Query deduplicates concurrent invalidations. Each step records cost independently, so broadcasts are naturally spaced by step execution time. |
| WebSocket disconnection leaves stale data | 5-min polling fallback ensures eventual consistency. |

## Sources & References

- GitHub issue: i75Corridor/pawn#39
- Related code: `server/src/services/execution-engine.ts`, `ui/src/hooks/useDataChangedListener.ts`, `ui/src/pages/Costs.tsx`
