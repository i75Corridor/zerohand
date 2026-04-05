---
title: "feat: Add WebSocket broadcasts to budgets, packages, and triggers routes"
type: feat
status: completed
date: 2026-04-04
---

# feat: Add WebSocket broadcasts to budgets, packages, and triggers routes

## Overview

Add `data_changed` WebSocket broadcasts to every CREATE/UPDATE/DELETE mutation in the budgets, packages, and triggers route handlers. Currently these routes mutate silently — no other client knows about changes until a page refresh.

## Problem Frame

The approvals route already broadcasts `data_changed` events via `WsManager`, enabling real-time UI updates. The budgets, packages, and triggers routes lack this integration, creating an inconsistent experience where some mutations update the UI in real-time and others do not.

## Requirements Trace

- R1. Pass `WsManager` to `createBudgetsRouter`, `createPackagesRouter`, and `createTriggersRouter` in `server/src/index.ts`
- R2. Broadcast `{ type: "data_changed", entity, action, id }` on every CREATE/UPDATE/DELETE mutation in all three routes
- R3. Extend `WsDataChanged` entity union to include `"trigger"`, `"budget"`, `"package"` (if PR #49 hasn't merged first)
- R4. Verify: UI pages refresh when another client modifies these entities

## Scope Boundaries

- Only modifying existing route handlers — no new routes
- No changes to the UI WebSocket listener (issue #32 covers that separately)
- No changes to the WsManager class itself
- Read-only routes (GET) are not affected

## Context & Research

### Relevant Code and Patterns

- **Pattern to follow**: `server/src/routes/approvals.ts` — already receives `WsManager` and calls `ws.broadcast({ type: "run_status", ... })`. Note: approvals broadcasts `run_status`, not `data_changed`. Use the `WsDataChanged` type definition in `packages/shared/src/index.ts` as the authoritative reference for the `data_changed` broadcast payload shape, and approvals only for the wiring pattern (how `ws` is received as a parameter)
- **Route wiring**: `server/src/index.ts` — `createApprovalsRouter(db, ws)` is the pattern (registered after `WsManager` creation at line 162); the other three are currently registered at lines 141-148 (before `ws` exists) and receive only `(db)`. **Route registrations must be moved after `WsManager` creation.**
- **WsManager**: `server/src/ws/index.ts` — `broadcast(msg)` method sends to all connected clients
- **WsDataChanged type**: `packages/shared/src/index.ts` — entity union currently `"pipeline" | "step" | "skill"` on main

### Institutional Learnings

- `docs/solutions/best-practices/adding-agent-tools-dual-system-architecture-2026-04-04.md` — documents the pattern for extending `WsDataChanged` entity union

## Key Technical Decisions

- **Add `ws` parameter to existing route factory signatures**: Matches the approvals pattern. The `WsManager` import is from `server/src/ws/index.js`.
- **Broadcast after successful mutation, not before**: The route handler should complete the DB write and have the row before broadcasting. This matches the approvals pattern.
- **Use `ws.broadcast()` directly, not a helper**: The approvals route calls `ws.broadcast({ type: "data_changed", ... })` inline — follow the same approach for consistency.

## Open Questions

### Resolved During Planning

- **Should we depend on PR #49 for the entity union extension?** No — include it in this plan for independence. If #49 merges first, this becomes a no-op for that step (the types are already extended).

### Deferred to Implementation

- None — this is straightforward pattern-following work.

## Implementation Units

- [ ] **Unit 1: Extend WsDataChanged entity union (if needed)**

**Goal:** Ensure `"trigger"`, `"budget"`, and `"package"` are valid entity values in the `WsDataChanged` type.

**Requirements:** R3

**Dependencies:** None

**Files:**
- Modify: `packages/shared/src/index.ts`

**Approach:**
- Check if `WsDataChanged.entity` already includes the new values (PR #49 may have merged)
- If not, add `"trigger" | "budget" | "package"` to the union
- If `"setting"` and `"approval"` are also missing, add them for completeness (matching #49)

**Patterns to follow:**
- Existing `WsDataChanged` type definition

**Test scenarios:**
- Test expectation: none — pure type extension with no behavioral change

**Verification:**
- TypeScript compiles with no errors

- [ ] **Unit 2: Add WsManager to triggers route**

**Goal:** Broadcast `data_changed` on trigger create, update, and delete.

**Requirements:** R1, R2

**Dependencies:** Unit 1

**Files:**
- Modify: `server/src/routes/triggers.ts`
- Modify: `server/src/index.ts`

**Approach:**
- Change `createTriggersRouter(db: Db)` signature to `createTriggersRouter(db: Db, ws: WsManager)`
- Add `ws.broadcast({ type: "data_changed", entity: "trigger", action: "created", id: row.id })` after POST handler's `res.status(201).json()`
- Add broadcast with action `"updated"` after PATCH handler's `res.json()`
- Add broadcast with action `"deleted"` after DELETE handler's `res.status(204).send()`
- Update `server/src/index.ts`: move triggers route registration after `WsManager` creation (line 162+) and change to `createTriggersRouter(db, ws)`

**Patterns to follow:**
- `server/src/routes/approvals.ts` — how `ws` is received and `ws.broadcast()` is called

**Test scenarios:**
- Happy path: creating a trigger broadcasts `{ type: "data_changed", entity: "trigger", action: "created", id }` 
- Happy path: updating a trigger broadcasts with action `"updated"`
- Happy path: deleting a trigger broadcasts with action `"deleted"`
- Edge case: failed mutation (404 on update/delete) does NOT broadcast

**Verification:**
- Trigger CRUD operations produce WebSocket messages observable in the browser console

- [ ] **Unit 3: Add WsManager to budgets route**

**Goal:** Broadcast `data_changed` on budget create, update, and delete.

**Requirements:** R1, R2

**Dependencies:** Unit 1

**Files:**
- Modify: `server/src/routes/budgets.ts`
- Modify: `server/src/index.ts`

**Approach:**
- Change `createBudgetsRouter(db: Db)` to `createBudgetsRouter(db: Db, ws: WsManager)`
- Add broadcasts after POST (created), PATCH (updated), DELETE (deleted)
- Update `server/src/index.ts`: move budgets route registration after `WsManager` creation and change to `createBudgetsRouter(db, ws)`

**Patterns to follow:**
- Same as Unit 2

**Test scenarios:**
- Happy path: creating a budget broadcasts with entity `"budget"`, action `"created"`
- Happy path: updating a budget broadcasts with action `"updated"`
- Happy path: deleting a budget broadcasts with action `"deleted"`
- Edge case: 404 responses do NOT broadcast

**Verification:**
- Budget mutations produce `data_changed` WebSocket messages

- [ ] **Unit 4: Add WsManager to packages route**

**Goal:** Broadcast `data_changed` on package install, update, uninstall, and local-install.

**Requirements:** R1, R2

**Dependencies:** Unit 1

**Files:**
- Modify: `server/src/routes/packages.ts`
- Modify: `server/src/index.ts`

**Approach:**
- Change `createPackagesRouter(db: Db)` to `createPackagesRouter(db: Db, ws: WsManager)`
- Broadcast after: POST /packages/install (created), POST /packages/:id/update (updated), DELETE /packages/:id (deleted), POST /packages/install-local (created), POST /packages/publish (created)
- Do NOT broadcast on read-only operations: GET /packages, GET /packages/discover, POST /packages/scan, GET /packages/:id/security, POST /packages/check-updates, POST /packages/export
- Update `server/src/index.ts`: move packages route registration after `WsManager` creation and change to `createPackagesRouter(db, ws)`

**Patterns to follow:**
- Same as Units 2-3

**Test scenarios:**
- Happy path: installing a package broadcasts with entity `"package"`, action `"created"`
- Happy path: updating a package broadcasts with action `"updated"`
- Happy path: uninstalling a package broadcasts with action `"deleted"`
- Happy path: local-install broadcasts with action `"created"`
- Happy path: publish broadcasts with action `"created"`
- Edge case: scan, discover, export, check-updates do NOT broadcast
- Error path: failed install does NOT broadcast

**Verification:**
- Package mutations produce `data_changed` WebSocket messages
- Read-only package operations do NOT produce broadcasts

## System-Wide Impact

- **Interaction graph:** The UI WebSocket handler in `ui/src/lib/ws.ts` listens for messages. Once these broadcasts are added, the server-side infrastructure for real-time updates is in place. Actual UI refetching depends on the UI listener handling new entity types (see issue #32).
- **Error propagation:** Broadcasts fire after successful mutations only. If the broadcast itself fails (WebSocket disconnected), it fails silently — no impact on the HTTP response.
- **Unchanged invariants:** Approvals route is not modified. All existing GET/list endpoints are not affected.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| PR #49 entity union extension overlaps | Unit 1 checks before modifying; if already extended, it's a no-op |
| Broadcast fires before response is sent | Place broadcast call after `res.json()` / `res.status().send()` to ensure the client gets the HTTP response regardless |

## Sources & References

- Related issue: i75Corridor/zerohand#34
- Related issue: i75Corridor/zerohand#32 (UI data_changed listener)
- Related PR: i75Corridor/zerohand#49 (agent tools — extends WsDataChanged)
- Pattern: `server/src/routes/approvals.ts` (existing WsManager usage)
