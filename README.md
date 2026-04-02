# Zerohand

<p align="center">
  <img src=".github/zerohand.svg" width="300" alt="Zerohand" />
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
| `packages/cli` | `zerohand` CLI — manage pipelines, runs, and packages from the terminal |
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

### Run a pipeline (web)

1. Go to **Pipelines** → click **Run** next to "The Daily Absurdist"
2. Enter a topic (e.g. `"AI replacing middle managers"`)
3. Click **Run Pipeline** → redirected to Run Detail
4. Watch steps execute in real-time

### Run a pipeline (CLI)

Install the CLI globally (published to GitHub Packages):

```bash
# Configure the @zerohand scope once (needs read:packages PAT)
export NODE_AUTH_TOKEN=<your-github-pat>
npm config set @zerohand:registry https://npm.pkg.github.com
npm config set //npm.pkg.github.com/:_authToken ${NODE_AUTH_TOKEN}

npm install -g @zerohand/cli
```

Point it at your server (default is `http://localhost:3009`):

```bash
zerohand config set server http://localhost:3009
```

Trigger a run and stream output:

```bash
zerohand run "The Daily Absurdist" --input topic="AI hype" --watch
```

Scaffold a new pipeline package:

```bash
zerohand new my-pipeline
```

See [`docs/cli.md`](./docs/cli.md) for the full command reference.

---

## Features

### Pipelines
Define multi-step workflows as YAML packages. Each step references a skill or worker, a prompt template, and optional configuration. Steps execute sequentially; outputs are accessible in downstream prompt templates via `{{steps.N.output}}`.

### Skill-based Execution
Skills are folders in `SKILLS_DIR` with a `SKILL.md` (system prompt + frontmatter) and an optional `scripts/` directory of executable tools. Each skill runs as a `pi` LLM agent session using the pipeline's configured model. Specialized capabilities like image generation and publishing are provided by external skill packages rather than built into the server.

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
pnpm dev                          # start server + UI in parallel
pnpm db:generate                  # regenerate SQL migrations from schema
pnpm db:reset                     # wipe embedded postgres data (next dev re-seeds)
pnpm typecheck                    # typecheck all packages
pnpm --filter @zerohand/cli build # build the CLI binary
```

---

## File Structure

```
zerohand/
├── pipelines/                         # Pipeline packages (YAML config)
│   └── daily-absurdist/
│       ├── pipeline.yaml              # Manifest: model, steps (skill-based), inputSchema
│       └── COMPANY.md                 # Context file (interpolated into skill prompts)
├── skills/                            # Skill definitions (SKILL.md + scripts/)
│   ├── researcher/
│   │   ├── SKILL.md                   # Frontmatter (name, type) + system prompt body
│   │   └── scripts/
│   │       └── web_search.js          # Tool: read JSON from stdin, write result to stdout
│   ├── writer/SKILL.md
│   ├── editor/SKILL.md
│   ├── imagen/SKILL.md
│   └── publisher/SKILL.md
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

Tracked on the [i75Corridor project board](https://github.com/orgs/i75Corridor/projects/8/views/1).

