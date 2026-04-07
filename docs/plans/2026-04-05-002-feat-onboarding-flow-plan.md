---
title: "feat: Build onboarding flow and capability discovery page"
type: feat
status: completed
date: 2026-04-05
---

# feat: Build onboarding flow and capability discovery page

## Overview

Add a multi-step onboarding modal for first-time users and a persistent Help page listing agent capabilities. The onboarding modal appears once on first visit (localStorage-based detection), walks through 5 steps covering Pawn's core concepts, and is dismissable. A "Help" nav item in the sidebar provides ongoing access to the capability reference and a "Retake tour" trigger.

## Problem Frame

The agent-native audit scored Capability Discovery at 71%. First-time users see an empty dashboard with minimal guidance — no walkthrough, no capability reference, no "getting started" tutorial. This creates a poor first impression and slows adoption.

GitHub issue: i75Corridor/pawn#38

## Requirements Trace

- R1. First-run detection via `localStorage` flag
- R2. Welcome modal with 5 guided steps (overview, pipelines, runs, agent chat, skills/packages)
- R3. "Help" nav item accessible from sidebar bottom section (alongside Settings)
- R4. Help page listing agent capabilities, skill types, and key concepts
- R5. Dismissable — don't show modal again after completion or explicit dismiss
- R6. Ability to retake tour from Help page

## Scope Boundaries

- No backend changes — this is purely UI state with localStorage persistence
- No analytics or tracking of onboarding completion
- No interactive walkthroughs that highlight specific UI elements (simple modal steps, not a spotlight tour)
- No changes to the Dashboard empty state — the existing EmptyState component already guides users to create pipelines

## Context & Research

### Relevant Code and Patterns

- `ui/src/components/Modal.tsx` — existing Radix Dialog wrapper with overlay, animations, title, maxWidth props
- `ui/src/components/Layout.tsx` — sidebar nav array pattern at lines 72-79, bottom nav, accent color mappings
- `ui/src/App.tsx` — lazy-loaded routes with Suspense + ErrorBoundary pattern
- `ui/src/components/EmptyState.tsx` — existing empty state with icon, title, description, actions
- `ui/src/pages/Dashboard.tsx` — the page users see first; already has empty state for zero runs
- `server/src/services/global-agent.ts` — `SYSTEM_PROMPT` constant (line 20) contains the agent capability list to reference for Help page content
- Radix primitives available: `@radix-ui/react-dialog`, `@radix-ui/react-separator`
- Icons: `lucide-react` used throughout (HelpCircle, Rocket, GitBranch, Play, MessageSquare, Package)

## Key Technical Decisions

- **localStorage flag rather than API-based detection**: The issue suggests localStorage. It's simpler — no backend changes, no new DB table, instant on page load. The flag `pawn_onboarded` is set when the user completes or dismisses the modal.
- **Multi-step modal rather than spotlight tour**: A spotlight tour (highlighting UI elements) requires a tour library and tight coupling to the DOM layout. A multi-step modal with illustrations/icons is self-contained, easier to maintain, and sufficient for 5 conceptual steps.
- **Reuse existing Modal component**: The `Modal.tsx` wrapper already handles overlay, animation, portal rendering, and close behavior. The onboarding modal extends it with step navigation (prev/next/skip).
- **Help page as a real route rather than a modal**: The Help page serves as a persistent reference. Making it a route means it's linkable, bookmarkable, and accessible from the sidebar like other pages.

## Open Questions

### Resolved During Planning

- **First-run detection method**: localStorage flag `pawn_onboarded`. Set to `"true"` on modal completion or dismiss.
- **Tour step count and content**: 5 steps per issue acceptance criteria — mapped to core concepts.
- **Help page content scope**: Agent capabilities (from SYSTEM_PROMPT concepts), skill types, key navigation hints. Keep it static — no API calls needed.

### Deferred to Implementation

- **Exact copy and icon choices per tour step**: Content writing is better done in implementation where it can be iterated visually.
- **Help page section ordering**: Decide during implementation based on what reads best.

## Implementation Units

- [ ] **Unit 1: Create OnboardingModal component**

  **Goal:** Build a multi-step modal that walks users through 5 onboarding steps with navigation controls.

  **Requirements:** R2, R5

  **Dependencies:** None

  **Files:**
  - Create: `ui/src/components/OnboardingModal.tsx`

  **Approach:**
  - Accept props: `open: boolean`, `onClose: () => void`
  - Internal state: `step` (0-4) tracking current position
  - Each step is an object with: icon (lucide component), title, description, optional tip
  - Step content defined as a const array inside the component
  - Navigation: "Skip" button (calls onClose), "Back" button (when step > 0), "Next" button, "Get Started" on final step (calls onClose)
  - Step indicator dots showing progress
  - Use the existing `Modal` component as the base with `maxWidth="max-w-lg"`
  - The 5 steps:
    1. Welcome to Pawn — overview of the orchestration system
    2. Pipelines — sequential steps, skills, input schemas
    3. Running pipelines — triggers (cron, webhook, manual), monitoring runs
    4. Agent chat — the copilot sidebar, natural language commands
    5. Skills & Packages — extending capabilities, marketplace

  **Patterns to follow:**
  - `ui/src/components/Modal.tsx` — base dialog wrapper
  - Styling: dark slate theme, sky-600 accent for primary buttons, rounded-lg buttons

  **Test scenarios:**
  - Happy path: renders step 1 content when opened with step=0
  - Happy path: clicking "Next" advances to step 2, content updates
  - Happy path: clicking "Back" on step 2 returns to step 1
  - Happy path: clicking "Get Started" on step 5 calls onClose
  - Edge case: clicking "Skip" on any step calls onClose immediately
  - Edge case: step indicator shows correct active dot for each step

  **Verification:**
  - Modal renders with step content, navigation works forward/backward, close callbacks fire

