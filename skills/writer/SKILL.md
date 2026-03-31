---
name: writer
version: "1.2.0"
description: "Write a satirical Onion-style story. Accepts inline research notes, a memory key to read from, or a file path. Saves the story to a specified output path. Call with /writer topic='...' notes='...' or /writer topic='...' from_key='...'"
argument-hint: 'topic="Iran war" from_key="pipeline:research" save_file="output/story-2026-03-25.md"'
allowed-tools: shell, memory_recall, memory_store
user-invocable: true
metadata:
  openclaw:
    emoji: "✍️"
---

# writer: Satirical Story Writer

Write a sharp, 2000-2500 word satirical story in the style of The Onion. Grounded in real facts.

## Step 1 — Parse Arguments

Extract from the user's message or delegate prompt:
- **TOPIC** — the subject of the story (optional if FROM_KEY is provided — derive from research)
- **NOTES** — inline research notes (optional, may be pasted directly in the message)
- **FROM_KEY** — from `from_key="..."` — memory key to recall research from (optional)
- **FROM_FILE** — from `from_file="..."` — file path to read research from (optional)
- **SAVE_FILE** — from `save_file="..."` — output file path for the story (optional, default: `/zeroclaw-data/workspace/output/story-{YYYY-MM-DD}.md`)
- **STORE_KEY** — from `store_key="..."` — memory key to store the headline + filepath under (optional)

## Step 2 — Get Research

In priority order:
1. Use NOTES if provided inline
2. If FROM_KEY provided: call `memory_recall` with that key
3. If FROM_FILE provided: call `shell` with `cat "{FROM_FILE}"` to read the file
4. If none provided: proceed with TOPIC alone (the writer will draw on general knowledge)

## Step 3 — Write the Story

Using the research (or topic alone), write a **2000-2500 word satirical news article**. Be specific and precise. Ground every joke in real, verifiable details.

Structure exactly as:
```
# {HEADLINE}

## {SUBHEADING — one dry sentence that undercuts the headline}

*By {FICTITIOUS JOURNALIST NAME}, {FICTITIOUS LOCATION}*

{2000-2500 words of story body}
```

## Step 4 — Save

Determine today's date (YYYY-MM-DD) if not specified.

**CRITICAL: You MUST call the shell tool to save the story. Do this immediately after writing the story — do not skip this step.**

Call `shell` with this exact command to save the full story to SAVE_FILE:

```bash
node /zeroclaw-data/workspace/skills/writer/scripts/write.mjs "{SAVE_FILE}" << 'ZEROCLAW_STORY_EOF'
{FULL STORY CONTENT HERE}
ZEROCLAW_STORY_EOF
```

Replace `{FULL STORY CONTENT HERE}` with the complete story markdown (headline through final paragraph).

If STORE_KEY was provided: call `memory_store` with `key` = STORE_KEY and `value` = `"{HEADLINE} | {SAVE_FILE}"`.

## Step 5 — Reply

```
Story written.
Headline: {HEADLINE}
Saved to: {SAVE_FILE}
```
