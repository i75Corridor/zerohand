# Pawn Pipeline Package Format

A pipeline package is a directory that can be distributed as a git repository, npm package, or zip archive. When placed in the `PIPELINES_DIR` directory (default: `../pipelines`), the server auto-imports it on startup.

## Directory Structure

```
my-pipeline/
  pipeline.yaml          # manifest (required)
  COMPANY.md             # context file (interpolated into prompts via {{context.company}})
  prompts/               # system prompt files (optional, for legacy worker-based pipelines)
    researcher.md
    writer.md
```

## pipeline.yaml (skill-based format, recommended)

The new format uses `skill:` on steps and a top-level `model:` instead of a `workers:` section.

```yaml
name: My Pipeline
description: "What this pipeline does"

# Model for all skill-based steps (can be overridden per skill in SKILL.md)
model: google/gemini-2.5-flash

# Optional: system prompt prepended to every skill's body
systemPrompt: |
  You are the editorial team for My Publication.

# Optional: inline system prompt file (relative to package dir)
# systemPromptFile: ./SYSTEM.md

# Optional: JSON Schema for inputs passed to the pipeline at trigger time
inputSchema:
  type: object
  properties:
    topic:
      type: string
      description: "The topic to process"
  required: [topic]

# Context files — loaded as strings and available as {{context.<key>}} in skill prompts
context:
  company: ./COMPANY.md

# Steps executed in order (stepIndex 0, 1, 2, ...)
steps:
  - name: Research
    skill: researcher       # references skills/researcher/SKILL.md
    promptTemplate: |
      Research the topic: "{{input.topic}}"
    timeoutSeconds: 120

  - name: Write
    skill: writer
    promptTemplate: |
      Write an article based on:
      {{steps.0.output}}
    timeoutSeconds: 180

  - name: Illustrate
    skill: imagen
    promptTemplate: "{{steps.1.output.imagePrompt}}"
    timeoutSeconds: 120

  - name: Publish
    skill: publisher
    promptTemplate: "{{steps.1.output}}"
    timeoutSeconds: 30
    metadata:
      imageStepIndex: 2
```

## pipeline.yaml (legacy worker-based format)

The original format with `workers:` is still supported for backwards compatibility.

```yaml
name: My Pipeline
description: "What this pipeline does"

inputSchema:
  type: object
  properties:
    topic:
      type: string
  required: [topic]

workers:
  researcher:
    name: Researcher
    workerType: pi
    modelProvider: google
    modelName: gemini-2.5-flash
    systemPromptFile: ./prompts/researcher.md
    customTools:
      - web_search

steps:
  - name: Research
    worker: researcher
    promptTemplate: |
      Research: {{input.topic}}
    timeoutSeconds: 300
```

## Fields Reference

### Top-level

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Pipeline display name |
| `description` | No | Human-readable description |
| `model` | No | `provider/model-name` for all skill-based steps (e.g. `google/gemini-2.5-flash`) |
| `systemPrompt` | No | Inline system prompt prepended to all skill prompts |
| `systemPromptFile` | No | Path relative to package dir to a system prompt `.md` file |
| `inputSchema` | No | JSON Schema object for pipeline inputs |
| `context` | No | Map of key → relative file path; files are loaded and available as `{{context.key}}` |
| `workers` | No | Legacy: map of worker key → worker config (omit for skill-based pipelines) |
| `steps` | Yes | Ordered list of step definitions |

### Step config (skill-based)

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Step display name |
| `skill` | Yes (skill mode) | Skill folder name (must exist in `SKILLS_DIR`) |
| `promptTemplate` | Yes | Template string; supports `{{input.KEY}}`, `{{steps.N.output}}`, `{{steps.N.output.field}}` |
| `timeoutSeconds` | No | Max execution time (default 300) |
| `approvalRequired` | No | If true, run pauses for human approval before this step (default false) |
| `metadata` | No | Arbitrary metadata; `imageStepIndex` used by publish skills |

### Step config (legacy worker-based)

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Step display name |
| `worker` | Yes (worker mode) | Key from the `workers` map |
| `promptTemplate` | Yes | Template string |
| `timeoutSeconds` | No | Max execution time (default 300) |
| `approvalRequired` | No | Approval gate (default false) |

## Skill Directory Format

Skills live in `SKILLS_DIR` (default: `../skills`) and are organized into namespaces.

### Namespacing

Skills use a two-level `<namespace>/<skill-name>` path:

```
skills/
  local/                      # skills created in-app or via the agent
    researcher/
      SKILL.md
      scripts/
        web_search.js
    writer/
      SKILL.md
  daily-absurdist/            # namespace = package slug on import
    researcher/
      SKILL.md
    writer/
      SKILL.md
```

| Namespace | Source |
|-----------|--------|
| `local` | Skills created via the in-app builder or the global agent |
| `<package-slug>` | Skills imported from a package (namespace = slug derived from package name) |

When referencing a skill in `pipeline.yaml` or via the API, use the fully qualified name:

```yaml
steps:
  - name: Research
    skill: local/researcher    # or daily-absurdist/researcher
```

**Export behavior:** When exporting a pipeline as a package, the namespace prefix is stripped from skill paths (the package itself is the namespace context on import).

### SKILL.md format

```markdown
---
name: researcher
version: "1.0.0"
description: "Research Director"
type: pi                        # pi | imagen | publish
model: google/gemini-2.5-flash  # optional model override
mcpServers:                     # optional: MCP servers whose tools are available to this skill
  - brave-search
  - filesystem
metadata:                       # optional, used by imagen type
  aspectRatio: "16:9"
  personGeneration: allow_all
---

You are the Research Director. {{context.company}}

[System prompt body — appended to the pipeline system prompt]
```

The `mcpServers` field references server names registered in the global MCP server registry (see [MCP Servers](./mcp-servers.md)). The execution engine connects to these servers before running the step and makes their tools available to the LLM.

### Script tools

Scripts in `scripts/` become LLM-callable tools. They receive JSON on stdin and must write their result to stdout:

```javascript
// skills/researcher/scripts/web_search.js
import { createInterface } from "readline";
const chunks = [];
const rl = createInterface({ input: process.stdin });
rl.on("line", (line) => chunks.push(line));
rl.on("close", async () => {
  const { query = "", maxResults = 8 } = JSON.parse(chunks.join("\n") || "{}");
  // ... perform search ...
  console.log(JSON.stringify(results));
});
```

Supported script types: `.js` (node), `.ts` (npx tsx), `.py` (python3), `.sh` (bash).

## Import Behavior

The server performs an **idempotent upsert** on startup:

- **New package** (name not in DB): creates pipeline, workers (if any), and steps.
- **Existing package, same hash**: skips (no changes).
- **Existing package, hash changed**: updates pipeline and steps in-place, preserving all run history.

Workers are tracked by their YAML key via `pipeline.metadata.workerKeyMap`. Context values are stored in `pipeline.metadata.context` and loaded at run time for skill prompt interpolation.
