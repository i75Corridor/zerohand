---
title: "feat: Implement light/dark mode with system preference detection"
type: feat
status: active
date: 2026-04-07
issue: https://github.com/i75Corridor/pawn/issues/72
deepened: 2026-04-07
---

# feat: Implement light/dark mode with system preference detection

## Overview

Add light/dark mode theming to the Pawn UI. The app is currently dark-only with all colors defined as CSS custom properties on `:root`. The existing `--pawn-surface-*` and `--pawn-gold-*` token architecture means theming is primarily a variable-swap operation — redefine the custom properties under a `.dark` class selector, create light-mode values as the default, and the entire Tailwind-based UI follows automatically.

Users get a quick toggle button in the sidebar and a full 3-way selector (system / light / dark) in Settings. System preference is detected on first visit and respected until the user explicitly chooses.

## Problem Frame

Users have no way to switch between light and dark themes. The dark-only palette causes eye strain for users who prefer light interfaces or work in bright environments. The issue (#72) requests system preference detection, persistent user choice, and no flash of wrong theme on load.

## Requirements Trace

- R1. Detect `prefers-color-scheme` on first visit and apply matching theme
- R2. Quick-toggle button in sidebar bottom nav (cycles light/dark)
- R3. Full 3-way theme selector in Settings page (system / light / dark)
- R4. Persist user's theme choice in localStorage (`pawn_theme`)
- R5. Apply correct theme class to `<html>` element
- R6. All components respect current theme via CSS custom properties
- R7. No flash of wrong theme on page load (blocking inline script)

## Scope Boundaries

- Light and dark themes only — no custom/branded themes
- Gold accent scale stays the same in both themes (warm metallic identity)
- Status colors (emerald, amber, red) are theme-independent accents — they may need subtle opacity adjustments but not full re-mapping
- Chart and flow-editor hardcoded colors are converted to use CSS vars, but visual fine-tuning of the light palette for charts is deferred to a follow-up if needed
- No SSR — this is a Vite SPA, so the blocking script in `index.html` is sufficient for flash prevention

## Context & Research

### Relevant Code and Patterns

- `ui/src/index.css` — all `--pawn-*` custom properties defined on `:root` (lines 5–47), plus hardcoded oklch values in `.sidebar`, `.card-hover`, `.input-glow`, `:focus-visible`, `.board-grid`, `.skeleton`
- `ui/tailwind.config.js` — maps `var(--pawn-*)` to Tailwind classes; no `darkMode` key configured
- `ui/src/components/Layout.tsx` — sidebar bottom nav area (lines 198–237) where toggle goes; existing `matchMedia` pattern (lines 104–112) for viewport detection
- `ui/src/pages/Settings.tsx` — card-section pattern (`bg-pawn-surface-900 border border-pawn-surface-800 rounded-card`) for the Appearance section
- `ui/src/main.tsx` — provider tree: `StrictMode > QueryClientProvider > BrowserRouter > App`; no custom context providers exist yet
- `ui/src/pages/Costs.tsx` — 15+ hardcoded hex/rgb color values in Recharts props
- `ui/src/pages/PipelineDetail.tsx` — 3 hardcoded inline style colors for xyflow
- `ui/src/components/GlobalChatPanel.tsx` — some hardcoded color values

### Institutional Learnings

- `docs/solutions/best-practices/codebase-wide-rename-monorepo-2026-04-07.md` — localStorage keys must use the new brand name (`pawn_theme`) to avoid collisions with stale keys from the old brand

### Hardcoded Color Audit

124 occurrences of `text-white` across 23 files need a strategy. These are used for headings, labels, active nav text, and button text. In a light theme, white text on light backgrounds would be invisible.

**Decision:** Introduce a semantic `--pawn-text-primary` custom property (white in dark, surface-950 in light) mapped to `text-pawn-primary` in Tailwind. Replace `text-white` with `text-pawn-primary` where it represents primary text color. Keep `text-white` only where it's genuinely meant to be white regardless of theme (e.g., text on colored badge backgrounds).

## Key Technical Decisions

- **CSS variable swap, not Tailwind `dark:` variant**: Since 95%+ of the UI already uses `pawn-surface-*` and `pawn-gold-*` token classes, redefining the custom properties under `html.dark` gives us theming for free without adding `dark:` prefixes to every class. This is the lowest-touch approach.

- **`html.dark` class selector**: Light mode values are the `:root` default. Dark mode values live under `html.dark`. This follows the "class" strategy and allows the blocking script to add `.dark` before first paint.

- **Three-value preference model**: localStorage key `pawn_theme` stores `"system"` | `"light"` | `"dark"`. Default is `"system"`. The resolved theme (what's actually applied) is always light or dark.

- **ThemeContext as first custom context**: A new `ThemeProvider` wraps the app in `main.tsx`. Exposes `theme` (the preference), `resolvedTheme` (light/dark), and `setTheme`. Components use `useTheme()` hook.

- **Semantic text tokens**: Add `--pawn-text-primary`, `--pawn-text-secondary`, `--pawn-text-muted` custom properties with matching Tailwind classes. This handles the `text-white` problem systematically.

- **Chart/flow colors via CSS vars**: Add `--pawn-chart-*` custom properties for Recharts tooltip backgrounds, axis fills, and grid strokes. JS reads them via `getComputedStyle` or they're referenced inline as `var(--pawn-chart-bg)`.

- **Blocking script for flash prevention**: A classic `<script>` (no `type="module"`, no `defer`, no `async`) placed as the first child of `<head>` in `index.html`. It reads `pawn_theme` from localStorage and system preference, then sets `document.documentElement.classList.add("dark")` synchronously before any CSS loads. Must be classic script — a `type="module"` script is deferred by spec and would cause the exact flash we're preventing. Must also handle invalid/corrupt localStorage values by falling back to system preference.

- **Shared resolution logic**: The blocking script and ThemeProvider must use identical theme resolution logic: read `pawn_theme` from localStorage, validate it's one of `system|light|dark` (else treat as `system`), resolve `system` via `matchMedia("(prefers-color-scheme: dark)")`. Keep this logic under 10 lines so parity is manually verifiable. Both must also update `<meta name="theme-color">` — the current `#030712` (dark) needs to become a light value in light mode, otherwise mobile browser chrome stays dark on a light page.

- **Surface scale inversion mental model**: In light mode, the numeric stops are inverted: `surface-950` = lightest (near white, page background), `surface-50` = darkest (near black). This is intentional — `bg-pawn-surface-950` always means "deepest container background" regardless of theme, and the CSS var value flips to match. Implementers should not create a light-mode scale where 50=light and 950=dark (the "natural" Tailwind reading) — that would break every component's contrast relationships.

## Open Questions

### Resolved During Planning

- **Where does the toggle go?** Both — quick toggle in sidebar bottom nav + full selector in Settings Appearance section.
- **How to handle `text-white`?** Semantic token replacement with `text-pawn-primary`.
- **Tailwind `dark:` variant needed?** No — CSS variable swap makes it unnecessary for the vast majority of styles.

### Deferred to Implementation

- **Exact light-mode gold accent adjustments**: The gold scale may need minor lightness/saturation tweaks for light backgrounds. Fine-tune during implementation by visual inspection.
- **Chart visual tuning**: Light-mode chart colors may need contrast adjustments after seeing them rendered. Get the plumbing right first.

## Implementation Units

- [ ] **Unit 1: Theme context and blocking script**

  **Goal:** Create the theme state management system and prevent flash of wrong theme on load.

  **Requirements:** R1, R4, R5, R7

  **Dependencies:** None

  **Files:**
  - Create: `ui/src/context/ThemeContext.tsx`
  - Modify: `ui/src/main.tsx`
  - Modify: `ui/index.html`
  - Test: `ui/src/context/__tests__/ThemeContext.test.tsx`

  **Approach:**
  - `ThemeContext.tsx` exports `ThemeProvider` and `useTheme` hook
  - Provider manages state: `theme` preference (`system` | `light` | `dark`), `resolvedTheme` (`light` | `dark`)
  - On mount: read `pawn_theme` from localStorage (default `system`), listen to `matchMedia("(prefers-color-scheme: dark)")` for system changes
  - On theme change: update localStorage, add/remove `.dark` class on `document.documentElement`, update `<meta name="color-scheme">`
  - `index.html`: add classic `<script>` (not `type="module"`) as first child of `<head>` that reads `pawn_theme` + system pref and sets `.dark` class before first paint. Must handle invalid localStorage values (fall back to `system`). Must also set `<meta name="theme-color">` and `<meta name="color-scheme">` to match resolved theme.
  - Resolution logic in blocking script and ThemeProvider must be identical: read `pawn_theme`, validate against `system|light|dark`, resolve `system` via `matchMedia`
  - Wrap app in `ThemeProvider` in `main.tsx` alongside existing providers

  **Patterns to follow:**
  - `matchMedia` listener pattern from `Layout.tsx` lines 104–112
  - localStorage try/catch pattern from `Layout.tsx` lines 97–101
  - Provider placement in `main.tsx` provider tree

  **Test scenarios:**
  - Happy path: provider renders children and exposes default theme (`system`)
  - Happy path: `setTheme("dark")` updates resolvedTheme to `dark` and persists to localStorage
  - Happy path: `setTheme("light")` updates resolvedTheme to `light` and persists to localStorage
  - Happy path: `setTheme("system")` resolves based on matchMedia preference
  - Edge case: localStorage unavailable (private browsing) — falls back to system preference without error
  - Edge case: invalid localStorage value (e.g., `"purple"`) — falls back to `system`
  - Integration: changing theme adds/removes `.dark` class on `document.documentElement`
  - Integration: blocking script and ThemeProvider resolve to the same theme for the same localStorage + system pref state
  - Edge case: blocking script handles corrupt localStorage value (e.g., `"purple"`) — falls back to system preference

  **Verification:**
  - `useTheme()` returns correct `theme` and `resolvedTheme` after each setter call
  - `.dark` class on `<html>` matches resolved theme
  - localStorage contains the selected preference

- [ ] **Unit 2: CSS custom property light/dark split**

  **Goal:** Define light-mode and dark-mode values for all custom properties, plus new semantic text and chart tokens.

  **Requirements:** R5, R6

  **Dependencies:** Unit 1 (`.dark` class must be applied for dark values to take effect)

  **Files:**
  - Modify: `ui/src/index.css`
  - Modify: `ui/tailwind.config.js`

  **Approach:**
  - Move current `:root` values (which are dark-mode values) under `html.dark` selector
  - Create new `:root` values for light mode: invert the surface scale so that the numeric stops maintain their semantic role but with opposite lightness. Example mapping: `--pawn-surface-950` (deepest bg) = near white in light, near black in dark; `--pawn-surface-50` (lightest accent) = near black in light, near white in dark. The key insight: stop numbers represent depth/hierarchy, not absolute lightness.
  - Keep gold accent scale similar but adjust lightness for light backgrounds
  - Pay special attention to `.sidebar` border (`oklch(0.22 0.008 54 / 0.6)`) — this will be nearly invisible on a light sidebar and needs a light-mode-appropriate value via custom property
  - Add semantic tokens: `--pawn-text-primary`, `--pawn-text-secondary`, `--pawn-text-muted` with light/dark values
  - Add chart tokens: `--pawn-chart-bg`, `--pawn-chart-border`, `--pawn-chart-grid`, `--pawn-chart-text` with light/dark values
  - Convert hardcoded oklch values in `.sidebar`, `.card-hover`, `.input-glow`, `:focus-visible`, `.board-grid`, `.skeleton`, `.row-alternate` to reference custom properties
  - Update `color-scheme` property: `color-scheme: light` on `:root`, `color-scheme: dark` on `html.dark`
  - Add semantic text classes to `tailwind.config.js` under `colors.pawn.text`

  **Patterns to follow:**
  - Existing custom property naming: `--pawn-{scale}-{stop}`
  - Existing Tailwind config mapping: `pawn.{scale}.{stop}: 'var(--pawn-{scale}-{stop})'`

  **Test scenarios:**
  - Happy path: without `.dark` class, surface-950 resolves to a light color (near white)
  - Happy path: with `.dark` class, surface-950 resolves to a dark color (near black)
  - Happy path: `--pawn-text-primary` is dark in light mode, light in dark mode
  - Edge case: all `--pawn-chart-*` tokens have values in both modes
  - Integration: body background and text color visually correct in both themes (manual/visual verification)

  **Verification:**
  - No remaining hardcoded oklch/hex values in `index.css` utility classes
  - All custom properties have both light and dark definitions
  - Tailwind config includes new semantic text and chart token mappings

- [ ] **Unit 3: Replace `text-white` with semantic text tokens**

  **Goal:** Swap hardcoded `text-white` for `text-pawn-primary` (and similar) across all components so text is visible in both themes.

  **Requirements:** R6

  **Dependencies:** Unit 2 (semantic text tokens must exist)

  **Files:**
  - Modify: all component and page files using `text-white` for primary text (~23 files)
  - Key files: `ui/src/components/Layout.tsx`, `ui/src/components/SectionPanel.tsx`, `ui/src/components/StatCard.tsx`, `ui/src/components/EmptyState.tsx`, `ui/src/pages/Dashboard.tsx`, `ui/src/pages/Settings.tsx`, `ui/src/pages/PipelineBuilder.tsx`, `ui/src/pages/PipelineDetail.tsx`, `ui/src/pages/Costs.tsx`, `ui/src/pages/Help.tsx`, `ui/src/pages/Approvals.tsx`, `ui/src/pages/SkillDetail.tsx`, `ui/src/App.tsx`

  **Approach:**
  - Grep-able heuristic for each `text-white` occurrence:
    - If the same `className` string contains `bg-pawn-gold-*`, `bg-emerald-*`, `bg-amber-*`, `bg-red-*`, or any saturated background -> **keep `text-white`** (white on colored bg, theme-independent)
    - If the element is on a `bg-pawn-surface-*` background or has no explicit background -> **replace with `text-pawn-primary`** (theme-dependent primary text)
    - If the element is secondary/supporting text on a surface -> **replace with `text-pawn-secondary`**
  - `bg-white` occurrences (if any) -> `bg-pawn-surface-50`
  - This heuristic makes the 124-occurrence replacement mechanical rather than requiring individual judgment calls

  **Patterns to follow:**
  - Existing semantic class usage: `text-pawn-surface-400` for muted text, `text-pawn-surface-200` for secondary text

  **Test scenarios:**
  - Happy path: primary headings use `text-pawn-primary` and are visible in both themes
  - Happy path: button text on gold backgrounds remains `text-white` (intentionally unchanged)
  - Edge case: no remaining `text-white` occurrences that represent theme-dependent primary text

  **Verification:**
  - Grep for `text-white` — remaining occurrences are only on explicitly colored backgrounds
  - Visual check: all text is readable in both light and dark themes

- [ ] **Unit 4: Replace hardcoded chart and flow-editor colors**

  **Goal:** Convert Recharts and xyflow hardcoded color values to use CSS custom properties so charts theme correctly.

  **Requirements:** R6

  **Dependencies:** Unit 1 (ThemeContext for `useTheme()`), Unit 2 (chart CSS custom properties must exist)

  **Files:**
  - Create: `ui/src/hooks/useChartTheme.ts`
  - Modify: `ui/src/pages/Costs.tsx`
  - Modify: `ui/src/pages/PipelineDetail.tsx`
  - Modify: `ui/src/components/GlobalChatPanel.tsx`

  **Approach:**
  - For Recharts: create a `useChartTheme()` hook that reads `--pawn-chart-*` CSS custom properties via `getComputedStyle(document.documentElement)` and returns a colors object. Use `resolvedTheme` from `useTheme()` as a dependency to trigger re-reads. Important: the `CHART_TOOLTIP_STYLE` constant in `Costs.tsx` is defined at module scope and will never update on theme change — it must become a component-level variable derived from `useChartTheme()`.
  - Timing consideration: `getComputedStyle` during React render may return stale values if the class toggle and state update happen in the same microtask. Use `useEffect` + state to read computed styles after the DOM has updated, or use `resolvedTheme` as a `key` on chart containers to force remount (simpler but causes a brief flicker). Prefer the `useEffect` approach for smoother transitions.
  - For xyflow: replace inline `style={{ background: "#181614" }}` with CSS var references or conditional classes based on `resolvedTheme`.
  - Replace all hardcoded hex/rgb values in tooltip `contentStyle`, axis `tick`, grid `stroke`, bar `fill`, line `stroke`, and edge `style` props.

  **Patterns to follow:**
  - `useTheme()` hook from Unit 1 for reactive theme changes
  - CSS custom property naming from Unit 2

  **Test scenarios:**
  - Happy path: Recharts tooltip background uses `--pawn-chart-bg` value, not hardcoded hex
  - Happy path: xyflow background and grid colors respond to theme change
  - Edge case: chart re-renders when theme switches (colors update without page reload)
  - Integration: `useTheme()` resolvedTheme change triggers chart color recalculation

  **Verification:**
  - No remaining hardcoded hex/rgb/oklch color values in Costs.tsx, PipelineDetail.tsx, or GlobalChatPanel.tsx chart-related props
  - Charts are visually readable in both themes

- [ ] **Unit 5: Sidebar toggle and Settings appearance section**

  **Goal:** Add the quick-toggle button in the sidebar and the full 3-way theme selector in Settings.

  **Requirements:** R2, R3

  **Dependencies:** Unit 1 (ThemeContext), Unit 2 (CSS vars for visual correctness)

  **Files:**
  - Modify: `ui/src/components/Layout.tsx`
  - Modify: `ui/src/pages/Settings.tsx`

  **Approach:**
  - **Sidebar toggle**: Add a button in the sidebar bottom nav area (next to Help/Settings/Agent AI) with a sun/moon icon from lucide-react. Clicking cycles between light and dark (uses `setTheme`). If current preference is `system`, first click resolves to the opposite of the current system theme.
  - **Settings Appearance section**: New card section at the top of Settings page, following the existing card pattern. Contains a 3-option selector (radio group or segmented control) for System / Light / Dark. Shows current resolved theme as a hint (e.g., "Currently using dark" when set to System).
  - Both use `useTheme()` from ThemeContext.

  **Patterns to follow:**
  - Sidebar bottom nav button style from the Agent AI toggle (Layout.tsx lines 224–235)
  - Settings card section pattern from `ActiveModelsSection` (Settings.tsx)
  - Icon imports from lucide-react (`Sun`, `Moon`, `Monitor`)

  **Test scenarios:**
  - Happy path: clicking sidebar toggle switches between light and dark themes
  - Happy path: selecting "System" in Settings follows OS preference
  - Happy path: selecting "Light" or "Dark" in Settings overrides system preference
  - Happy path: sidebar icon reflects current resolved theme (sun for light, moon for dark)
  - Edge case: sidebar toggle when preference is "system" — resolves to opposite of current
  - Integration: changing theme in Settings updates sidebar icon immediately (shared context)

  **Verification:**
  - Sidebar toggle is visible and functional in both mobile and desktop layouts
  - Settings Appearance section matches existing card styling
  - Theme preference round-trips through both UI surfaces

- [ ] **Unit 6: Visual QA and edge-case fixes**

  **Goal:** Verify all components render correctly in both themes and fix any remaining issues.

  **Requirements:** R6

  **Dependencies:** Units 1–5

  **Files:**
  - Potentially any component or page file
  - Focus areas: `ui/src/components/Modal.tsx`, `ui/src/components/OnboardingModal.tsx`, `ui/src/components/OutputPreview.tsx`, `ui/src/components/StatusBadge.tsx`, `ui/src/components/ModelSelector.tsx`, `ui/src/pages/Canvas.tsx`, `ui/src/pages/Packages.tsx`, `ui/src/pages/Pipelines.tsx`, `ui/src/pages/RunDetail.tsx`, `ui/src/pages/Skills.tsx`

  **Approach:**
  - Navigate every page in both light and dark mode
  - Check: text contrast, border visibility, hover states, focus rings, status badges, modals/overlays, loading skeletons
  - Fix any remaining hardcoded colors, opacity issues, or contrast problems
  - Verify mobile responsive layout in both themes
  - Test reduced-motion preference still works

  **Test expectation:** none -- this is a visual QA pass; issues found are fixed inline

  **Verification:**
  - All pages visually inspected in both themes
  - No illegible text, invisible borders, or broken hover states
  - Modals and overlays have appropriate backdrop contrast in both themes
  - Status badges (emerald, amber, red) maintain sufficient contrast in light mode

## System-Wide Impact

- **Interaction graph:** ThemeContext wraps the entire app — every component can consume it. The blocking script in `index.html` runs before React hydrates. CSS variable changes cascade to all styled elements automatically.
- **Error propagation:** localStorage failure is silently handled (falls back to system preference). No network calls involved.
- **State lifecycle risks:** Race between blocking script and React hydration — the script must set `.dark` synchronously so the first React render sees the correct class. ThemeProvider reads the same localStorage key on mount and should agree with the script's decision.
- **API surface parity:** No backend changes. Theme is purely client-side.
- **Integration coverage:** The blocking script + ThemeProvider must agree on theme resolution logic. If they diverge, there will be a flash on hydration.
- **Unchanged invariants:** All existing Tailwind utility classes (`pawn-surface-*`, `pawn-gold-*`) continue to work exactly as before — they reference the same CSS var names, which now resolve to different values based on theme.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Light palette contrast issues (text unreadable on light backgrounds) | Semantic text tokens ensure primary/secondary text maps correctly; visual QA unit dedicated to catching issues |
| Recharts doesn't re-render on CSS var change | Use `resolvedTheme` as a React key or dependency to force re-render on theme switch |
| Blocking script logic diverges from ThemeProvider | Extract shared resolution logic or keep it simple enough (< 10 lines) to manually verify parity |
| 124 `text-white` replacements introduce regressions | Systematic approach: only replace where it represents theme-dependent text; keep `text-white` on colored backgrounds |
| Gold accent scale looks wrong on light backgrounds | Defer fine-tuning to visual QA; the gold scale is warm enough to work on both, with possible minor adjustments to the 50-200 range |

## Sources & References

- Related issue: [i75Corridor/pawn#72](https://github.com/i75Corridor/pawn/issues/72)
- Related code: `ui/src/index.css`, `ui/tailwind.config.js`, `ui/src/components/Layout.tsx`
- Institutional learning: `docs/solutions/best-practices/codebase-wide-rename-monorepo-2026-04-07.md` (localStorage key naming)
