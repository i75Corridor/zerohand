# Zerohand CLI

`zerohand` is the command-line interface for managing pipelines, runs, and packages — and for scaffolding new pipeline packages ready to publish as GitHub repositories.

## Installation

The CLI is published to GitHub Packages under the `@zerohand` scope. You need a GitHub personal access token (PAT) with `read:packages` permission.

```bash
# Authenticate with GitHub Packages (one-time)
export GITHUB_TOKEN=<your-pat>

# Configure the @zerohand scope to use GitHub Packages (one-time)
npm config set @zerohand:registry https://npm.pkg.github.com
npm config set //npm.pkg.github.com/:_authToken ${GITHUB_TOKEN}

# Global install
npm install -g @zerohand/cli

# Or run without installing
npx @zerohand/cli <command>
```

If you are working inside this monorepo, the `.npmrc` at the repo root already configures the `@zerohand` scope — set `GITHUB_TOKEN` in your environment and `pnpm install` will resolve the package correctly.

### Local development install

To test CLI changes locally without publishing:

```bash
# Build the CLI
pnpm --filter @zerohand/cli build

# Link it globally — makes `zerohand` available in your PATH
cd packages/cli
pnpm link --global

# Verify
zerohand --help

# After each change, rebuild (the global link picks it up immediately)
pnpm --filter @zerohand/cli build

# When done, remove the global link
cd packages/cli
pnpm unlink --global
```

## Configuration

The CLI reads its configuration from `~/.config/zerohand/config.json`. You can override the server URL at any time with an environment variable.

```bash
# Show current config
zerohand config show

# Point at a local dev server (default)
zerohand config set server http://localhost:3009

# Point at a remote server
zerohand config set server https://my-zerohand.example.com

# Set an API key (if your server requires one)
zerohand config set api-key <key>
```

The `ZEROHAND_SERVER_URL` environment variable overrides the configured server URL for a single invocation:

```bash
ZEROHAND_SERVER_URL=http://staging:3009 zerohand pipelines list
```

---

## Run management

### `zerohand run <pipeline-name>`

Trigger a pipeline run by name. Pipeline names are matched case-insensitively.

```bash
zerohand run "The Daily Absurdist"
zerohand run "The Daily Absurdist" --input topic="AI hype"
zerohand run "The Daily Absurdist" --input topic="robots" --watch
```

**Options:**

| Flag | Description |
|------|-------------|
| `--input <key=value>` | Pass an input parameter. Repeat for multiple inputs. |
| `--watch` | Stream step output to stdout until the run completes or fails. |

When `--watch` is active, text deltas from each step are printed as they arrive over WebSocket. Step transitions are printed to stderr so they can be separated from the content stream.

---

### `zerohand runs list`

List recent runs (last 100).

```bash
zerohand runs list
zerohand runs list --pipeline "The Daily Absurdist"
zerohand runs list --pipeline "The Daily Absurdist" --limit 5
```

**Options:**

| Flag | Description |
|------|-------------|
| `--pipeline <name>` | Filter by pipeline name. |
| `--limit <n>` | Max rows to display (default: 20). |

---

### `zerohand runs tail <run-id>`

Stream step output for an already-running run. If the run has already finished, prints its final status and exits.

```bash
zerohand runs tail 4f3a1b2c
```

Accepts a full UUID or a truncated prefix (8+ chars). The 8-char shortened ID is shown in `runs list` output.

---

### `zerohand runs cancel <run-id>`

Cancel a run.

```bash
zerohand runs cancel 4f3a1b2c-...
```

---

## Pipeline management

### `zerohand pipelines list`

List all pipelines.

```bash
zerohand pipelines list
```

Output columns: name, status, model, created.

---

### `zerohand pipelines import <file.yaml>`

Import a `pipeline.yaml` file into the server. If a pipeline with the same name already exists it is updated in place — run history is preserved.

```bash
zerohand pipelines import ./my-pipeline/pipeline.yaml
```

