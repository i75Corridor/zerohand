---
name: trending
version: "3.1.0"
description: "SLASH COMMAND: /trending <topic>. Triggered ONLY by the /trending command. Runs the full research→write→editorial review→image→notify pipeline via delegate agents. Do NOT use for general research queries."
argument-hint: 'Iran war, AI regulation, Elon Musk Mars trip'
allowed-tools: shell, delegate, memory_store, memory_recall, memory_forget
user-invocable: true
metadata:
  openclaw:
    emoji: "📰"
    requires:
      env:
        - GEMINI_API_KEY
      bins:
        - node
    primaryEnv: GEMINI_API_KEY
---

# trending: Full Research-to-Publish Pipeline

Orchestrate the complete pipeline: research → write → editorial review → image → notify. Each step runs in an isolated delegate agent with its own timeout and tool set. You are the Editor-in-Chief of The Daily Absurdist — coordinate, don't execute.

## Step 1 — Parse Topic

Extract **TOPIC** from the user's input — everything after `/trending`.

If no topic provided, reply: "Usage: `/trending <topic>`. Example: `/trending Iran war`" and stop.

Determine today's date by calling `shell` with `date +%Y-%m-%d`. Store result as **DATE**.

## Step 2 — Research

**CRITICAL: Call the shell tool now — do not describe what you will do, just do it immediately.**

Run these three shell commands to search the web:

```bash
node /zeroclaw-data/workspace/skills/research/scripts/search.mjs "{TOPIC} latest news 2026" --max=5
```

```bash
node /zeroclaw-data/workspace/skills/research/scripts/search.mjs "{TOPIC} controversy scandal expert opinion" --max=5
```

```bash
node /zeroclaw-data/workspace/skills/research/scripts/search.mjs "{TOPIC} background context history" --max=5
```

Each returns JSON: `[{ title, url, snippet }, ...]`. Read all three results and compile into structured findings:

```
TOPIC: {TOPIC}
DATE: {DATE}

KEY FACTS:
- (bullet points from search snippets)

QUOTES:
- (notable quotes or statements)

ANGLES:
- (interesting satirical angles or contradictions — list at least 3, ranked by non-obviousness)

SOURCES:
- (URLs)
```

Call `memory_store` with:
- `key`: `"trending:research:{DATE}"`
- `value`: the full compiled findings block above (as a single string)

## Step 3 — Write Story

Call `memory_recall` with query `"trending:research:{DATE}"` to load the research notes.

Using the research, write a **2000-2500 word satirical news article** in the style of The Onion. Structure it exactly as:

```
# {HEADLINE}

## {SUBHEADING — one dry sentence that undercuts the headline}

*By {FICTITIOUS JOURNALIST NAME}, {FICTITIOUS LOCATION}*

{2000-2500 words of article body}
```

**CRITICAL: After writing, do these TWO steps immediately — do not skip either.**

**Step 3a — Store the full article in memory:**

Call `memory_store` with:
- `key`: `"trending:draft:{DATE}"`
- `value`: the complete article (headline through final paragraph, as written above)

**Step 3b — Write to disk:**

Call `shell` with:
```bash
node /zeroclaw-data/workspace/skills/writer/scripts/memory-to-file.mjs "trending:draft:{DATE}" "/zeroclaw-data/workspace/output/story-{DATE}.md"
```

**Step 3c — Store the headline:**

Call `memory_store` with `key` = `"trending:headline:{DATE}"` and `value` = just the headline text (no `#` prefix).

## Step 4 — Editorial Review

Call `delegate`:
- `agent`: `"editor"`
- `prompt`: `story_file="/zeroclaw-data/workspace/output/story-{DATE}.md" headline_key="trending:headline:{DATE}" date="{DATE}" rewrite_round="0"`

Wait for completion. The editor will either approve (storing image prompt at `trending:image_prompt:{DATE}`) or trigger a rewrite cycle automatically.

## Step 5 — Generate Cover Image

Call `memory_recall` with key `trending:image_prompt:{DATE}` to get the image prompt.

If the key is empty (editor failed to store it), use this fallback:
`"A satirical 1950s American editorial newspaper cartoon about {TOPIC}, crosshatched ink illustration, exaggerated caricature, dramatic black-and-white, newspaper halftone texture, in the style of Herblock or Bill Mauldin"`

Call `delegate`:
- `agent`: `"image_maker"`
- `prompt`: `prompt="{IMAGE_PROMPT}" output="/zeroclaw-data/workspace/output/story-{DATE}-cover.png" store_key="trending:cover:{DATE}"`

Wait for completion.

## Step 6 — Notify

Call `memory_recall` with key `trending:headline:{DATE}` to get the headline.

Call `delegate`:
- `agent`: `"notifier"`
- `prompt`: `headline="{HEADLINE}" story="output/story-{DATE}.md" cover="output/story-{DATE}-cover.png" cleanup="trending:research:{DATE},trending:headline:{DATE},trending:image_prompt:{DATE},trending:cover:{DATE},trending:editor_status:{DATE}"`

## Step 7 — Done

Reply: "Pipeline complete. Story and cover saved to output/. Check Telegram for the notification."
