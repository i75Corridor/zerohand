# Workers

A worker defines *how* a pipeline step is executed — which model to use, what system prompt to run, which skills and tools to make available, and what type of execution to perform.

Workers are defined inside `pipeline.yaml` under the `workers` key and are created in the database when the pipeline is seeded. They can also be created directly via the REST API.

---

## Worker Types

### `pi` — LLM Agent (via Pi.dev)

Runs a full pi.dev agent session. The worker's system prompt, skills, and custom tools are loaded into the session. The resolved step `promptTemplate` is sent as the user message. The agent may call tools and iterate before producing a final response.

**Configuration:**

```yaml
workerType: pi
modelProvider: google           # google | anthropic | openai
modelName: gemini-2.5-flash
systemPrompt: "You are..."      # inline system prompt
systemPromptFile: ./prompts/researcher.md   # or a file path (relative to pipeline dir)
skills:
  - research                    # skill names matching subdirs in SKILLS_DIR
customTools:
  - web_search                  # built-in tool names (see Built-in Tools below)
```

**Output:** The final assistant text from the agent session.

---

### `imagen` — Image Generation

Calls the Google Imagen API with the resolved prompt as the image generation prompt. Appends a fixed editorial cartoon style suffix. Falls back to two generic prompts if the primary fails.

**Configuration:**

```yaml
workerType: imagen
modelProvider: google
modelName: imagen-4.0-generate-001   # or imagen-4.0-fast-generate-001
```

**Output:** Absolute path to the saved `.png` file (e.g. `/app/output/2026-03-31-ai-replacing-managers.png`).

The output file is written to `OUTPUT_DIR` (env var, default `../output` relative to server). Filename is derived from the run ID and step index for uniqueness.

---

### `publish` — Markdown Publisher

Assembles a markdown article from the resolved prompt (article text) and an optional image from a prior step. Writes the result to `OUTPUT_DIR` as a `.md` file.

**Configuration:**

```yaml
workerType: publish
modelProvider: none
modelName: none
```

**Step metadata** (set on the step, not the worker):

```yaml
steps:
  - name: Publish
    worker: publisher
    promptTemplate: "{{steps.1.output}}"   # article text
    metadata:
      imageStepIndex: 3   # step index whose output is the image file path
```

**Output:** Absolute path to the saved `.md` file.

The filename is derived from the `#` headline in the article text. Format: `{date}-{headline-slug}.md`.

---

## Skills

Skills are `SKILL.md` files discovered from the `SKILLS_DIR` directory. Each skill lives in its own subdirectory:

```
skills/
├── research/
│   └── SKILL.md
├── writer/
│   └── SKILL.md
└── editor/
    └── SKILL.md
```

Skills are loaded via the pi.dev `loadSkillsFromDir()` API and injected into the agent session's context. A worker declares which skills it needs by name:

```yaml
skills:
  - research
  - writer
```

Only skills whose names match the worker's list are injected. If `SKILLS_DIR` doesn't exist or the worker's `skills` list is empty, no skills are loaded.

`SKILL.md` format follows the [Agent Skills standard](https://agentskills.io). At minimum a skill file needs a name in the frontmatter:

```markdown
---
name: research
description: Web research and structured reporting
---

## Research Protocol

When asked to research a topic, always...
```

---

## Built-in Tools

Custom tools are registered with the pi session and callable by the agent during its run.

### `web_search`

Searches the web using DuckDuckGo's HTML interface. Returns an array of `{ title, url, snippet }` objects.

```yaml
customTools:
  - web_search
```

Parameters the agent passes:
- `query` (string) — the search query
- `maxResults` (number, optional) — max results to return, default 8

Implementation: `server/src/services/pi-executor.ts` → `makeWebSearchTool()`

---

## Database Schema

Workers are stored in the `workers` table:

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `name` | text | Display name |
| `description` | text | Human-readable description |
| `worker_type` | text | `pi`, `imagen`, or `publish` |
| `model_provider` | text | `google`, `anthropic`, `openai`, `none` |
| `model_name` | text | Model identifier |
| `system_prompt` | text | Fully resolved system prompt (context already interpolated) |
| `skills` | jsonb | Array of skill names |
| `custom_tools` | jsonb | Array of built-in tool names |
| `metadata` | jsonb | Arbitrary worker-level config |
| `status` | text | `idle`, `active`, `paused`, `error` |

---

## REST API

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/workers` | List all workers |
| `POST` | `/api/workers` | Create a worker |
| `PATCH` | `/api/workers/:id` | Update a worker |
