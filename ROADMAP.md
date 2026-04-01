# Zerohand Roadmap

This document tracks completed work and the detailed implementation plan for upcoming features. Phases are ordered by dependency — foundational capabilities first, power features on top.

---

## Completed

- Monorepo: `packages/db` (Drizzle + embedded Postgres), `packages/shared` (types), `server` (Express + WebSocket), `ui` (React + Vite + Tailwind)
- Skill-based execution: skills are `SKILL.md` files with YAML frontmatter + optional `scripts/` directory; no workers
- Three skill types: `pi` (LLM agent via pi-coding-agent), `imagen` (Google Imagen via `scripts/generate.cjs`), `publish` (markdown assembly via `scripts/publish.js`)
- Idempotent pipeline import: SHA-256 hash-based upsert preserves run history across config changes
- Execution engine: real-time WebSocket streaming, step sequencing, resume from completed steps
- Cron triggers with timezone support and visual schedule builder
- Human-in-the-loop approval gates (pause / resume)
- Budget enforcement: per-skill monthly caps with configurable model pricing
- Chat interface: steer running agents mid-execution (interrupt / follow-up / abort)
- Output canvas: browse images and markdown from completed runs with inline preview
- Settings page: model pricing table editor
- Global Agent: always-on right-side panel with tools for pipelines, runs, skills, and UI navigation; contextually aware of current page
- Pipeline detail page with ReactFlow DAG showing step graph
- Pipeline builder UI: create and edit pipelines and steps visually
- Skills management UI: list, browse, and edit SKILL.md files from the browser
- Script security: path traversal guard, API key stripping from child env, 30s SIGKILL timeout, 1 MB stdout cap
- Unit tests (vitest 4): `skill-loader`, `resolve-prompt`, `pipeline-import`

---

## Phase 6 — Cost Dashboard and Observability

> Make spend visible and run history explorable. All the data is already in `cost_events` and `step_run_events`.

### 6a. Cost Dashboard Page

**Files:**

| Action | File |
|--------|------|
| Create | `ui/src/pages/Costs.tsx` — line chart (spend over time), bar charts (by skill, by pipeline), date range selector, summary stats |
| Modify | `server/src/routes/stats.ts` — add `GET /api/stats/costs?from=&to=&groupBy=skill\|pipeline\|day` |
| Modify | `ui/src/components/Layout.tsx` — add Costs nav entry (DollarSign icon) |
| Modify | `packages/shared/src/index.ts` — add `ApiCostBreakdown` type |
| Modify | `ui/src/lib/api.ts` — add cost stats method |

**Dependency:** `pnpm --filter ui add recharts`

**Summary stats row:** total this month, daily average, projected month-end, most expensive skill, most expensive pipeline.

### 6b. Structured System Logging

Opt-in detailed logging of everything that flows through the execution engine — step inputs, resolved prompts, raw LLM outputs, script stdin/stdout, tool calls, and timing. Designed for debugging and auditing, not shown in the default UI.

**Design:**

Logging is controlled by a `LOG_LEVEL` env var: `off` (default) | `info` | `debug`. At `debug`, all payloads are captured. At `info`, only metadata (timing, token counts, status) is captured with payloads omitted.

Log entries are written as JSONL to `DATA_DIR/logs/runs/<runId>.jsonl` so they can be tailed, grepped, and parsed without a database query.

**What gets logged at each level:**

| Event | `info` | `debug` |
|-------|--------|---------|
| Run started (pipeline name, inputs) | ✓ | ✓ |
| Step started (skill name, step index) | ✓ | ✓ |
| Resolved prompt sent to skill | — | ✓ |
| LLM response (raw output text) | — | ✓ |
| Script stdin payload | — | ✓ |
| Script stdout response | — | ✓ |
| Tool call (name, input) | ✓ | ✓ |
| Tool result | — | ✓ |
| Token usage per step | ✓ | ✓ |
| Step completed/failed + duration | ✓ | ✓ |
| Run completed + total duration | ✓ | ✓ |

**Files:**

| Action | File | Details |
|--------|------|---------|
| Create | `server/src/services/run-logger.ts` | `RunLogger` class: opened per run, writes JSONL entries, closed on run end. `LOG_LEVEL` gating. |
| Modify | `server/src/services/execution-engine.ts` | Instantiate `RunLogger` at run start; emit log entries at each dispatch point (before/after prompt, script calls, tool events) |
| Modify | `server/src/services/skill-loader.ts` | `execScript()` accepts optional logger callback to capture stdin/stdout when at debug level |
| Create | `server/src/routes/logs.ts` | `GET /api/runs/:id/log` — streams the JSONL file for a run (or returns 404 if logging was off) |
| Modify | `server/src/index.ts` | Mount logs router |
| Modify | `ui/src/pages/RunDetail.tsx` | "Debug Log" tab: streams log entries, renders as a timeline. Shown only when log file exists for the run. |
| Modify | `ui/src/lib/api.ts` | Add `getRunLog(runId)` method |

**Log entry schema:**
```jsonc
{ "ts": "2026-04-01T15:00:00.000Z", "event": "step_start", "stepIndex": 0, "skillName": "researcher" }
{ "ts": "...", "event": "prompt", "stepIndex": 0, "payload": "Research the topic..." }
{ "ts": "...", "event": "tool_call", "stepIndex": 0, "tool": "web_search", "input": { "query": "..." } }
{ "ts": "...", "event": "tool_result", "stepIndex": 0, "tool": "web_search", "output": "[...]" }
{ "ts": "...", "event": "step_output", "stepIndex": 0, "payload": "## Research Report..." }
{ "ts": "...", "event": "step_end", "stepIndex": 0, "status": "completed", "durationMs": 8420, "tokens": { "input": 1200, "output": 800 } }
```

