---
title: Propagate new DB fields through all config construction sites
date: "2026-04-12"
category: best-practices
module: mcp-servers/oauth
problem_type: best_practice
component: tooling
severity: medium
applies_when:
  - Adding a new column or field to a database-backed entity
  - Implementing a cross-cutting feature (auth, logging, telemetry) that touches existing code paths
  - Extending a config/options object that is constructed in multiple places
  - Gating UI on data that may not be visible in the component's default render state
tags:
  - oauth
  - mcp
  - config-propagation
  - integration
  - field-omission
  - cross-cutting-concern
---

# Propagate new DB fields through all config construction sites

## Context

When implementing MCP Client OAuth 2.1 support across the TypeScript/Express/React stack (15+ files, 9 implementation units), two integration bugs emerged after the feature was built. Both shared a root cause: the new `oauthConfig` field was correctly added to the database schema and correctly consumed by downstream logic, but the intermediate code paths that bridge the two were never updated. The feature worked in unit-level thinking but broke at the seams.

**Bug 1**: Clicking "Test" on an OAuth-configured MCP server returned 401 because `oauthConfig` was not included in the config object passed to `pool.connect()`.

**Bug 2**: The "Connect with OAuth" button was never visible because the `OAuthConnectionCard` was gated behind an unrelated `expanded` state.

## Guidance

**When you add a new field to a persisted entity, grep every place that entity's config object is constructed — not just where it is consumed.**

Database columns are read in many places. If your ORM row is destructured or cherry-picked into a plain object before being passed to business logic, every such construction site must include the new field. The compiler will not catch omissions in optional/JSONB fields.

### Backend: propagate new fields through all config construction sites

Before (field omitted at construction):
```typescript
// server/src/routes/mcp-servers.ts — test endpoint
const tools = await pool.connect({
  id: row.id,
  name: row.name,
  transport: row.transport as "stdio" | "sse" | "streamable-http",
  command: row.command ?? undefined,
  args: (row.args as string[] | null) ?? [],
  url: row.url ?? undefined,
  headers: (row.headers as Record<string, string> | null) ?? {},
  env: (row.env as Record<string, string> | null) ?? {},
  // oauthConfig NOT included — silent failure
});
```

After:
```typescript
const tools = await pool.connect({
  id: row.id,
  name: row.name,
  transport: row.transport as "stdio" | "sse" | "streamable-http",
  command: row.command ?? undefined,
  args: (row.args as string[] | null) ?? [],
  url: row.url ?? undefined,
  headers: (row.headers as Record<string, string> | null) ?? {},
  env: (row.env as Record<string, string> | null) ?? {},
  oauthConfig: (row.oauthConfig as {
    clientId: string; clientSecret?: string; scopes?: string[];
  } | null) ?? undefined,
});
```

### Frontend: do not gate primary actions behind secondary interactions

Before (OAuth button hidden until row is expanded):
```tsx
{expanded && (server.transport === "sse" || server.transport === "streamable-http") && (
  <OAuthConnectionCard server={server} />
)}
```

After (visible whenever applicable):
```tsx
{(server.transport === "sse" || server.transport === "streamable-http") && server.oauthConfig && (
  <OAuthConnectionCard server={server} />
)}
```

## Why This Matters

1. **Silent failures are the most expensive bugs.** The `oauthConfig` omission produced a 401 at runtime with no build error, no type error, and no test failure — the field was optional, so TypeScript was satisfied with `undefined`. The only signal was the HTTP error from the remote server.

2. **Users cannot act on what they cannot see.** The OAuth connect button was the single entry point for the entire OAuth flow. Hiding it behind an expand toggle meant users would fail to authenticate until they discovered the hidden panel by accident.

3. **Cross-cutting features have multiplicative integration surface.** A feature touching N endpoints and M UI components has N+M potential omission sites. Each one is an independent failure mode that will not surface until that specific code path executes with real data.

## When to Apply

- You are adding a column to a database table and the corresponding entity is read in more than one route or service method
- You are building a feature that modifies a shared config/options type, especially when the type uses optional fields or JSONB
- You are adding UI for a new capability — ask whether the user needs to discover it or whether it should be immediately visible
- You are working in a codebase where entity objects are constructed via manual field-picking rather than spread or ORM hydration (the risk is highest here because the compiler cannot enforce completeness on partial object literals with optional properties)

## Examples

### Example 1: Backend config propagation

**Symptom**: `StreamableHTTPError: {"error":"invalid_token","error_description":"Missing Authorization header"}`

**Investigation**: `McpClientPool.connect()` correctly checked `config.oauthConfig` and created an auth provider when present. The `mcp_servers` table had `oauthConfig` populated. The gap was in `server/src/routes/mcp-servers.ts` where the config object was constructed by cherry-picking fields from the DB row — `oauthConfig` was not listed.

**Prevention**: After adding any new field, run `grep -rn 'id: row.id'` (or equivalent pattern for your entity construction) to find every site that builds the config object. Each one needs the new field.

### Example 2: UI visibility

**Symptom**: Users never saw the "Connect with OAuth" button.

**Investigation**: `OAuthConnectionCard` was rendered inside `{expanded && ...}` in `McpServerRow`. The row defaults to collapsed. The OAuth card was the primary action for OAuth-configured servers, not supplementary detail.

**Prevention**: When a new feature's primary CTA is placed inside an existing container, verify that the container's default visibility matches the action's importance. Primary actions belong at the top level; supplementary details can live behind expand/collapse.

## Related

- `docs/solutions/best-practices/adding-agent-tools-dual-system-architecture-2026-04-04.md` — covers tool-level parity (registration in both in-app and MCP systems); complementary pattern for feature propagation
- `docs/solutions/best-practices/database-config-file-based-override-2026-04-06.md` — covers config *sourcing* (file → env → DB resolution); this doc covers config *consumption* (ensuring new fields reach all consumers)
- i75Corridor/pawn#64 — MCP client OAuth support feature that prompted these learnings
- i75Corridor/pawn#63 — MCP client HTTP custom headers (same pattern: new fields that must propagate)
