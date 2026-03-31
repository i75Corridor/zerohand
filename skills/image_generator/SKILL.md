---
name: image_generator
version: "2.0.0"
description: "Generate editorial cartoon cover images using Google Imagen. Provide a prompt and optional output path. The image is styled as a 1950s-1960s editorial newspaper cartoon. Returns the saved file path."
argument-hint: 'prompt="A satirical 1950s editorial cartoon of a politician drowning in paperwork" output=/zeroclaw-data/workspace/output/cover.png store_key="trending:cover:2026-03-29"'
allowed-tools: shell, memory_store
user-invocable: true
metadata:
  openclaw:
    emoji: "🖼️"
    requires:
      env:
        - GEMINI_API_KEY
      bins:
        - node
    primaryEnv: GEMINI_API_KEY
---

# image_generator: Generate Editorial Cartoon Cover Images

Generate a single editorial cartoon cover image from a prompt using Google Imagen via the Gemini API.

**Style mandate:** Every image must evoke 1950s-1960s American editorial newspaper cartooning — crosshatching, ink wash, exaggerated caricature, dramatic chiaroscuro, newspaper halftone texture. The script enforces this style suffix automatically.

## Parse Arguments

From the user's input or delegate prompt, extract:
- **PROMPT** — from `prompt="..."` — the image description (required)
- **OUTPUT_PATH** — from `output=<path>` or `--output=<path>`. If not provided, use today's date: `/zeroclaw-data/workspace/output/image-YYYY-MM-DD.png`
- **MODEL** — from `model=<model>` or `--model=<model>` (default: `imagen-4.0-fast-generate-001`)
- **STORE_KEY** — from `store_key="..."` — memory key to store the output path (optional)

## Run

**CRITICAL: Call the shell tool immediately with this exact command — do not stop before calling it.**

```bash
node /zeroclaw-data/workspace/skills/image_generator/scripts/image.mjs "{PROMPT}" --output="{OUTPUT_PATH}" --model="{MODEL}"
```

Use a timeout of **120000ms** (2 minutes). Run in the foreground — do not background.

## On Success

If STORE_KEY was provided, call `memory_store` with `key` = STORE_KEY and `value` = OUTPUT_PATH.

Report back:
```
Image generated successfully.
Saved to: {OUTPUT_PATH}
Prompt: {PROMPT}
Model: {MODEL}
```

## On Failure

Report the exact error message from the script. Do not retry — the script handles its own fallback internally.
