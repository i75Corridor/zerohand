# Environment Variables

All variables are optional unless marked **required**. Defaults assume the server is started from `server/`.

---

## Server

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3009` | HTTP + WebSocket listen port |
| `PUBLIC_URL` | _(none)_ | Publicly reachable base URL of the server, e.g. `https://zerohand.example.com`. Required for Slack webhook callbacks. |

---

## Storage

| Variable | Default | Description |
|----------|---------|-------------|
| `DATA_DIR` | `.data` (repo root) | Root directory for all runtime state — Postgres data, packages, skills, agent sessions. |
| `SKILLS_DIR` | `$DATA_DIR/skills` | Where skill folders (`SKILL.md` + `scripts/`) are stored. Each subdirectory is one skill. |
| `PACKAGES_DIR` | `$DATA_DIR/packages` | Where cloned package repos are stored after `packages install`. |
| `PIPELINES_DIR` | `server/../pipelines` | Directory of local pipeline YAML files imported at startup. |
| `OUTPUT_DIR` | `$DATA_DIR/output` | Where skill script output files (images, exported articles, etc.) are written. |

---

## Database

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | _(none)_ | External Postgres connection string, e.g. `postgresql://user:pass@host:5432/zerohand`. When set, the embedded Postgres instance is skipped entirely. |

---

## AI Providers

At least one provider key is required to run pipelines.

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Anthropic Claude models |
| `GEMINI_API_KEY` | Google Gemini models |
| `OPENAI_API_KEY` | OpenAI models |

These are **stripped from child process environments** when running skill scripts to prevent accidental leakage. Scripts that need API access should declare the required key names in the `secrets` field of their `SKILL.md` — only those named keys are passed through from `process.env` into the script's environment.

---

## Integrations

| Variable | Description |
|----------|-------------|
| `GITHUB_TOKEN` | GitHub personal access token. Used by `packages install` to clone private repos and by `packages discover` to raise the GitHub API rate limit. **Not used for publishing** — see the `gh` CLI note below. |

### GitHub auth for publishing

**Publishing packages** (via the UI's "Publish to GitHub" button or `POST /api/packages/publish`) uses the `gh` CLI, not `GITHUB_TOKEN`. The server calls `gh repo create` as a subprocess, relying on whatever credentials `gh` has stored locally.

To enable publishing, authenticate the `gh` CLI once on the machine running the server:

```bash
gh auth login    # opens browser, writes to ~/.config/gh/hosts.yml
```

The token that `gh auth login` stores needs the `repo` scope to create repositories.

`GITHUB_TOKEN` and `gh` auth are independent — you can set `GITHUB_TOKEN` for rate-limit benefits without it affecting publishing, and vice versa.
| `SLACK_BOT_TOKEN` | Slack bot token (`xoxb-...`). Required for the Slack channel trigger. |
| `SLACK_SIGNING_SECRET` | Slack signing secret for validating incoming webhook payloads. Required alongside `SLACK_BOT_TOKEN`. |

---

## Notes

- `SKILLS_DIR` and `PACKAGES_DIR` both live inside `DATA_DIR` by default, keeping all runtime state in one place that's easy to back up or wipe.
- Overriding `SKILLS_DIR` to a path outside `DATA_DIR` is supported for cases where skills are managed in a separate repo or shared across instances.
- Scripts run with a sanitized environment — only non-sensitive vars plus any explicitly declared `secrets` are passed through. See `server/src/services/skill-loader.ts` for the full allowlist logic.
