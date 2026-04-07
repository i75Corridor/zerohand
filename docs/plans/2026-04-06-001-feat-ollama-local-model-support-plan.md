---
title: "feat: Add Ollama and custom OpenAI-compatible model support"
type: feat
status: completed
date: 2026-04-06
---

# feat: Add Ollama and custom OpenAI-compatible model support

## Overview

Add two complementary provider mechanisms:

1. **Ollama (first-class)** — auto-discovers locally-running models via Ollama's `/api/tags` endpoint. Zero configuration beyond setting `OLLAMA_HOST`.
2. **Custom OpenAI-compatible providers** — user-defined providers (LiteLLM, vLLM, LM Studio, or any OpenAI-compatible server) configured via a `providers.json` file and viewable/editable in the Settings UI.

Both use pi-ai's existing `openai-completions` streaming path. Ollama gets dedicated treatment (auto-discovery, zero-cost, availability polling) while custom providers use a generic config-driven approach.

## Problem Frame

Pawn delegates all model discovery and execution to `@mariozechner/pi-ai`, which has a hardcoded registry of cloud providers. Users running local models via Ollama have no way to use them — despite `.env.example` already listing `OLLAMA_HOST`. This blocks users who want free, private, offline-capable model execution.

## Requirements Trace

- R1. Ollama models appear in the model selector grouped under an "Ollama" provider
- R2. Users can select an Ollama model for pipelines, skills, and the global agent
- R3. All local/custom models execute via the existing `openai-completions` streaming path in pi-ai
- R4. Ollama models have zero cost and do not trigger budget guard limits
- R5. Availability reflects actual Ollama server reachability, not just env var presence
- R6. The system degrades gracefully when Ollama is not running (no errors, models just absent or marked offline)
- R7. Users can define custom OpenAI-compatible providers via a `providers.json` config file
- R8. Custom providers are viewable and editable from the Settings UI in the browser
- R9. Config file is the source of truth; UI edits persist to the same file. On restart, the file is re-read.
- R10. Custom provider models appear in the model selector grouped under their provider name

## Scope Boundaries

