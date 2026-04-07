# Version History

Every time a pipeline or its steps are modified, Pawn automatically saves a snapshot of the full pipeline state before applying the change. These snapshots form a version history that you can browse and restore from.

**Source:** `server/src/routes/pipelines.ts` (`snapshotPipeline()`), `packages/db/src/schema/pipeline-versions.ts`

---

## How Snapshots Are Created

A snapshot is taken automatically — no user action required — before any of these operations:

- `PATCH /api/pipelines/:id` — editing pipeline metadata (name, description, model, inputSchema, systemPrompt)
- `PATCH /api/pipelines/:pipelineId/steps/:stepId` — editing a step
- `DELETE /api/pipelines/:pipelineId/steps/:stepId` — deleting a step

Each snapshot stores the full `ApiPipeline` object (including all steps at that moment) as JSONB, plus a human-readable `changeSummary` describing which operation triggered it.

Version numbers are sequential per pipeline, starting at 1.

---

## Browsing Version History

### Via UI

From the **Pipeline Detail** page, click **Version History** to expand the history panel. Each entry shows:
- Version number (`v1`, `v2`, …)
- Change summary (e.g. "Before patch", "Before step delete")
- Timestamp

Click **Restore** on any version to roll back to that state.

### Via API

#### `GET /api/pipelines/:id/versions`

Returns the most recent 50 versions (descending order).

```json
[
  {
    "id": "uuid",
    "versionNumber": 5,
    "changeSummary": "Before patch",
    "createdAt": "2026-04-04T10:23:00Z"
  }
]
```

#### `GET /api/pipelines/:id/versions/:version`

Returns a single version including the full `snapshot` field.

```json
{
  "id": "uuid",
  "pipelineId": "uuid",
  "versionNumber": 3,
  "snapshot": { "id": "...", "name": "My Pipeline", "steps": [...] },
  "changeSummary": "Before step patch",
  "createdAt": "..."
}
```

---

## Restoring a Version

### Via UI

Click **Restore** next to any version in the Version History panel. The current state is snapshotted first (so you can undo the restore), then the pipeline and all its steps are replaced with the snapshot values.

### Via API

```http
POST /api/pipelines/:id/versions/:version/restore
```

What happens:
1. The current state is snapshotted (so the restore itself is undoable).
2. Pipeline metadata fields are updated to the snapshot values.
3. All current steps are deleted.
4. Steps from the snapshot are re-inserted.
5. If the pipeline has a local package on disk, `pipeline.yaml` is updated.

Returns the restored `ApiPipeline` object.

---

## Database Schema

```sql
CREATE TABLE pipeline_versions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id     UUID NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
  version_number  INTEGER NOT NULL,
  snapshot        JSONB NOT NULL,    -- full ApiPipeline including steps
  change_summary  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(pipeline_id, version_number)
);
```

Versions are cascade-deleted when the pipeline is deleted.

---

## Notes

- Version history is per-pipeline, not global — there is no cross-pipeline diff or merge.
- History is capped at 50 versions displayed in the UI; the database retains all versions.
- Version numbers never reset even after a restore — the restore adds a new version on top.
- Snapshots are not taken for `POST /api/pipelines/:id/steps` (adding a new step) — only for destructive or modifying operations.
