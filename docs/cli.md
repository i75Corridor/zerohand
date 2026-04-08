# Pawn CLI

`pawn` is the command-line interface for managing pipelines, runs, and blueprints — and for scaffolding new pipeline blueprints ready to publish as GitHub repositories.

## Installation

The CLI is published to GitHub Packages under the `@i75corridor` scope. You need a GitHub personal access token (PAT) with `read:packages` permission.

```bash
# Set your GitHub PAT (needs read:packages scope)
export NODE_AUTH_TOKEN=<your-pat>

# Configure the @i75corridor scope to use GitHub Packages (one-time)
npm config set @i75corridor:registry https://npm.pkg.github.com
npm config set //npm.pkg.github.com/:_authToken ${NODE_AUTH_TOKEN}

# Global install
npm install -g @i75corridor/zh-cli

# Or run without installing
npx @i75corridor/zh-cli <command>
```

If you are working inside this monorepo, copy `.npmrc.example` to `.npmrc` and set `NODE_AUTH_TOKEN` in your environment:

```bash
cp .npmrc.example .npmrc
export NODE_AUTH_TOKEN=<your-pat>
pnpm install
```

`.npmrc` is gitignored — your token stays local.

### Local development install

To test CLI changes locally without publishing:

```bash
# Build the CLI
pnpm --filter @i75corridor/zh-cli build

# Link it globally — makes `pawn` available in your PATH
cd packages/cli
pnpm link --global

# Verify
pawn --help

# After each change, rebuild (the global link picks it up immediately)
pnpm --filter @i75corridor/zh-cli build

# When done, remove the global link
cd packages/cli
pnpm unlink --global
```

## Configuration

The CLI reads its configuration from `~/.config/pawn/config.json`. You can override the server URL at any time with an environment variable.

```bash
# Show current config
pawn config show

# Point at a local dev server (default)
pawn config set server http://localhost:3009

# Point at a remote server
pawn config set server https://my-pawn.example.com

# Set an API key (if your server requires one)
pawn config set api-key <key>
```

The `PAWN_SERVER_URL` environment variable overrides the configured server URL for a single invocation:

```bash
PAWN_SERVER_URL=http://staging:3009 pawn pipelines list
```

---

## Run management

### `pawn run <pipeline-name>`

Trigger a pipeline run by name. Pipeline names are matched case-insensitively.

```bash
pawn run "The Daily Absurdist"
pawn run "The Daily Absurdist" --input topic="AI hype"
pawn run "The Daily Absurdist" --input topic="robots" --watch
```

**Options:**

| Flag | Description |
|------|-------------|
| `--input <key=value>` | Pass an input parameter. Repeat for multiple inputs. |
| `--watch` | Stream step output to stdout until the run completes or fails. |

When `--watch` is active, text deltas from each step are printed as they arrive over WebSocket. Step transitions are printed to stderr so they can be separated from the content stream.

---

### `pawn runs list`

List recent runs (last 100).

```bash
pawn runs list
pawn runs list --pipeline "The Daily Absurdist"
pawn runs list --pipeline "The Daily Absurdist" --limit 5
```

**Options:**

| Flag | Description |
|------|-------------|
| `--pipeline <name>` | Filter by pipeline name. |
| `--limit <n>` | Max rows to display (default: 20). |

---

### `pawn runs tail <run-id>`

Stream step output for an already-running run. If the run has already finished, prints its final status and exits.

```bash
pawn runs tail 4f3a1b2c
```

Accepts a full UUID or a truncated prefix (8+ chars). The 8-char shortened ID is shown in `runs list` output.

---

### `pawn runs cancel <run-id>`

Cancel a run.

```bash
pawn runs cancel 4f3a1b2c-...
```

---

## Pipeline management

### `pawn pipelines list`

List all pipelines.

```bash
pawn pipelines list
```

Output columns: name, status, model, created.

---

### `pawn pipelines import <file.yaml>`

Import a `pipeline.yaml` file into the server. If a pipeline with the same name already exists it is updated in place — run history is preserved.

```bash
pawn pipelines import ./my-pipeline/pipeline.yaml
```

The YAML format matches the [Pipeline Blueprint Format](./BLUEPRINT_FORMAT.md). Steps are synced by position: existing steps are replaced, new ones added, removed ones deleted.

