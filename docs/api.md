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
