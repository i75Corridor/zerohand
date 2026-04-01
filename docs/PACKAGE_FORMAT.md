# Zerohand Pipeline Package Format

A pipeline package is a directory that can be distributed as a git repository, npm package, or zip archive. When placed in the `PIPELINES_DIR` directory (default: `../pipelines`), the server auto-imports it on startup.

## Directory Structure

```
my-pipeline/
  pipeline.yaml          # manifest (required)
  prompts/               # system prompt files (optional)
    researcher.md
    writer.md
  context/               # context files interpolated into prompts (optional)
    COMPANY.md
  README.md              # human-readable documentation (optional)
```

## pipeline.yaml

The manifest describes the pipeline, its workers, and its steps.

```yaml
# Optional distribution metadata
package:
  version: "1.0.0"
  author: "Your Name"
  license: "MIT"
  repository: "https://github.com/user/my-pipeline"
  keywords: ["news", "automation"]

# Pipeline definition
name: My Pipeline
description: "What this pipeline does"

# Optional: JSON Schema for inputs passed to the pipeline at trigger time
inputSchema:
  type: object
  properties:
    topic:
      type: string
      description: "The topic to process"
  required: [topic]

# Workers used by steps in this pipeline
workers:
  researcher:
    name: Researcher
    type: pi
    model: anthropic/claude-sonnet-4-5-20251001
    systemPrompt: |
      You are a research assistant. Gather facts and summarize clearly.
    skills:
      - web_search
    budgetMonthlyCents: 1000

  writer:
    name: Writer
    type: pi
    model: anthropic/claude-sonnet-4-5-20251001
    systemPromptFile: prompts/writer.md
    skills:
      - editor

# Steps executed in order (stepIndex 0, 1, 2, ...)
steps:
  - name: Research
    worker: researcher
    promptTemplate: |
      Research the following topic and produce a structured brief:
      Topic: {{input.topic}}
    timeoutSeconds: 300

  - name: Write
    worker: writer
    promptTemplate: |
      Using this research:
      {{steps.0.output}}

      Write a 500-word article about: {{input.topic}}
    timeoutSeconds: 300
    approvalRequired: false
```

## Fields Reference

### Top-level

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Pipeline display name |
| `description` | No | Human-readable description |
| `inputSchema` | No | JSON Schema object for pipeline inputs |
| `workers` | Yes | Map of worker key → worker config |
| `steps` | Yes | Ordered list of step definitions |
| `package` | No | Distribution metadata (ignored by import) |

### Worker config

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Display name for the worker |
| `type` | Yes | `pi`, `imagen`, `publish`, `function`, `api` |
| `model` | No | `provider/model-name` (e.g. `anthropic/claude-sonnet-4-5-20251001`) |
| `systemPrompt` | No | Inline system prompt string |
| `systemPromptFile` | No | Path relative to package dir to a `.md` file |
| `skills` | No | List of skill names (must exist in `SKILLS_DIR`) |
| `budgetMonthlyCents` | No | Monthly spending cap in cents |

### Step config

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Step display name |
| `worker` | Yes | Key from the `workers` map |
| `promptTemplate` | Yes | Template string; supports `{{input.KEY}}` and `{{steps.N.output}}` tokens |
| `timeoutSeconds` | No | Max execution time (default 300) |
| `approvalRequired` | No | If true, run pauses for human approval before this step (default false) |

## Import Behavior

The server performs an **idempotent upsert** on startup:

- **New package** (name not in DB): creates pipeline, workers, and steps.
- **Existing package, same hash**: skips (no changes).
- **Existing package, hash changed**: updates pipeline and steps in-place, preserving all run history.

Workers are tracked by their YAML key via `pipeline.metadata.workerKeyMap`. This lets the import system match workers across restarts even if they are renamed in the DB via the UI.

## Distribution (Phase 8)

Future distribution mechanisms (not yet implemented):

```bash
# Install from git
zerohand install https://github.com/user/my-pipeline

# Install from npm
zerohand install npm:@user/my-zerohand-pipeline
```

Until the CLI exists, copy or clone the package directory into your `PIPELINES_DIR` and restart the server.
