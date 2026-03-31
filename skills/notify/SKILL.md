---
name: notify
version: "1.1.0"
description: "Send a brief Telegram notification with a headline and file paths. Accepts inline arguments or reads from optional memory keys. Call with /notify headline='...' story='...' cover='...'"
argument-hint: 'headline="Iran War Enters Year Two" story="output/story-2026-03-25.md" cover="output/story-2026-03-25-cover.png"'
allowed-tools: sessions_send, memory_recall, memory_forget
user-invocable: true
metadata:
  openclaw:
    emoji: "📣"
---

# notify: Send a Telegram Notification

Send a brief Telegram notification with a headline and file locations.

## Step 1 — Parse Arguments

Extract from the user's message or delegate prompt:
- **HEADLINE** — from `headline="..."` or `headline=...`
- **STORY_PATH** — from `story="..."` or `story=...`
- **COVER_PATH** — from `cover="..."` or `cover=...` (optional)
- **MEMORY_CLEANUP** — from `cleanup="..."` — comma-separated list of memory keys to forget after sending (optional)

If HEADLINE is missing: check if a `memory_key` argument was provided (e.g. `memory_key="pipeline:headline"`), and call `memory_recall` on that key to retrieve the headline. If still missing, reply "Usage: `/notify headline='...' story='...' cover='...'`" and stop.

## Step 2 — Send Notification

Compose and send via `sessions_send`:

```
📰 **{HEADLINE}**

{One-sentence satirical tease based on the headline}

Story: `{STORY_PATH}` | Cover: `{COVER_PATH}`
```

If COVER_PATH is empty, omit the cover line.

## Step 3 — Cleanup (optional)

If MEMORY_CLEANUP was provided, call `memory_forget` for each key listed.
