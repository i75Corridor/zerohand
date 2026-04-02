# Secrets

Zerohand has two separate secrets systems that serve different purposes and never fall back to each other. Understanding which to use for a given need avoids confusion.

---

## System 1: Environment Variables (Model Provider API Keys)

Environment variables are the **only** way to authenticate model providers. Zerohand reads them at startup via the pi-ai library's `getEnvApiKey()` function and registers them into `AuthStorage` so the model routing layer can make API calls.

| Provider | Environment Variable |
|----------|---------------------|
| Google (Gemini) | `GEMINI_API_KEY` |
| Anthropic | `ANTHROPIC_API_KEY` |
| OpenAI | `OPENAI_API_KEY` |
| OpenRouter | `OPENROUTER_API_KEY` |
| xAI | `XAI_API_KEY` |
| Groq | `GROQ_API_KEY` |
| Mistral | `MISTRAL_API_KEY` |

Any provider in the pi-ai registry that has a key set will be marked **available** in the model selector. Providers without a key are listed but disabled.

These env vars are **never** read for `{{secret.KEY}}` interpolation or script injection — they exist solely for model routing.

---

## System 2: Encrypted Secrets (Postgres)

Secrets stored in the database are AES-256-GCM encrypted at rest. They serve three specific runtime purposes:

### 1. Prompt Template Interpolation

Use `{{secret.KEY}}` anywhere in a pipeline step's prompt template:

```
Summarize the following and post to Slack at {{secret.SLACK_WEBHOOK_URL}}
```

At run time, `execution-engine` decrypts all secrets once at the start of each run and substitutes them before the prompt reaches the model.

### 2. Script Environment Injection

A skill can declare which secrets it needs in its `SKILL.md` frontmatter:

```yaml
---
name: publisher
secrets:
  - SLACK_WEBHOOK_URL
  - NOTION_API_KEY
---
```

Those secrets are decrypted and passed as environment variables into the skill's script process (or Docker sandbox if enabled). The script reads them via `process.env.SLACK_WEBHOOK_URL` etc.

### 3. GitHub Token for Package Installs

The key `GITHUB_TOKEN` in the secrets table is used by the package manager to authenticate `git clone` for private package repositories. If not set, only public repos can be installed.

### Managing Secrets

**UI:** Settings → Secrets. Values are masked on display (first 3 + last 4 chars).

**API:**
```
GET    /api/secrets          List all (masked values only)
POST   /api/secrets          { key, value, description? }
PUT    /api/secrets/:key     { value, description? }
DELETE /api/secrets/:key
```

---

## Precedence and Interaction

The two systems are **completely independent**. There is no "check env var, fall back to DB" logic or vice versa.

| | Env Vars | DB Secrets |
|---|---|---|
| Model provider auth | ✓ | ✗ |
| `{{secret.KEY}}` in prompts | ✗ | ✓ |
| Script `secretEnv` injection | ✗ | ✓ |
| GitHub package installs | ✗ | ✓ (`GITHUB_TOKEN`) |

**Example:** If `ANTHROPIC_API_KEY` exists as both an env var and a DB secret:
- The **env var** is what allows Anthropic models to appear as available in the model selector and be used for inference.
- The **DB secret** is only used if a prompt template contains `{{secret.ANTHROPIC_API_KEY}}` or a skill's `secrets:` frontmatter lists it — which would be unusual.

---

## Encryption Details

- Algorithm: AES-256-GCM
- Key source: `ENCRYPTION_KEY` env var (64 hex chars = 32 bytes). If not set, an auto-generated key is written to `DATA_DIR/.encryption-key` with a startup warning.
- Each secret is stored with its own random IV and auth tag — ciphertext reuse across secrets is not possible.
- The plaintext value is **never** returned by the API. Only masked representations are exposed.
