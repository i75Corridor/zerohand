# Zerohand Roadmap

This document tracks completed work and the detailed implementation plan for upcoming features. Phases are ordered by dependency — foundational capabilities first, power features on top.

---

## Completed

- Pipeline YAML packages with hash-based re-seeding
- Execution engine with real-time WebSocket streaming
- Three worker types: `pi` (LLM agent), `imagen` (Google Imagen), `publish` (markdown assembly)
- Cron triggers with timezone support and visual schedule builder
- Telegram / Slack bot triggers (channel webhooks)
- Human-in-the-loop approval gates (pause / resume)
- Budget enforcement: per-worker monthly caps, configurable model pricing in DB
- Session persistence across steps (per worker + run)
- Chat interface: steer running agents mid-execution (interrupt / follow-up / abort)
- Output canvas: browse images and markdown from completed runs with inline preview
- Settings page: model pricing table editor

---

## Phase 4 — Global Agent Chat Interface

> **The flagship feature.** A persistent AI assistant accessible from every page that can orchestrate runs, answer questions, and navigate the UI on your behalf.

### 4a. Global Agent Backend

A dedicated pi.dev agent session with custom tools wired to the Zerohand DB and API. Unlike the per-step `ChatPanel`, this agent is always-on and understands the whole system.

**Custom tools the agent can call:**

| Tool | What it does |
|------|-------------|
| `list_pipelines` | Returns all pipelines with step counts and status |
| `trigger_pipeline` | Creates a pipeline run with given inputs |
| `cancel_run` | Cancels an active run |
| `list_recent_runs` | Returns recent runs with status and cost |
| `get_run_status` | Gets detail for a specific run |
| `list_workers` | Returns workers with model, skills, budget usage |
| `get_system_stats` | Returns runs this month, active count, total cost |
| `navigate_ui` | Returns a URL — the frontend auto-navigates |

**Files:**

| Action | File |
|--------|------|
| Create | `server/src/services/global-agent.ts` — persistent pi.dev session, custom tool implementations, streaming response callback |
| Modify | `server/src/ws/index.ts` — handle `global_chat` messages alongside existing `chat` handler |
| Modify | `server/src/index.ts` — instantiate `GlobalAgent`, wire to WsManager |
| Modify | `packages/shared/src/index.ts` — add `WsGlobalChat` (client→server), `WsGlobalChatResponse` (server→client, streams text_delta) |

**Key decisions:**
- Persistent session directory at `DATA_DIR/global-agent/` — conversation survives server restarts
- Same `createAgentSession` pattern as `pi-executor.ts` but with `customTools` instead of skills
- Session streams `text_delta` events just like step execution, so the same WS infrastructure handles it

### 4b. Global Agent UI

A collapsible floating panel anchored to the bottom-right, accessible from every page without navigating away.

**Files:**

| Action | File |
|--------|------|
| Create | `ui/src/components/GlobalChat.tsx` — toggle button always visible, panel slides up, conversation history, markdown rendering, auto-navigate on `navigate_ui` tool results |
| Modify | `ui/src/components/Layout.tsx` — render `<GlobalChat />` inside the layout shell |

**Key decisions:**
- Conversation history kept in component state + `localStorage` so it survives page changes
- Agent markdown responses rendered with `react-markdown` (already installed)
- When agent uses `navigate_ui`, the frontend calls React Router `navigate()` automatically

**Verification:**
1. Ask "what pipelines do I have?" → correct list
2. Ask "run Daily Absurdist about AI" → run triggers, link to run detail returned
3. Ask "show me the latest run" → UI navigates to RunDetail
4. Refresh page → conversation history survives

---

## Phase 5 — Management UIs

> Worker, Pipeline, and Skills CRUD through the UI. All backend REST APIs already exist — this phase wires the UI to them.

### 5a. Worker Management UI

Extend `Workers.tsx` from read-only cards to full create/edit/delete.

**Files:**

| Action | File |
|--------|------|
| Modify | `ui/src/pages/Workers.tsx` — add `WorkerFormModal`, wire create/update/delete mutations |
| Modify | `server/src/routes/workers.ts` — include `systemPrompt`, `customTools`, `metadata` in `toApiWorker` response |
| Modify | `packages/shared/src/index.ts` — add those fields to `ApiWorker` |
| Create | `server/src/routes/skills.ts` — `GET /api/skills` reads `SKILLS_DIR`, parses SKILL.md frontmatter, returns name + description per skill |

