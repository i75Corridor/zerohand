# Pipeline Validation

Pawn includes a fast, static validation pass that checks a pipeline for common errors before running it. Validation does not execute any LLM calls or scripts — it inspects the pipeline definition, its steps, and references to external resources.

**Source:** `server/src/services/tools/validate-pipeline.ts`, `server/src/routes/pipelines.ts`

---

## Running Validation

### Via UI

From the **Pipeline Detail** page, click the **Validate** button in the Validation section. Results appear inline with per-error severity indicators.

In **PipelineBuilder** (edit mode), validation runs automatically after saving. Each step in the step list shows a colored status dot:

| Dot color | Meaning |
|-----------|---------|
| Green | No errors or warnings for this step |
| Amber | One or more warnings |
| Red | One or more errors |

### Via API

```http
POST /api/pipelines/:id/validate
```

Returns a `ValidationResult`:

```json
{
  "valid": true,
  "errors": [],
  "warnings": [
    {
      "type": "missing_secret",
      "stepIndex": 1,
      "field": "promptTemplate",
      "message": "Secret 'OPENAI_API_KEY' is not set in the environment",
      "severity": "warning"
    }
  ]
}
```

### Via Agent

The agent tool `validate_pipeline` runs the same check:

```
Validate pipeline <id>
→ returns { valid, errors, warnings }
```

---

## What Is Checked

| Check | Severity | Description |
|-------|----------|-------------|
| **Missing skill** | error | A step's `skillName` does not resolve to a directory in `SKILLS_DIR` |
| **Missing MCP server** | error | A skill's `mcpServers` list references a server that is not registered |
| **Disabled MCP server** | error | A referenced MCP server exists but has `enabled: false` |
| **Invalid `{{input.X}}` token** | error | `X` is not a property in the pipeline's `inputSchema` |
| **Invalid `{{steps.N.output}}` token** | error | `N` is not a valid earlier step index (N ≥ current step index) |
| **Missing secret env var** | warning | A `{{secret.X}}` token references an env var that is not set |
| **Unrecognised `{{context.X}}`** | warning | A context reference doesn't match any context key in the pipeline metadata |

Validation does **not** check:
- Whether scripts actually run correctly
- Whether the LLM will produce useful output
- API key validity (only whether the env var is set)

---

## Template Token Highlighting

When editing a step in **PipelineBuilder**, unresolvable `{{...}}` tokens in the prompt template are highlighted in real time below the textarea. Tokens that reference missing input fields or out-of-range step indices appear as red pill badges — no save required.

---

## `ValidationResult` Type

Defined in `packages/shared/src/index.ts`:

```typescript
export interface ApiValidationError {
  type:
    | "missing_skill"
    | "missing_mcp_server"
    | "invalid_template"
    | "schema_mismatch"
    | "missing_secret";
  stepIndex?: number;   // undefined = pipeline-level issue
  field: string;
  message: string;
  severity: "error" | "warning";
}

export interface ApiValidationResult {
  valid: boolean;        // true only when errors[] is empty
  errors: ApiValidationError[];
  warnings: ApiValidationError[];
}
```
