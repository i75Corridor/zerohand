# Budgets

Budget policies enforce spending caps on `pi` workers or entire pipelines. The budget guard checks the cap before each step and records a cost event after each step completes.

**Source:** `server/src/services/budget-guard.ts`, `server/src/routes/budgets.ts`

---

## How Budget Enforcement Works

Before each `pi` step, the execution engine calls `checkBudget(db, workerId, pipelineRunId)`:

1. Queries `budget_policies` for any policy scoped to the worker (`scopeType: "worker"`, `scopeId: workerId`).
2. Sums all `cost_events.cost_cents` for that scope in the current calendar month.
3. If the total meets or exceeds `policy.amountCents` and `hardStopEnabled` is true, throws a budget exceeded error.
4. The step and pipeline run are marked `failed` with a clear message.

After each `pi` step completes successfully, `recordCost()` inserts a `cost_events` row with:
- Real input and output token counts from the pi session's usage object
- A `costCents` estimate based on the model's pricing rate
- References to the step run, worker, and pipeline run for querying

---

## Model Pricing

`budget-guard.ts` maintains a pricing table (USD per million tokens) for known models. Unknown models fall back to a default rate. Pricing is used only for tracking and enforcement — actual billing is handled by the model provider.

---

## Creating a Budget Policy

### Via the API

```http
POST /api/budgets
Content-Type: application/json

{
  "scopeType": "worker",
  "scopeId": "uuid-of-worker",
  "amountCents": 500,
  "windowKind": "calendar_month",
  "warnPercent": 80,
  "hardStopEnabled": true
}
```

- `scopeType`: `"worker"` — enforced per worker (checked before each step that uses this worker)
- `amountCents`: cap in USD cents. `500` = $5.00 per month.
- `windowKind`: `"calendar_month"` resets on the 1st of each month. `"lifetime"` never resets.
- `warnPercent`: percentage of the cap at which a warning is logged (e.g. `80` = warn at $4.00 of $5.00). Not yet surfaced in UI.
- `hardStopEnabled`: if `true`, the step fails when the cap is exceeded. If `false`, the check is advisory only (warning logged, execution continues).

### Scope Types

| `scopeType` | `scopeId` | Behavior |
|-------------|-----------|----------|
| `worker` | Worker UUID | Caps cumulative spend for a specific worker across all runs |

Pipeline-scoped budgets are planned but not yet implemented in the enforcement logic.

---

## Listing and Managing Policies

```http
GET /api/budgets
GET /api/budgets?scopeType=worker&scopeId=uuid
PATCH /api/budgets/:id
DELETE /api/budgets/:id
```

---

## Cost Events

Every completed `pi` step generates a `cost_events` row. These are the source of truth for budget enforcement.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `step_run_id` | uuid | FK to step_runs |
| `worker_id` | uuid | FK to workers |
| `pipeline_run_id` | uuid | FK to pipeline_runs |
| `provider` | text | `google`, `anthropic`, `openai` |
| `model` | text | Model identifier |
| `input_tokens` | integer | Tokens in the prompt |
| `output_tokens` | integer | Tokens in the response |
| `cost_cents` | integer | Estimated cost in USD cents |
| `occurred_at` | timestamp | When the step completed |

---

## Database Schema: Budget Policies

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `scope_type` | text | `worker` or `pipeline` |
| `scope_id` | uuid | ID of the scoped entity |
| `amount_cents` | integer | Spending cap in USD cents |
| `window_kind` | text | `calendar_month` or `lifetime` |
| `warn_percent` | integer | Warning threshold (0–100) |
| `hard_stop_enabled` | boolean | Whether to fail the step on cap exceeded |
| `created_at` | timestamp | |
| `updated_at` | timestamp | |
