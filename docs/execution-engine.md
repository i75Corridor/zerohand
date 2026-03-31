# Execution Engine

The execution engine is the core of Zerohand. It polls the database for queued pipeline runs, executes each step in sequence, streams events to the UI, and records all output.

**Source:** `server/src/services/execution-engine.ts`

---

## Lifecycle

```
                     ┌─────────────────────────────────┐
                     │   POST /api/runs (trigger)       │
                     │   creates pipeline_run (queued)  │
                     └───────────────┬─────────────────┘
                                     │
               ┌─────────────────────▼──────────────────────┐
               │            Engine tick (every 2s)           │
               │   finds oldest queued run not in-flight     │
               └─────────────────────┬──────────────────────┘
                                     │
               ┌─────────────────────▼──────────────────────┐
               │         mark run "running"                  │
               │         broadcast run_status via WS         │
               └─────────────────────┬──────────────────────┘
                                     │
                    ┌────────────────▼────────────────┐
                    │     for each step (in order)     │
                    │                                  │
                    │  1. create step_run (queued)     │
                    │  2. resolve prompt template      │
                    │  3. mark step "running"          │
                    │  4. dispatch to worker type      │
                    │  5. stream events → DB + WS      │
                    │  6. mark step "completed"        │
                    │  7. store output for next steps  │
                    └────────────────┬────────────────┘
                                     │
               ┌─────────────────────▼──────────────────────┐
               │     mark run "completed"                    │
               │     broadcast run_status via WS             │
               └─────────────────────────────────────────────┘
```

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

## Worker Dispatch

After resolving the prompt, the engine checks `worker.worker_type`:

### `pi`

Delegates to `pi-executor.ts → runWorkerStep()`:

1. Loads the model via pi.dev `getModel(provider, name)`
2. Creates `AuthStorage` with API keys from environment
3. Loads skills from `SKILLS_DIR` filtered to the worker's `skills` list
4. Registers custom tools (e.g. `web_search`)
5. Creates an in-memory `AgentSession` via `createAgentSession()`
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
| `pipeline_runs` | One row per triggered run. Holds `status`, `input_params`, `output`, `error`. |
| `step_runs` | One row per step per run. Holds per-step `status`, `output`, `usage_json`, `error`. |
| `step_run_events` | Append-only event log. Enables UI replay of any past run. |
