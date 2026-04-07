---
title: "feat: Pawn brand refresh - icon and image assets"
type: feat
status: completed
date: 2026-04-07
origin: GitHub issue #73
---

# Pawn Brand Refresh — Icon and Image Assets

## Overview

Replace all fist-themed visual assets with pawn chess piece imagery across the UI, public directory, and GitHub assets. The pawn signals strategic positioning and deliberate action — a natural fit for an agentic workflow platform.

## Problem Frame

The current brand imagery uses a fist icon. A brand refresh requires replacing it with an animated pawn chess piece that conveys the platform's strategic, deliberate automation philosophy.

## Requirements Trace

- R1. Replace logo in `ui/public/logo.svg` with pawn chess piece theme (full logo with wordmark)
- R2. Create animated pawn icon in `ui/src/components/Layout.tsx` (inline `PawnIcon` replacing `FistIcon`)
- R3. Update `ui/public/favicon.svg` with pawn icon (browser tab, multiple sizes baked in via viewBox)
- R4. Replace `.github/pawn.svg` hero image with pawn + glow effects (animated)
- R5. Remove all fist imagery references from UI code and assets

## Scope Boundaries

- No PWA manifest changes (no PWA configuration exists)
- No changes to API, CLI, or server packages — purely UI asset work
- OG images / social share images: not present in current codebase, excluded

## Context & Research

### Relevant Code and Patterns

- `ui/src/components/Layout.tsx:4-27` — `FistIcon` inline SVG component with `{ size, className }` props, using `currentColor`
- `ui/public/logo.svg` — full logo with fist + wordmark + tagline, sky-400 on transparent
- `ui/public/favicon.svg` — standalone fist icon, sky-400
- `.github/pawn.svg` — hero image with glow filters, bloom, dot grid, wordmark
- Lucide icons pattern: named imports from `lucide-react`, used throughout nav

### Design Language

| Token | Hex | Usage |
|-------|-----|-------|
| Sky-400 | `#38bdf8` | Primary brand accent |
| Sky-500 | `#0ea5e9` | Glows, hover states |
| Slate-950 | `#020617` | Page background |
| White | `#f8fafc` | Primary text |

Existing `.github/pawn.svg` uses `linearGradient`, `radialGradient`, and SVG `<filter>` elements for glow/bloom effects — preserve these patterns.

### Animation Approach

The provided `ChessPawnIcon` component uses `motion/react` (framer-motion) with spring-based physics for head and body animation. This requires adding `framer-motion` to `ui` dependencies.

Animation patterns:
- **Head**: spring-based x/y translation + rotate wobble on hover (2.4s easeInOut)
- **Body**: spring-based rotate sway on hover (1.8s easeInOut)
- **Trigger**: mouse enter/leave (auto-start/stop when uncontrolled)

## Key Technical Decisions

- **Animation library**: `framer-motion` (`motion/react`) — spring-based physics animation matching the provided `ChessPawnIcon` asset. Requires adding `framer-motion` to `ui` package dependencies.
- **PawnIcon architecture**: Standalone component at `ui/src/components/Icons/ChessPawnIcon.tsx` — follows the provided asset's `forwardRef` + `useImperativeHandle` pattern with `ChessPawnIconHandle` interface. Auto-starts animation on mouse enter when uncontrolled.
- **Hero animation**: Same `ChessPawnIcon` component embedded in `.github/pawn.svg` with CSS `animate-pawn-hero` class (added to `tailwind.config.js`) applied to the root SVG group for ambient floating
- **Pawn geometry**: Chess pawn silhouette from the provided asset — base platform, tapered column, crossbar, and spherical crown. Stroke-based rendering (`stroke="currentColor"`) for icon use.

## Open Questions

### Resolved During Planning

- **OG images**: Not present in codebase; excluded from scope
- **PWA manifest**: No PWA configuration exists; excluded from scope
- **Docs assets**: No fist imagery found in `docs/`; no changes needed

### Deferred to Implementation

- Exact pawn SVG path coordinates — determined during implementation based on visual balance
- Specific animation easing curve — finalize in implementation against visual feedback

