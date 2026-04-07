# Execution Engine

The execution engine is the core of Pawn. It polls the database for queued pipeline runs, executes each step in sequence, streams events to the UI, and records all output.

**Source:** `server/src/services/execution-engine.ts`

---

## Lifecycle

```
                     ┌──────────────────────────────────────┐
                     │   POST /api/runs (manual trigger)     │
                     │   TriggerManager (cron fire)          │
                     │   Approval resume (re-queued)         │
                     │   → creates/re-queues pipeline_run    │
                     └───────────────┬──────────────────────┘
                                     │
               ┌─────────────────────▼──────────────────────┐
               │            Engine tick (every 2s)           │
               │   finds oldest queued run not in-flight     │
               └─────────────────────┬──────────────────────┘
                                     │
               ┌─────────────────────▼──────────────────────┐
               │         mark run "running"                  │
               │         load existing step_runs (resume)    │
               │         broadcast run_status via WS         │
               └─────────────────────┬──────────────────────┘
                                     │
                    ┌────────────────▼────────────────┐
                    │     for each step (in order)     │
                    │                                  │
                    │  0. skip if already completed    │
                    │  1. check approval gate          │
                    │     → pause + return if pending  │
                    │  2. check budget (pi only)       │
                    │     → fail step if exceeded      │
                    │  3. resolve prompt template      │
                    │  4. create step_run (queued)     │
                    │  5. mark step "running"          │
                    │  6. dispatch to worker type      │
                    │  7. stream events → DB + WS      │
                    │  8. record cost event (pi only)  │
                    │  9. mark step "completed"        │
                    │  10. store output for next steps │
                    └────────────────┬────────────────┘
                                     │
               ┌─────────────────────▼──────────────────────┐
               │     mark run "completed"                    │
               │     broadcast run_status via WS             │
               └─────────────────────────────────────────────┘
```

---

## Resume Support

When a run is re-queued (e.g. after an approval gate is resolved), the engine does not start from scratch. At the beginning of `executeRun()`:

1. All existing `step_runs` for the run are loaded from the database.
2. For each completed step, the output is inserted into the `stepOutputs` map.
3. Steps whose `step_run` has status `completed` are skipped during the loop.

This means a paused run picks up exactly where it left off, with all prior step outputs intact for template resolution.

---

## Approval Gates

If a step has `approvalRequired: true`, the engine:

1. Creates an `approval` record with status `pending` and the step's resolved prompt as the payload.
2. Sets the pipeline run status to `paused`.
3. Returns immediately — the engine does not block waiting for the decision.

When a human approves via `POST /api/approvals/:id/approve`:
- The approval status is set to `approved`.
- The pipeline run status is set back to `queued`.
- The engine picks it up on the next tick and resumes from the approval gate step.

If rejected, the pipeline run is marked `failed`.

---

## Prompt Template Resolution

Before dispatching a step to its worker, the engine resolves `{{...}}` placeholders in the step's `promptTemplate`.

| Syntax | Source |
|--------|--------|
| `{{input.topic}}` | `pipeline_run.input_params.topic` |
| `{{steps.0.output}}` | Raw output string from step 0 |
| `{{steps.2.output.imagePrompt}}` | JSON dot-path into step 2's output |

Steps can only reference outputs from steps with a lower index (already completed). Unresolved placeholders are left as-is.

JSON dot-paths work on any depth: `{{steps.1.output.nested.field}}` will parse step 1's output as JSON and traverse `output → nested → field`. If parsing fails or the path doesn't exist, returns an empty string.

---

## Step-by-Step Execution Mode

When a run is triggered with `metadata.executionMode === "step_by_step"`, the engine pauses the run after each step completes (except the final step). Pause happens by:

1. Setting the run status to `"paused"`.
2. Broadcasting `run_status` to connected WebSocket clients.
3. Disconnecting the MCP pool and returning early from `executeRun()`.

The run is resumed via `POST /api/runs/:id/resume`, which sets the status back to `"queued"`. On the next engine tick, the run is picked up, existing step outputs are restored from the database, completed steps are skipped, and the next pending step executes.

---

## MCP Client Pool

At the start of each `executeRun()`, the engine creates a `McpClientPool` instance. Before executing a skill step:

1. The skill's `SKILL.md` is loaded — the `mcpServers: [...]` frontmatter field is read.
2. For each named server, the engine queries the `mcp_servers` table to get connection config.
3. Only enabled servers are connected; disabled servers are silently skipped.
4. Connected servers' tools are fetched and converted to `ToolDefinition` objects via `mcp-tool-bridge.ts`.
5. MCP tools are merged with script tools and passed to `runSkillStep()`.

