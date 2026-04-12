# AGENTS.md

This file provides guidance to AI coding agents when working with code in this repository.

## Commands

```bash
pnpm dev                        # Start server (3009) + UI (3008) concurrently
pnpm build                      # Build all: db → server → ui → cli → mcp
pnpm typecheck                  # TypeScript check all packages
pnpm test                       # Run vitest across server + cli
pnpm test:watch                 # Watch mode for server tests
pnpm --filter server test       # Server tests only
pnpm db:generate                # Generate Drizzle migration SQL from schema changes
pnpm db:reset                   # Wipe embedded postgres data (reinits on next dev)
pnpm reset                      # Full .data directory reset
```

Pre-push hook (lefthook) runs sequentially: typecheck → test → build. All must pass before push.

## Architecture

Pawn is an agentic workflow orchestrator built on [pi.dev](https://github.com/badlogic/pi-mono). pnpm monorepo with 6 workspaces:

| Package | Scope | Purpose |
|---------|-------|---------|
| `packages/db` | `@pawn/db` | Drizzle ORM schema, migrations, postgres client |
| `packages/shared` | `@pawn/shared` | API types (`Api*` interfaces), status enums, WS message types |
| `server` | — | Express API, embedded postgres, execution engine, services |
| `ui` | — | React SPA (Vite, Tailwind, React Query, React Router) |
| `packages/cli` | `@i75corridor/pawn-cli` | CLI tool: manage pipelines/runs/approvals from terminal |
| `packages/mcp` | `@i75corridor/pawn-mcp` | MCP server: expose Pawn as tools/resources for AI assistants |

### Server startup (`server/src/index.ts`)
1. Load `.env` via custom `env-loader.ts`
2. Initialize OAuth encryption key → `DATA_DIR/oauth-encryption.key`
3. Start postgres: `DATABASE_URL` env → `database.json` in `.data/` → embedded postgres
4. Auto-apply migrations from `packages/db/src/migrations/`
5. Register Express routers on `/api/*`, WebSocket on `/ws`
6. Init services: ExecutionEngine, TriggerManager, GlobalAgentService, Ollama polling, OAuth refresh polling
7. Cleanup expired OAuth pending flows

### Execution engine (`server/src/services/execution-engine.ts`)
Pipeline runs execute steps sequentially. Each step: resolve prompt template (`{{input.key}}`, `{{steps.N.output}}`, `{{secret.VAR}}`) → check approval gate → check budget → execute via Pi.dev agent session (with skill system prompt + tools) → stream events via WebSocket → record cost.

### Dual tool system
Agent tools exist in two parallel systems that must stay in sync:
- **In-app tools** (`server/src/services/tools/`): Direct Drizzle ORM access, `ToolDefinition` from pi-ai
- **MCP tools** (`packages/mcp/src/tools/`): Delegate to HTTP API via `ApiClient`, zod schema records

When adding new tools, infrastructure changes come first (shared types, ApiClient methods, WsDataChanged entity union), then parallel implementation in both systems. See `docs/solutions/best-practices/adding-agent-tools-dual-system-architecture-2026-04-04.md`.

### MCP client (`server/src/services/mcp-client.ts`)
`McpClientPool` connects to external MCP servers, bridges their tools to the Pi.dev agent. Supports OAuth 2.1 via the SDK's `authProvider` option on HTTP transports. Pool requires `setDb(db)` to enable OAuth token lookup.

### Database
- **Embedded postgres** (dev): auto-managed in `.data/postgres/`, auto-detected port
- **External postgres**: `DATABASE_URL` env var or `database.json` in `.data/`
- Migrations auto-apply on startup via `applyPendingMigrations()`

## Code Conventions

### TypeScript / Imports
- ESM throughout (`"type": "module"`). **Always use `.js` extensions** in local imports.
- Target ES2023 (server), ES2020 (UI). Strict mode enabled.
- Workspace imports: `import { mcpServers } from "@pawn/db"`

### Database (Drizzle ORM)
- Schema files: `packages/db/src/schema/`, one file per entity, re-exported from `index.ts`
- UUIDs as PKs: `uuid("id").primaryKey().defaultRandom()`
- Timestamps: `timestamp("created_at", { withTimezone: true }).notNull().defaultNow()`
- JSONB columns typed: `jsonb("field").$type<SomeType>()`
- Text columns for enums (not postgres enums)
- FKs with cascade: `.references(() => table.id, { onDelete: "cascade" })`
- Migration workflow: edit schema → `pnpm db:generate` → SQL file created → auto-applied on next startup

### API routes (`server/src/routes/`)
- Factory functions: `makeFooRouter(db): Router` or `createFooRouter(db): Router`
- Mounted at `/api` prefix in `server/src/index.ts`
- Standard REST: GET list, GET `:id`, POST create, PATCH update, DELETE
- Row → API type mapping via `rowToApi()` helpers
- All response types prefixed `Api*` in `@pawn/shared`
- Errors: 400 validation, 404 not found, 409 conflict, 502 upstream failure

### Frontend (`ui/src/`)
- React Query: `useQuery` with descriptive `queryKey`, `useMutation` with `onSuccess: () => queryClient.invalidateQueries()`
- API client: `ui/src/lib/api.ts` — typed methods wrapping fetch, `ApiError` class
- Design tokens: `pawn-gold-*`, `pawn-surface-*` colors; `rounded-card`, `rounded-button` radii; `text-pawn-text-primary`, `text-pawn-text-secondary`
- Icons: lucide-react
- WebSocket: `ui/src/lib/ws.ts` with `useDataChangedListener` hook for real-time updates
- Pages lazy-loaded via React Router

### Config file convention
New config files follow the `DATA_DIR` + JSON file pattern (see `database.json`, `providers.json`). Env var always overrides file. Fail-fast on malformed security config — never fall through to insecure defaults. Mask secrets at the API boundary before any response leaves the server.

## Key Integration Points

When adding a new field to a database table, **grep every place the entity's config object is constructed** — not just where it's consumed. The compiler won't catch omissions in optional/JSONB fields. See `docs/solutions/best-practices/mcp-oauth-config-propagation-through-all-code-paths-2026-04-12.md`.

When adding UI for a new feature, verify the component's default visibility matches the action's importance. Primary CTAs belong at the top level; supplementary details can live behind expand/collapse.

## Documented Solutions

`docs/solutions/` contains documented solutions to past problems (bugs, best practices, workflow patterns), organized by category with YAML frontmatter (`module`, `tags`, `problem_type`). Search here before implementing features or debugging in documented areas.
