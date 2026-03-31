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

Update a step.

#### `DELETE /api/pipelines/:pipelineId/steps/:stepId`

Delete a step.

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
  "inputParams": { "topic": "AI replacing middle managers" }
}
```

Returns the created run object.

#### `GET /api/runs/:id`

Get a single run.

#### `POST /api/runs/:id/cancel`

Cancel a queued or running run.

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
