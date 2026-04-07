# Global Agent & Pipeline Authoring Tools

Pawn includes a global LLM agent (accessible via the chat interface) that can create, edit, validate, test, and export pipelines. The agent uses the same REST API as the UI but has additional tools for richer authoring workflows.

**Source:** `server/src/services/global-agent.ts`, `server/src/services/tools/`

---

## Pipeline Composition Workflow

The agent follows a structured workflow when asked to build a pipeline:

1. **Gather requirements** — understand inputs, outputs, and step structure needed
2. **Check MCP availability** — call `list_mcp_servers` to see what servers are registered
3. **Inspect MCP tools** — call `list_mcp_server_tools` for any server you plan to use; get exact tool names, descriptions, and schemas to write accurate skill system prompts
4. **Design skill decomposition** — break the task into sequential steps, each with one skill
4. **Create skills** — call `create_skill` for each skill, then `create_skill_script` for tools
5. **Create pipeline** — call `create_pipeline` (include `inputSchema`)
6. **Add steps** — call `add_pipeline_step` for each, linking to the skill's qualified name (`local/<name>`)
7. **Validate** — call `validate_pipeline` and fix any errors before proceeding
8. **Test (optional)** — call `test_step` to run individual steps with mock inputs
9. **Export** — call `get_pipeline_yaml` or `export_package` to produce the distributable form

---

## Available Tools

### Pipeline tools

| Tool | Description |
|------|-------------|
| `create_pipeline` | Create a new pipeline with name, description, inputSchema, model |
| `update_pipeline` | Update pipeline metadata fields |
| `delete_pipeline` | Delete a pipeline and all its steps |
| `add_pipeline_step` | Add a step to a pipeline (stepIndex, name, skillName, promptTemplate, ...) |
| `update_pipeline_step` | Update a specific step |
| `delete_pipeline_step` | Delete a step |
| `list_pipelines` | List all pipelines |
| `get_pipeline` | Get full pipeline including steps |

### Skill tools

| Tool | Description |
|------|-------------|
| `create_skill` | Create a new skill (namespace defaults to `local`) |
| `update_skill` | Update a skill's SKILL.md |
| `create_skill_script` | Add a script file to a skill's `scripts/` directory |
| `update_skill_script` | Update an existing script |
| `delete_skill_script` | Remove a script from a skill |
| `list_skills` | List all skills (grouped by namespace) |
| `get_skill` | Get a skill's SKILL.md content |
| `clone_skill` | Copy an existing skill to a new name/namespace |
| `delete_skill` | Remove a skill (blocked if referenced by a pipeline) |

### Run & test tools

| Tool | Description |
|------|-------------|
| `trigger_run` | Start a pipeline run with input params |
| `get_run` | Get run status and details |
| `list_runs` | List recent runs for a pipeline |
| `cancel_run` | Cancel a queued or running run |
| `test_step` | Execute a single step in isolation with mock inputs (no full run created) |
| `get_step_run_output` | Retrieve the output of a specific step run |

### Validation & export tools

| Tool | Description |
|------|-------------|
| `validate_pipeline` | Run static validation — returns `{valid, errors[], warnings[]}` |
| `get_pipeline_yaml` | Serialize a pipeline to its YAML representation |
| `export_package` | Return full package bundle: YAML + skill SKILL.md files + scripts |

### MCP server tools

| Tool | Description |
|------|-------------|
| `list_mcp_servers` | List registered MCP servers with name, transport, enabled flag, and source |
| `list_mcp_server_tools` | Connect to a specific server and return its full tool list (names, descriptions, input schemas, agent tool names) |
| `register_mcp_server` | Register a new MCP server (stdio/sse/streamable-http) |
| `update_mcp_server` | Update a server's config or toggle its `enabled` flag |
| `delete_mcp_server` | Remove a server from the registry |

---

## Skill Namespacing in Agent Context

Skills created by the agent go into the `local` namespace. When referencing a skill in a pipeline step, always use the fully qualified name:

```
local/researcher
local/writer
daily-absurdist/researcher   ← imported package skill
```

The agent's system prompt includes this reminder, so it should use qualified names automatically.

---

## `test_step` Tool

`test_step` runs a single step without creating a full pipeline run record. It is useful for rapidly iterating on a skill or prompt template.

Parameters:
- `pipelineId` — the pipeline containing the step
- `stepIndex` — which step to run (0-based)
- `mockInputs` — values for `{{input.*}}` tokens (e.g. `{ "topic": "AI" }`)
- `previousOutputs` — values for `{{steps.N.output}}` tokens (e.g. `{ 0: "Research findings..." }`)

Returns the step's output text.

---

## Agent Tool Context

The agent tools share a `AgentToolContext` object that provides:
- `db` — Drizzle database instance
- `broadcast` / `broadcastDataChanged` — WebSocket broadcasting
- `cancelRun` — function to cancel an in-flight run
- `skillsDir` — resolved path to `SKILLS_DIR`
- `runSkillStep` — used by `test_step` to execute a skill step in isolation

---

## Script Authoring Patterns

Scripts in `skills/<ns>/<name>/scripts/` receive JSON on stdin and write results to stdout. Common patterns:

```javascript
// Read input
const chunks = [];
process.stdin.on("data", (c) => chunks.push(c));
process.stdin.on("end", async () => {
  const input = JSON.parse(chunks.join("") || "{}");
  const { query } = input;

  // Perform work...

  // Return result
  console.log(JSON.stringify({ result: "..." }));
});
```

- **Web requests**: use `fetch()` (Node 18+) — no extra libraries needed
- **File output**: write to `process.env.OUTPUT_DIR` if the step produces files
- **Error handling**: exit with non-zero code and write to stderr; the engine captures it as the step error
- **Secrets**: declare `secrets: [MY_KEY]` in SKILL.md frontmatter to receive env vars; access via `process.env.MY_KEY`
- **Scope**: one capability per script file; compose via multiple scripts rather than one large one