- [ ] **Unit 2: Create Help page**

  **Goal:** Build a static reference page listing agent capabilities, skill types, key concepts, and a "Retake tour" button.

  **Requirements:** R4, R6

  **Dependencies:** Unit 1 (imports OnboardingModal component; no state coordination — Help page manages its own `showTour` state)

  **Files:**
  - Create: `ui/src/pages/Help.tsx`

  **Approach:**
  - Static content page — no API calls
  - Sections:
    - "Getting Started" with a "Take the Tour" button that opens OnboardingModal
    - "Core Concepts" — Pipeline, Skill, Script, Run, Trigger, Approval
    - "Agent Capabilities" — what the chat copilot can do (list from SYSTEM_PROMPT)
    - "Keyboard Shortcuts" or "Tips" — optional, if useful
  - Each section uses a card layout matching the app's dark theme
  - The page manages its own `showTour` state to control OnboardingModal visibility
  - Follow the page layout pattern: `p-4 sm:p-6 lg:p-10 max-w-6xl pt-14 lg:pt-10`

  **Patterns to follow:**
  - `ui/src/pages/Costs.tsx` — page structure with header, sections, card styling
  - `ui/src/pages/Settings.tsx` — static-ish page with sections

  **Test scenarios:**
  - Happy path: page renders with all sections visible
  - Happy path: clicking "Take the Tour" button opens OnboardingModal
  - Happy path: closing the tour modal returns to Help page without navigation

  **Verification:**
  - Help page renders all sections, tour button opens the onboarding modal

- [ ] **Unit 3: Wire onboarding into Layout and routing**

  **Goal:** Add the Help nav item to the sidebar, add the `/help` route, and trigger the onboarding modal on first visit.

  **Requirements:** R1, R3, R5

  **Dependencies:** Unit 1, Unit 2

  **Files:**
  - Modify: `ui/src/components/Layout.tsx`
  - Modify: `ui/src/App.tsx`

  **Approach:**
  - **Layout.tsx**:
    - Add `HelpCircle` to the `bottomNav` array (alongside Settings) with route `/help`, label "Help", accent color (e.g., amber)
    - Add accent color mappings for the new nav item
    - Add first-run detection: on mount, check `localStorage.getItem("pawn_onboarded")`. If null, show the OnboardingModal
    - When modal closes (complete or skip), set `localStorage.setItem("pawn_onboarded", "true")`
    - Import and render `OnboardingModal` conditionally
  - **App.tsx**:
    - Add lazy import for Help page
    - Add route `<Route path="/help" element={<Help />} />`

  **Patterns to follow:**
  - Existing `bottomNav` array in Layout.tsx for Settings
  - Existing lazy-load + Suspense pattern in App.tsx
  - Accent color mappings: `ACCENT_ACTIVE_TEXT`, `ACCENT_BAR`, `ACCENT_HOVER`

  **Test scenarios:**
  - Happy path: first visit (no localStorage flag) → OnboardingModal appears automatically
  - Happy path: subsequent visits (flag set) → no modal shown
  - Happy path: Help nav item visible in sidebar, navigates to /help
  - Happy path: /help route renders Help page
  - Edge case: localStorage cleared → modal appears again on next visit
  - Integration: complete tour in modal → localStorage flag set → refresh page → no modal

  **Verification:**
  - First-time users see the onboarding modal automatically
  - Help page accessible via sidebar navigation
  - Modal doesn't reappear after dismissal

## System-Wide Impact

- **Interaction graph:** The OnboardingModal renders in Layout (root level), so it's available on all pages. No callbacks or middleware affected.
- **Error propagation:** All changes are UI-only with no API calls. localStorage operations cannot throw in a way that breaks rendering (wrapped in try/catch by convention).
- **State lifecycle risks:** The localStorage flag is permanent once set. No expiry, no versioning. If onboarding content changes significantly in the future, a versioned key (e.g., `pawn_onboarded_v2`) could force re-display.
- **API surface parity:** No backend changes. CLI and MCP are unaffected.
- **Unchanged invariants:** Dashboard empty state, existing modals, sidebar navigation for other items all unchanged.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Modal blocks urgent first actions for returning users who cleared localStorage | "Skip" button is always visible on every step. Modal is non-blocking (can be closed via overlay click or X). |
| Help page content becomes stale as features evolve | Content is static strings in the component — easy to update. No external data source to drift from. |
| Tour content too verbose or too terse | Deferred to implementation — easier to iterate on copy with the visual in front of you. |

## Sources & References

- GitHub issue: i75Corridor/pawn#38
- Related code: `ui/src/components/Modal.tsx`, `ui/src/components/Layout.tsx`, `ui/src/App.tsx`
