# Architecture

## Overview

Zerohand is a monorepo agentic workflow orchestrator. Pipelines are defined as YAML packages, stored in a directory, and seeded into PostgreSQL on startup. The execution engine polls for queued runs, resolves prompt templates, dispatches work to the appropriate worker type, and streams events back to the UI over WebSocket.

```
┌──────────────────────────────────────────────────────────────┐
│                         Web UI (React)                        │
│   Dashboard  │  Pipelines  │  Workers  │  Run Detail          │
└──────────────────────┬───────────────────────────────────────┘
                       │ REST + WebSocket (port 3009)
┌──────────────────────┴───────────────────────────────────────┐
│                       Server (Express)                        │
│                                                               │
│  ┌─────────────────────┐   ┌──────────────────────────────┐  │
│  │   Execution Engine  │   │         REST API             │  │
│  │  polls every 2s     │   │  /api/workers                │  │
│  │  runs steps in seq  │   │  /api/pipelines              │  │
│  └────────┬────────────┘   │  /api/runs                   │  │
│           │                └──────────────────────────────┘  │
│  ┌────────┴────────────┐   ┌──────────────────────────────┐  │
│  │   Worker Dispatch   │   │       WebSocket Manager      │  │
│  │  pi / imagen /      │   │  broadcasts to all clients   │  │
│  │  publish            │   └──────────────────────────────┘  │
│  └────────┬────────────┘                                      │
└───────────┼──────────────────────────────────────────────────┘
            │
   ┌────────┴─────────────────────────────────────────┐
   │                                                   │
┌──┴──────────────┐   ┌─────────────────────────────┐ │
│   PostgreSQL    │   │   Pi.dev SDK                │ │
│   (embedded     │   │   createAgentSession()      │ │
│    or external) │   │   loadSkillsFromDir()       │ │
└─────────────────┘   │   ToolDefinition (tools)    │ │
                      └─────────────────────────────┘ │
                                                       │
              ┌────────────────────────────────────────┘
              │
   ┌──────────┴──────────────────────────────────────┐
   │              File System                         │
   │   pipelines/   skills/   output/                │
   └─────────────────────────────────────────────────┘
```

---

## Packages

### `packages/db`

Drizzle ORM schema and migration client. Exports:

- `createDb(url)` — creates a Drizzle client with all relations wired up
- `applyPendingMigrations(url)` — runs any unapplied SQL migrations
- `ensurePostgresDatabase(rootUrl, dbName)` — creates the DB if it doesn't exist
- All schema tables as named exports (`workers`, `pipelines`, `pipelineSteps`, etc.)

### `packages/shared`

TypeScript interfaces shared between server and UI:

- API response types (`ApiPipeline`, `ApiPipelineRun`, `ApiStepRun`, etc.)
- WebSocket message types (`WsMessage`, `WsStepEvent`, etc.)
- Status enums (`PipelineRunStatus`, `StepRunStatus`)

### `server`

Express application. Responsibilities:

- Boots embedded PostgreSQL (or connects to external via `DATABASE_URL`)
- Applies migrations and seeds pipeline packages on startup
- Serves REST API and WebSocket
- Runs the execution engine

### `ui`

React + Vite + TailwindCSS single-page app. Talks to the server via REST (React Query) and WebSocket for live step streaming.

---

## Data Flow: Triggering a Run

```
User clicks "Run Pipeline"
  → POST /api/runs { pipelineId, inputParams }
  → creates pipeline_run row (status: queued)
  → returns { id }
  → UI navigates to /runs/:id

Execution Engine (polling every 2s)
  → finds queued run
  → marks run as "running"
  → broadcasts run_status via WebSocket

For each pipeline step (in order):
  → creates step_run row
  → resolves prompt template ({{input.*}}, {{steps.N.output.*}})
  → dispatches to worker type:
      pi      → pi-executor.ts (createAgentSession)
      imagen  → builtin-workers.ts (Google Imagen API)
      publish → builtin-workers.ts (writes markdown to disk)
  → streams events to step_run_events table + WebSocket
  → captures output, marks step "completed"

All steps done:
  → marks run "completed"
  → broadcasts run_status via WebSocket
```

---

## Worker Types

| Type | What it does | Output |
|------|-------------|--------|
| `pi` | Runs a pi.dev agent session with the resolved prompt | Agent's final assistant text |
| `imagen` | Calls Google Imagen API with the resolved prompt as the image prompt | Absolute path to saved `.png` |
| `publish` | Writes the resolved prompt (article text) + image from a prior step to a `.md` file | Absolute path to saved `.md` |

See [`workers.md`](./workers.md) for full configuration reference.

---

## Key Design Decisions

**Pipeline packages over DB-only config** — Pipelines are defined in `pipelines/<name>/pipeline.yaml`. This makes them version-controllable, shareable as packages, and editable without a UI. The seeder detects changes via a content hash and re-seeds automatically on restart.

**Embedded PostgreSQL for local dev** — Zero setup. The server starts its own Postgres process on first boot. Set `DATABASE_URL` to use external Postgres (e.g. Docker Compose).

**Pi.dev as the LLM execution layer** — Handles model routing, auth, session management, skill injection, and tool calling. Zerohand wraps it in `pi-executor.ts` and adds its own tool definitions (web search).

**Polling over event-driven scheduling** — The execution engine polls every 2 seconds for queued runs. Simple, reliable, easy to debug. Sufficient for the current workload.

**WebSocket broadcast to all clients** — No per-connection subscriptions. All connected clients receive all events; the UI filters by `pipelineRunId`.