The YAML format matches the [Pipeline Package Format](./PACKAGE_FORMAT.md). Steps are synced by position: existing steps are replaced, new ones added, removed ones deleted.

> **Note:** Context files (referenced via `context:` in the YAML) are resolved server-side at run time — they are not uploaded by the CLI. The `systemPrompt` field is sent as-is; `systemPromptFile` is not followed client-side.

---

### `zerohand pipelines export <name>`

Export a pipeline to `pipeline.yaml` format. Prints to stdout by default; use `--output` to write to a file.

```bash
zerohand pipelines export "The Daily Absurdist"
zerohand pipelines export "The Daily Absurdist" --output pipeline.yaml
```

**Options:**

| Flag | Description |
|------|-------------|
| `-o, --output <file>` | Write to a file instead of stdout. |

---

## Package management

### `zerohand packages list`

List installed packages.

```bash
zerohand packages list
```

Shows repo name, skills, whether an update is available, and install date.

---

### `zerohand packages install <repo-url-or-path>`

Install a pipeline package from a GitHub repository URL **or a local directory path**.

```bash
# From GitHub
zerohand packages install https://github.com/i75Corridor/zerohand-daily-absurdist

# From a local directory
zerohand packages install ./my-pipeline
zerohand packages install /absolute/path/to/my-pipeline
```

**Local path install** is the bridge between your local files and the UI editor. When you install from a local path:

1. The server imports `pipeline.yaml` into the database so the pipeline appears in the UI at `http://localhost:3008/packages`
2. Any edits you make in the UI editor are written back to `pipeline.yaml` on disk automatically
3. The install is **ephemeral by path** — if you move the directory, re-run `zerohand packages install <new-path>` to re-register it

This is useful when you've scaffolded a new package with `zerohand new` and want to iterate on it visually before publishing:

```bash
zerohand new my-pipeline          # scaffold
zerohand packages install ./my-pipeline  # load into UI
# edit in UI at http://localhost:3008/packages
# changes flow back to ./my-pipeline/pipeline.yaml
```

The `packages list` command shows a `TYPE` column (`local` or `remote`) so you can tell at a glance which packages are file-backed.

---

### `zerohand packages update <name>`

Pull the latest version of an installed package.

```bash
zerohand packages update zerohand-daily-absurdist
```

The `<name>` matches the last segment of the repository full name (case-insensitive).

---

### `zerohand packages uninstall <name>`

Uninstall a package.

```bash
zerohand packages uninstall zerohand-daily-absurdist
```

---

### `zerohand packages discover [query]`

Search GitHub for repositories tagged with the `zerohand-package` topic.

```bash
zerohand packages discover
zerohand packages discover news
```

---

## Scaffolding

### `zerohand new <package-name>`

Interactively scaffold a new pipeline package. Prompts for name, description, model, input parameters, and step definitions, then generates a ready-to-publish directory structure.

```bash
zerohand new my-pipeline
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

The directory is `git init`'d automatically. To publish:

```bash
cd my-pipeline
git add .
git commit -m "Initial pipeline package"
gh repo create my-pipeline --public --push
zerohand packages install https://github.com/YOUR_ORG/my-pipeline
```

> **Tip:** Add the `zerohand-package` topic to your GitHub repo so it appears in `zerohand packages discover` results.

---

## Global options

| Flag | Description |
|------|-------------|
| `-V, --version` | Print CLI version. |
| `-h, --help` | Display help for any command. |

Pass `--help` after any subcommand for its specific options:

```bash
zerohand run --help
zerohand pipelines export --help
```

---

## How it works

The CLI is a pure REST + WebSocket client — it does not embed any server logic. All commands communicate with the Zerohand server via the API documented in [`docs/api.md`](./api.md).

Run streaming (`--watch`, `runs tail`) connects to the same WebSocket endpoint used by the web UI (`ws://server`), filters events by run ID, and writes text deltas to stdout as they arrive.

Config is stored at `~/.config/zerohand/config.json` (respects `XDG_CONFIG_HOME`).
