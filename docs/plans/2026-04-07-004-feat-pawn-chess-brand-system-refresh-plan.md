---
title: "feat: Pawn chess brand system refresh — colors, design language, and component consistency"
type: feat
status: completed
date: 2026-04-07
origin: GitHub issue i75Corridor/pawn#71
---

# Pawn Chess Brand System Refresh

## Overview

Replace the generic sky/cyan-on-dark palette with a warm metallic chess-derived color system (gold, amber, bronze), introduce chess-themed structural design elements throughout the UI, and enforce component consistency across all pages. This is a full brand refresh that transforms Pawn from "another dark dashboard" into something visually distinctive and thematically coherent.

## Problem Frame

After the rename from ZeroHand to Pawn, the brand identity is incomplete. The chess pawn icon was added (issue #73), but the color palette, component styling, and overall design language still read as generic AI-generated dark-mode SaaS. The `sky-400` primary accent is the single most overused color in developer tool templates. Nothing about the visual experience says "chess" or "strategy" beyond the logo.

Issue #71 specifically calls for: new color palette, updated CSS variables/design tokens, refreshed component styles, updated gradients/shadows, and WCAG AA contrast compliance.

## Requirements Trace

- R1. Define new warm metallic color palette for pawn brand (gold/amber/bronze primary)
- R2. Create centralized color token system (CSS custom properties) — no more scattered Tailwind defaults
- R3. Update all component library styles to use new tokens (buttons, inputs, cards, badges, status indicators)
- R4. Introduce chess-derived design language elements (board motifs, piece-rank metaphors, alternating patterns)
- R5. Normalize component usage across all pages (PageHeader, SectionPanel, StatCard everywhere)
- R6. Upgrade loading states from bare text to skeleton/shimmer loaders
- R7. Establish shape hierarchy (varied border-radius by component containment level)
- R8. Ensure all color combinations meet WCAG AA contrast ratios (4.5:1 normal text, 3:1 large text)
- R9. Replace all hardcoded hex/RGB values with token references

## Scope Boundaries

- No changes to API, CLI, or server packages — purely UI work
- No changes to routing, data fetching, or business logic
- No new pages or features — this is a reskin of existing surfaces
- No font changes — Satoshi + Cabinet Grotesk stay (they're working well)
- No animation overhaul — existing motion system is solid; only add chess-specific ambient elements if they serve the theme
- The multi-accent nav system (per-section colors) is a strength — preserve it, but shift the hues to the new palette family

## Context & Research

### Relevant Code and Patterns

- `ui/src/index.css` — base styles, CSS custom properties for easing, sidebar/footer raw RGB values
- `ui/tailwind.config.js` — type scale, animation keyframes, no custom color tokens
- `ui/src/components/StatusBadge.tsx` — single source of truth for 6 status states; updating here propagates everywhere
- `ui/src/components/StatCard.tsx` — metric display with accent color prop
- `ui/src/components/Layout.tsx` — sidebar nav with per-section accent maps (`ACCENT_ACTIVE_TEXT`, `ACCENT_BAR`, `ACCENT_HOVER`)
- `ui/src/components/EmptyState.tsx` — uses `bg-sky-600` for primary CTA
- `ui/src/components/Modal.tsx` — `bg-slate-900`, `border-slate-700/60`
- `ui/src/components/PageHeader.tsx` — `text-sky-400/80` subtitle
- `ui/src/components/SectionPanel.tsx` — `bg-slate-900/40`, `border-slate-800/50`
- `ui/src/components/LoadingState.tsx` — bare text, no visual indicator
- `ui/src/components/OnboardingModal.tsx` — `bg-sky-500/10` icon boxes, `bg-sky-600` buttons
- `ui/src/pages/Costs.tsx` — 11 hardcoded hex values for Recharts charts
- `ui/src/pages/PipelineDetail.tsx` — 3 hardcoded hex values for DAG edges

### Blast Radius

| Color family | Occurrences | Files | Impact |
|---|---|---|---|
| sky- | 146 | 23 | Primary brand accent — highest impact |
| indigo- | 90 | multiple | Pipeline/status use — high impact |
| rose- | 43 | multiple | Error/failed states |
| amber- | 43 | multiple | Warning/approval states |
| emerald- | 24 | multiple | Success states |
| violet- | 15 | 4 | Skills accent |
| teal- | 4 | 2 | Packages accent |
| Hardcoded hex | 14 | 2 | Costs.tsx (11), PipelineDetail.tsx (3) |

### Design Direction: Warm Metallic Chess

**Primary brand accent**: Amber-gold — `oklch(0.82 0.14 75)` range. Evokes chess pieces, trophies, and strategic weight. Distinctive against the sea of blue/cyan developer tools.

**Neutral tinting**: Warm the slate base toward the gold hue. Pure blue-gray slates read cold and generic. A slight warm shift (toward `oklch(... ... 60-80)` hue angle) creates subconscious brand cohesion.

**Status colors**: Keep semantic meaning (green=success, red=error, yellow=warning) but shift the specific hues:
- Success: emerald stays (it's warm enough)
- Error: shift rose toward a warmer red-orange
- Warning: amber deepens to distinguish from primary gold
- Running/active: shift from sky to a cooler gold or warm white

**Chess board reference**: Alternating warm/cool neutrals in data tables and grid layouts — not literal black/white squares, but a subtle light-dark rhythm that echoes the 8x8 grid.

## Key Technical Decisions

- **CSS custom properties as the token layer**: Define all colors as `--pawn-*` CSS variables in `:root`. Tailwind classes reference these via `theme.extend.colors` in `tailwind.config.js`. This centralizes the palette and makes future changes trivial.
- **oklch color space**: Use `oklch()` for defining the palette — perceptually uniform, easier to create consistent tints/shades, and modern browser support is excellent. Provide hex fallbacks in comments for debugging.
- **Shape hierarchy via Tailwind extend**: Add `borderRadius` tokens in tailwind config: `badge` (6px), `button` (8px), `card` (12px), `panel` (16px). Apply consistently.
- **Skeleton loaders over spinners**: Skeleton shimmer communicates structure and reduces perceived wait time. Better fit for an ops dashboard where users need to know what's loading, not just that something is loading.
- **Preserve nav accent system**: The per-section colors stay but shift hues — gold for Dashboard, deep indigo for Pipelines, amethyst for Skills, teal-bronze for Packages, burnt amber for Costs, warm rose for Canvas.

## Open Questions

### Resolved During Planning

- **Font changes?** No — Satoshi + Cabinet Grotesk are distinctive and working well. The brand problem is color and pattern, not typography.
- **Light mode?** No — dark-mode-only is the correct call for an ops dashboard. The warm metallic palette will differentiate it from other dark dashboards.
- **Recharts colors?** Will be updated to match new palette using token references where possible, hardcoded hex where Recharts requires it.

### Deferred to Implementation

- Exact oklch values for each token — will be tuned visually during implementation
- Whether `color-mix()` or manual shades work better for the tint/shade system — depends on browser testing
- Specific skeleton loader dimensions — match to actual component layout

## Implementation Units

- [ ] **Unit 1: Create centralized color token system**

**Goal:** Establish CSS custom properties and Tailwind color configuration as the single source of truth for all colors.

**Requirements:** R1, R2

**Dependencies:** None

**Files:**
- Modify: `ui/src/index.css` — add `:root` block with `--pawn-*` CSS custom properties
- Modify: `ui/tailwind.config.js` — add `colors` section referencing CSS vars, add `borderRadius` tokens
- Create: `ui/src/styles/tokens.md` — document the token system for team reference (optional, lightweight)

**Approach:**
Define the warm metallic palette as CSS custom properties in `:root`:
- `--pawn-gold-*` (50-950 scale) — primary brand accent
- `--pawn-bronze-*` — secondary/depth accent
- `--pawn-surface-*` — warm-tinted neutrals replacing cold slates
- `--pawn-success`, `--pawn-error`, `--pawn-warning`, `--pawn-info` — semantic status colors
- Shape tokens: `--radius-badge`, `--radius-button`, `--radius-card`, `--radius-panel`

Wire into Tailwind via `theme.extend.colors` using `var()` references. This lets components use `text-pawn-gold-400` or `bg-pawn-surface-900`.

**Patterns to follow:**
- Existing `transitionTimingFunction` pattern in tailwind.config.js — extending theme, not replacing
- `:root` CSS variable pattern already present in index.css (`--ease-out-quart`, etc.)

**Test scenarios:**
- Happy path: `bg-pawn-gold-500` class renders the correct gold color in browser
- Happy path: `rounded-card` class applies the card-level border radius
- Edge case: Dark mode contrast — gold-400 text on surface-950 background meets 4.5:1 ratio
- Edge case: All 10 token scale stops (50-950) produce visually distinct, perceptually uniform steps
- Error path: Missing CSS variable falls back gracefully (Tailwind generates static value)

**Verification:**
- Tailwind build completes without errors
- Token values render correctly in browser dev tools
- WCAG AA contrast check passes for primary text/background combinations

---

- [ ] **Unit 2: Update base styles and neutral tinting**

**Goal:** Replace cold blue-gray slate backgrounds with warm-tinted neutrals throughout the base styles.

**Requirements:** R1, R3, R9

**Dependencies:** Unit 1 (token system defined)

**Files:**
- Modify: `ui/src/index.css` — replace raw RGB values in `.sidebar`, `.footer-well`, body `@apply` with token references
- Modify: `ui/src/components/Layout.tsx` — update sidebar, nav, and footer classes to use new surface tokens
- Modify: `ui/src/components/Modal.tsx` — update overlay and content background colors
- Modify: `ui/src/components/SectionPanel.tsx` — update card background and border tokens

**Approach:**
Replace all `bg-slate-*` structural references with `bg-pawn-surface-*` equivalents. Replace raw `rgb()` values in index.css (`.sidebar`, `.footer-well`) with `var(--pawn-surface-*)`. The warm tinting should be subtle — shifting the hue angle from pure blue-gray (~230) toward warm (~260-280) while keeping saturation low.

**Patterns to follow:**
- Existing Layout.tsx class structure — swap color tokens, don't restructure

**Test scenarios:**
- Happy path: Sidebar, main area, and modal backgrounds all show warm-tinted dark neutral
- Happy path: Border colors are subtle but visible against adjacent surfaces
- Edge case: Footer well contrast remains legible
- Edge case: Mobile overlay (`bg-black/50`) still dims background effectively

**Verification:**
- No raw `rgb()` or hex values remain in index.css for structural colors
- Visual warmth is perceptible but not heavy-handed

---

- [ ] **Unit 3: Replace primary accent colors in components**

**Goal:** Swap sky/cyan accents for gold/amber across all shared components.

**Requirements:** R1, R3, R8

**Dependencies:** Unit 1 (token system), Unit 2 (base styles updated)

**Files:**
- Modify: `ui/src/components/Layout.tsx` — update `ACCENT_ACTIVE_TEXT`, `ACCENT_BAR`, `ACCENT_HOVER` maps, logo color, agent panel accent
- Modify: `ui/src/components/PageHeader.tsx` — update subtitle color from `text-sky-400/80`
- Modify: `ui/src/components/EmptyState.tsx` — update primary CTA button from `bg-sky-600`
- Modify: `ui/src/components/OnboardingModal.tsx` — update icon boxes, step dots, CTA buttons
- Modify: `ui/src/components/StatCard.tsx` — update default accent prop
- Modify: `ui/src/components/StatusBadge.tsx` — update `running` status from sky to new active color
- Modify: `ui/src/components/Icons/ChessPawnIcon.tsx` — update stroke/fill references if they use sky

**Approach:**
Replace `sky-400/500/600` references with `pawn-gold-400/500/600` equivalents. The nav accent map shifts:
- Dashboard: `pawn-gold` (primary brand)
- Pipelines: deep indigo (keep, it's not sky)
- Skills: amethyst/violet (keep, shift slightly warmer)
- Packages: teal-bronze
- Costs: burnt amber/copper
- Canvas: warm rose (keep, shift slightly)
- Approvals: emerald (keep)

Status badge `running` state shifts from sky-400/500 to a warm indicator — either gold or a warmer blue.

**Patterns to follow:**
- Existing accent map pattern in Layout.tsx

**Test scenarios:**
- Happy path: Primary CTAs render in gold across all components
- Happy path: Nav active states show correct per-section accent colors
- Happy path: StatusBadge `running` state is visually distinct from `completed` and `warning`
- Edge case: Gold primary buttons have sufficient contrast for text readability (dark text on gold)
- Edge case: Focus ring (`input-glow`) updates to gold and is visible (increase from 8% opacity)
- Integration: OnboardingModal step dots, icons, and CTAs all use consistent gold accent

**Verification:**
- No `sky-` classes remain in shared components (grep returns zero)
- All interactive elements meet WCAG AA contrast

---

- [ ] **Unit 4: Update page-level color references**

**Goal:** Replace sky/cyan and hardcoded hex values across all page components.

**Requirements:** R3, R9

**Dependencies:** Unit 1 (tokens), Unit 3 (shared components updated)

**Files:**
- Modify: `ui/src/pages/Dashboard.tsx` — update any remaining sky references
- Modify: `ui/src/pages/Costs.tsx` — replace 11 hardcoded hex values with new palette
- Modify: `ui/src/pages/PipelineDetail.tsx` — replace 3 hardcoded hex values for DAG edges
- Modify: `ui/src/pages/Pipelines.tsx` — update accent references
- Modify: `ui/src/pages/Skills.tsx` — update accent references
- Modify: `ui/src/pages/Settings.tsx` — update accent references
- Modify: `ui/src/pages/Approvals.tsx` — update accent references
- Modify: `ui/src/pages/Canvas.tsx` — update accent references
- Modify: `ui/src/pages/Packages.tsx` — update accent references
- Modify: `ui/src/pages/Help.tsx` — update accent references
- Modify: `ui/src/pages/PipelineBuilder.tsx` — update accent references
- Modify: `ui/src/pages/RunDetail.tsx` — update accent references
- Modify: `ui/src/pages/SkillDetail.tsx` — update accent references

**Approach:**
Sweep all 13 page files. Replace `sky-*` classes with `pawn-gold-*`. Replace hardcoded hex in Costs.tsx chart config with new palette hex values (Recharts requires raw hex). Replace DAG edge colors in PipelineDetail.tsx. Each page's section-specific accent should align with the nav accent map from Unit 3.

**Patterns to follow:**
- Token references for Tailwind classes, hex constants for Recharts/diagram libraries that require them

**Test scenarios:**
- Happy path: Costs charts render with new palette colors — gold, bronze, warm tones
- Happy path: Pipeline DAG edges use warm palette
- Edge case: Recharts tooltip/legend text remains readable against new chart colors
- Edge case: All 13 pages load without console color-related warnings

**Verification:**
- `grep -r "sky-" ui/src/pages/` returns zero matches
- `grep -r "#38bdf8\|#34d399\|#818cf8\|#4f46e5" ui/src/` returns zero matches
- Charts are visually distinguishable (no two series look the same)

---

- [ ] **Unit 5: Introduce chess design language elements**

**Goal:** Add chess-derived structural design elements that make the theme feel intentional and woven into the UI rather than just a logo.

**Requirements:** R4

**Dependencies:** Unit 1 (tokens), Unit 2 (base styles)

**Files:**
- Modify: `ui/src/index.css` — add chess board subtle background pattern, alternating row utility
- Modify: `ui/tailwind.config.js` — add chess-related utilities if needed
- Modify: `ui/src/components/SectionPanel.tsx` — alternating row support
- Modify: `ui/src/components/EmptyState.tsx` — chess-piece metaphor in empty states (e.g., "No moves yet" or piece iconography)

**Approach:**
Introduce three chess-derived elements:

1. **Board grid motif**: A very subtle CSS background pattern on the main content area — an 8x8 grid of alternating warm neutrals at ~2-3% opacity. Visible enough to register subconsciously, not enough to distract. Uses `background-image: repeating-conic-gradient()` or a simple SVG pattern.

2. **Alternating row rhythm**: Table rows and list items in SectionPanel alternate between two warm neutral shades — echoing the chess board. Not zebra striping (which is heavy) — more like a 1-2% opacity shift.

3. **Strategic microcopy touches**: Update a few empty state messages to reference chess language where natural — "No moves yet" instead of "No runs yet", "Opening position" for empty dashboards. Light touch, not forced.

**Patterns to follow:**
- Existing `content-auto` utility pattern in index.css for new utilities
- EmptyState component's existing title/description pattern

**Test scenarios:**
- Happy path: Board grid pattern is visible at normal zoom but doesn't interfere with content readability
- Happy path: Alternating rows in SectionPanel create subtle visual rhythm
- Edge case: Board pattern disappears gracefully at small screen sizes (no moiré)
- Edge case: Chess microcopy feels natural, not gimmicky — test by reading aloud
- Edge case: `prefers-reduced-motion` — board pattern is static (no animation)

**Verification:**
- Chess elements are perceptible but not heavy-handed
- Content remains the visual priority over decorative elements

---

- [ ] **Unit 6: Normalize component usage across pages**

**Goal:** Apply PageHeader, SectionPanel consistently on all pages that currently use custom one-off layouts.

**Requirements:** R5

**Dependencies:** Unit 3 (shared components updated with new palette)

**Files:**
- Modify: `ui/src/pages/Costs.tsx` — replace custom header with PageHeader
- Modify: `ui/src/pages/Pipelines.tsx` — replace custom h1 with PageHeader
- Modify: `ui/src/pages/Skills.tsx` — replace custom h1 with PageHeader
- Modify: `ui/src/pages/Settings.tsx` — wrap sections in SectionPanel
- Modify: `ui/src/pages/Approvals.tsx` — apply PageHeader if missing
- Modify: `ui/src/pages/Canvas.tsx` — apply PageHeader if missing
- Modify: `ui/src/pages/Packages.tsx` — apply PageHeader if missing
- Modify: `ui/src/pages/Help.tsx` — apply PageHeader if missing

**Approach:**
Audit each page. If it builds a custom `<h1>` + subtitle layout, replace with `<PageHeader>`. If it wraps data tables in custom card markup, replace with `<SectionPanel>`. Preserve any page-specific action buttons by passing them as `actions` prop. The goal is visual consistency — every page should feel like part of the same application.

**Patterns to follow:**
- Dashboard.tsx as the reference implementation for PageHeader + StatCard + SectionPanel usage

**Test scenarios:**
- Happy path: Every page renders a consistent header area with proper title hierarchy
- Happy path: Section panels have uniform card styling and header bars
- Edge case: Costs.tsx header area retains its filter/control buttons via `actions` prop
- Edge case: Settings.tsx sections work within SectionPanel without layout conflicts
- Integration: Navigating between pages feels like one cohesive app, not 13 different designs

**Verification:**
- Visual consistency: screenshot each page and compare header/section patterns
- No custom `<h1>` tags remain outside of PageHeader component

---

- [ ] **Unit 7: Establish shape hierarchy**

**Goal:** Create visual distinction between component containment levels through varied border-radius.

**Requirements:** R7

**Dependencies:** Unit 1 (radius tokens defined)

**Files:**
- Modify: `ui/src/components/StatusBadge.tsx` — use `rounded-badge` (6px)
- Modify: `ui/src/components/EmptyState.tsx` — use `rounded-card`
- Modify: `ui/src/components/SectionPanel.tsx` — use `rounded-card` (12px)
- Modify: `ui/src/components/StatCard.tsx` — use `rounded-card`
- Modify: `ui/src/components/Modal.tsx` — use `rounded-panel` (16px)
- Modify: `ui/src/components/Layout.tsx` — nav items use `rounded-button` (8px)

**Approach:**
Replace uniform `rounded-xl`/`rounded-2xl` everywhere with a hierarchy:
- Badges/tags: `rounded-badge` (~6px) — tight, compact
- Buttons/inputs/nav items: `rounded-button` (~8px) — interactive feel
- Cards/sections: `rounded-card` (~12px) — content containers
- Modals/panels: `rounded-panel` (~16px) — top-level overlays

This creates visual containment grammar — you can tell what level of the UI you're looking at by the corner radius alone.

**Patterns to follow:**
- Token references from Unit 1's `borderRadius` additions

**Test scenarios:**
- Happy path: Badge corners are noticeably tighter than card corners
- Happy path: Modal corners are the roundest element on screen
- Edge case: Nested elements (badge inside card inside modal) show three distinct radius levels
- Edge case: Small screen sizes — radius values don't feel oversized on compact elements

**Verification:**
- No remaining `rounded-xl` or `rounded-2xl` classes in shared components (all replaced with semantic tokens)
- Visual hierarchy is perceptible without explanation

---

- [ ] **Unit 8: Upgrade loading states**

**Goal:** Replace bare text loading indicators with skeleton shimmer loaders.

**Requirements:** R6

**Dependencies:** Unit 1 (tokens for shimmer colors), Unit 2 (warm neutrals)

**Files:**
- Modify: `ui/src/components/LoadingState.tsx` — implement skeleton shimmer with structural hints
- Modify: `ui/src/index.css` — add `@keyframes shimmer` animation
- Modify: `ui/tailwind.config.js` — add shimmer animation config

**Approach:**
Replace the "Loading..." text with a skeleton loader that hints at the structure of what's loading. The shimmer gradient should use warm neutrals from the new palette — a subtle left-to-right sweep of `pawn-surface-800` to `pawn-surface-700` and back. The LoadingState component should accept a `variant` prop: `"page"` (full stat cards + section skeleton), `"section"` (rows within a panel), `"inline"` (single line placeholder).

**Patterns to follow:**
- Existing stagger delay utilities (`.stagger-1` through `.stagger-5`)
- `prefers-reduced-motion` pattern already in index.css — shimmer should be disabled

**Test scenarios:**
- Happy path: Page-level skeleton shows 3 card placeholders + table rows matching Dashboard layout
- Happy path: Section-level skeleton shows appropriate row placeholders
- Happy path: Shimmer animation is smooth and subtle
- Edge case: `prefers-reduced-motion` — skeleton structure shows but shimmer is static
- Edge case: Content loads quickly — skeleton doesn't flash (minimum display time or instant swap)

**Verification:**
- LoadingState no longer renders plain text
- Skeleton structure matches the actual content layout it's replacing
- Animation respects reduced motion preference

---

- [ ] **Unit 9: Contrast audit and final polish**

**Goal:** Verify all color combinations meet WCAG AA, fix remaining raw values, and clean up minor issues.

**Requirements:** R8, R9

**Dependencies:** All previous units

**Files:**
- Modify: `ui/src/index.css` — fix focus ring visibility (increase from 8% opacity), remove any remaining raw RGB
- Modify: `ui/src/components/StatCard.tsx` — fix `text-slate-600` sub text contrast
- Modify: `ui/src/components/Layout.tsx` — remove `will-change: transform` from aside CSS if not needed
- Audit: All component and page files for remaining old palette references

**Approach:**
Run a final sweep:
1. Grep for any remaining `sky-`, old hex values, or raw `rgb()` that should be tokens
2. Test all text/background combinations against WCAG AA (4.5:1 normal, 3:1 large text)
3. Fix the focus ring visibility — bump from 8% to ~20% opacity and shift to gold
4. Fix StatCard sub text contrast — `text-slate-600` on dark backgrounds is ~2.5:1, needs to be at least `text-slate-400` (~4.8:1) or use the new `pawn-surface-400`
5. Verify `will-change` is only applied during active mobile transitions

**Patterns to follow:**
- Existing `forced-colors` and `prefers-reduced-motion` patterns

**Test scenarios:**
- Happy path: All primary text/background combinations pass WCAG AA checker
- Happy path: Focus rings are clearly visible on keyboard navigation
- Edge case: Forced-colors mode still renders usable borders and text
- Edge case: Semi-transparent backgrounds (e.g., `bg-pawn-surface-900/50`) still meet contrast when composited
- Error path: No remaining old palette references found in grep sweep

**Verification:**
- Zero `sky-` or old hardcoded hex matches in `ui/src/`
- Lighthouse accessibility score remains at or above current baseline
- Focus ring is visible without squinting

---

- [ ] **Unit 10: Update SVG assets for new palette**

**Goal:** Update logo, favicon, and hero SVG to use the new gold/warm metallic palette.

**Requirements:** R1, R3

**Dependencies:** Unit 1 (final palette values determined)

**Files:**
- Modify: `ui/public/logo.svg` — swap sky-400 fills/strokes for gold
- Modify: `ui/public/favicon.svg` — swap sky-400 for gold
- Modify: `.github/pawn.svg` — update glow filters, gradients, and accent colors to warm metallic

**Approach:**
Update the SVG fill/stroke colors from `#38bdf8` (sky-400) to the finalized gold hex value. For `.github/pawn.svg`, update the `linearGradient` and `radialGradient` definitions to warm tones — gold center glow, bronze edge glow. Keep the existing animation and filter structure.

**Patterns to follow:**
- Existing `.github/pawn.svg` gradient/filter structure

**Test scenarios:**
- Happy path: Logo renders in gold at all display sizes
- Happy path: Favicon is recognizable as gold pawn at 16px, 32px
- Happy path: Hero SVG glow effects feel warm and cohesive
- Edge case: Gold on dark background has sufficient contrast for the favicon to be identifiable in a browser tab

**Verification:**
- All three SVGs open in browser without errors
- No sky/cyan colors remain in SVG source
- Hero image pawn-hero-float animation still works with new colors

## System-Wide Impact

- **Interaction graph:** Color changes propagate through every component and page. StatusBadge is the most connected node — it's used on Dashboard, Pipelines, PipelineDetail, RunDetail, Approvals.
- **Error propagation:** None — purely visual. No API, state, or logic changes.
- **State lifecycle risks:** None.
- **API surface parity:** None — no API changes.
- **Integration coverage:** Visual regression is the primary risk. Manual screenshot comparison across all 13 pages before/after.
- **Unchanged invariants:** All routing, data fetching, WebSocket connections, authentication, and business logic remain untouched. The component interfaces (props) are unchanged — only the visual output differs.
- **External contracts:** `.github/pawn.svg` is referenced by the GitHub repo README. Color change is intentional and expected.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| oklch browser support | oklch is supported in all modern browsers (Chrome 111+, Firefox 113+, Safari 16.4+). For the ops engineer audience, this is safe. Add hex fallback comments for debugging. |
| Recharts hex requirement | Recharts needs raw hex for series colors. Maintain a small hex constant map in Costs.tsx, derived from the token values. |
| Gold/amber confusion with warning state | The primary gold accent must be visually distinct from the warning amber. Use different saturation/lightness — brand gold is brighter and more saturated, warning amber is duller and darker. |
| Scope creep into layout/functionality | This plan is explicitly visual only. No new components, no layout restructuring beyond consistent component adoption. |
| Contrast failures in warm palette | Warm yellows/golds are notoriously hard for contrast on dark backgrounds. Test every combination during Unit 9. If gold-400 fails on surface-950, lighten to gold-300. |

## Sources & References

- **Origin document:** GitHub issue i75Corridor/pawn#71
- Related completed work: `docs/plans/2026-04-07-001-feat-pawn-brand-refresh-plan.md` (icon/image assets — completed)
- Related completed work: `docs/plans/2026-04-07-002-refactor-zerohand-to-pawn-rename-plan.md` (codebase rename)
- Design context: `.impeccable.md`
- Related code: `ui/src/index.css`, `ui/tailwind.config.js`, all files under `ui/src/components/` and `ui/src/pages/`