**Privacy note:** At `debug` level, full prompt and output text is written to disk. This may include user-supplied input values. Log files should be excluded from backups/exports that leave the operator's environment.

**Verification:**
1. `LOG_LEVEL=debug pnpm dev` → run a pipeline → `DATA_DIR/logs/runs/<id>.jsonl` exists and contains all events
2. `LOG_LEVEL=info` → log file exists but prompt/output payloads are absent
3. `LOG_LEVEL=off` → no log file created
4. `GET /api/runs/:id/log` → streams the JSONL
5. RunDetail "Debug Log" tab shows timeline of events when log exists

---

### 6c. Run History Enhancements

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
4. Debug log tab in RunDetail streams JSONL events for the run

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
| Modify | `server/src/services/pipeline-import.ts` — refactor `importPipelinePackage` to be callable from the import endpoint, not just startup |
| Modify | `ui/src/pages/Pipelines.tsx` — Export and Import buttons |
| Modify | `ui/src/lib/api.ts` — add `exportPipeline`, `importPipeline` methods |

### 8b. Script Sandbox (Docker Isolation)

Skill scripts currently run as child processes with full access to the server's filesystem and environment. This phase wraps every `execScript()` call in a throwaway Docker container, following the same design as nanoclaw's `container-runner.ts`.

**Threat model:** A malicious or buggy script in `skills/<name>/scripts/` must not be able to read the server's env vars (API keys, DB URL), write outside its own directory, spawn persistent processes, or exfiltrate data over the network unless the skill explicitly declares network access.

**Design (Docker-first, macOS + Linux):**

| Layer | Mechanism |
|---|---|
| Filesystem | Only `skills/<name>/scripts/` mounted read-only at `/scripts`; `/tmp` as tmpfs; nothing else visible |
| Credentials | API keys stripped from child env (already done); never passed into container |
| Network | `--network=none` by default; skills declare `network: true` in SKILL.md frontmatter to opt in |
| User | Non-root (`node`, uid 1000) inside container |
| Timeout | Hard kill via `docker stop --time=0` after `SCRIPT_TIMEOUT_MS` |
| Stdout limit | Container stdout piped through the same 1 MB cap as the current implementation |

**Files:**

| Action | File | Details |
|--------|------|---------|
| Create | `server/src/services/script-sandbox.ts` | `runInSandbox(scriptPath, input, opts)` — builds `docker run` args, mounts script dir read-only, strips env, enforces timeout, captures stdout |
| Modify | `server/src/services/skill-loader.ts` | Replace `execScript()` body with `runInSandbox()` call; read `network` flag from skill frontmatter |
| Modify | `server/src/routes/skills.ts` | Expose `network` field from SKILL.md frontmatter in `ApiSkill` |
| Modify | `packages/shared/src/index.ts` | Add `network?: boolean` to `ApiSkill` |
| Create | `container/skill-runner/Dockerfile` | Node 22-slim, `node` user, no extra packages; reusable image for all JS/TS skill scripts |
| Modify | `server/src/index.ts` | On startup, verify Docker is available (`docker info`); log warning and fall back to subprocess mode if not |

**SKILL.md frontmatter addition:**
```yaml
network: true   # optional — false by default; grants --network=bridge to the container
```

**Docker availability fallback:** If Docker is not running, `script-sandbox.ts` falls back to the existing subprocess execution with a warning log. This keeps local dev working without Docker while enforcing sandboxing in production.

**Verification:**
1. Skill script that calls `process.env.GEMINI_API_KEY` → returns `undefined`
2. Skill script that writes to `/etc/passwd` → permission denied
3. Skill script that makes an outbound HTTP request with `network: false` → connection refused
4. Same script with `network: true` → succeeds
5. Script that runs forever → killed after `SCRIPT_TIMEOUT_MS`, step fails with timeout error
6. Server starts without Docker → logs warning, scripts run as subprocesses (dev mode)

---

### 8c. Secrets Management

Encrypted runtime variables injected into skills. Keeps API keys out of YAML files.

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
2. Reference `{{secret.MY_KEY}}` in a skill prompt, verify skill receives the real value
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

A step that triggers another pipeline and waits for its output.

**Schema change:** Add optional `parentRunId` column to `pipelineRuns`.

**Files:**

| Action | File |
|--------|------|
| Modify | `packages/db/src/schema/pipeline-runs.ts` — add `parentRunId` FK |
| Modify | `server/src/services/execution-engine.ts` — add `pipeline` step dispatch: creates child run, polls for completion, returns child output as step output |
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
- **Scheduled digest reports** — aggregate run results over time, send via email or channel bot
- **Multi-tenant / API keys** — user accounts, workspace isolation, API key authentication
- **Plugin system** — community-contributed skill types loaded from a plugins directory
- **Skill structured output** — `outputSchema` in SKILL.md frontmatter; skills produce typed JSON for downstream template access

---

## Critical Files (Cross-Phase Reference)

| File | Touched By |
|------|-----------|
| `server/src/services/execution-engine.ts` | Phases 7, 8b, 8c, 9a, 9b, 9c |
| `packages/shared/src/index.ts` | Every phase |
| `packages/db/src/schema/` | Phases 7, 9a, 9b, 9c |
| `ui/src/components/Layout.tsx` | Phase 6a |
| `ui/src/lib/api.ts` | Every phase |
| `server/src/services/pipeline-import.ts` | Phase 8a |
| `server/src/services/script-sandbox.ts` (new) | Phase 8b |
| `server/src/services/skill-loader.ts` | Phase 8b |
| `container/skill-runner/Dockerfile` (new) | Phase 8b |
