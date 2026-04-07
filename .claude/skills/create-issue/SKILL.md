---
name: create-issue
description: Interactively draft and file a new GitHub issue for i75Corridor/pawn. Ask the user questions to understand the problem or feature, explore the codebase in plan mode to fill in technical detail, then create the issue via `gh`. Use this skill whenever the user wants to write a ticket, file a bug, propose a feature, or create any GitHub issue — even if they just say "let's write up an issue for X" or "I want to track this".
---

## What this skill does

1. Interview the user to understand what the issue is about
2. Explore relevant code in plan mode to add technical context
3. Draft a structured issue (title, body, labels) and get approval
4. File the issue via `gh issue create`

---

## Step 1 — Interview the user

Ask only what you don't already know from the conversation. Cover these points — you can ask them all at once in a short numbered list rather than one at a time:

1. **What's the problem or feature?** A sentence or two describing what needs to happen and why.
2. **Bug or enhancement?** Is something broken, or is this new capability?
3. **Acceptance criteria** — how will we know this is done? (rough bullets are fine)
4. **Affected area** — any files, pages, or subsystems the user knows are involved?
5. **Priority / context** — blocking something? Nice-to-have? Any deadline?

Don't ask for things the user has already said. If the conversation already answers a question, skip it. If you're only missing one or two things, just ask those.

---

## Step 2 — Enter plan mode and draft the issue

Use `EnterPlanMode` to explore the codebase before writing the issue body. This surfaces the right file paths, function names, and technical constraints so the issue is immediately actionable for whoever picks it up.

During plan mode:
- Search for relevant files, types, and functions tied to the affected area
- Identify files that will likely need to change
- Note any schema changes, new dependencies, or breaking concerns
- If it's a bug, trace the likely source (where is the problematic code?)
- If it's an enhancement, sketch the implementation approach at a high level

Draft the issue using this structure:

```
## Context
<Why this matters. What's the current behavior / gap. 1-3 sentences.>

## Problem / Goal
<What needs to change and why. Be specific.>

## Acceptance Criteria
- [ ] <Concrete, testable condition>
- [ ] <Another condition>
- [ ] ...

## Technical Notes
<Optional. Anything useful for the implementer: relevant files, approach sketch, gotchas, dependencies. Skip if the acceptance criteria are self-explanatory.>

## Files
<List files likely to change, one per line. Derive from your codebase exploration.>
```

Then choose a label:
- `bug` — something is broken or behaving incorrectly
- `enhancement` — new feature or improvement
- `documentation` — docs only
- `question` — needs discussion before work begins

Propose a concise, imperative title (e.g. "Add WebSocket cost events to Costs page").

Use `ExitPlanMode` once the draft is ready.

---

## Step 3 — Show the draft and get approval

Present the full issue draft to the user — title, label, and body — formatted so it's easy to read. Ask: **"Does this look right, or anything you'd change?"**

Wait for explicit approval before filing. Incorporate any edits the user requests, then confirm once more if changes were substantial.

---

## Step 4 — File the issue

```bash
gh issue create \
  --repo i75Corridor/pawn \
  --title "<title>" \
  --body "<body>" \
  --label "<label>"
```

Return the issue URL to the user.

---

## Notes

- Keep the issue body tight — a good issue is specific enough to act on, not a design doc
- If the user mentions a related issue or PR, reference it in the body with `#<number>`
- If the scope is unclear, it's better to file a narrow, focused issue than an epic — encourage the user to split if needed
- Never file the issue without explicit user sign-off on the draft