### New Dependency

- `framer-motion` — added to `ui` package for `ChessPawnIcon` spring-based animation

## Implementation Units

- [ ] **Unit 1: Create pawn SVG assets**

**Goal:** Create all pawn SVG assets that replace fist imagery

**Requirements:** R1, R3

**Dependencies:** None

**Files:**
- Create: `ui/public/pawn.svg`
- Modify: `ui/public/favicon.svg` (replace fist with pawn)
- Create: `.github/pawn.svg` (hero pawn with glow effects)

**Approach:**
Design a chess pawn SVG silhouette using a `<path>` element. The pawn shape: wide rounded base, tapered column, spherical crown, and a small crossbar at top. Reuse the sky-400 (`#38bdf8`) brand color throughout.

For `ui/public/favicon.svg`: Keep the simple pawn icon, no animation, sky-400 fill.

For `.github/pawn.svg` (hero): Mirror the structure of the existing `.github/pawn.svg` — same background gradient, dot grid, glow filters, wordmark, tagline — but replace the fist with an animated pawn. Apply `class="animate-pawn-hero"` to the pawn `<g>` element for ambient CSS float animation (defined in Unit 4).

**Patterns to follow:**
- Existing `.github/pawn.svg` for glow/filter structure
- Existing `ui/public/favicon.svg` for simplicity

**Test scenarios:**
- Pawn icon renders correctly in light/dark contexts
- Favicon displays at correct sizes (16px, 32px, 48px browser tabs)
- Hero pawn has smooth floating animation loop

**Verification:**
- All three SVG files open in browser without errors
- Pawn is recognizable as a chess pawn at all sizes

---

- [ ] **Unit 2: Add framer-motion dependency and create ChessPawnIcon component**

**Goal:** Add `framer-motion` to the UI package and create the animated `ChessPawnIcon` component

**Requirements:** R2

**Dependencies:** None (parallel with Unit 1)

**Files:**
- Modify: `ui/package.json` (add `framer-motion`)
- Create: `ui/src/components/Icons/ChessPawnIcon.tsx`

**Approach:**
Install `framer-motion` in the `ui` package. Create `ChessPawnIcon` at `ui/src/components/Icons/ChessPawnIcon.tsx` using the provided asset architecture: `forwardRef` + `useImperativeHandle`, `useAnimation` for head and body, spring-based `BODY_VARIANTS` and `HEAD_VARIANTS`, mouse enter/leave triggers. The component uses `stroke="currentColor"` for the icon style.

**Patterns to follow:**
- Provided `ChessPawnIcon` asset from lucide-animated.com
- Existing `FistIcon` prop signature (`size`, `className`)

**Test scenarios:**
- Happy path: `ChessPawnIcon` renders at default size with correct stroke color
- Happy path: Animation triggers on mouse enter and returns on mouse leave
- Edge case: Default `size=28` renders cleanly
- Edge case: Custom `className` is applied correctly
- Error path: Works without `ref` (uncontrolled mode auto-animates)

**Verification:**
- `pnpm install` succeeds with framer-motion added
- Component renders without TypeScript errors
- Animation plays on hover in browser

---

- [ ] **Unit 3: Update logo.svg**

**Goal:** Replace the fist logo with a pawn-themed full logo

**Requirements:** R1

**Dependencies:** Unit 1 (pawn SVG path defined)

**Files:**
- Modify: `ui/public/logo.svg`

**Approach:**
Replace the fist geometry with a centered pawn silhouette. Retain the "Pawn" wordmark on the pawn body and "Agentic workflows for engineers" tagline below. Use the same font stack (Satoshi) and sky-400 color.

**Patterns to follow:**
- Existing `ui/public/logo.svg` for layout, typography, positioning

**Test scenarios:**
- Logo renders with pawn and text at correct proportions
- Text is legible and centered on pawn body

**Verification:**
- Logo at 280×190 viewBox renders cleanly at various display sizes

---

- [ ] **Unit 4: Add pawn-hero ambient float animation to Tailwind**

