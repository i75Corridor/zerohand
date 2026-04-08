# Architecture

## Overview

Pawn is a monorepo agentic workflow orchestrator. Pipelines are defined as YAML blueprints, stored in a directory, and seeded into PostgreSQL on startup. The execution engine polls for queued runs, resolves prompt templates, dispatches work to the appropriate worker type, and streams events back to the UI over WebSocket.

The control plane adds scheduling (cron triggers), human approval gates, and budget enforcement on top of the core execution loop.

```
┌────────────────────────────────────────────────────────────────────┐
│                           Web UI (React)                            │
│  Dashboard │ Pipelines │ Builder │ Approvals │ Run Detail │ Settings│
└──────────────────────────┬─────────────────────────────────────────┘
                           │ REST + WebSocket (port 3009)
┌──────────────────────────┴─────────────────────────────────────────┐
│                         Server (Express)                            │
│                                                                     │
│  ┌──────────────────────────┐   ┌──────────────────────────────┐   │
│  │     Execution Engine     │   │          REST API            │   │
│  │  polls every 2s          │   │  /api/pipelines (+validate,  │   │
│  │  runs steps in sequence  │   │    versions, restore)        │   │
│  │  budget check            │   │  /api/runs (+resume, rerun)  │   │
│  │  approval gates          │   │  /api/mcp-servers            │   │
│  │  session persistence     │   │  /api/blueprints (+preview)  │   │
│  │  MCP client pool         │   │  /api/triggers               │   │
│  │  step-by-step mode       │   │  /api/approvals              │   │
│  └──────────┬───────────────┘   │  /api/budgets                │   │
│             │                   └──────────────────────────────┘   │
│  ┌──────────┴──────────────┐   ┌──────────────────────────────┐   │
│  │    Trigger Manager      │   │      WebSocket Manager       │   │
│  │  polls every 30s        │   │  broadcasts to all clients   │   │
│  │  fires cron runs        │   └──────────────────────────────┘   │
│  └─────────────────────────┘                                       │
│                                                                     │
│  ┌─────────────────────────┐   ┌──────────────────────────────┐   │
│  │    Global Agent         │   │    Validation Engine         │   │
│  │  pipeline authoring     │   │  validate_pipeline tool +    │   │
│  │  skill/script CRUD      │   │  POST /api/pipelines/:id/    │   │
│  │  MCP server queries     │   │  validate                    │   │
│  └─────────────────────────┘   └──────────────────────────────┘   │
└───────────────────────────┬────────────────────────────────────────┘
                            │
   ┌────────────────────────┴────────────────────────────┐
   │                                                      │
┌──┴──────────────┐   ┌──────────────────────────────┐   │
│   PostgreSQL    │   │   Pi.dev SDK                 │   │
│   (embedded     │   │   createAgentSession()        │   │
│    or external) │   │   loadSkillsFromDir()         │   │
└─────────────────┘   │   ToolDefinition (tools)      │   │
                      └──────────────────────────────┘   │
                                                          │
              ┌───────────────────────────────────────────┘
              │
   ┌──────────┴───────────────────────────────────────────┐
   │                    File System                        │
   │   pipelines/   skills/<ns>/<name>/   output/         │
   │   sessions/    packages/                              │
   └───────────────────────────────────────────────────────┘

              ┌───────────────────────────────────────────┐
              │         External MCP Servers              │
              │   (stdio / SSE / Streamable HTTP)         │
              │   connected per-run via McpClientPool     │
              └───────────────────────────────────────────┘
```

---

## Packages

### `packages/db`

Drizzle ORM schema and migration client. Exports:

- `createDb(url)` — creates a Drizzle client with all relations wired up
- `applyPendingMigrations(url)` — runs any unapplied SQL migrations
- `ensurePostgresDatabase(rootUrl, dbName)` — creates the DB if it doesn't exist
- All schema tables as named exports (`workers`, `pipelines`, `pipelineSteps`, `triggers`, `approvals`, `budgetPolicies`, `costEvents`, `workerSessions`, etc.)