**Worker form fields:** name, description, workerType (dropdown), modelProvider/modelName (picker sourced from `model_costs` settings), systemPrompt (textarea), skills (multi-select from `GET /api/skills`), customTools, budgetMonthlyCents.

### 5b. Pipeline Builder UI

Visual step editor for creating and editing pipelines.

**Files:**

| Action | File |
|--------|------|
| Create | `ui/src/pages/PipelineBuilder.tsx` — pipeline metadata form + step list (add / remove / reorder) |
| Modify | `ui/src/pages/Pipelines.tsx` — add "New Pipeline" button, "Edit" button per row |
| Modify | `ui/src/App.tsx` — add `/pipelines/new` and `/pipelines/:id/edit` routes |
| Modify | `ui/src/lib/api.ts` — add `createStep`, `updateStep`, `deleteStep` (backend routes already at `/api/pipelines/:id/steps`) |

**Step editor fields per step:** worker (dropdown), prompt template (textarea with `{{input.*}}` / `{{steps.N.output}}` token hints), timeout, approvalRequired toggle, condition (Phase 9a).

**inputSchema builder:** key name + type + required checkbox per field — generates JSON Schema.

### 5c. Skills Management UI

Browse, edit, and create SKILL.md files from the UI.

**Files:**

| Action | File |
|--------|------|
| Create | `ui/src/pages/Skills.tsx` — list skills with name, version, description, allowed-tools; click to open editor |
| Modify | `server/src/routes/skills.ts` — add `GET /api/skills/:name`, `PUT /api/skills/:name`, `POST /api/skills` |
| Modify | `ui/src/components/Layout.tsx` — add Skills nav entry |
| Modify | `ui/src/App.tsx` — add `/skills` route |
| Modify | `packages/shared/src/index.ts` — add `ApiSkill` type |
| Modify | `ui/src/lib/api.ts` — add skill CRUD methods |

**Key decision:** Skills are files on disk. The server reads/writes them via `fs`. The skill editor is a monospace textarea for editing raw SKILL.md content. Agent-assisted creation uses the Global Agent (Phase 4).

**Verification:**
1. Create a worker via UI, assign to a pipeline step, run the pipeline
2. Edit a pipeline's steps (reorder, change prompts), run, verify new config executes
3. Edit a skill, verify the next worker run picks up the updated content
4. Create a new skill, assign to a worker, verify it loads during execution

---

## Phase 6 — Cost Dashboard and Observability

> Make spend visible and run history explorable. All the data is already in `cost_events` and `step_run_events`.

### 6a. Cost Dashboard Page

**Files:**

| Action | File |
|--------|------|
| Create | `ui/src/pages/Costs.tsx` — line chart (spend over time), bar charts (by worker, by pipeline), date range selector, summary stats |
| Modify | `server/src/routes/stats.ts` — add `GET /api/stats/costs?from=&to=&groupBy=worker\|pipeline\|day` |
| Modify | `ui/src/components/Layout.tsx` — add Costs nav entry (DollarSign icon) |
| Modify | `packages/shared/src/index.ts` — add `ApiCostBreakdown` type |
| Modify | `ui/src/lib/api.ts` — add cost stats method |

**Dependency:** `pnpm --filter ui add recharts`

**Summary stats row:** total this month, daily average, projected month-end, most expensive worker, most expensive pipeline.

### 6b. Run History Enhancements

**Files:**

| Action | File |
|--------|------|
| Modify | `ui/src/pages/Dashboard.tsx` — filters (status dropdown, pipeline dropdown, date range) |
| Modify | `server/src/routes/pipeline-runs.ts` — add `?status=`, `?pipelineId=`, `?from=`, `?to=`, `?limit=`, `?offset=` query params |
| Modify | `ui/src/pages/RunDetail.tsx` — "Logs" tab per step showing tool calls as structured collapsible cards; Cancel run button |
| Modify | `ui/src/lib/api.ts` — wire up `getStepEvents()` (exists but unused) for the logs tab |