**Goal:** Add ambient floating animation for the hero pawn SVG

**Requirements:** R4

**Dependencies:** None (parallel with Units 1-3)

**Files:**
- Modify: `ui/tailwind.config.js`

**Approach:**
Add a `keyframes` entry for `pawn-hero-float` — a subtle translate-Y oscillation for the hero SVG's ambient animation. The hero SVG (`.github/pawn.svg`) uses a `<g class="animate-pawn-hero">` wrapper for the pawn group. Note: The inline `ChessPawnIcon` uses framer-motion (Unit 2), not this CSS animation.

**Patterns to follow:**
- Existing `animate-fade-in`, `animate-scale-in` keyframes in `tailwind.config.js`

**Test scenarios:**
- `animate-pawn-hero` class applies smooth looping animation
- No animation jank or stutter on repeat

**Verification:**
- Tailwind build completes without errors
- Hero pawn has smooth ambient float animation

---

- [ ] **Unit 5: Replace FistIcon in Layout.tsx with ChessPawnIcon**

**Goal:** Update Layout.tsx to use ChessPawnIcon instead of FistIcon

**Requirements:** R2, R5

**Dependencies:** Unit 2 (ChessPawnIcon component created)

**Files:**
- Modify: `ui/src/components/Layout.tsx`

**Approach:**
Remove the inline `FistIcon` function from `Layout.tsx`. Add `import { ChessPawnIcon } from "./Icons/ChessPawnIcon"` and replace `<FistIcon size={24} className="text-sky-400" />` with `<ChessPawnIcon size={24} className="text-sky-400" />`.

**Patterns to follow:**
- Existing import pattern for Lucide icons
- ChessPawnIcon component interface from Unit 2

**Test scenarios:**
- Happy path: PawnIcon renders in sidebar with correct size and sky-400 color
- Happy path: Animation plays on hover
- Edge case: Works with `size` prop override
- Edge case: Works with additional `className` props

**Verification:**
- Layout renders without errors
- Pawn appears in sidebar with hover animation

---

- [ ] **Unit 6: Verify no remaining fist imagery**

**Goal:** Confirm all fist references are removed

**Requirements:** R5

**Dependencies:** Units 1-5 complete

**Files:**
- Search: `ui/src/`, `ui/public/`, `.github/`

**Approach:**
Run a case-insensitive grep for `fist`, `Fist`, `fistIcon`, `FistIcon`, and visually inspect all replaced assets. Ensure no fist SVG paths, comments, or variable names remain.

**Patterns to follow:**
- N/A — cleanup verification

**Test scenarios:**
- No matches for `fist` in `ui/src/`, `ui/public/`, `.github/`
- Visual spot-check of sidebar, favicon, logo, hero image

**Verification:**
- Grep returns zero matches for fist-related terms
- All visible brand touchpoints show pawn imagery

## System-Wide Impact

- **Interaction graph:** `ChessPawnIcon` replaces `FistIcon` in the sidebar logo spot. No other component uses `FistIcon`.
- **Dependency addition:** `framer-motion` added to `ui` package — affects bundle size
- **Error propagation:** None — purely visual change
- **State lifecycle risks:** None
- **API surface parity:** None — no API or CLI changes
- **Integration coverage:** Visual only; no integration tests affected
- **Unchanged invariants:** Navigation, routing, API calls, authentication — all unaffected

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Framer-motion bundle size | `framer-motion` adds to UI bundle; only used for this one animated icon. If bundle size is a concern, can be code-split or replaced with CSS animation later. |
| Pawn SVG path complexity | Use the provided `ChessPawnIcon` path data directly |
| Cross-browser favicon | SVG favicon with proper `viewBox` scales correctly in all modern browsers |

## Documentation / Operational Notes

- No API docs or runbooks require updates — purely cosmetic change
- README.md should be verified but did not show fist imagery in scan

## Sources & References

- **Origin document:** GitHub issue #73
- Related code: `ui/src/components/Layout.tsx`, `ui/public/logo.svg`, `ui/public/favicon.svg`, `.github/pawn.svg`
- Related PRs/issues: #73
