---
title: Codebase-wide rename in a pnpm monorepo
date: 2026-04-07
category: best-practices
module: monorepo
problem_type: best_practice
component: development_workflow
severity: medium
applies_when:
  - Rebranding requires renaming package names, imports, env vars, and user-facing strings
  - A pnpm monorepo needs coordinated package name changes across workspaces
  - Rename touches external contract surfaces (env vars, CLI binary, MCP URIs, GitHub topics)
tags:
  - rename
  - refactor
  - monorepo
  - pnpm
  - rebranding
  - workspace
---

# Codebase-wide rename in a pnpm monorepo

## Context

The project rebranded from "Zerohand" to "Pawn" (issue #70), requiring a rename across ~200 occurrences in ~50+ files spanning npm package names, TypeScript imports, environment variables, database defaults, Docker config, CLI tooling, MCP protocol identifiers, UI branding, CI/CD workflows, and documentation. The monorepo uses pnpm workspaces with 6 packages.

## Guidance

### Execution order matters

Rename in strict dependency order to keep the build working at each step:

1. **Package infrastructure first** -- `package.json` name fields, workspace dependency refs (`workspace:*`), root build script `--filter` arguments. Run `pnpm install` immediately to regenerate the lockfile. Commit this as an atomic unit.
2. **Import statements second** -- Bulk replace `@old-scope/pkg` with `@new-scope/pkg` across all `.ts`/`.tsx` files. This is a safe bulk `sed` operation since the old imports won't resolve after step 1.
3. **Domain-specific renames in parallel** -- Server config, CLI, MCP, UI, package discovery can all be done independently after imports are updated. These touch non-overlapping files and are ideal for parallel subagent dispatch.
4. **Documentation and CI last** -- These depend on knowing the final state of all code changes.
5. **Final grep verification** -- Full-codebase case-insensitive grep catches stragglers from new code merged to main between planning and execution.

### Case variant mapping

Document all case variants upfront to ensure nothing is missed:

| Pattern | Example | Maps to |
|---------|---------|---------|
| PascalCase | `Zerohand` | `Pawn` |
| lowercase | `zerohand` | `pawn` |
| SCREAMING_SNAKE | `ZEROHAND_*` | `PAWN_*` |
| kebab compound | `zerohand-mcp` | `pawn-mcp` |
| snake compound | `zerohand_onboarded` | `pawn_onboarded` |
| URI scheme | `zerohand://` | `pawn://` |
| npm scope | `@zerohand/` | `@pawn/` |

### Key pitfalls discovered

- **Existing databases break** -- Embedded Postgres data directories are initialized with the old role name. After renaming defaults, existing installs fail with `FATAL: Role "pawn" does not exist`. Fix: `pnpm db:reset` for dev, or set `DATABASE_URL` explicitly for production.
- **Lockfile must be committed with package renames** -- If the lockfile isn't regenerated and committed in the same unit as package.json changes, CI's `--frozen-lockfile` will fail.
- **New code on main creates merge conflicts** -- When main is active during a rename, rebase introduces conflicts in every file that was both modified on main and renamed by the branch. Resolution is mechanical (take main's code, apply the rename) but tedious. Minimize the window between branch creation and merge.
- **Bulk sed on docs clobbers plan documents** -- The rename plan itself contains "zerohand" as part of its content (documenting what to rename). Bulk sed on `docs/` turns "Rename zerohand to pawn" into "Rename pawn to pawn". Accept this for historical plans or exclude them from bulk operations.
- **Comments with example package names** -- Comments like `// "zerohand-daily-absurdist/researcher"` are easy to miss in grep because they look like real package names, not brand references.

### Parallel subagent strategy

For a rename of this size, dispatch domain-specific units as parallel subagents after the foundational units (package names + imports) are committed:

- Server config + DB + Docker (one agent)
- CLI package (one agent)
- MCP package (one agent)
- Package discovery system (one agent)
- UI + assets + branding (one agent)

This cut total execution time roughly in half compared to serial execution.

## Why This Matters

A botched rename leaves the codebase in an inconsistent state where some references point to the old name and others to the new. TypeScript compilation catches import mismatches immediately, but runtime references (env vars, database names, MCP URIs, localStorage keys) fail silently until users hit them. The dependency-ordered approach ensures the build stays green at every commit boundary.

## When to Apply

- Rebranding a monorepo project
- Renaming npm scope or package names in a workspace
- Any rename that crosses multiple package boundaries and external contract surfaces

## Examples

**Before (package.json workspace ref):**
```json
"dependencies": {
  "@zerohand/db": "workspace:*",
  "@zerohand/shared": "workspace:*"
}
```

**After:**
```json
"dependencies": {
  "@pawn/db": "workspace:*",
  "@pawn/shared": "workspace:*"
}
```

**Before (environment variable):**
```typescript
const serverUrl = process.env.ZEROHAND_SERVER_URL;
```

**After:**
```typescript
const serverUrl = process.env.PAWN_SERVER_URL;
```

## Related

- [i75Corridor/pawn#70](https://github.com/i75Corridor/pawn/issues/70) -- Original rename issue
- [i75Corridor/pawn#79](https://github.com/i75Corridor/pawn/pull/79) -- Implementation PR
- `docs/plans/2026-04-07-002-refactor-zerohand-to-pawn-rename-plan.md` -- Detailed plan
