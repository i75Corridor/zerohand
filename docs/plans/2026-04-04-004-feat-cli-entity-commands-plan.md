---
title: "feat: Add CLI commands for triggers, approvals, budgets, and settings"
type: feat
status: completed
date: 2026-04-04
---

# feat: Add CLI commands for triggers, approvals, budgets, and settings

## Overview

Add 13 new CLI commands across 4 entity groups (triggers, approvals, budgets, settings) to close the CLI action parity gap. Commands use existing REST API via the CLI's `ApiClient`.

## Requirements Trace

- R1. Triggers: `list [--pipeline]`, `create <pipeline-id> --cron`, `toggle <id>`, `delete <id>`
- R2. Approvals: `list [--status]`, `approve <id> [--note]`, `reject <id> [--note]`
- R3. Budgets: `list`, `create --scope --limit`, `delete <id>`
- R4. Settings: `list`, `set <key> <value>`
- R5. All commands use existing REST API via `packages/cli/src/api-client.ts`
- R6. Commands registered in `packages/cli/src/index.ts`

## Scope Boundaries

- No new API routes — all endpoints already exist
- CLI output uses `formatTable` / `relativeTime` from existing `formatters.ts`
- No interactive prompts — all params via flags/args

## Key Technical Decisions

- **Extend CLI ApiClient, not MCP ApiClient**: The CLI has its own `ApiClient` in `packages/cli/src/api-client.ts` (separate from the MCP one). Add methods here.
- **One file per entity group**: Matches `commands/pipelines.ts`, `commands/packages.ts` pattern.
- **Commander subcommand pattern**: Each group registers via `registerXCommand(program, client)`.

## Implementation Units

- [ ] **Unit 1: Extend CLI ApiClient with trigger/approval/budget/settings methods**

**Files:** Modify: `packages/cli/src/api-client.ts`

**Approach:** Add typed methods matching REST routes for all 4 groups. Import `ApiTrigger`, `ApiApproval`, `ApiBudgetPolicy`, `ApiSetting` from `@pawn/shared`.

- [ ] **Unit 2: Triggers commands**

**Files:** Create: `packages/cli/src/commands/triggers.ts`

**Approach:** `triggers list [--pipeline <id>]`, `triggers create <pipeline-id> --cron <expr> [--timezone] [--input key=value]`, `triggers toggle <id>` (PATCH enabled=!current), `triggers delete <id>`. Use `formatTable` for list output.

- [ ] **Unit 3: Approvals commands**

**Files:** Create: `packages/cli/src/commands/approvals.ts`

**Approach:** `approvals list [--status pending|approved|rejected]`, `approvals approve <id> [--note]`, `approvals reject <id> [--note]`. Default status filter: pending.

- [ ] **Unit 4: Budgets commands**

**Files:** Create: `packages/cli/src/commands/budgets.ts`

**Approach:** `budgets list`, `budgets create --scope <type:id> --limit <cents>`, `budgets delete <id>`. Parse scope as `type:id` (e.g., `pipeline:abc123`).

- [ ] **Unit 5: Settings commands**

**Files:** Create: `packages/cli/src/commands/settings.ts`

**Approach:** `settings list`, `settings set <key> <value>`. Try JSON.parse on value, fall back to string.

- [ ] **Unit 6: Register all commands in index.ts**

**Files:** Modify: `packages/cli/src/index.ts`

**Approach:** Import and call `registerTriggersCommand`, `registerApprovalsCommand`, `registerBudgetsCommand`, `registerSettingsCommand`. Update description text.

## Sources & References

- Related issue: i75Corridor/pawn#36
- Pattern: `packages/cli/src/commands/pipelines.ts`
- Pattern: `packages/cli/src/commands/packages.ts`
