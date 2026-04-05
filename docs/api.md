# API Reference

## REST API

Base URL: `http://localhost:3009/api`

---

### Health

#### `GET /api/health`

Returns server status.

```json
{ "status": "ok" }
```

---

### Workers

#### `GET /api/workers`

List all workers.

```json
[
  {
    "id": "uuid",
    "name": "Researcher",
    "description": "...",
    "workerType": "pi",
    "modelProvider": "google",
    "modelName": "gemini-2.5-flash",
    "skills": ["research"],
    "customTools": ["web_search"],
    "status": "idle",
    "createdAt": "2026-03-31T00:00:00Z"
  }
]
```

#### `POST /api/workers`

Create a worker.

```json
{
  "name": "My Worker",
  "workerType": "pi",
  "modelProvider": "google",
  "modelName": "gemini-2.5-flash",
  "systemPrompt": "You are...",
  "skills": [],
  "customTools": []
}
```

#### `PATCH /api/workers/:id`

Update any fields on a worker. Returns the updated worker.

#### `DELETE /api/workers/:id`

Delete a worker.

---

### Pipelines

#### `GET /api/pipelines`

List all pipelines (steps array is empty for performance).

```json
[
  {
    "id": "uuid",
    "name": "The Daily Absurdist",
    "description": "...",
    "status": "active",
    "inputSchema": { "type": "object", "properties": { "topic": { "type": "string" } } },
    "steps": [],
    "createdAt": "2026-03-31T00:00:00Z"
  }
]
```

#### `GET /api/pipelines/:id`

Get a pipeline with full steps (including worker names).

#### `POST /api/pipelines`

Create a pipeline.

```json
{
  "name": "My Pipeline",
  "description": "...",
  "inputSchema": {
    "type": "object",
    "properties": {
      "topic": { "type": "string", "description": "The topic" }
    },
    "required": ["topic"]
  }
}
```

#### `PATCH /api/pipelines/:id`

Update pipeline fields.

#### `DELETE /api/pipelines/:id`

Delete a pipeline (cascades to steps).

#### `GET /api/pipelines/:id/steps`

List steps for a pipeline.

#### `POST /api/pipelines/:id/steps`

Add a step to a pipeline.

```json
{
  "stepIndex": 0,
  "name": "Research",
  "workerId": "uuid",
  "promptTemplate": "Research: {{input.topic}}",
  "timeoutSeconds": 120,
  "approvalRequired": false
}
```

#### `PATCH /api/pipelines/:pipelineId/steps/:stepId`

Update a step. A version snapshot of the pipeline is saved before the update is applied (see [Version History](./version-history.md)).

#### `DELETE /api/pipelines/:pipelineId/steps/:stepId`

Delete a step. A version snapshot is saved before deletion.

#### `POST /api/pipelines/:id/validate`

Run a static validation pass on the pipeline. Returns a `ValidationResult` without executing anything (see [Validation](./validation.md)).

```json
{
  "valid": false,
  "errors": [
    {
      "type": "missing_skill",
      "stepIndex": 0,
      "field": "skillName",
      "message": "Skill 'local/researcher' not found on disk",
      "severity": "error"
    }
  ],
  "warnings": []
}
```

#### `GET /api/pipelines/:id/versions`

List the most recent 50 version snapshots for a pipeline, in descending order.

```json
[
  { "id": "uuid", "versionNumber": 3, "changeSummary": "Before patch", "createdAt": "..." }
]
```

#### `GET /api/pipelines/:id/versions/:version`

Get a single snapshot. The `snapshot` field contains the full serialized `ApiPipeline` (including steps) at that point in time.

#### `POST /api/pipelines/:id/versions/:version/restore`

Restore the pipeline to a previous version. The current state is snapshotted first. Returns the restored `ApiPipeline`.

---

### Pipeline Runs

#### `GET /api/runs`

List runs. Optional query param: `?pipelineId=uuid`

```json
[
  {
    "id": "uuid",
    "pipelineId": "uuid",
    "pipelineName": "The Daily Absurdist",
    "status": "completed",
    "inputParams": { "topic": "AI replacing middle managers" },
    "triggerType": "manual",
    "createdAt": "...",
    "startedAt": "...",
    "finishedAt": "..."
  }
]
```

#### `POST /api/runs`

Trigger a pipeline run.

```json
{
  "pipelineId": "uuid",
  "inputParams": { "topic": "AI replacing middle managers" },
  "executionMode": "step_by_step"
}
```