- No Ollama model pull/management from the pawn UI
- No multi-GPU or concurrency configuration
- Custom providers must be OpenAI-compatible (`/v1/chat/completions`); no support for Anthropic-native or Google-native APIs via custom config
- No per-model cost configuration for custom providers in v1 (all treated as zero-cost like Ollama; cloud providers use pi-ai's built-in cost data)

## Context & Research

### Relevant Code and Patterns

- `server/src/services/model-utils.ts` — `listAllModels()` (sync), `parseModelFullId()`, `readModelSetting()`
- `server/src/services/pi-executor.ts` — `runSkillStep()` calls `getModel()` then `createAgentSession()`
- `server/src/services/global-agent.ts:203` — same `getModel()` pattern
- `server/src/services/budget-guard.ts` — `estimateCostCents()` falls back to 50/150 cents for unknown models
- `server/src/services/execution-engine.ts` — model resolution cascade
- `server/src/services/tools/validate-pipeline.ts:109` — API key check for skill providers
- `server/src/services/package-manager.ts:170` — model warnings on package install
- `server/src/routes/models.ts` — `GET /models` endpoint (sync handler)
- `ui/src/components/ModelSelector.tsx` — groups by provider, sorts available first
- `packages/shared/src/index.ts` — `ApiModelEntry` interface
- `.env.example` — already has `OLLAMA_HOST=http://localhost:11434`

### Key pi-ai Internals

- `Model<TApi>` interface accepts `provider: string` (not restricted to `KnownProvider` at runtime)
- `openai-completions` provider: `createClient()` throws if no API key — need dummy key `"ollama"` via `AuthStorage.setRuntimeApiKey()`
- `getModel()` is typed against `KnownProvider` but the codebase already uses `as any` casts (pi-executor.ts:78, global-agent.ts:203)
- `getEnvApiKey("ollama")` returns `undefined` — Ollama is not in pi-ai's env map
- `OpenAICompletionsCompat` interface allows overriding `supportsStore`, `supportsDeveloperRole`, `supportsReasoningEffort` — useful for disabling features Ollama doesn't support

### Ollama API

- `GET /api/tags` — lists installed models with `name`, `size`, `modified_at`, `details` (parameter_size, quantization_level, family)
- `GET /api/show` (POST with `{name}`) — returns model details including `num_ctx` (context window)
- `POST /v1/chat/completions` — OpenAI-compatible chat completions endpoint
- No auth required; ignores `Authorization` header

## Key Technical Decisions

- **Bypass pi-ai's static registry, construct Model objects manually**: pi-ai has no public API to register custom providers at runtime. We construct `Model<"openai-completions">` objects matching the interface shape and pass them directly to `createAgentSession()`. This is safe because `createAgentSession` accepts `Model<Api>` (not restricted to `KnownProvider`).

- **Background polling with in-memory cache**: `listAllModels()` is synchronous and called in multiple places including module-level `buildDefaultModelCosts()` in budget-guard.ts. Making it async would be a large refactor. Instead, poll `OLLAMA_HOST/api/tags` periodically and cache the results. The sync `listAllModels()` reads from cache.

- **Dummy API key "ollama"**: pi-ai's `openai-completions` provider requires a non-empty API key (it throws otherwise). We set `auth.setRuntimeApiKey("ollama", "ollama")` — Ollama ignores the header.

- **OLLAMA_HOST env var gates everything**: If not set, no Ollama code runs. If set, background polling starts. Availability is determined by actual reachability (poll success), not just env var presence.

- **Conservative context window defaults**: Use 4096 context / 2048 max tokens as defaults. Optionally call `/api/show` per model during polling to get actual `num_ctx`, but fall back to defaults if the call fails or the field is missing.

- **Disable OpenAI-specific features via `compat`**: Set `supportsStore: false`, `supportsDeveloperRole: false`, `supportsReasoningEffort: false` on each Ollama and custom provider model to prevent pi-ai from sending unsupported fields.

- **`providers.json` as config file, Settings UI as editor**: Custom providers are defined in `${DATA_DIR}/providers.json`. The Settings UI reads/writes this file via API endpoints. The file is the source of truth — on restart, it is re-read. This keeps config portable (can be version-controlled or copied between instances) while being accessible to non-technical users via the UI.

- **Custom providers are zero-cost by default**: Like Ollama, custom provider models have `cost: { input: 0, output: 0, ... }`. Per-model cost configuration is out of scope for v1.

- **Provider name conflict prevention**: If a custom provider name matches a built-in pi-ai provider (e.g., `"openai"`), it is ignored with a warning. This prevents confusing collisions where the same provider name has both pi-ai models and custom models.

## Open Questions

### Resolved During Planning

- **Will pi-ai's openai-completions stream work with Ollama?** Yes — it creates an OpenAI SDK client with `baseURL: model.baseUrl` and `apiKey`. Ollama's `/v1/chat/completions` is OpenAI-compatible. The dummy key satisfies the SDK's non-null requirement.

- **How to handle the sync/async mismatch?** Background polling with cache. The `/models` route and `buildDefaultModelCosts()` stay synchronous; the cache is updated asynchronously on a timer.

- **What about the budget guard phantom costs?** Ollama models are registered in the cost map with zero rates during cache refresh. The `estimateCostCents` function finds them before hitting the 50/150 fallback.

### Deferred to Implementation

- Whether the 30s default polling interval needs tuning based on real-world usage
- Whether `/api/show` per-model calls are fast enough to include in the poll cycle, or if static defaults are sufficient
- Ollama model ID normalization (e.g., `llama3:latest` vs `llama3` — may need to test what Ollama's `/v1/chat/completions` actually accepts)

## Implementation Units

- [ ] **Unit 1: Ollama discovery service with background polling**

  **Goal:** Create a service that polls Ollama's `/api/tags`, constructs `Model<"openai-completions">` objects, and exposes them via a synchronous getter.

  **Requirements:** R1, R5, R6

  **Dependencies:** None

  **Files:**
  - Create: `server/src/services/ollama-provider.ts`
  - Modify: `server/src/services/model-utils.ts`
  - Test: `server/src/__tests__/ollama-provider.test.ts`

  **Approach:**
  - New module `ollama-provider.ts` with:
    - `startOllamaPolling()` — called at server startup if `OLLAMA_HOST` is set. Fetches `/api/tags`, constructs Model objects, stores in module-scoped cache. Runs on a `setInterval` (default 30s).
    - `getOllamaModels(): Model<"openai-completions">[]` — returns cached models (empty array if Ollama unreachable or `OLLAMA_HOST` not set).
    - `isOllamaAvailable(): boolean` — returns whether the last poll succeeded.
    - `stopOllamaPolling()` — clears interval (for tests/shutdown).
  - Each Ollama model is constructed as:
    - `id`: model name from `/api/tags` (e.g., `llama3.1:8b`)
    - `name`: same, possibly cleaned up
    - `api`: `"openai-completions"`
    - `provider`: `"ollama"`
    - `baseUrl`: `${OLLAMA_HOST}/v1`
    - `reasoning`: `false`
    - `input`: `["text"]`
    - `cost`: `{ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }`
    - `contextWindow`: from `/api/show` if available, else `4096`
    - `maxTokens`: `contextWindow / 2` or `2048` default
    - `compat`: `{ supportsStore: false, supportsDeveloperRole: false, supportsReasoningEffort: false }`
  - Modify `listAllModels()` in `model-utils.ts` to append Ollama models from `getOllamaModels()`, mapped to `ApiModelEntry` with `available: isOllamaAvailable()`.

  **Patterns to follow:**
  - The existing `listAllModels()` loop pattern for constructing `ApiModelEntry` from `Model` objects
  - The `OAUTH_ONLY_PROVIDERS` set pattern for provider-specific exclusions

  **Test scenarios:**
  - Happy path: mock `/api/tags` returning 2 models -> `getOllamaModels()` returns 2 Model objects with correct shape
  - Happy path: `listAllModels()` includes Ollama models alongside pi-ai models when cache is populated
  - Edge case: `OLLAMA_HOST` not set -> polling never starts, `getOllamaModels()` returns `[]`
  - Edge case: Ollama returns empty model list (`[]` in tags response) -> `getOllamaModels()` returns `[]`, `isOllamaAvailable()` returns `true`
  - Error path: Ollama unreachable (fetch throws) -> `getOllamaModels()` returns stale cache or `[]`, `isOllamaAvailable()` returns `false`
  - Edge case: model name contains colons (e.g., `qwen2.5-coder:7b`) -> `fullId` is `ollama/qwen2.5-coder:7b`, `parseModelFullId()` handles it correctly (splits on first `/`)

  **Verification:**
  - `GET /models` returns Ollama models with `provider: "ollama"` and `available: true` when Ollama is running
  - `GET /models` returns no Ollama models when `OLLAMA_HOST` is unset

- [ ] **Unit 2: Wire Ollama into execution path**

  **Goal:** Make `runSkillStep()` and `global-agent.ts` resolve Ollama models and provide the dummy API key so pi-ai's openai-completions stream works.

  **Requirements:** R2, R3

  **Dependencies:** Unit 1

  **Files:**
  - Modify: `server/src/services/pi-executor.ts`
  - Modify: `server/src/services/global-agent.ts`
  - Modify: `server/src/services/execution-engine.ts`
  - Test: `server/src/__tests__/ollama-execution.test.ts`

  **Approach:**
  - Create a `resolveModel()` helper (in `ollama-provider.ts` or a shared location) that:
    1. Tries `getModel(provider, modelId)` from pi-ai (existing path)
    2. If provider is `"ollama"`, looks up the model from `getOllamaModels()` cache
    3. Returns the `Model` object or throws
  - Replace `getModel(provider as any, name as any)` calls in `pi-executor.ts:78` and `global-agent.ts:203` with `resolveModel(provider, name)`.
  - Modify `makeAuthStorage()` in `pi-executor.ts` to also call `auth.setRuntimeApiKey("ollama", "ollama")` when `OLLAMA_HOST` is set.
  - **Fix pre-existing bug**: `recordCost()` in `execution-engine.ts:457` receives `pipelineModelProvider`/`pipelineModelName` instead of the skill's resolved model. When a skill overrides to Ollama but the pipeline default is a cloud model, costs are recorded at cloud rates. Fix by passing the effective (post-override) provider/model to `recordCost()`. This is a pre-existing issue but becomes a blocker for Ollama's zero-cost guarantee (R4).

  **Patterns to follow:**
  - The existing `as any` casting pattern for `getModel()` calls
  - The `makeAuthStorage()` loop pattern for injecting API keys

  **Test scenarios:**
  - Happy path: `resolveModel("ollama", "llama3:latest")` returns correct Model object from cache
  - Happy path: `resolveModel("anthropic", "claude-sonnet-4-5-20250514")` falls through to pi-ai `getModel()` (existing behavior unchanged)
  - Error path: `resolveModel("ollama", "nonexistent-model")` throws descriptive error
  - Error path: `resolveModel("ollama", "llama3:latest")` when Ollama cache is empty throws with "Ollama not available" message
  - Integration: `makeAuthStorage()` includes `"ollama"` key when `OLLAMA_HOST` is set
  - Integration: full pipeline execution path where pipeline-level default model is Ollama (covers `readModelSetting()` -> `runSkillStep()` -> `resolveModel()` chain)
  - Integration: skill overrides to Ollama model while pipeline default is a cloud model -> `recordCost()` receives the Ollama provider/model, not the pipeline-level cloud model

  **Verification:**
  - A pipeline configured with an Ollama model executes successfully through pi-ai's openai-completions stream
  - The global agent works when configured with an Ollama model

- [ ] **Unit 3: Budget guard and validation fixes**

  **Goal:** Prevent phantom costs for Ollama models and fix false-positive validation warnings.

  **Requirements:** R4, R6

  **Dependencies:** Unit 1

  **Files:**
  - Modify: `server/src/services/budget-guard.ts`
  - Modify: `server/src/services/tools/validate-pipeline.ts`
  - Modify: `server/src/services/package-manager.ts`
  - Test: `server/src/__tests__/model-availability.test.ts` (extend existing)

  **Approach:**
  - **Budget guard**: `buildDefaultModelCosts()` runs at module load time — before Ollama polling starts. So Ollama models will never appear in the initial cost map, and the DB-seeded defaults will also lack them. Rather than fighting the load order, add a provider-level short-circuit in `estimateCostCents`: if the model key starts with `ollama/`, return `0` immediately. This is simpler and more reliable than trying to inject zero-cost entries at the right time.
  - **Pipeline validation**: Add Ollama-aware check in `validate-pipeline.ts:109` — when `skill.modelProvider === "ollama"`, check `isOllamaAvailable()` instead of `getEnvApiKey()`. Warn with "Ollama server not reachable" instead of "no API key".
  - **Package manager**: Same pattern in `package-manager.ts:170` — treat `"ollama"` as a special case.

  **Patterns to follow:**
  - The existing `OAUTH_ONLY_PROVIDERS` set pattern for provider-specific logic in model-utils.ts
  - The existing `modelWarnings` pattern in package-manager.ts

  **Test scenarios:**
  - Happy path: `estimateCostCents` returns 0 for `ollama/llama3:latest` (even when cost map was loaded before Ollama polling started)
  - Happy path: `estimateCostCents` returns 0 for any `ollama/*` model regardless of cost map contents (provider short-circuit)
  - Happy path: pipeline validation with Ollama skill and Ollama available -> no warning
  - Error path: pipeline validation with Ollama skill and Ollama unavailable -> warning "Ollama server not reachable"
  - Happy path: package install with Ollama skill and Ollama available -> no model warning

  **Verification:**
  - Ollama pipeline runs do not increment cost counters
  - Budget limits do not block Ollama model usage
  - No false "missing API key" warnings for Ollama skills

- [ ] **Unit 4: Frontend model selector updates**

  **Goal:** Display Ollama models properly in the UI with appropriate labels and availability indicators.

  **Requirements:** R1, R5

  **Dependencies:** Unit 1

  **Files:**
  - Modify: `ui/src/components/ModelSelector.tsx`

  **Approach:**
  - Add `"ollama": "Ollama"` to `PROVIDER_LABELS`
  - Change the unavailable label: when `!m.available` and `m.provider === "ollama"`, show "(server offline)" instead of "(no API key)"
  - Context window display: the existing `{(selectedModel.contextWindow / 1000).toFixed(0)}k ctx` works fine with the 4096 default (shows "4k ctx")
  - Cost display: the existing conditional `{selectedModel.costInputPerM > 0 && ...}` naturally hides the cost line for zero-cost models

  **Patterns to follow:**
  - Existing `PROVIDER_LABELS` map pattern
  - Existing availability display logic

  **Test scenarios:**
  - Happy path: Ollama models appear under "Ollama" group heading
  - Happy path: available Ollama models are selectable, show "4k ctx" and no cost line
  - Edge case: unavailable Ollama models show "(server offline)" not "(no API key)"
  - Edge case: no Ollama models (OLLAMA_HOST not set) -> no "Ollama" group appears at all

  **Verification:**
  - Ollama group appears in model selector when Ollama is running
  - Selecting an Ollama model stores `ollama/model-name` as the fullId

- [ ] **Unit 5: Server startup wiring and .env.example update**

  **Goal:** Start Ollama polling at server boot and ensure env configuration is documented.

  **Requirements:** R5, R6

  **Dependencies:** Unit 1

  **Files:**
  - Modify: `server/src/index.ts`
  - Modify: `.env.example`

  **Approach:**
  - At server startup, after express app initialization, call `startOllamaPolling()` if `process.env.OLLAMA_HOST` is set
  - Log a message like `"Ollama provider enabled: ${OLLAMA_HOST}"` or `"Ollama provider: OLLAMA_HOST not set, skipping"`
  - Add `stopOllamaPolling()` to the shutdown handler (alongside existing `engine.stop()` and `triggers.stop()`) to prevent timer leak on SIGTERM
  - `.env.example` already has `OLLAMA_HOST` — add a comment noting that models are auto-discovered

  **Patterns to follow:**
  - Existing server startup initialization patterns

  **Test expectation:** none — pure startup wiring with no behavioral change beyond calling `startOllamaPolling()`

  **Verification:**
  - Server starts without errors when `OLLAMA_HOST` is set and Ollama is running
  - Server starts without errors when `OLLAMA_HOST` is not set
  - Server starts without errors when `OLLAMA_HOST` is set but Ollama is not running

- [ ] **Unit 6: Custom OpenAI-compatible provider config loader**

  **Goal:** Load and validate a `providers.json` config file that defines custom OpenAI-compatible providers with their base URLs, API keys, and model lists.

  **Requirements:** R7, R9, R10

  **Dependencies:** Unit 1 (reuses the Model object construction pattern from ollama-provider.ts)

  **Files:**
  - Create: `server/src/services/custom-providers.ts`
  - Modify: `server/src/services/model-utils.ts`
  - Test: `server/src/__tests__/custom-providers.test.ts`

  **Approach:**
  - Config file location: `${DATA_DIR}/providers.json` (alongside other runtime state in `.data/`)
  - File format matches the Pi convention the user specified:
    ```
    {
      "providers": {
        "<provider-name>": {
          "baseUrl": "http://localhost:4000/v1",
          "apiKey": "sk-...",       // optional, defaults to "none"
          "models": [
            { "id": "gpt-4o", "name": "GPT-4o (via LiteLLM)", "contextWindow": 128000 }
          ]
        }
      }
    }
    ```
  - `id` is the only required field per model. Optional fields: `name` (defaults to `id`), `contextWindow` (defaults to 4096), `maxTokens` (defaults to `contextWindow / 2`)
  - New module `custom-providers.ts` with:
    - `loadCustomProviders()` — reads and validates `providers.json`, constructs `Model<"openai-completions">` objects with `compat` overrides. Caches in memory. Called at startup and when the file changes.
    - `getCustomProviderModels(): Model<"openai-completions">[]` — returns cached models.
    - `getCustomProviderConfig(): CustomProvidersConfig` — returns the raw parsed config (for the Settings UI to read).
    - `saveCustomProviderConfig(config: CustomProvidersConfig)` — writes config back to `providers.json` (for Settings UI edits).
  - Each custom model gets `provider` set to the config key (e.g., `"litellm"`)
  - Availability: custom providers are marked `available: true` if `apiKey` is present or defaulted. No reachability check (unlike Ollama) — the user is responsible for ensuring the server is running.
  - Modify `listAllModels()` to also append models from `getCustomProviderModels()`.
  - Modify `resolveModel()` (from Unit 2) to also check custom provider models when the provider doesn't match pi-ai or Ollama.

  **Patterns to follow:**
  - The Ollama model construction pattern from Unit 1
  - The `dataDir()` path convention from `server/src/services/paths.ts`

  **Test scenarios:**
  - Happy path: valid `providers.json` with 1 provider and 2 models -> `getCustomProviderModels()` returns 2 Model objects
  - Happy path: `listAllModels()` includes custom provider models grouped under their provider name
  - Happy path: model with only `id` field -> defaults applied (name=id, contextWindow=4096, maxTokens=2048)
  - Edge case: `providers.json` doesn't exist -> `getCustomProviderModels()` returns `[]`, no error
  - Edge case: `providers.json` is malformed JSON -> logs warning, returns `[]`
  - Edge case: provider name conflicts with a pi-ai provider (e.g., `"openai"`) -> custom config is ignored for that provider, warning logged
  - Error path: model missing `id` field -> that model is skipped with a warning
  - Happy path: `resolveModel("litellm", "gpt-4o")` returns the correct custom Model object
  - Happy path: `saveCustomProviderConfig()` writes valid JSON and `loadCustomProviders()` re-reads it

  **Verification:**
  - `GET /models` includes custom provider models when `providers.json` exists
  - Custom provider models are executable via `runSkillStep()`

- [ ] **Unit 7: Custom providers API endpoints**

  **Goal:** Expose REST endpoints for the Settings UI to read and write custom provider configuration.

  **Requirements:** R8, R9

  **Dependencies:** Unit 6

  **Files:**
  - Create: `server/src/routes/custom-providers.ts`
  - Modify: `server/src/index.ts` (register the router)
  - Test: `server/src/__tests__/custom-providers-routes.test.ts`

  **Approach:**
  - `GET /api/custom-providers` — returns the current `CustomProvidersConfig` (from `getCustomProviderConfig()`). API keys are masked in the response (e.g., `"sk-...1234"`) for display safety.
  - `PUT /api/custom-providers` — accepts a full `CustomProvidersConfig`, validates it, calls `saveCustomProviderConfig()`, then `loadCustomProviders()` to refresh the cache. Returns the saved config.
  - After save, invalidate the `["models"]` query cache by broadcasting a `data_changed` WebSocket event so the frontend refreshes the model list.

  **Patterns to follow:**
  - The settings router pattern (`server/src/routes/settings.ts`) for CRUD on config
  - The `data_changed` WebSocket broadcast pattern for cache invalidation

  **Test scenarios:**
  - Happy path: `GET /api/custom-providers` returns config with masked API keys
  - Happy path: `PUT /api/custom-providers` with valid config -> saves file, returns config, model list updated
  - Error path: `PUT /api/custom-providers` with invalid config (missing `providers` key) -> 400 error
  - Edge case: `GET /api/custom-providers` when no `providers.json` exists -> returns `{ providers: {} }`

  **Verification:**
  - Settings UI can read and display current custom provider configuration
  - Settings UI edits persist to `providers.json` and immediately appear in the model selector

- [ ] **Unit 8: Settings UI for custom providers**

  **Goal:** Add a "Custom Providers" section to the Settings page where users can view, add, edit, and remove custom OpenAI-compatible providers.

  **Requirements:** R8, R10

  **Dependencies:** Unit 7

  **Files:**
  - Modify: `ui/src/pages/Settings.tsx`
  - Modify: `ui/src/lib/api.ts` (add API client methods)
  - Modify: `ui/src/components/ModelSelector.tsx` (dynamic provider labels)

  **Approach:**
  - New `CustomProvidersSection` component in `Settings.tsx`, placed between Active Models and MCP Servers sections.
  - UI shows a card per provider with: name, base URL, API key (masked), model count, and an expand/collapse to show model list.
  - Add provider: inline form with fields for name, base URL, API key, and a textarea or repeater for model IDs.
  - Edit/delete: inline editing on existing providers, delete button with confirmation.
  - On save: `PUT /api/custom-providers` with the full config, then invalidate `["models"]` and `["custom-providers"]` query keys.
  - `ModelSelector.tsx`: instead of hardcoded `PROVIDER_LABELS`, fall back to capitalizing the provider key for unknown providers. This way custom providers like `"litellm"` display as "Litellm" without needing manual label entries.
  - Add `api.getCustomProviders()` and `api.updateCustomProviders()` to the API client.

  **Patterns to follow:**
  - The `McpServersSection` pattern in Settings.tsx for card-based config management with expand/collapse
  - The existing `api.getSetting()` / `api.updateSetting()` pattern for API client methods

  **Test scenarios:**
  - Happy path: Settings page shows "Custom Providers" section with existing providers from config
  - Happy path: adding a new provider -> appears in model selector immediately
  - Happy path: removing a provider -> models disappear from selector immediately
  - Edge case: no `providers.json` -> section shows empty state with "Add Provider" button
  - Edge case: provider label fallback -> unknown provider "litellm" displays as "Litellm" in model selector

  **Verification:**
  - Users can add, view, edit, and remove custom providers entirely from the Settings page
  - Changes are reflected in the model selector without page refresh

## System-Wide Impact

- **Interaction graph:** `listAllModels()` is called by `GET /models` route, `buildDefaultModelCosts()` in budget-guard, and indirectly by the frontend. All gain Ollama + custom provider models via the cache merge. `resolveModel()` is the new central model resolution point, used by `runSkillStep()` and `global-agent.ts`.
- **Error propagation:** Two distinct failure points: (1) **Before execution** — `resolveModel()` throws descriptive errors: "Ollama not available" / "Model not found in Ollama" for Ollama, "Model not found in custom provider X" for custom providers. (2) **During execution** — if the target server goes down mid-stream, pi-ai's openai-completions stream produces a standard connection error. Ollama polling failures are caught silently and update `isOllamaAvailable()` to `false`.
- **State lifecycle risks:** Ollama polling cache can be stale by up to 30s. Custom provider config is re-read on startup and on Settings UI save. A model removed between list and execution will produce a clear error from the target server. No partial state or corruption risk.
- **API surface parity:** The `GET /models` endpoint already returns `ApiModelEntry[]` — no schema change needed. New `GET/PUT /api/custom-providers` endpoints are added for config management.
- **Unchanged invariants:** All existing pi-ai provider behavior is unchanged. The `resolveModel()` helper only intercepts non-pi-ai providers and delegates everything else to `getModel()`.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| pi-ai's `openai-completions` stream may send parameters Ollama doesn't understand (e.g., `store`, `developer` role) | Use `compat` overrides to disable unsupported features |
| Ollama's OpenAI-compatible endpoint may not support all message types (tool calls, images) | Start with text-only `input: ["text"]`; tool support is testable during implementation |
| Polling `/api/tags` and `/api/show` per model could be slow with many models | Defer `/api/show` calls behind a flag; use conservative defaults initially |
| Background polling timer leaks in tests | Expose `stopOllamaPolling()` for cleanup; use `vi.useFakeTimers()` in tests |
| Custom provider name collides with pi-ai built-in | Ignore the custom config for that name, log a warning |
| `providers.json` edited manually with invalid JSON | `loadCustomProviders()` catches parse errors, logs warning, returns empty list |
| API key stored in plaintext in `providers.json` | Acceptable for self-hosted/local use; mask in API responses; note in docs |

## Sources & References

- Ollama OpenAI compatibility docs: https://docs.ollama.com/integrations/pi
- pi-ai `openai-completions` provider: `node_modules/.pnpm/@mariozechner+pi-ai@0.64.0_ws@8.20.0_zod@4.3.6/node_modules/@mariozechner/pi-ai/dist/providers/openai-completions.js`
- pi-ai `Model` type: `node_modules/.pnpm/@mariozechner+pi-ai@0.64.0_ws@8.20.0_zod@4.3.6/node_modules/@mariozechner/pi-ai/dist/types.d.ts`
