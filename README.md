# Zerohand

<p align="center">
  <img src=".github/zerohand-v4.svg" width="300" alt="Zerohand" />
</p>

An agentic workflow orchestrator built on [pi.dev](https://github.com/badlogic/pi-mono). Define pipelines as YAML packages, configure workers, trigger runs manually — and watch them execute in real-time through the web portal.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Web UI (React)                     │
│  Dashboard │ Pipelines │ Workers │ Run Detail        │
└─────────────────┬───────────────────┬───────────────┘
                  │ REST + WebSocket  │
┌─────────────────┴───────────────────┴───────────────┐
│                  Server (Express)                     │
│  Execution Engine │ REST API │ WebSocket              │
└────────┬──────────────────────────┬─────────────────┘
         │                          │
┌────────┴────────┐    ┌────────────┴────────────────┐
│  PostgreSQL     │    │  Pi.dev Execution Layer      │
│  (embedded dev) │    │  Sessions │ Skills │ Tools   │
└─────────────────┘    └─────────────────────────────┘
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
pnpm dev            # starts server on :3009 + UI on :5173
```

Open `http://localhost:5173`. The Daily Absurdist pipeline seeds automatically on first boot.

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

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GEMINI_API_KEY` | Yes | — | Google API key (Gemini + Imagen) |
| `ANTHROPIC_API_KEY` | No | — | Anthropic API key |
| `OPENAI_API_KEY` | No | — | OpenAI API key |
| `PORT` | No | `3009` | HTTP server port |
| `DATA_DIR` | No | `server/.data` | Embedded Postgres data directory |
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
├── pipelines/                       # Pipeline packages (YAML config)
│   └── daily-absurdist/
│       ├── pipeline.yaml            # Manifest: workers, steps, inputSchema
│       ├── COMPANY.md               # Context file (interpolated into prompts)
│       └── prompts/                 # System prompt files per worker
├── skills/                          # Pi.dev SKILL.md files
│   ├── research/SKILL.md
│   ├── writer/SKILL.md
│   └── editor/SKILL.md
├── packages/
│   ├── db/src/schema/               # Drizzle schema
│   └── shared/src/index.ts          # Shared API + WS types
├── server/src/
│   ├── index.ts                     # Bootstrap: Postgres, Express, Engine
│   ├── seed.ts                      # Config-driven pipeline seeder
│   ├── routes/                      # REST API handlers
│   ├── services/
│   │   ├── execution-engine.ts      # Pipeline run orchestration
│   │   ├── pi-executor.ts           # Pi.dev session bridge
│   │   └── builtin-workers.ts       # imagen + publish worker types
│   └── ws/index.ts                  # WebSocket broadcast manager
└── ui/src/
    ├── pages/                       # Dashboard, Pipelines, Workers, RunDetail
    └── lib/                         # API client, WebSocket hook
```

---

## Roadmap

**Phase 2 — Control Plane**
- Budget enforcement (per-worker/pipeline monthly caps)
- Human-in-the-loop approval gates
- Cron + webhook triggers
- Worker session persistence (resume pi sessions across runs)

**Phase 3 — Channels**
- Chat interface (steer agents mid-run)
- Telegram / Slack bot triggers
