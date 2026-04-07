---
title: "refactor: Rename pawn to pawn across entire codebase"
type: refactor
status: active
date: 2026-04-07
---

# refactor: Rename pawn to pawn across entire codebase

## Overview

Comprehensive rename of all "pawn" references to "pawn" across the entire codebase, including package names, imports, environment variables, database identifiers, Docker config, CLI tooling, MCP protocol identifiers, UI branding, CI/CD workflows, and documentation. The GitHub repository will also be renamed from `i75Corridor/pawn` to `i75Corridor/pawn`.

## Problem Frame

The project is rebranding from "Pawn" to "Pawn". Every code, config, and user-facing reference must be updated to reflect the new name. This is blocking all other rebranding work (i75Corridor/pawn#70).

## Requirements Trace

- R1. Rename all npm/package names from pawn to pawn
- R2. Update all `@pawn/*` import statements across the monorepo
- R3. Rename environment variables (`PAWN_*` -> `PAWN_*`)
- R4. Update database defaults and provide migration script for existing installs
- R5. Update Docker config (compose, image names)
- R6. Update CLI binary name, config path, and user-facing strings
- R7. Update MCP server/client identity and resource URI scheme (`pawn://` -> `pawn://`)
- R8. Rename GitHub topic (`pawn-package` -> `pawn-package`) with hard cutover
- R9. Update all UI display text, SVG assets, localStorage keys, and system prompt
- R10. Update CI/CD workflows, repo URL references, and documentation
- R11. All tests pass after rename with no regressions

## Scope Boundaries

- Historical plan documents in `docs/plans/` will be updated (references to package names and repo URLs)
- The GitHub repo rename itself is a manual step (GitHub Settings), not automated by this work
- Existing published packages on GitHub will need manual re-tagging with `pawn-package` topic (out of scope for code changes)
- SVG logo files need text replacement from "Pawn" to "Pawn" but full redesign is out of scope

## Context & Research

### Relevant Code and Patterns

The codebase uses these case variants consistently:

| Pattern | Example | Rename to |
|---------|---------|-----------|
| PascalCase | `Pawn` | `Pawn` |
| lowercase | `pawn` | `pawn` |
| SCREAMING_SNAKE | `PAWN_*` | `PAWN_*` |
| kebab compound | `pawn-mcp` | `pawn-mcp` |
| snake compound | `pawn_onboarded` | `pawn_onboarded` |
| URI scheme | `pawn://` | `pawn://` |
| npm scope | `@pawn/` | `@pawn/` |
| abbreviated CLI | `@i75corridor/zh-cli` | `@i75corridor/pawn-cli` |

**Monorepo workspace structure (pnpm):**

| Workspace | Current package name | New package name |
|-----------|---------------------|-----------------|
| `packages/db` | `@pawn/db` | `@pawn/db` |
| `packages/shared` | `@pawn/shared` | `@pawn/shared` |
| `packages/cli` | `@i75corridor/zh-cli` | `@i75corridor/pawn-cli` |
| `packages/mcp` | `@i75corridor/pawn-mcp` | `@i75corridor/pawn-mcp` |
| `server` | `server` | `server` (unchanged) |
| `ui` | `ui` | `ui` (unchanged) |
| root | `pawn` | `pawn` |

**Total scope:** ~206 occurrences across ~50 files, plus ~80 import statement files.

### Institutional Learnings

No prior rename/migration learnings exist in `docs/solutions/`. This rename should be documented as a new solution entry afterward.

### External References

- pnpm workspace protocol: workspace dependencies use `workspace:*` and must match the `name` field in each package's `package.json`
- GitHub repository rename: GitHub automatically redirects the old URL, but CI configs and local clones should be updated

## Key Technical Decisions

- **Hard cutover for GitHub topic:** Switch from `pawn-package` to `pawn-package` immediately. Existing published packages will need manual re-tagging. This is simpler than dual-topic support and aligns with a clean rebrand.
- **Database migration included:** Provide a migration script to rename database name/user from `pawn` to `pawn` for existing installs, not just new defaults.
- **CLI package name:** `@i75corridor/pawn-cli` with binary `pawn` (full rename, no abbreviation).
- **Lockfile regeneration:** After package name changes, `pnpm install` must regenerate `pnpm-lock.yaml` to reflect new package names.
- **SVG text replacement:** Simple find-replace of "Pawn" text nodes in SVG files. No visual redesign.

## Open Questions

### Resolved During Planning

- **GitHub topic migration strategy:** Hard cutover to `pawn-package`. Existing packages need manual re-tagging.
- **Database migration:** Include migration script for existing installs.
- **CLI naming:** `@i75corridor/pawn-cli` with `pawn` binary.
- **Repo rename:** GitHub repo will be renamed; all URL references updated in code.

### Deferred to Implementation

- **Exact SVG edit approach:** May require manual inspection of SVG structure to ensure text nodes are correctly replaced without breaking paths/shapes.
- **Migration script testing:** Exact SQL commands for renaming database/user depend on PostgreSQL version behavior with active connections.

## Implementation Units

- [ ] **Unit 1: Package infrastructure**

**Goal:** Rename all package.json `name` fields, workspace dependency references, and root build scripts.

**Requirements:** R1

**Dependencies:** None (foundation for all other units)

**Files:**
- Modify: `package.json` (root — name and build script filters)
- Modify: `packages/db/package.json` (name)
- Modify: `packages/shared/package.json` (name)
- Modify: `packages/cli/package.json` (name, bin key, repository URL)
- Modify: `packages/mcp/package.json` (name, repository URL)
- Modify: `server/package.json` (workspace dependency names)
- Modify: `ui/package.json` (workspace dependency names)

**Approach:**
- Update `name` fields: root -> `pawn`, `@pawn/db` -> `@pawn/db`, `@pawn/shared` -> `@pawn/shared`, `@i75corridor/zh-cli` -> `@i75corridor/pawn-cli`, `@i75corridor/pawn-mcp` -> `@i75corridor/pawn-mcp`
- Update `bin` key in CLI package: `"pawn"` -> `"pawn"`
- Update all `"@pawn/db": "workspace:*"` and `"@pawn/shared": "workspace:*"` dependency references in server, ui, cli, mcp package.json files
- Update root `package.json` build script `--filter` arguments to match new names
- Update `repository.url` in cli and mcp package.json to point to `i75Corridor/pawn`
- Run `pnpm install` to regenerate lockfile

**Patterns to follow:**
- Existing `package.json` structure and workspace protocol usage

**Test scenarios:**
- Happy path: `pnpm install` succeeds with no unresolved workspace dependencies
- Happy path: `pnpm --filter @pawn/db build` resolves correctly
- Edge case: no residual `pawn` references remain in any `package.json` file

**Verification:**
- `pnpm install` completes without errors
- `grep -r "pawn" packages/*/package.json server/package.json ui/package.json package.json` returns no matches

---

- [ ] **Unit 2: Source code imports**

**Goal:** Update all `@pawn/db` and `@pawn/shared` import statements across the monorepo.

**Requirements:** R2

**Dependencies:** Unit 1 (package names must be updated first)

**Files:**
- Modify: All `server/src/**/*.ts` files with `@pawn/` imports
- Modify: All `ui/src/**/*.ts` and `ui/src/**/*.tsx` files with `@pawn/` imports
- Modify: All `packages/cli/src/**/*.ts` files with `@pawn/` imports
- Modify: All `packages/mcp/src/**/*.ts` files with `@pawn/` imports

**Approach:**
- Bulk find-replace `@pawn/db` -> `@pawn/db` and `@pawn/shared` -> `@pawn/shared` across all TypeScript source files
- These are the only two `@pawn/` scoped imports used in the codebase

**Patterns to follow:**
- Existing import statement style (type imports vs value imports preserved as-is)

**Test scenarios:**
- Happy path: TypeScript compilation (`pnpm typecheck`) passes with no unresolved module errors
- Edge case: no residual `@pawn/` import strings remain in any `.ts` or `.tsx` file

**Verification:**
- `pnpm typecheck` passes
- `grep -r "@pawn/" server/src/ ui/src/ packages/*/src/` returns no matches

---

- [ ] **Unit 3: Server config, database, and Docker**

**Goal:** Update environment variables, database defaults, Docker image name, temp directory prefixes, and provide a database migration script.

**Requirements:** R3, R4, R5

**Dependencies:** Unit 2

**Files:**
- Modify: `server/src/index.ts` (DB_NAME, DB_USER, DB_PASS defaults)
- Modify: `server/src/services/script-sandbox.ts` (Docker image name)
- Modify: `server/src/services/pi-executor.ts` (temp dir prefix, skill source tag)
- Modify: `server/src/routes/packages.ts` (temp dir prefixes)
- Modify: `server/src/services/tools/scan-package.ts` (temp dir prefix)
- Modify: `docker-compose.yml` (Postgres env vars, DATABASE_URL, healthcheck)
- Modify: `.env.example` (if it contains pawn references)
- Modify: `.gitignore` (temp dir path)
- Create: `packages/db/migrations/XXXX_rename_database.sql` (migration script)
- Test: `server/src/__tests__/database-config.test.ts`
- Test: `server/src/__tests__/database-config-startup.test.ts`
- Test: `server/src/__tests__/settings-database-config.test.ts`
- Test: `server/src/__tests__/skill-loader.test.ts`
- Test: `server/src/__tests__/model-availability.test.ts`

**Approach:**
- Replace `DB_NAME = "pawn"` with `"pawn"`, same for DB_USER and DB_PASS
- Replace Docker image `pawn/skill-runner:latest` with `pawn/skill-runner:latest`
- Replace temp dir prefixes: `pawn-scan-` -> `pawn-scan-`, `pawn-export-` -> `pawn-export-`, `pawn-publish-` -> `pawn-publish-`, `/tmp/pawn` -> `/tmp/pawn`, `pawn-skill-test-` -> `pawn-skill-test-`, `pawn-model-test-` -> `pawn-model-test-`
- Replace skill source tag `"pawn"` -> `"pawn"` in pi-executor
- Update docker-compose.yml: POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB, DATABASE_URL, healthcheck user
- Provide SQL migration script for renaming existing database and user
- Update all test fixtures that assert `database: "pawn"` to `database: "pawn"`

**Patterns to follow:**
- Existing Drizzle migration file naming convention in `packages/db/migrations/`

**Test scenarios:**
- Happy path: server starts with new default DB name `pawn`
- Happy path: docker-compose up creates database named `pawn` with user `pawn`
- Happy path: all database config tests pass with updated assertions
- Error path: migration script handles case where database name already is `pawn` (idempotent)
- Edge case: existing DATABASE_URL override still works (no hardcoded name dependency)

**Verification:**
- All database-related tests pass
- `docker-compose config` shows `pawn` in all Postgres env vars
- `grep -r "pawn" server/src/ docker-compose.yml .gitignore` returns no matches (excluding import statements already handled)

---

- [ ] **Unit 4: CLI package**

**Goal:** Rename CLI binary, config directory path, environment variables, and all user-facing strings.

**Requirements:** R3, R6

**Dependencies:** Unit 2

**Files:**
- Modify: `packages/cli/src/index.ts` (program name, description)
- Modify: `packages/cli/src/config.ts` (config dir path, PAWN_SERVER_URL env var)
- Modify: `packages/cli/src/commands/packages.ts` (user-facing strings, topic references)
- Modify: `packages/cli/src/commands/new.ts` (user-facing strings)
- Test: `packages/cli/src/__tests__/config.test.ts`

**Approach:**
- `.name("pawn")` -> `.name("pawn")`
- Config path: `join(configHome, "pawn", ...)` -> `join(configHome, "pawn", ...)`
- Environment variable: `PAWN_SERVER_URL` -> `PAWN_SERVER_URL`
- Update all help text, example commands, and descriptions referencing "pawn"
- Update `pawn-package` topic references to `pawn-package`

**Patterns to follow:**
- Existing Commander.js command definition style

**Test scenarios:**
- Happy path: `pawn --help` shows correct program name and description
- Happy path: config file resolves to `~/.config/pawn/config.json`
- Happy path: `PAWN_SERVER_URL` environment variable is read correctly
- Edge case: config test assertions updated for new paths and env var names

**Verification:**
- CLI tests pass
- `grep -r "pawn" packages/cli/src/` returns no matches

---

- [ ] **Unit 5: MCP package**

**Goal:** Update MCP server/client identity, resource URI scheme, environment variables, and prompt text.

**Requirements:** R3, R7

**Dependencies:** Unit 2

**Files:**
- Modify: `packages/mcp/src/server.ts` (server name)
- Modify: `packages/mcp/src/resources/index.ts` (resource URIs)
- Modify: `packages/mcp/src/prompts/index.ts` (prompt text)
- Modify: `packages/mcp/src/tools/package-tools.ts` (tool descriptions)
- Modify: `packages/mcp/src/index.ts` (PAWN_URL, PAWN_API_KEY env vars)
- Modify: `server/src/services/mcp-client.ts` (client name)
- Test: `packages/mcp/src/__tests__/server.test.ts`

**Approach:**
- Server name: `"pawn"` -> `"pawn"`
- Client name in mcp-client.ts: `"pawn"` -> `"pawn"`
- Resource URIs: `pawn://pipelines` -> `pawn://pipelines`, etc. (12 occurrences)
- Environment variables: `PAWN_URL` -> `PAWN_URL`, `PAWN_API_KEY` -> `PAWN_API_KEY`
- Update prompt text mentioning "Pawn"
- Update tool descriptions referencing "pawn-package"
- Update test assertions for new URI scheme

**Patterns to follow:**
- Existing MCP SDK server/resource registration patterns

**Test scenarios:**
- Happy path: MCP server reports name as `pawn`
- Happy path: resource URIs use `pawn://` scheme
- Happy path: `PAWN_URL` and `PAWN_API_KEY` env vars are read correctly
- Integration: MCP test assertions updated and passing for new URIs

**Verification:**
- MCP tests pass
- `grep -r "pawn" packages/mcp/src/ server/src/services/mcp-client.ts` returns no matches

---

- [ ] **Unit 6: Package discovery system**

**Goal:** Rename the GitHub topic used for package discovery from `pawn-package` to `pawn-package`.

**Requirements:** R8

**Dependencies:** Unit 2

**Files:**
- Modify: `server/src/services/package-manager.ts` (GitHub API search query)
- Modify: `server/src/routes/packages.ts` (topic applied to published repos)
- Modify: `server/src/services/tools/discover-packages.ts` (tool description)
- Modify: `ui/src/pages/Packages.tsx` (topic filter in display)

**Approach:**
- Replace `topic:pawn-package` -> `topic:pawn-package` in GitHub API search
- Replace `"pawn-package"` -> `"pawn-package"` in topic management commands
- Update tool descriptions and UI filter

**Patterns to follow:**
- Existing GitHub API topic usage in package-manager.ts

**Test scenarios:**
- Happy path: package discovery searches for `topic:pawn-package`
- Happy path: publishing a package adds `pawn-package` topic
- Happy path: UI filters out `pawn-package` from displayed topics

**Verification:**
- `grep -r "pawn-package" server/src/ ui/src/` returns no matches

---

- [ ] **Unit 7: UI, assets, and branding**

**Goal:** Update all user-facing display text, SVG assets, localStorage keys, system prompt, and onboarding content.

**Requirements:** R9

**Dependencies:** Unit 2

**Files:**
- Modify: `ui/index.html` (title, meta tags)
- Modify: `ui/src/components/Layout.tsx` (brand name, localStorage key)
- Modify: `ui/src/components/OnboardingModal.tsx` (welcome text)
- Modify: `ui/src/pages/Help.tsx` (help text)
- Modify: `ui/src/pages/PipelineDetail.tsx` (CLI command reference)
- Modify: `ui/src/pages/RunDetail.tsx` (if applicable)
- Modify: `ui/public/logo.svg` (text nodes)
- Modify: `ui/public/favicon.svg` (comment)
- Modify: `.github/pawn.svg` (rename file to `pawn.svg`, update text)
- Modify: `server/src/services/global-agent.ts` (system prompt)
- Modify: `.impeccable.md` (brand personality)

**Approach:**
- Replace `Pawn` with `Pawn` in all UI display text and HTML meta tags
- Replace `pawn_onboarded` with `pawn_onboarded` in localStorage calls
- Update system prompt: `"You are the Pawn assistant"` -> `"You are the Pawn assistant"`
- Edit SVG text nodes to replace "Pawn" with "Pawn"
- Rename `.github/pawn.svg` to `.github/pawn.svg` and update README reference

**Patterns to follow:**
- Existing UI component text patterns

**Test scenarios:**
- Happy path: page title shows "Pawn" in browser tab
- Happy path: sidebar brand name displays "Pawn"
- Happy path: onboarding modal says "Welcome to Pawn"
- Happy path: global agent identifies as "Pawn assistant"
- Edge case: localStorage key change means existing users see onboarding again (expected with rebrand)

**Verification:**
- Visual inspection of UI shows "Pawn" branding
- `grep -ri "pawn" ui/src/ ui/index.html ui/public/ server/src/services/global-agent.ts` returns no matches

---

- [ ] **Unit 8: Documentation, CI/CD, and repo references**

**Goal:** Update all documentation, CI/CD workflows, Claude skill files, and repository URL references.

**Requirements:** R10

**Dependencies:** Units 1-7 (documentation should reflect final state)

**Files:**
- Modify: `README.md`
- Modify: `docs/architecture.md`
- Modify: `docs/cli.md`
- Modify: `docs/env.md`
- Modify: `docs/mcp-servers.md`
- Modify: `docs/execution-engine.md`
- Modify: `docs/validation.md`
- Modify: `docs/PACKAGE_FORMAT.md`
- Modify: `docs/version-history.md`
- Modify: `docs/pipeline-packages.md`
- Modify: `docs/agent-tools.md`
- Modify: `docs/secrets.md`
- Modify: `.github/workflows/publish-cli.yml` (package name reference)
- Modify: `.claude/skills/create-issue/SKILL.md` (repo references)
- Modify: `.claude/skills/implement-issue/SKILL.md` (repo references)
- Modify: `docs/plans/*.md` (repo and package references in existing plans)

**Approach:**
- Bulk find-replace `pawn` -> `pawn`, `Pawn` -> `Pawn`, `PAWN` -> `PAWN` across all documentation files
- Update CI workflow: `@i75corridor/zh-cli` -> `@i75corridor/pawn-cli`
- Update Claude skill files: `i75Corridor/pawn` -> `i75Corridor/pawn`
- Update existing plan documents with new repo and package name references
- Review each file after bulk replace for context correctness (e.g., ensure "pawn" makes sense in prose)

**Patterns to follow:**
- Existing documentation formatting and structure

**Test scenarios:**
- Happy path: CI workflow references correct package name
- Happy path: README logo reference points to `.github/pawn.svg`
- Edge case: historical context in version-history.md and plan documents still reads correctly after rename

**Verification:**
- `grep -ri "pawn" docs/ README.md .github/ .claude/` returns no matches
- CI workflow YAML is valid

---

- [ ] **Unit 9: Final verification and cleanup**

**Goal:** Full codebase grep for any remaining "pawn" references, run all tests, and verify build.

**Requirements:** R11

**Dependencies:** Units 1-8

**Files:**
- No new files

**Approach:**
- Run `grep -ri "pawn"` across the entire repo to catch any missed references
- Exclude `.git/` directory and binary files
- Run full test suite: `pnpm test`
- Run full typecheck: `pnpm typecheck`
- Run full build: `pnpm build`
- Fix any remaining references or test failures

**Test expectation: none** -- this unit is purely verification of prior work.

**Verification:**
- `grep -ri "pawn" --include="*.ts" --include="*.tsx" --include="*.json" --include="*.yml" --include="*.yaml" --include="*.md" --include="*.html" --include="*.svg"` returns zero matches
- `pnpm test` passes
- `pnpm typecheck` passes
- `pnpm build` succeeds

## System-Wide Impact

- **Interaction graph:** Package name changes cascade through pnpm workspace resolution, TypeScript module resolution, and CI publish steps. The lockfile must be regenerated after Unit 1.
- **Error propagation:** If package names are updated but imports are not (or vice versa), TypeScript compilation will fail immediately, providing clear error signals.
- **State lifecycle risks:** Existing databases named `pawn` need the migration script. Existing CLI config at `~/.config/pawn/` will be orphaned (users need to re-configure or manually move). Existing localStorage `pawn_onboarded` key will be orphaned (users see onboarding again).
- **API surface parity:** MCP resource URIs change from `pawn://` to `pawn://`. Any MCP clients caching old URIs will need to refresh.
- **Integration coverage:** Must verify that the full pipeline works end-to-end after rename: server starts, UI loads, CLI connects, MCP server registers, packages can be discovered.
- **Unchanged invariants:** All application behavior, data models, API endpoints, and pipeline execution logic remain identical. Only naming/branding changes.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Missed "pawn" reference causes runtime failure | Unit 9 does full-codebase grep and full test/build verification |
| pnpm lockfile conflicts after package rename | Regenerate lockfile immediately after Unit 1, before any other changes |
| Existing database users can't connect after rename | Migration script is provided; DATABASE_URL override still works regardless of defaults |
| GitHub repo redirect stops working | GitHub maintains redirects indefinitely; update local configs proactively |
| Published packages lose discoverability | Hard cutover accepted; existing packages need manual re-tagging |
| SVG edits break logo rendering | Manual visual inspection after text replacement |

## Sources & References

- Issue: i75Corridor/pawn#70
- Related code: all workspaces in the monorepo
- pnpm workspace protocol: https://pnpm.io/workspaces