**Verification:**
1. Cost page shows chart with historical data, breakdowns match raw `cost_events`
2. Filter runs by status and pipeline, verify correct results
3. Step logs show tool calls with inputs/outputs as structured timeline

---

## Phase 7 — Execution Engine Enhancements

> Production-grade reliability and throughput.

### 7a. Retry and Error Recovery

**Schema change:** Add `retryConfig` JSONB to `pipelineSteps` — `{ maxRetries: number, backoffMs: number, retryOnErrors?: string[] }`.

**Files:**

| Action | File |
|--------|------|
| Modify | `packages/db/src/schema/pipelines.ts` — add `retryConfig` column |
| Modify | `server/src/services/execution-engine.ts` — wrap step dispatch in retry loop, classify errors (budget-exceeded = never retry) |
| Modify | `packages/shared/src/index.ts` — add `"retrying"` to step status enum, `retryConfig` to `ApiPipelineStep` |
| DB migration | `pnpm db:generate` |

### 7b. Run Resume from Failed Step

**Files:**

| Action | File |
|--------|------|
| Create | `server/src/routes/pipeline-runs.ts` — `POST /api/runs/:id/retry` resets run + failed step_run to `"queued"` |
| Modify | `ui/src/pages/RunDetail.tsx` — "Retry from failed step" button shown when `run.status === "failed"` |
| Modify | `ui/src/lib/api.ts` — add `retryRun(id)` method |

**Key insight:** The existing `executeRun` skip logic already handles completed steps — retrying just needs to reset the failed step's status. The engine does the rest.

### 7c. Parallel Step Execution

Steps sharing the same `stepIndex` execute concurrently via `Promise.all`.

**Schema change:** Drop the unique constraint on `(pipelineId, stepIndex)` to allow parallel steps at the same index.

**Files:**

| Action | File |
|--------|------|
| Modify | `packages/db/src/schema/pipelines.ts` — remove unique constraint on `stepIndex` |
| Modify | `server/src/services/execution-engine.ts` — group steps by index, run groups with `Promise.all` |
| Modify | `ui/src/pages/PipelineBuilder.tsx` — UI for adding parallel steps (visual grouping at same index) |
| DB migration | `pnpm db:generate` |

**Verification:**
1. Configure step with `maxRetries: 2`, force failure, verify retry then success
2. Fail at step 2, click Retry, verify steps 0–1 skipped, step 2 re-executes
3. Create pipeline with 2 parallel steps, verify concurrent execution via timestamps
4. Verify downstream steps reference parallel outputs correctly

---

## Phase 8 — Pipeline Packaging and Secrets

### 8a. Pipeline Import / Export

The foundation for a future pipeline marketplace. Export format matches the existing `pipelines/` YAML package structure.

**Files:**

| Action | File |
|--------|------|
| Modify | `server/src/routes/pipelines.ts` — `GET /api/pipelines/:id/export` (zip), `POST /api/pipelines/import` (zip upload) |
| Modify | `server/src/seed.ts` — refactor `seedPackage` to be callable from the import endpoint, not just startup |
| Modify | `ui/src/pages/Pipelines.tsx` — Export and Import buttons |
| Modify | `ui/src/lib/api.ts` — add `exportPipeline`, `importPipeline` methods |

### 8b. Secrets Management

Encrypted runtime variables injected into workers. Keeps API keys out of YAML files.

**Files:**

| Action | File |
|--------|------|
| Modify | `server/src/routes/settings.ts` — CRUD for secrets with `crypto.createCipheriv` encryption at rest; API returns masked values |
| Modify | `server/src/services/execution-engine.ts` — extend `resolvePrompt()` to support `{{secret.KEY}}` — resolves from decrypted secrets at runtime |
| Modify | `ui/src/pages/Settings.tsx` — add Secrets section with password inputs for add/edit/delete |

**Key decisions:**
- Encryption key from `ENCRYPTION_KEY` env var (auto-generated and stored in DATA_DIR if not set)
- API never returns unmasked values — only the server-side executor sees real values
- Secrets are excluded from pipeline export packages

**Verification:**
1. Add a secret via UI, verify API returns masked value
2. Reference `{{secret.MY_KEY}}` in a worker prompt, verify worker receives the real value
3. Export a pipeline — confirm no secrets are included

---

## Phase 9 — Advanced Orchestration

