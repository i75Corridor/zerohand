---
name: research
version: "1.2.0"
description: "Research any topic using web searches. Returns structured findings. Optionally stores to a named memory key. Call with /research <topic>."
argument-hint: 'Iran war 2026'
allowed-tools: shell, memory_store
user-invocable: false
metadata:
  openclaw:
    emoji: "🔍"
---

# research: Web Research on Any Topic

Research a topic thoroughly using web searches. Return structured findings, and optionally persist them.

## Step 1 — Parse Arguments

Extract from the user's message or delegate prompt:
- **TOPIC** — the subject to research (required)
- **STORE_KEY** — from `store_key="..."` — memory key to store findings under (optional, default: none)

If TOPIC is missing, reply "Usage: `/research <topic>`" and stop.

## Step 2 — Search

**CRITICAL: Call the shell tool immediately — do not describe what you will do, just do it.**

Run three searches using the search script. Call shell three times:

```bash
node /zeroclaw-data/workspace/skills/research/scripts/search.mjs "{TOPIC} latest news 2026" --max=5
```

```bash
node /zeroclaw-data/workspace/skills/research/scripts/search.mjs "{TOPIC} controversy analysis expert opinion" --max=5
```

```bash
node /zeroclaw-data/workspace/skills/research/scripts/search.mjs "{TOPIC} background context history" --max=5
```

Each returns a JSON array of `{ title, url, snippet }` objects. Collect all results and deduplicate overlapping sources.

## Step 3 — Compile Findings

Compile the results into structured notes:

```
TOPIC: {TOPIC}
DATE: {YYYY-MM-DD}

KEY FACTS:
- {bullet points from search snippets}

QUOTES:
- {notable quotes or statements from snippets}

ANGLES:
- {interesting satirical angles or contradictions worth writing about}

SOURCES:
- {URLs from results}
```

## Step 4 — Persist (if requested)

If STORE_KEY was provided: call `memory_store` with `key` = STORE_KEY and `value` = the full structured notes block.

## Step 5 — Reply

Return a 3-4 sentence summary of the key findings.
