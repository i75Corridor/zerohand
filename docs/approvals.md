# Approvals

Human-in-the-loop approval gates allow a human operator to review and approve or reject a pipeline step before execution continues.

**Source:** `server/src/routes/approvals.ts`, `server/src/services/execution-engine.ts`

---

## How Approval Gates Work

Any pipeline step can be marked with `approvalRequired: true` in `pipeline.yaml`:

```yaml
steps:
  - name: Publish
    worker: publisher
    approvalRequired: true
    promptTemplate: "{{steps.2.output}}"
    metadata:
      imageStepIndex: 3
```

When the execution engine reaches a step with `approvalRequired: true`:

1. An `approval` record is created with:
   - `status: "pending"`
   - `payload`: the resolved prompt (the content the human is reviewing)
   - `pipelineRunId` + `stepRunId` for traceability
2. The pipeline run is set to `status: "paused"`.
3. The engine returns — the run is no longer in-flight.

The Approvals page polls every 10 seconds and displays pending approvals. The sidebar nav badge updates every 15 seconds.

---

## Making a Decision

### Via the UI

1. Go to **Approvals** — pending approvals are shown as cards.
2. Each card shows the pipeline name, step name, creation time, and payload (if non-empty).
3. Click **Approve** or **Reject**.
4. A note input appears — optionally add a note, then click **Confirm Approve** or **Confirm Reject**.
5. The card disappears; the pipeline resumes (or fails) in the background.

### Via the API

Approve:
```http
POST /api/approvals/:id/approve
Content-Type: application/json

{ "note": "Looks good." }
```

Reject:
```http
POST /api/approvals/:id/reject
Content-Type: application/json

{ "note": "Too risky, hold off." }
```

---

## What Happens After a Decision

### On Approve

1. The approval record is updated: `status: "approved"`, `decisionNote`, `decidedAt`.
2. The pipeline run is re-queued: `status: "queued"`.
3. A `run_status` WebSocket event is broadcast.
4. The execution engine picks up the run on its next tick.
5. It loads all existing `step_runs`, repopulates outputs from completed steps, and continues from the approved step.

### On Reject

1. The approval record is updated: `status: "rejected"`, `decisionNote`, `decidedAt`.
2. The step run is marked `failed`.
3. The pipeline run is marked `failed` with the message `"Rejected: {note}"`.
4. A `run_status` WebSocket event is broadcast.
5. No further steps are executed.

---

## Listing Approvals

```http
GET /api/approvals?status=pending
```

Status can be `pending`, `approved`, or `rejected`. Returns approvals joined with pipeline names and step names for display.

---

## Pipeline YAML Configuration

```yaml
steps:
  - name: Review Article
    worker: editor
    approvalRequired: true
    timeoutSeconds: 300
    promptTemplate: |
      Review this article and confirm it meets editorial standards:
      {{steps.1.output}}
```

When `approvalRequired` is omitted or `false`, the step executes immediately without waiting.

---

## Database Schema

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `step_run_id` | uuid | FK to step_runs |
| `pipeline_run_id` | uuid | FK to pipeline_runs |
| `status` | text | `pending`, `approved`, or `rejected` |
| `payload` | jsonb | Content for the human to review (resolved prompt) |
| `decision_note` | text | Optional note from the approver |
| `decided_at` | timestamp | When the decision was made |
| `created_at` | timestamp | When the gate was hit |
| `updated_at` | timestamp | |