- `executionMode`: omit for normal execution. Set to `"step_by_step"` to pause the run after each step completes (see [Step-by-Step Execution](#step-by-step-execution)).

Returns the created run object.

#### `GET /api/runs/:id`

Get a single run.

#### `POST /api/runs/:id/cancel`

Cancel a queued or running run.

#### `POST /api/runs/:id/resume`

Resume a run that is paused in step-by-step mode. Sets the run status back to `"queued"` so the engine picks it up on the next tick and executes the next step.

#### `POST /api/runs/:id/steps/:stepRunId/rerun`

Reset a completed step back to `"queued"` and re-queue the pipeline run for re-execution of that step. Useful for retrying a step with different prompt edits without re-running the whole pipeline.

#### `GET /api/runs/:id/steps`

Get all step runs for a run.

```json
[
  {
    "id": "uuid",
    "stepIndex": 0,
    "workerId": "uuid",
    "workerName": "Researcher",
    "status": "completed",
    "output": { "text": "## KEY FACTS\n..." },
    "startedAt": "...",
    "finishedAt": "..."
  }
]
```

#### `GET /api/runs/:id/steps/:stepRunId/events`

Get all recorded events for a step run (for replay).

```json
[
  { "seq": 0, "eventType": "text_delta", "message": "Searching...", "payload": null },
  { "seq": 1, "eventType": "tool_call_start", "message": "web_search", "payload": { "input": { "query": "..." } } }
]
```

---

### MCP Servers

MCP servers provide external tools that pipeline skills can call during execution. See [MCP Servers](./mcp-servers.md) for the full guide.

#### `GET /api/mcp-servers`

List all registered MCP servers.

#### `POST /api/mcp-servers`

Register a new MCP server.

```json
{
  "name": "brave-search",
  "transport": "stdio",
  "command": "npx",
  "args": ["-y", "@anthropic/brave-search-mcp"],
  "env": { "BRAVE_API_KEY": "key" },
  "enabled": true
}
```

#### `PATCH /api/mcp-servers/:id`

Update a server (e.g. toggle `enabled`, change `url`).

#### `DELETE /api/mcp-servers/:id`

Remove a server.

#### `POST /api/mcp-servers/:id/test`

Test the connection. Connects, lists tools, disconnects.

```json
{ "connected": true, "tools": [{ "serverName": "brave-search", "name": "search", ... }] }
```

#### `GET /api/mcp-servers/:id/tools`

Live tool list for a server.

---

### Packages

#### `POST /api/packages/preview`

Preview a pipeline as a package without writing any files. Returns the pipeline YAML, bundled skill contents, and a validation result — useful for inspecting what an export would produce.

```json
{ "pipelineId": "uuid" }
```

```json
{
  "pipelineYaml": "name: My Pipeline\n...",
  "skills": [
    {
      "name": "researcher",
      "qualifiedName": "local/researcher",
      "skillMd": "---\nname: researcher\n---\n...",
      "scripts": [{ "filename": "web_search.js", "content": "..." }]
    }
  ],
  "validation": { "valid": true, "errors": [], "warnings": [] }
}
```

---

### Triggers

Cron triggers schedule a pipeline to run automatically on a recurring schedule.

#### `GET /api/pipelines/:pipelineId/triggers`

List all triggers for a pipeline.

```json
[
  {
    "id": "uuid",
    "pipelineId": "uuid",
    "type": "cron",
    "enabled": true,
    "cronExpression": "0 9 * * *",
    "timezone": "America/New_York",
    "defaultInputs": { "topic": "today's news" },
    "nextRunAt": "2026-04-01T13:00:00Z",
    "lastFiredAt": "2026-03-31T13:00:00Z",
    "createdAt": "..."
  }
]
```

#### `POST /api/pipelines/:pipelineId/triggers`

Create a cron trigger. `nextRunAt` is computed automatically from the expression and timezone.

```json
{
  "type": "cron",
  "cronExpression": "0 9 * * *",
  "timezone": "America/New_York",
  "defaultInputs": { "topic": "today's news" }
}
```

#### `PATCH /api/triggers/:id`

Update a trigger (e.g. enable/disable, change expression).

```json
{ "enabled": false }
```

#### `DELETE /api/triggers/:id`

Delete a trigger.

---

### Approvals

Human-in-the-loop decision gates. An approval is created automatically when a pipeline run reaches a step with `approvalRequired: true`.

#### `GET /api/approvals?status=pending`

List approvals by status. `status` can be `pending`, `approved`, or `rejected`. Defaults to `pending`.

```json
[
  {
    "id": "uuid",
    "stepRunId": "uuid",
    "pipelineRunId": "uuid",
    "pipelineName": "The Daily Absurdist",
    "stepName": "Publish",
    "status": "pending",
    "payload": { "text": "Article text preview..." },
    "createdAt": "..."
  }
]
```

#### `POST /api/approvals/:id/approve`

Approve an approval gate. Re-queues the pipeline run so execution resumes. Optional note.

```json
{ "note": "Looks good, publish it." }
```

Returns the updated approval object.

#### `POST /api/approvals/:id/reject`

Reject an approval gate. Marks the pipeline run as failed. Optional note.

```json
{ "note": "Too controversial, don't publish." }
```

Returns the updated approval object.

---

### Budgets

Budget policies enforce spending caps on workers or pipelines.

#### `GET /api/budgets`

List budget policies. Optional filters: `?scopeType=worker&scopeId=uuid`

```json
[
  {
    "id": "uuid",
    "scopeType": "worker",
    "scopeId": "uuid",
    "amountCents": 500,
    "windowKind": "calendar_month",
    "warnPercent": 80,
    "hardStopEnabled": true,
    "createdAt": "..."
  }
]
```

#### `POST /api/budgets`

Create a budget policy.

```json
{
  "scopeType": "worker",
  "scopeId": "uuid",
  "amountCents": 500,
  "windowKind": "calendar_month",
  "warnPercent": 80,
  "hardStopEnabled": true
}
```

- `scopeType`: `"worker"` or `"pipeline"`
- `scopeId`: ID of the worker or pipeline
- `amountCents`: monthly cap in USD cents (e.g. `500` = $5.00)
- `windowKind`: `"calendar_month"` (resets on the 1st) or `"lifetime"`
- `warnPercent`: percentage at which to log a warning (not yet surfaced in UI)
- `hardStopEnabled`: if `true`, the step fails when the cap is hit

#### `PATCH /api/budgets/:id`

Update a budget policy.

#### `DELETE /api/budgets/:id`

Delete a budget policy.

---

## WebSocket

Connect to `ws://localhost:3009`. All messages are JSON.

### `run_status`

Emitted when a pipeline run changes status.

```ts
{
  type: "run_status"
  pipelineRunId: string
  status: "queued" | "running" | "paused" | "completed" | "failed" | "cancelled"
}
```

### `step_status`

Emitted when a step run changes status.

```ts
{
  type: "step_status"
  pipelineRunId: string
  stepRunId: string
  stepIndex: number
  status: "queued" | "running" | "completed" | "failed" | "cancelled"
}
```

### `step_event`

Emitted for each streaming event during step execution.

```ts
{
  type: "step_event"
  pipelineRunId: string
  stepRunId: string
  stepIndex: number
  eventType: "text_delta" | "tool_call_start" | "tool_call_end" | "status_change" | "error"
  message?: string    // text content for text_delta; tool name for tool_call_start; error message for error
  payload?: object    // tool input/output details for tool calls
}
```

The UI accumulates `text_delta` messages to build the live step output display.

### `trigger_fired`

Emitted when the trigger manager fires a cron trigger.

```ts
{
  type: "trigger_fired"
  triggerId: string
  pipelineId: string
  pipelineRunId: string
}
```

### `data_changed`

Emitted when the agent or any server-side process modifies a pipeline, step, or skill. The UI uses this to invalidate its React Query cache and re-fetch.

```ts
{
  type: "data_changed"
  entity: "pipeline" | "step" | "skill"
  id?: string
}
```

---

## Step-by-Step Execution

When a run is triggered with `executionMode: "step_by_step"`, the engine pauses the run after each step completes (unless it is the last step). The run status becomes `"paused"`.

Typical flow:

```
POST /api/runs { executionMode: "step_by_step" }   → run created (queued)
  Engine runs step 0
  → run status: "paused" (broadcast via run_status)

POST /api/runs/:id/resume                           → run re-queued
  Engine runs step 1
  → run status: "paused"

POST /api/runs/:id/resume                           → run re-queued
  Engine runs step 2 (last)
  → run status: "completed"
```

The **Run Detail** UI shows a "Continue to Next Step" banner when a run is paused. Completed steps show a re-run button (↺) to re-execute individual steps.