### 9a. Conditional / Branching Steps

Steps can be skipped based on the output of previous steps.

**Schema change:** Add `condition` text column to `pipelineSteps`.

**Files:**

| Action | File |
|--------|------|
| Modify | `packages/db/src/schema/pipelines.ts` — add `condition` column |
| Modify | `server/src/services/execution-engine.ts` — evaluate condition via sandboxed `new Function('steps', 'input', ...)` before dispatching; mark step_run `"skipped"` if false |
| Modify | `packages/shared/src/index.ts` — add `"skipped"` to step status enum, `condition` to `ApiPipelineStep` |
| Modify | `ui/src/pages/PipelineBuilder.tsx` — condition editor per step |
| DB migration | `pnpm db:generate` |

**Example conditions:** `steps[0].output.includes("approved")` · `input.priority === "high"` · `JSON.parse(steps[1].output).verdict === "PASS"`

### 9b. Pipeline Composition (Sub-pipelines)

A new `pipeline` worker type that triggers another pipeline as a step and waits for its output.

**Schema change:** Add optional `parentRunId` column to `pipelineRuns`.

**Files:**

| Action | File |
|--------|------|
| Modify | `packages/shared/src/index.ts` — add `"pipeline"` to `WORKER_TYPE` |
| Modify | `packages/db/src/schema/pipeline-runs.ts` — add `parentRunId` FK |
| Modify | `server/src/services/execution-engine.ts` — add `pipeline` worker dispatch: creates child run, polls for completion, returns child output as step output |
| Modify | `ui/src/pages/RunDetail.tsx` — show parent/child run relationships with links |
| DB migration | `pnpm db:generate` |

**Safety:** Depth limit of 5 levels to prevent recursive loops.

### 9c. Webhook Output Triggers

Notify external systems when a pipeline run completes or fails.

**New table:** `output_webhooks` — `(pipelineId, url, events, headers, enabled)`.

**Files:**

| Action | File |
|--------|------|
| Create | `packages/db/src/schema/output-webhooks.ts` — new table |
| Create | `server/src/routes/output-webhooks.ts` — `GET/POST /api/pipelines/:id/webhooks`, `PATCH/DELETE /api/webhooks/:id` |
| Modify | `server/src/services/execution-engine.ts` — after run completes/fails, query `outputWebhooks` and fire HTTP POSTs with retry (3x exponential backoff) |
| Modify | `ui/src/pages/Pipelines.tsx` — webhook output config in Triggers modal |
| DB migration | `pnpm db:generate` |

**Webhook payload:**
```json
{
  "runId": "...",
  "pipelineId": "...",
  "pipelineName": "...",
  "status": "completed",
  "output": "...",
  "durationSeconds": 42,
  "costCents": 18,
  "triggeredAt": "2026-04-01T..."
}
```

**Verification:**
1. Create conditional step, verify it skips when condition is false
2. Run pipeline A that calls pipeline B — verify sub-run executes and output flows through
3. Configure webhook URL, run pipeline, verify POST received with correct payload
4. Verify depth limit prevents recursive pipeline loops

---

## Future Ideas

These are unscheduled and will be prioritized based on usage:

- **Pipeline versioning** — snapshot config per edit; runs reference the exact version they ran against
- **A/B testing** — run two prompt variants side by side with cost and quality comparison
- **Worker pools** — multiple concurrent instances of the same worker for throughput scaling
- **Scheduled digest reports** — aggregate run results over time, send via email or channel bot
- **Multi-tenant / API keys** — user accounts, workspace isolation, API key authentication
- **Plugin system** — community-contributed worker types loaded from a plugins directory

---

## Critical Files (Cross-Phase Reference)

| File | Touched By |
|------|-----------|
| `server/src/services/execution-engine.ts` | Phases 7, 8b, 9a, 9b, 9c |
| `packages/shared/src/index.ts` | Every phase |
| `packages/db/src/schema/` | Phases 7, 9a, 9b, 9c |
| `ui/src/components/Layout.tsx` | Phases 4b, 5c, 6a |
| `ui/src/lib/api.ts` | Every phase |
| `server/src/ws/index.ts` | Phase 4a |
| `server/src/services/pi-executor.ts` | Phase 4a |
| `server/src/seed.ts` | Phase 8a |
