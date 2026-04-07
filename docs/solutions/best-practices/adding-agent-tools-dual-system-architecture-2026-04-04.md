---
title: "Adding Agent Tools to Dual-System Architecture (In-App + MCP)"
date: 2026-04-04
category: best-practices
module: agent-tools
problem_type: best_practice
component: tooling
severity: medium
applies_when:
  - Adding a new agent tool that must exist in both the in-app global agent and the MCP server
  - Extending an existing entity group with new tool actions across both systems
  - Introducing new WebSocket broadcast event types required by tool implementations
  - Working with services that require parameters not present in AgentToolContext
tags:
  - agent-tools
  - mcp
  - tool-registration
  - action-parity
  - websocket-broadcast
---

# Adding Agent Tools to Dual-System Architecture (In-App + MCP)

## Context

The pawn project exposes agent capabilities through two parallel tool systems:

1. **In-app global agent** — tools in `server/src/services/tools/`, with direct DB access via Drizzle ORM. Each tool is a factory function `make<Name>(ctx: AgentToolContext): ToolDefinition` with parameters defined using `Type.Object()` from `@mariozechner/pi-ai`.

2. **MCP server** — tools in `packages/mcp/src/tools/`, using an HTTP API client. Tools are registered in groups via `register<Group>Tools(server: McpServer, client: ApiClient)` with parameters as zod schema plain records.

When adding a batch of tools across multiple entity groups (triggers, approvals, budgets, packages, settings), the work decomposes into: infrastructure prep (first), parallel per-entity-group implementation (middle), and serial registration/prompt updates (last).

This guidance was developed while implementing issue #30 (adding 19 tools to bring action parity from 59% to 100%).

## Guidance

### 1. Infrastructure First — Extend Shared Types and API Client Before Any Tools

Before writing a single tool, complete all shared-layer extensions:

- **Widen `WsDataChanged` entity union** in `packages/shared/src/index.ts` to include new entity type literals
- **Add typed methods to `ApiClient`** in `packages/mcp/src/api-client.ts` matching every REST route the MCP tools will call
- **Widen `AgentToolContext.broadcast`** if in-app tools need to broadcast message types beyond the current union

### 2. AgentToolContext Type Widening — Update Both the Interface AND the Constructor

When a tool needs to broadcast a message type not currently in `AgentToolContext.broadcast`, you must update **two** locations:

```typescript
// 1. server/src/services/tools/context.ts
import type { WsGlobalAgentEvent, WsDataChanged, WsRunStatusChange } from "@pawn/shared";
export interface AgentToolContext {
  broadcast: (msg: WsGlobalAgentEvent | WsDataChanged | WsRunStatusChange) => void;
  // ...
}

// 2. server/src/services/global-agent.ts — constructor parameter must match
constructor(
  private db: Db,
  private broadcastFn: (msg: WsGlobalAgentEvent | WsDataChanged | WsRunStatusChange) => void,
  dataDir: string,
) { ... }
```

The underlying `ws.broadcast()` already accepts any `WsMessage` at runtime — only the TypeScript types need updating. Missing the constructor parameter is the common mistake: the interface compiles fine but the service instantiation fails.

### 3. Direct Import for One-Off Dependencies, Not Context Extension

If a tool needs a value (like `packagesDir`) that is not in `AgentToolContext` and is only needed by one tool group, import it directly:

```typescript
// In the tool file — import directly from paths.ts
import { packagesDir } from "../paths.js";

// Do NOT extend AgentToolContext for one-off needs.
// Reserve context extension for dependencies needed by many tool groups.
```

This follows the same pattern route handlers use.

### 4. In-App Tools Replicate Route Logic; MCP Tools Delegate

In-app tools operate on the DB directly (the established pattern). For complex state machines (e.g., approve/reject modifying approvals + pipelineRuns + stepRuns + broadcasting status changes), you must replicate the route handler's logic. This creates drift risk but maintains architectural consistency.

MCP tools avoid this entirely — they call the HTTP API, so the route handler logic runs exactly once.

### 5. Handle Unreachable Callbacks Gracefully

Some route handlers receive callbacks (e.g., `onModelChange()` passed to `createSettingsRouter()`) that exist only in closure scope and are not importable. The in-app tool cannot replicate these. Solution: do what you can (e.g., call `invalidateModelCostsCache()` directly), and accept that the MCP tool covers the full path via the HTTP route.

### 6. Parallelize Per-Entity-Group Work

Each entity group touches different files with no shared state. These units can be dispatched as parallel subagents. Only infrastructure (first) and registration/prompt integration (last) are serial dependencies.

## Why This Matters

- **Type widening mistakes** cause confusing compile errors in seemingly unrelated files (the service constructor, not the tool)
- **Forgetting infrastructure prep** means every parallel subagent hits the same missing types/methods and either blocks or creates merge conflicts
- **Over-extending `AgentToolContext`** bloats the interface and forces all tool groups to receive dependencies they don't use
- **Route logic drift** between in-app tools and route handlers is the primary maintenance risk — knowing it exists lets you proactively add comments or tests

## When to Apply

- Adding a new entity group's tools (both in-app and MCP)
- Extending an existing tool to broadcast a new message type
- Deciding whether to add a field to `AgentToolContext` vs. importing directly
- Planning multi-tool implementation work for parallel execution

## Examples

**Infrastructure checklist before parallel dispatch:**
1. `packages/shared/src/index.ts` — new entity literals in `WsDataChanged`
2. `packages/mcp/src/api-client.ts` — all new typed HTTP methods
3. `server/src/services/tools/context.ts` — widened `broadcast` type if needed
4. `server/src/services/global-agent.ts` — matching constructor parameter type

**In-app tool factory (standard pattern):**
```typescript
export function makeCreateTrigger(ctx: AgentToolContext): ToolDefinition {
  return {
    name: "create_trigger",
    label: "Create Trigger",
    description: "Create a new trigger for a pipeline.",
    parameters: Type.Object({
      pipelineId: Type.String({ description: "Pipeline ID" }),
      type: Type.Optional(Type.String({ description: "Trigger type: cron, webhook, or channel" })),
      cronExpression: Type.Optional(Type.String({ description: "Cron expression" })),
    }),
    execute: async (_id, params: { pipelineId: string; type?: string; cronExpression?: string }) => {
      const [row] = await ctx.db.insert(triggers).values({ ... }).returning();
      ctx.broadcastDataChanged("trigger", "created", row.id);
      return { content: [{ type: "text" as const, text: JSON.stringify(row, null, 2) }], details: {} };
    },
  };
}
```

**MCP tool group registration (standard pattern):**
```typescript
export function registerTriggerTools(server: McpServer, client: ApiClient): void {
  server.tool(
    "list_triggers",
    "List all triggers for a pipeline",
    { pipelineId: z.string().describe("Pipeline ID") },
    async ({ pipelineId }) => {
      try {
        const triggers = await client.listTriggers(pipelineId);
        return { content: [{ type: "text", text: triggers.map(formatTrigger).join("\n\n") }] };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Failed: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        };
      }
    },
  );
}
```

## Related

- Issue #30: Add agent tools for triggers, approvals, budgets, packages, and settings
- Issue #23: Create MCP endpoint in API (foundational MCP server)
- Issue #32: Add data_changed WebSocket listener in UI for real-time updates
- Plan: `docs/plans/2026-04-04-001-feat-agent-tool-parity-plan.md`
- Plan: `docs/plans/2026-04-03-001-feat-mcp-server-package-plan.md`
