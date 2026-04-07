---
name: implement-issue
description: End-to-end GitHub issue implementation workflow for i75Corridor/pawn. Fetches issue details via `gh` CLI, enters plan mode to design the implementation, executes the plan, creates tests, then confirms with the user before committing, pushing, and opening a PR. Triggered by the slash command `/implement-issue <number>` (e.g. `/implement-issue 21`).
---

## What this skill does

Full issue-to-PR workflow:
1. Fetch issue details from GitHub
2. Enter plan mode — design the implementation, get approval
3. Execute the plan
4. Create / run tests
5. Confirm with user → commit, push, open PR

---

## Step 1 — Fetch issue and prepare branch

The repo is always `i75Corridor/pawn`. Parse the issue number from the argument passed to `/issue`.

Fetch the issue:
```bash
gh issue view <N> --repo i75Corridor/pawn \
  --json number,title,body,labels,state,assignees,milestone,url,comments
```

Then check the current branch:
```bash
git branch --show-current
```

If on `main`, create and switch to a feature branch before doing any work:
```bash
git checkout -b feat/issue-<N>-<short-slug>
```
Derive the slug from the issue title — lowercase, hyphens, max ~5 words (e.g. `feat/issue-7-retry-error-recovery`).

Display a concise summary to the user:
- Title + number + URL
- State + labels
- Body (rendered, not raw JSON)
- Any clarifying comments if present

If the issue is closed, note that and confirm with the user before proceeding.

---

## Step 2 — Enter plan mode

Use `EnterPlanMode` to design the implementation.

When writing the plan:
- Read the issue body carefully — it usually contains a file table, schema changes, and verification steps
- Explore any files mentioned before finalizing the plan
- Break work into discrete, ordered steps
- Call out any DB migrations, new dependencies, or breaking changes explicitly
- Note which steps are risky or irreversible
- Ensure unit tests are accounted for
- Ask user any clarifying questions

Present the plan to the user. Do not start executing until the user approves (explicitly or implicitly by saying "go", "looks good", etc.). Use `ExitPlanMode` once approved.

---

## Step 3 — Execute the plan

Work through each planned step. For each:
- Mark it in-progress before starting
- Make the change
- Mark it complete

Follow the codebase's existing patterns — read files before editing, don't add unnecessary abstractions or comments, match the surrounding code style.

For DB schema changes: write migrations manually (drizzle-kit requires an interactive TTY, so `pnpm db:generate` will fail in this environment). Follow the pattern in `packages/db/src/migrations/`.

Run typecheck frequently:
```bash
cd <project-root> && pnpm typecheck
```

Fix any errors before moving on. Don't accumulate type errors.

---

## Step 4 — Tests

After implementation, create or update tests appropriate to what was built:
- Unit tests for pure logic (resolvers, utilities, parsers)
- Integration tests for API routes
- Follow the existing test patterns in the codebase

Run the test suite:
```bash
pnpm test
```

If tests fail, fix them before proceeding. Don't mark this step done until tests pass.

---

## Step 5 — Confirm and ship

Present a summary of what was done:
- Files changed (with brief description of each change)
- Tests added/updated
- Anything left out of scope or deferred

Then ask: **"Ready to commit, push, and open a PR?"**

Wait for explicit confirmation before proceeding.

On confirmation:
```bash
# Stage relevant files (be specific — never `git add .`)
git add <files>

# Commit
git commit -m "$(cat <<'EOF'
<imperative summary of what was done>

Closes #<issue-number>

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"

# Push
git push -u origin <current-branch>

# Open PR
gh pr create \
  --title "<issue title>" \
  --body "$(cat <<'EOF'
Closes #<issue-number>

## Summary
<bullet points of what changed>

## Test plan
<checklist>

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Return the PR URL to the user.

---

## Notes

- If the issue references other issues or PRs, read them for context before planning
- If the issue body has a "Verification" section, use it to drive the test plan
- If you hit an unexpected blocker mid-execution, surface it to the user rather than improvising around it
- Never force-push or amend published commits
