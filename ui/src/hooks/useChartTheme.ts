import { useState, useEffect, useMemo } from "react";
import { useTheme } from "../context/ThemeContext.tsx";

export interface ChartThemeColors {
  /** Tooltip / popover background */
  bg: string;
  /** Chart border color */
  border: string;
  /** Grid line color */
  grid: string;
  /** Axis label / tick text color */
  text: string;
  /** Primary brand accent (gold) */
  gold: string;
  /** Surface-950 (deepest container bg) */
  surface950: string;
  /** Surface-800 (secondary border) */
  surface800: string;
  /** Muted text for label styles */
  textMuted: string;
  /** Semantic: success / positive */
  emerald: string;
  /** Semantic: secondary / info */
  indigo: string;
  /** Semantic: tertiary / edge strokes */
  violet: string;
}

function readVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/**
 * Returns chart-friendly color values that update when the theme changes.
 * Reads CSS custom properties AFTER the DOM has updated so the values
 * reflect the active light/dark mode.
 */
export function useChartTheme(): ChartThemeColors {
  const { resolvedTheme } = useTheme();

  // Sensible defaults so the first render isn't blank
  const [colors, setColors] = useState<ChartThemeColors>(() => ({
    bg: resolvedTheme === "dark" ? "rgba(24,22,20,0.95)" : "rgba(247,245,242,0.95)",
    border: resolvedTheme === "dark" ? "#252220" : "#e8e4df",
    grid: resolvedTheme === "dark" ? "rgba(37,34,32,0.6)" : "rgba(216,212,207,0.6)",
    text: resolvedTheme === "dark" ? "#7d776a" : "#7d776a",
    gold: "#c99a3e",
    surface950: resolvedTheme === "dark" ? "#181614" : "#f7f5f2",
    surface800: resolvedTheme === "dark" ? "#252220" : "#e8e4df",
    textMuted: resolvedTheme === "dark" ? "#9e9889" : "#7d776a",
    emerald: "#34d399",
    indigo: "#818cf8",
    violet: "#4f46e5",
  }));

  useEffect(() => {
    // Allow one frame for the DOM class toggle to apply new CSS vars
    const id = requestAnimationFrame(() => {
      setColors({
        bg: readVar("--pawn-chart-bg") || colors.bg,
        border: readVar("--pawn-chart-border") || colors.border,
        grid: readVar("--pawn-chart-grid") || colors.grid,
        text: readVar("--pawn-chart-text") || colors.text,
        gold: readVar("--pawn-gold-500") || colors.gold,
        surface950: readVar("--pawn-surface-950") || colors.surface950,
        surface800: readVar("--pawn-surface-800") || colors.surface800,
        textMuted: readVar("--pawn-text-muted") || colors.textMuted,
        emerald: "#34d399",
        indigo: "#818cf8",
        violet: "#4f46e5",
      });
    });
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedTheme]);

  return colors;
}

/**
 * Recharts tooltip + label style object derived from chart theme colors.
 */
export function useChartTooltipStyle() {
  const c = useChartTheme();
  return useMemo(
    () => ({
      contentStyle: {
        background: c.bg,
        border: `1px solid ${c.border}`,
        borderRadius: "12px",
        color: c.text,
        fontSize: 12,
      },
      labelStyle: { color: c.textMuted },
    }),
    [c.bg, c.border, c.text, c.textMuted],
  );
}