Tool naming: `mcp__<serverName>__<toolName>` (dashes in names replaced with underscores).

The pool is torn down in the `finally` block of `executeRun()` regardless of success or failure. Steps that pause the run (step-by-step mode) also disconnect the pool before returning.

---

## Worker Dispatch

After resolving the prompt, the engine checks `worker.worker_type`:

### `pi`

Delegates to `pi-executor.ts → runWorkerStep()`:

1. Loads the model via pi.dev `getModel(provider, name)`
2. Creates `AuthStorage` with API keys from environment
3. Loads skills from `SKILLS_DIR` filtered to the worker's `skills` list
4. Registers custom tools (e.g. `web_search`)
5. Creates an `AgentSession` — persistent (`SessionManager.create(dir)`) if `sessionDir` is provided, in-memory otherwise
6. Subscribes to session events, forwarding them as step events
7. Calls `session.prompt(resolvedPrompt)` and awaits completion
8. Extracts the final assistant text as the step output

### `imagen`

Delegates to `builtin-workers.ts → runImagenWorker()`:

1. Appends a fixed editorial cartoon style suffix to the prompt
2. Calls Google Imagen API via `@google/genai`
3. Falls back to two generic prompts if the primary fails
4. Saves the PNG to `OUTPUT_DIR/{runId}-step{index}.png`
5. Returns the absolute file path as the step output

### `publish`

Delegates to `builtin-workers.ts → runPublishWorker()`:

1. Reads the article text from the resolved prompt
2. Reads the image path from `stepOutputs[step.metadata.imageStepIndex]`
3. Extracts the headline from the first `# ` heading in the article
4. Generates a date-based slug: `{date}-{headline-words}.md`
5. Writes `![Cover illustration](image.png)\n\n{article}` to `OUTPUT_DIR`
6. Returns the absolute file path as the step output

---

## Session Persistence

For `pi` workers, the engine calls `getOrCreateSession(workerId, runId)` before dispatching:

1. Queries `worker_sessions` for an existing record matching `(workerId, runId)`.
2. If found, returns the stored session directory path.
3. If not found, creates a new directory under `DATA_DIR/sessions/{workerId}/{runId}/` and inserts a record.

The session directory is passed to `runWorkerStep()`, which uses `SessionManager.create(sessionDir)` instead of `SessionManager.inMemory()`. Pi.dev writes session state to this directory, enabling context to persist across steps or across re-queued runs.

---

## Budget Enforcement

Before each `pi` step, the engine calls `checkBudget(db, workerId, pipelineRunId)`:

1. Queries `budget_policies` for any policies scoped to this worker.
2. Sums `cost_events.cost_cents` for the current calendar month.
3. If spending exceeds the policy's `amountCents` and `hardStopEnabled` is true, throws an error — the step and run are marked `failed`.

After each `pi` step completes, `recordCost()` inserts a `cost_events` row with real token counts from the pi session's usage object.

---

## Event Streaming

During step execution, events are:
1. Written to `step_run_events` table (for replay via REST API)
2. Broadcast to all WebSocket clients immediately

Event types:

| `eventType` | When |
|-------------|------|
| `text_delta` | Each chunk of text from a `pi` worker; progress messages from `imagen`/`publish` |
| `tool_call_start` | Agent begins a tool call |
| `tool_call_end` | Tool call completes |
| `status_change` | Step status transitions |
| `error` | Step fails |

---

## Concurrency

The engine processes one run at a time per server instance. Within a run, steps are strictly sequential. The `activeRunIds` set prevents the same run from being picked up by concurrent tick invocations.

---

## Error Handling

If any step throws:
1. The step is marked `failed` with the error message
2. An `error` event is emitted
3. The exception propagates — the run is marked `failed` with the same message
4. The run is removed from `activeRunIds`

Subsequent steps in the run are not executed.

---

## Database Tables

| Table | Role |
|-------|------|
| `pipeline_runs` | One row per triggered run. Holds `status`, `input_params`, `output`, `error`, `metadata` (includes `executionMode`). |
| `step_runs` | One row per step per run. Holds per-step `status`, `output`, `usage_json`, `error`. |
| `step_run_events` | Append-only event log. Enables UI replay of any past run. |
| `approvals` | One row per approval gate hit. Holds `status`, `payload`, `decision_note`. |
| `cost_events` | One row per completed pi step. Holds token counts and `cost_cents`. |
| `worker_sessions` | Maps (workerId, runId) → session directory path for pi session persistence. |
| `pipeline_versions` | Auto-snapshot before each destructive edit. Stores full `ApiPipeline` JSON. |
| `mcp_servers` | Registry of external MCP servers with connection config and enabled flag. |
