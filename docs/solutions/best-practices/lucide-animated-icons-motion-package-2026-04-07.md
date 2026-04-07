---
title: Using lucide-animated icons with the motion package
date: 2026-04-07
category: best-practices
module: ui
problem_type: best_practice
component: tooling
severity: low
applies_when:
  - Adding animated icons to a React/Vite UI
  - Using lucide-animated.com components
  - Replacing static SVG icons with animated variants
tags:
  - lucide-animated
  - motion
  - framer-motion
  - animated-icons
  - react
  - svg
---

# Using lucide-animated icons with the motion package

## Context

When adding the animated chess-pawn icon from lucide-animated.com, the initial attempt used `framer-motion` (the legacy package name) and hand-rolled the animation variants. The lucide-animated component spec uses `motion` (the modern package) with `motion/react` imports and has specific spring physics tuned for each icon.

## Guidance

### Use `motion`, not `framer-motion`

The `framer-motion` package was renamed to `motion`. The lucide-animated components import from `motion/react`:

```typescript
import { motion, useAnimation, type Variants } from "motion/react";
```

Install with:
```bash
pnpm --filter ui add motion
```

### Fetch the exact component spec from lucide-animated.com

Each icon has a JSON registry at `https://lucide-animated.com/r/<icon-name>.json`. This contains the exact component code with tuned animation variants. Use it directly rather than hand-rolling animations:

```bash
# If you have shadcn configured:
pnpm dlx shadcn@latest add "https://lucide-animated.com/r/chess-pawn.json"

# If not, fetch the JSON and extract the component code manually
```

The JSON contains a `files` array with `content` fields holding the full TSX source. The component uses `forwardRef` + `useImperativeHandle` for controlled/uncontrolled animation modes.

### The component wraps in a div, not an svg

Unlike inline SVG icon components, lucide-animated components wrap in a `<div>` that handles mouse events. The SVG is a child. This means `className` applies to the div wrapper, and `stroke="currentColor"` inherits text color via CSS.

### Static SVG assets should use `fill`, not `stroke`

The animated component uses `stroke` rendering (outline style) which is correct for the Lucide icon aesthetic. But static SVG assets (favicon, logo, hero) should use `fill` for solid shapes that render well at small sizes (16px favicon).

## Why This Matters

Hand-rolling animation variants produces a visually different result from the tuned library version. The lucide-animated components have specific spring physics (`stiffness`, `damping`, `times` arrays) that create natural-feeling motion. Using `framer-motion` instead of `motion` will cause import errors in projects that install the modern package.

## When to Apply

- Any time you add an animated icon from lucide-animated.com
- When upgrading from `framer-motion` to `motion` in existing projects

## Examples

**Wrong (legacy package, hand-rolled):**
```typescript
import { motion } from "framer-motion";
// Hand-rolled variants with guessed easing
```

**Right (modern package, library component):**
```typescript
import { motion, useAnimation, type Variants } from "motion/react";
// Exact variants from lucide-animated.com/r/<icon>.json
```

## Related

- [i75Corridor/pawn#73](https://github.com/i75Corridor/pawn/issues/73) -- Brand refresh issue
- [lucide-animated.com](https://lucide-animated.com) -- Icon library source
- `ui/src/components/Icons/ChessPawnIcon.tsx` -- Implementation