> **Note:** Context files (referenced via `context:` in the YAML) are resolved server-side at run time — they are not uploaded by the CLI. The `systemPrompt` field is sent as-is; `systemPromptFile` is not followed client-side.

---

### `pawn pipelines export <name>`

Export a pipeline to `pipeline.yaml` format. Prints to stdout by default; use `--output` to write to a file.

```bash
pawn pipelines export "The Daily Absurdist"
pawn pipelines export "The Daily Absurdist" --output pipeline.yaml
```

**Options:**

| Flag | Description |
|------|-------------|
| `-o, --output <file>` | Write to a file instead of stdout. |

---

## Blueprint management

### `pawn blueprints list`

List installed blueprints.

```bash
pawn blueprints list
```

Shows repo name, skills, whether an update is available, and install date.

---

### `pawn blueprints install <repo-url-or-path>`

Install a pipeline blueprint from a GitHub repository URL **or a local directory path**.

```bash
# From GitHub
pawn blueprints install https://github.com/i75Corridor/pawn-daily-absurdist

# From a local directory
pawn blueprints install ./my-pipeline
pawn blueprints install /absolute/path/to/my-pipeline
```

**Local path install** is the bridge between your local files and the UI editor. When you install from a local path:

1. The server imports `pipeline.yaml` into the database so the pipeline appears in the UI at `http://localhost:3008/blueprints`
2. Any edits you make in the UI editor are written back to `pipeline.yaml` on disk automatically
3. The install is **ephemeral by path** — if you move the directory, re-run `pawn blueprints install <new-path>` to re-register it

This is useful when you've scaffolded a new blueprint with `pawn new` and want to iterate on it visually before publishing:

```bash
pawn new my-pipeline          # scaffold
pawn blueprints install ./my-pipeline  # load into UI
# edit in UI at http://localhost:3008/blueprints
# changes flow back to ./my-pipeline/pipeline.yaml
```

The `blueprints list` command shows a `TYPE` column (`local` or `remote`) so you can tell at a glance which blueprints are file-backed.

---

### `pawn blueprints update <name>`

Pull the latest version of an installed blueprint.

```bash
pawn blueprints update pawn-daily-absurdist
```

The `<name>` matches the last segment of the repository full name (case-insensitive).

---

### `pawn blueprints uninstall <name>`

Uninstall a blueprint.

```bash
pawn blueprints uninstall pawn-daily-absurdist
```

---

### `pawn blueprints discover [query]`

Search GitHub for repositories tagged with the `pawn-blueprint` topic.

```bash
pawn blueprints discover
pawn blueprints discover news
```

---

## Scaffolding

### `pawn new <blueprint-name>`

Interactively scaffold a new pipeline blueprint. Prompts for name, description, model, input parameters, and step definitions, then generates a ready-to-publish directory structure.

```bash
pawn new my-pipeline
```

**Generated structure:**

```
my-pipeline/
  pipeline.yaml          # manifest with your steps
  README.md              # install + usage instructions
  skills/
    <skill-name>/
      SKILL.md           # frontmatter + system prompt body
      scripts/
        example_tool.js  # stub stdin→stdout tool script
  .gitignore
```

The directory is `git init`'d automatically. To publish manually:

```bash
cd my-pipeline
git add .
git commit -m "Initial pipeline blueprint"
gh repo create my-pipeline --public --push
gh repo edit my-pipeline --add-topic pawn-blueprint
pawn blueprints install https://github.com/YOUR_ORG/my-pipeline
```

> **In-app alternative:** You can skip the CLI entirely and author pipelines + skills directly in the UI, then use the **Publish to GitHub** button on the pipeline detail page. See [`docs/pipeline-blueprints.md`](./pipeline-blueprints.md) for the full workflow.

---

## Global options

| Flag | Description |
|------|-------------|
| `-V, --version` | Print CLI version. |
| `-h, --help` | Display help for any command. |

Pass `--help` after any subcommand for its specific options:

```bash
pawn run --help
pawn pipelines export --help
```

---

## How it works

The CLI is a pure REST + WebSocket client — it does not embed any server logic. All commands communicate with the Pawn server via the API documented in [`docs/api.md`](./api.md).

Run streaming (`--watch`, `runs tail`) connects to the same WebSocket endpoint used by the web UI (`ws://server`), filters events by run ID, and writes text deltas to stdout as they arrive.

Config is stored at `~/.config/pawn/config.json` (respects `XDG_CONFIG_HOME`).
