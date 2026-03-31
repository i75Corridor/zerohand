# Triggers

Triggers schedule pipeline runs automatically. Currently, cron triggers are supported.

**Source:** `server/src/services/trigger-manager.ts`, `server/src/routes/triggers.ts`

---

## How Cron Triggers Work

The `TriggerManager` runs a polling loop every 30 seconds. On each tick it:

1. Queries all enabled cron triggers where `nextRunAt <= now()`.
2. For each due trigger, creates a `pipeline_run` with:
   - `status: "queued"`
   - `triggerType: "cron"`
   - `triggerDetail: { triggerId, expression }`
   - `inputParams: trigger.defaultInputs`
3. Updates the trigger: `lastFiredAt = now()`, `nextRunAt = computeNextRun(expression, timezone)`.
4. Broadcasts a `trigger_fired` WebSocket event.
5. The execution engine picks up the queued run on its next poll.

On first startup, triggers that have no `nextRunAt` value are initialized with the next scheduled time without firing immediately. This prevents a burst of runs on server restart.

---

## Creating a Trigger

### Via the UI

1. Go to **Pipelines** → click **Triggers** on a pipeline row.
2. Enter a cron expression (e.g. `0 9 * * *`), a timezone, and optional default inputs as JSON.
3. Click **Add Trigger**.

The modal also lists existing triggers with enable/disable toggles and delete buttons.

### Via the API

```http
POST /api/pipelines/:pipelineId/triggers
Content-Type: application/json

{
  "type": "cron",
  "cronExpression": "0 9 * * 1-5",
  "timezone": "America/New_York",
  "defaultInputs": { "topic": "today's top story" }
}
```

`nextRunAt` is computed server-side from the expression and timezone at creation time.

---

## Cron Expression Format

Standard 5-field cron: `minute hour day-of-month month day-of-week`

Examples:

| Expression | Meaning |
|------------|---------|
| `0 9 * * *` | Every day at 09:00 |
| `0 9 * * 1-5` | Weekdays at 09:00 |
| `*/30 * * * *` | Every 30 minutes |
| `0 0 1 * *` | First of every month at midnight |

Timezone is an IANA timezone string (e.g. `America/New_York`, `Europe/London`, `UTC`).

---

## Default Inputs

`defaultInputs` are merged into the pipeline run's `inputParams` when the trigger fires. These map to the pipeline's `inputSchema` fields — the same fields shown in the manual run modal.

```json
{ "topic": "today's top story" }
```

If the pipeline has no required inputs, `defaultInputs` can be omitted or set to `{}`.

---

## Enabling and Disabling

Triggers can be toggled without deleting them. A disabled trigger is never fired by the manager.

```http
PATCH /api/triggers/:id
Content-Type: application/json

{ "enabled": false }
```

---

## Next Run Computation

`computeNextRun(expression, timezone)` uses the [Croner](https://github.com/Hexagon/croner) library to parse the expression and compute the next scheduled time after now in the given timezone. This value is stored in `nextRunAt` and updated after each fire.

---

## Database Schema

Triggers are stored in the `triggers` table:

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `pipeline_id` | uuid | FK to pipelines |
| `type` | text | `cron` (webhook/channel planned) |
| `enabled` | boolean | Whether this trigger is active |
| `cron_expression` | text | 5-field cron string |
| `timezone` | text | IANA timezone (default: `UTC`) |
| `default_inputs` | jsonb | Input params passed to the triggered run |
| `next_run_at` | timestamp | When this trigger will next fire |
| `last_fired_at` | timestamp | When this trigger last fired |
| `created_at` | timestamp | |
| `updated_at` | timestamp | |