### `packages/shared`

TypeScript interfaces shared between server and UI:

- API response types (`ApiPipeline`, `ApiPipelineRun`, `ApiStepRun`, `ApiTrigger`, `ApiApproval`, `ApiBudgetPolicy`, `ApiMcpServer`, `ApiMcpTool`, `ApiValidationResult`, `ApiPipelineVersion`, `ApiBlueprintPreview`, etc.)
- WebSocket message types (`WsMessage`, `WsStepEvent`, etc.)
- Status enums (`PipelineRunStatus`, `StepRunStatus`)
- YAML serialization: `pipelineToYaml()` (converts `ApiPipeline` → YAML string for export)

### `server`

Express application. Responsibilities:

- Boots embedded PostgreSQL (or connects to external via `DATABASE_URL`)
- Applies migrations and seeds pipeline blueprints on startup
- Starts the execution engine (polls every 2s for queued runs)
- Starts the trigger manager (polls every 30s for due cron triggers)
- Starts the global agent (LLM with pipeline-authoring tools)
- Serves REST API and WebSocket

Key services:
- `execution-engine.ts` — run lifecycle, MCP pool, step-by-step mode
- `mcp-client.ts` — `McpClientPool` for stdio/SSE/HTTP connections
- `mcp-tool-bridge.ts` — converts MCP tools to pi `ToolDefinition` objects
- `tools/validate-pipeline.ts` — static validation engine (used by API + agent)
- `global-agent.ts` — global LLM agent with pipeline/skill/run authoring tools

### `ui`

React + Vite + TailwindCSS single-page app. Talks to the server via REST (React Query) and WebSocket for live step streaming. Key pages:

- **Dashboard** — recent runs, overall status
- **Pipelines** — list pipelines, trigger manual runs, manage cron triggers
- **PipelineDetail** — DAG view, validation panel, version history, export/preview/publish
- **PipelineBuilder** — drag-and-drop step editor with inline validation dots and token highlighting
- **Approvals** — pending approval queue with live badge in sidebar nav
- **Run Detail** — step-by-step progress with real-time streaming, step-by-step mode controls, re-run buttons
- **Settings** — MCP server registry management (add, test, enable/disable)

---

## Data Flow: Manual Run

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
  1. Skip if already completed (resume support)
  2. Check approval_required → create approval record, pause run if gate needed
  3. Check budget (budget-guard) → fail step if hard stop exceeded
  4. Resolve prompt template ({{input.*}}, {{steps.N.output.*}})
  5. Dispatch by step type:
       skill-based  → skill-loader.ts loads SKILL.md + scripts, then:
                       pi      → pi-executor.runSkillStep (pipeline + skill system prompt, script tools)
                       imagen  → builtin-workers.ts (Google Imagen API)
                       publish → builtin-workers.ts (writes markdown to disk)
       worker-based → pi-executor.runWorkerStep / builtin-workers.ts (legacy)
  6. Stream events → step_run_events table + WebSocket
  7. Record cost event (pi steps only)
  8. Capture output, mark step "completed"

All steps done:
  → marks run "completed"
  → broadcasts run_status via WebSocket
```

## Data Flow: Cron Trigger

```
TriggerManager tick (every 30s)
  → queries triggers WHERE enabled = true AND next_run_at <= now()
  → for each due trigger:
      → creates pipeline_run (status: queued, trigger_type: "cron")
      → updates trigger: last_fired_at = now(), next_run_at = computeNextRun(expression)
      → broadcasts trigger_fired via WebSocket
  → Execution Engine picks up the queued run normally
```

## Data Flow: Approval Gate

```
Execution Engine hits a step with approval_required = true
  → creates approval record (status: "pending")
  → marks pipeline_run status: "paused"
  → returns (engine stops processing this run)

User visits Approvals page
  → sees pending card with pipeline name, step name, payload
  → clicks "Approve" (optional: adds a note)
  → POST /api/approvals/:id/approve

