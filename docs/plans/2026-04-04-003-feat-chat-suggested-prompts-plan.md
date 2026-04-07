---
title: "feat: Add suggested prompts to GlobalChatPanel empty state"
type: feat
status: completed
date: 2026-04-04
---

# feat: Add suggested prompts to GlobalChatPanel empty state

## Overview

Replace the static hint text in the chat panel's empty state with 4-6 clickable prompt cards. Clicking a card sends it as a message immediately. Cards disappear after the first message.

## Problem Frame

Users landing on the chat panel see a passive hint ("Ask me about pipelines, runs, skills, or tell me to trigger a run.") with no actionable examples they can click. This scored Capability Discovery at 71% in the agent-native audit.

## Requirements Trace

- R1. Show 4-6 clickable suggested prompt cards when `messages.length === 0`
- R2. Clicking a card sends the prompt as a user message (same as typing + Enter)
- R3. Cards disappear after the first message is sent
- R4. Cards match the existing dark UI theme (slate/sky color palette)

## Scope Boundaries

- Single file change: `ui/src/components/GlobalChatPanel.tsx`
- No context-aware prompts (stretch goal deferred)
- No backend changes
- No new dependencies

## Key Technical Decisions

- **Inline in GlobalChatPanel, not a separate component**: The empty state is a simple conditional block (lines 132-137). The prompt cards replace it directly — no need for a separate file for 20 lines of JSX.
- **Reuse existing `sendMessage` flow**: Set `input` to the prompt text, then call `sendMessage()` — or more directly, replicate the send logic inline to avoid a flash of the input field being populated.
- **Direct send on click**: Rather than setting the input and simulating Enter, directly call `wsSend` with the prompt text (same as `sendMessage` does) and add the user message to state. This avoids UI flicker.

## Implementation Units

- [ ] **Unit 1: Replace empty state with clickable prompt cards**

**Goal:** Show suggested prompts when chat is empty; clicking one sends it as a message.

**Requirements:** R1, R2, R3, R4

**Dependencies:** None

**Files:**
- Modify: `ui/src/components/GlobalChatPanel.tsx`

**Approach:**
- Define a `SUGGESTED_PROMPTS` array of 5 prompt strings at the top of the component or as a module-level const
- Replace the empty-state block (lines 132-137) with a grid/flex layout of clickable cards
- Each card: styled as a small rounded button with slate-800 bg, slate-300 text, hover state (sky-500 border or bg tint)
- On click: add the prompt as a user message to `messages`, call `wsSend` with the prompt and current context, set `isStreaming` to true — mirrors what `sendMessage()` does but with a hardcoded text instead of `input`
- The existing condition `messages.length === 0 && !streamingText && !isStreaming` already gates the empty state — once a message is added, cards disappear automatically

**Patterns to follow:**
- Existing empty state styles in `GlobalChatPanel.tsx` (slate-600 text, centered)
- Existing button styles in the component (rounded-xl, slate-800/60 bg, border patterns)
- `sendMessage()` function for the exact send logic

**Test scenarios:**
- Happy path: panel loads with no messages -> 5 prompt cards visible
- Happy path: clicking "List all pipelines" card -> card text appears as user message, agent starts streaming
- Happy path: after first message sent -> cards no longer visible
- Edge case: rapid-clicking two cards -> only first fires (isStreaming blocks second)

**Verification:**
- Chat panel shows clickable prompt cards when empty
- Clicking a card sends it as a message and cards disappear
- Cards match the dark theme aesthetically

## Sources & References

- Related issue: i75Corridor/pawn#35
- Target file: `ui/src/components/GlobalChatPanel.tsx`
