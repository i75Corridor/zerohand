# Zerohand

<p align="center">
  <img src=".github/zerohand-v4.svg" width="300" alt="Zerohand" />
</p>

An agentic workflow orchestrator built on [pi.dev](https://github.com/badlogic/pi-mono). Define pipelines as YAML packages, configure workers, schedule them with cron triggers, gate steps behind human approvals, enforce budget caps — and watch runs execute in real-time through the web portal.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Web UI (React)                        │
│  Dashboard │ Pipelines │ Workers │ Approvals │ Run Detail    │
└─────────────────┬───────────────────┬───────────────────────┘
                  │ REST + WebSocket  │
┌─────────────────┴───────────────────┴───────────────────────┐
│                      Server (Express)                         │
│  Execution Engine │ Trigger Manager │ Budget Guard           │
│  Approval Service │ REST API │ WebSocket                     │
└────────┬──────────────────────────────┬─────────────────────┘
         │                              │
┌────────┴────────┐    ┌────────────────┴────────────────────┐
│  PostgreSQL     │    │  Pi.dev Execution Layer              │
│  (embedded dev) │    │  Sessions │ Skills │ Tools           │
└─────────────────┘    └─────────────────────────────────────┘
```

**Monorepo packages:**

| Package | Description |
|---------|-------------|
| `packages/db` | Drizzle ORM schema + migration client |
| `packages/shared` | Shared API types, status enums, WebSocket message types |
| `server` | Express API + embedded PostgreSQL + execution engine |
| `ui` | React + Vite + TailwindCSS operator dashboard |

See [`docs/`](./docs) for detailed component documentation.

---

## Quick Start

### Prerequisites

- Node.js >= 20.6
- pnpm >= 10
- Gemini API key

### Option A — Local dev (embedded PostgreSQL)

```bash
git clone <repo>
cd zerohand
cp .env.example .env
# Add your GEMINI_API_KEY to .env

pnpm install        # postinstall auto-configures embedded-postgres
pnpm db:generate    # generate SQL migrations from schema
pnpm dev            # starts server on :3009 + UI on :3008
```

Open `http://localhost:3008`. The Daily Absurdist pipeline seeds automatically on first boot.

### Option B — Docker Compose

```bash
cp .env.example .env
# Add your GEMINI_API_KEY to .env

docker compose up -d
```

Open `http://localhost:8080`. API at `http://localhost:3009`.

### Run a pipeline

1. Go to **Pipelines** → click **Run** next to "The Daily Absurdist"
2. Enter a topic (e.g. `"AI replacing middle managers"`)
3. Click **Run Pipeline** → redirected to Run Detail
4. Watch steps execute in real-time

---

## Features

### Pipelines
Define multi-step workflows as YAML packages. Each step references a worker, a prompt template, and optional configuration. Steps execute sequentially; outputs are accessible in downstream prompt templates via `{{steps.N.output}}`.

### Workers
Three built-in worker types:
- **`pi`** — LLM agent via pi.dev (Gemini, Claude, GPT). Loads skills and custom tools.
- **`imagen`** — Google Imagen image generation
- **`publish`** — Assembles and writes a markdown file to disk

### Cron Triggers
Schedule pipelines to run automatically. Set a cron expression, timezone, and default inputs — the trigger manager fires the pipeline at the scheduled time.

### Human-in-the-Loop Approvals
Mark any pipeline step with `approvalRequired: true`. The run pauses at that step, an approval request appears in the Approvals page (with a live badge count in the sidebar), and the run resumes only after a human approves. Approvals can include an optional note.

### Budget Enforcement
Set monthly spending caps per worker or per pipeline. The budget guard checks the cap before each `pi` step. If the hard stop threshold is exceeded, the step (and run) fails with a clear error. Cost events are recorded after each step with real token counts.

### Session Persistence
Pi.dev agent sessions are persisted per (worker, run) pair. Workers can resume their context across steps if needed. Session directories are stored in `DATA_DIR/sessions/` and tracked in the `worker_sessions` table.

### Real-time Streaming
All step events stream to the UI over WebSocket as they happen — text deltas, tool calls, status changes. Step cards in Run Detail expand when running and collapse automatically on completion.

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GEMINI_API_KEY` | Yes | — | Google API key (Gemini + Imagen) |
| `ANTHROPIC_API_KEY` | No | — | Anthropic API key |
| `OPENAI_API_KEY` | No | — | OpenAI API key |
| `PORT` | No | `3009` | HTTP server port |
| `DATA_DIR` | No | `server/.data` | Embedded Postgres data + session storage |
| `PIPELINES_DIR` | No | `../pipelines` | Pipeline package directory |
| `SKILLS_DIR` | No | `../skills` | Pi.dev skills directory |
| `OUTPUT_DIR` | No | `../output` | Generated file output directory |

---

## Useful Scripts

```bash
pnpm dev          # start server + UI in parallel
pnpm db:generate  # regenerate SQL migrations from schema
pnpm db:reset     # wipe embedded postgres data (next dev re-seeds)
pnpm typecheck    # typecheck all packages
```

---

## File Structure

```
zerohand/
├── pipelines/                         # Pipeline packages (YAML config)
│   └── daily-absurdist/
│       ├── pipeline.yaml              # Manifest: workers, steps, inputSchema
│       ├── COMPANY.md                 # Context file (interpolated into prompts)
│       └── prompts/                   # System prompt files per worker
├── skills/                            # Pi.dev SKILL.md files
│   ├── research/SKILL.md
│   ├── writer/SKILL.md
│   └── editor/SKILL.md
├── packages/
│   ├── db/src/schema/                 # Drizzle schema (all tables)
│   └── shared/src/index.ts            # Shared API + WS types
├── server/src/
│   ├── index.ts                       # Bootstrap: Postgres, Express, Engine
│   ├── seed.ts                        # Config-driven pipeline seeder
│   ├── routes/                        # REST API handlers
│   │   ├── workers.ts
│   │   ├── pipelines.ts
│   │   ├── runs.ts
│   │   ├── triggers.ts
│   │   ├── approvals.ts
│   │   └── budgets.ts
│   ├── services/
│   │   ├── execution-engine.ts        # Pipeline run orchestration
│   │   ├── pi-executor.ts             # Pi.dev session bridge
│   │   ├── builtin-workers.ts         # imagen + publish worker types
│   │   ├── trigger-manager.ts         # Cron scheduler
│   │   └── budget-guard.ts            # Budget checks + cost recording
│   └── ws/index.ts                    # WebSocket broadcast manager
└── ui/src/
    ├── pages/                         # Dashboard, Pipelines, Approvals, RunDetail
    └── lib/                           # API client, WebSocket hook
```

---

## Roadmap

See [ROADMAP.md](./ROADMAP.md) for the full phased implementation plan with detailed feature breakdowns, file references, and verification steps.

**Next up: Phase 4 — Global Agent Chat Interface** (persistent AI assistant accessible from every page).

