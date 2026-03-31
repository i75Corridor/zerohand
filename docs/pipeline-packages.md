# Pipeline Packages

Pipelines are defined as self-contained directory packages under `pipelines/`. Each package is a directory containing a `pipeline.yaml` manifest and any associated prompt files and context documents.

```
pipelines/
└── my-pipeline/
    ├── pipeline.yaml        ← required: manifest
    ├── COMPANY.md           ← optional: context file
    └── prompts/
        ├── researcher.md    ← system prompt file
        └── writer.md
```

On startup, the server scans every subdirectory of `PIPELINES_DIR` for a `pipeline.yaml` and seeds it into the database if not already present — or re-seeds it if the file has changed.

---

## pipeline.yaml Format

```yaml
name: The Daily Absurdist
description: "Satirical news pipeline: research → write → edit → publish"
status: active          # active | archived

# JSON Schema describing the inputs a user must provide when triggering a run.
# The UI renders one form field per property automatically.
inputSchema:
  type: object
  properties:
    topic:
      type: string
      description: Topic for the satirical article
  required:
    - topic

# Context files — read from disk and made available as {{context.<key>}}
# inside system prompt files. Paths are relative to this pipeline directory.
context:
  company: ./COMPANY.md

# Workers defined for this pipeline.
# Keys (e.g. "researcher") are used to reference workers from steps.
workers:
  researcher:
    name: Researcher
    description: Research Director
    workerType: pi                          # pi | imagen | publish
    modelProvider: google
    modelName: gemini-2.5-flash
    skills:                                 # SKILL.md names from skills/ directory
      - research
    customTools:                            # built-in tool names
      - web_search
    systemPromptFile: ./prompts/researcher.md   # or: systemPrompt: "inline text"

  image_generator:
    name: Image Generator
    workerType: imagen
    modelProvider: google
    modelName: imagen-4.0-generate-001

  publisher:
    name: Publisher
    workerType: publish
    modelProvider: none
    modelName: none

# Steps execute in order. Each step references a worker by its key above.
steps:
  - name: Research
    worker: researcher
    timeoutSeconds: 120
    promptTemplate: |
      Research this topic: "{{input.topic}}"

  - name: Write
    worker: writer
    timeoutSeconds: 180
    promptTemplate: |
      Write an article based on this research:
      {{steps.0.output}}

  - name: Illustrate
    worker: image_generator
    timeoutSeconds: 120
    promptTemplate: "{{steps.2.output.imagePrompt}}"   # JSON path into prior step output

  - name: Publish
    worker: publisher
    timeoutSeconds: 30
    promptTemplate: "{{steps.1.output}}"    # article text becomes the "prompt"
    metadata:
      imageStepIndex: 3                     # which step's output is the image path
```

---

## Prompt Template Interpolation

Step `promptTemplate` fields are resolved before being dispatched to the worker.

| Syntax | Resolves to |
|--------|-------------|
| `{{input.topic}}` | Run input param `topic` |
| `{{steps.0.output}}` | Full text output of step 0 |
| `{{steps.2.output.imagePrompt}}` | JSON dot-path into step 2's output |

For `pi` workers, the resolved prompt is the message sent to the agent.
For `imagen` workers, the resolved prompt is the image generation prompt.
For `publish` workers, the resolved prompt is the article text to write to disk.

---

## Context Files and System Prompt Interpolation

Context files are loaded once at seed time and their content is interpolated into system prompt files before being written to the database.

In `pipeline.yaml`:
```yaml
context:
  company: ./COMPANY.md
```

In `prompts/writer.md`:
```
You are the Staff Writer at The Daily Absurdist.

{{context.company}}

Write a 2,000–2,500 word article...
```

The `{{context.company}}` placeholder is replaced with the full content of `COMPANY.md` when the pipeline is seeded. This happens at seed time, not at run time.

---

## Change Detection and Re-seeding

A SHA-256 hash of `pipeline.yaml` is stored in `pipeline.metadata.configHash`. On each startup the server compares the current file hash against the stored hash.

- **Hash matches** → skip (log: "up to date")
- **Hash differs** → tear down existing pipeline (deletes run history), re-seed from current config

This means any change to `pipeline.yaml` — adding a step, changing a model, updating a prompt template — is automatically picked up on the next server restart.

> **Note:** Re-seeding deletes all pipeline run history for that pipeline. This is intentional for the development workflow. Run history is considered ephemeral relative to config changes.

---

## Adding a New Pipeline Package

1. Create a directory under `pipelines/`:
   ```
   pipelines/my-pipeline/
   ```

2. Add a `pipeline.yaml` following the format above.

3. Optionally add prompt files and context documents.

4. Restart the server. The pipeline appears in the UI automatically.

No code changes required.

---

## Docker

In Docker, the `pipelines/` and `skills/` directories are copied into the image at `/app/pipelines` and `/app/skills`. The server is configured via environment variables:

```yaml
PIPELINES_DIR: /app/pipelines
SKILLS_DIR: /app/skills
OUTPUT_DIR: /app/output
```

To inject custom pipelines into a Docker deployment without rebuilding the image, mount a volume over `/app/pipelines`.