Approval route handler
  → updates approval status: "approved", records note + decided_at
  → re-queues pipeline_run (status: "queued")
  → broadcasts run_status via WebSocket

Execution Engine (next tick)
  → picks up re-queued run
  → loads existing step_runs, populates stepOutputs from completed steps
  → skips completed steps, continues from the approved step
```

---

## Execution Model

Each pipeline step executes via either a **skill** (new) or a **worker** (legacy):

### Skill-based steps (recommended)
Steps reference a skill by name. Skills are folders in `SKILLS_DIR`:
- `SKILL.md` — frontmatter (name, type, model override) + body (system prompt appended to the pipeline system prompt)
- `scripts/` — executable files (`.js`, `.ts`, `.py`, `.sh`) that become tools the LLM can call

Skill types:
| Type | What it does |
|------|-------------|
| `pi` (default) | Runs a pi.dev agent session with pipeline + skill system prompt and script tools |
| `imagen` | Calls Google Imagen API with the resolved prompt |
| `publish` | Writes article + image to a `.md` file on disk |

### Worker-based steps (legacy, backwards compatible)
Steps reference a worker DB record. Workers have their own model, system prompt, and tool config.

| Type | What it does | Output |
|------|-------------|--------|
| `pi` | Runs a pi.dev agent session with the resolved prompt | Agent's final assistant text |
| `imagen` | Calls Google Imagen API with the resolved prompt as the image prompt | Absolute path to saved `.png` |
| `publish` | Writes the resolved prompt (article text) + image from a prior step to a `.md` file | Absolute path to saved `.md` |

---

## Key Design Decisions

**Pipeline blueprints over DB-only config** — Pipelines are defined in `pipelines/<name>/pipeline.yaml`. This makes them version-controllable, shareable as blueprints, and editable without a UI. The seeder detects changes via a SHA-256 content hash and re-seeds automatically on restart.

**Embedded PostgreSQL for local dev** — Zero setup. The server starts its own Postgres process on first boot. Set `DATABASE_URL` to use external Postgres (e.g. Docker Compose).

**Pi.dev as the LLM execution layer** — Handles model routing, auth, session management, skill injection, and tool calling. Pawn wraps it in `pi-executor.ts` and adds its own tool definitions (web search).

**Polling over event-driven scheduling** — The execution engine polls every 2 seconds for queued runs; the trigger manager polls every 30 seconds for due cron triggers. Simple, reliable, easy to debug.

**Resume on re-queue** — When a paused run is re-queued (after approval), the engine reloads all existing step_runs and repopulates outputs from completed ones. Steps that already completed are skipped; execution picks up at the next pending step.

**WebSocket broadcast to all clients** — No per-connection subscriptions. All connected clients receive all events; the UI filters by `pipelineRunId`.

**Cost recording after every pi step** — `cost_events` are inserted with real token counts from the pi session's usage object. Budget checks query this table before each step.

**Skill namespacing** — Skills are stored in `SKILLS_DIR/<namespace>/<skill-name>/`. The `local` namespace is for in-app skills; imported blueprints use the blueprint slug as namespace. This prevents naming collisions across blueprints.

**MCP server pool per run** — A `McpClientPool` is created at the start of each pipeline run and torn down (success or failure) in the `finally` block. Connections are established lazily (only for skills that declare them in `mcpServers` frontmatter) and reused across steps.

**Auto-snapshot before destructive edits** — Any `PATCH` or `DELETE` on a pipeline or its steps saves a full JSON snapshot to `pipeline_versions` before applying the change. This gives every pipeline a browsable, restorable history with no extra user action.

**Static validation separate from execution** — The `validate_pipeline` logic is a pure function with no LLM calls. It can be called from the REST API, the agent tool, or the PipelineBuilder after save — all sharing the same implementation.

**Blueprint preview without side effects** — `POST /api/blueprints/preview` serializes the pipeline to YAML and reads skill files from disk but writes nothing. This lets the UI show exactly what an export would produce before committing.
