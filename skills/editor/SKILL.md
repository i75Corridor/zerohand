---
name: editor
version: "1.1.0"
description: "Editorial quality review for satirical articles. Reads a drafted story, evaluates it against The Daily Absurdist standards, and either APPROVEs (crafting an image prompt) or requests ONE rewrite with specific feedback. Call with /editor story_file='...' headline_key='...' date='...'"
argument-hint: 'story_file="/zeroclaw-data/workspace/output/story-2026-03-29.md" headline_key="trending:headline:2026-03-29" date="2026-03-29"'
allowed-tools: shell, memory_recall, memory_store, delegate
user-invocable: true
metadata:
  openclaw:
    emoji: "✏️"
---

# editor: Editorial Quality Review

Review a drafted satirical article against The Daily Absurdist's editorial standards. Gate the pipeline: either approve and craft an image prompt, or send the piece back for one targeted rewrite.

**IMPORTANT:** This is a quality gate, not a rewrite service. You evaluate. You do not rewrite from scratch.

## Step 1 — Parse Arguments

Extract from the delegate prompt:
- **STORY_FILE** — from `story_file="..."` — full path to the drafted story markdown file
- **HEADLINE_KEY** — from `headline_key="..."` — memory key where the headline is stored
- **DATE** — from `date="..."` — YYYY-MM-DD date string
- **REWRITE_ROUND** — from `rewrite_round="..."` — integer, defaults to 0

## Step 2 — Read the Article

**CRITICAL: Call the shell tool immediately to read the story file.**

Call `shell` with: `cat "{STORY_FILE}"` to load the full article text.

Call `memory_recall` with HEADLINE_KEY to confirm the headline.

## Step 3 — Editorial Review

Evaluate the article against The Daily Absurdist quality standards. Score each criterion:

**REQUIRED to pass all five:**
1. **Headline specificity** — Is the headline declarative, specific, and somehow funny without a question mark?
2. **Deadpan voice** — Does the piece read like a tired, extremely competent reporter who has accepted the world is insane?
3. **Grounded absurdity** — Is every invented detail a plausible extension of something real?
4. **Non-obvious angle** — Is this the second-best satirical take, not the first obvious one?
5. **Tight writing** — Could you cut 20% without losing anything? If yes, flag it.

## Step 4 — Decision

**If the article PASSES all five criteria:**

Craft a vivid, specific image prompt for the cover illustration. The image must evoke 1950s-1960s editorial cartoon style — crosshatching, ink wash, exaggerated caricature, dramatic chiaroscuro, newspaper halftone texture. No photorealism. No modern aesthetics.

The prompt should:
- Reference the specific satirical subject (not just "a politician")
- Describe a single dramatic visual moment or composition
- Specify style explicitly: "in the style of a 1950s American editorial newspaper cartoon, crosshatched ink, exaggerated caricature, dramatic black-and-white with spot color"

Call `memory_store` with `key` = `"trending:image_prompt:{DATE}"` and `value` = the image prompt text.

Call `memory_store` with `key` = `"trending:editor_status:{DATE}"` and `value` = `"APPROVED"`.

Reply:
```
APPROVED
Headline: {HEADLINE}
Image prompt stored at: trending:image_prompt:{DATE}
```

**If the article FAILS one or more criteria:**

Only request a rewrite if REWRITE_ROUND is 0 (first pass). If REWRITE_ROUND is 1, approve anyway with a note — the pipeline must not stall.

For a rewrite request:
- Be specific. Name exactly what's wrong and what would fix it.
- Do not ask for a full rewrite — identify the 1-2 most fixable issues.
- Provide the corrected angle or headline direction if the angle is the problem.

Call `delegate`:
- `agent`: `"writer"`
- `prompt`: `from_file="{STORY_FILE}" save_file="{STORY_FILE}" store_key="{HEADLINE_KEY}" editor_notes="{YOUR SPECIFIC FEEDBACK}"`

Wait for the rewrite. Then call `shell` with `cat "{STORY_FILE}"` again and apply the same evaluation. If it passes, proceed to approval. If it still fails on the second pass, approve anyway — one rewrite maximum.

Call `memory_store` with `key` = `"trending:editor_status:{DATE}"` and `value` = `"APPROVED_AFTER_REWRITE"` (or `"APPROVED_WITH_NOTE"` if approved on first pass with caveats).

## Step 5 — Reply

Report back with decision and the image prompt (or rewrite feedback if still in-progress).
