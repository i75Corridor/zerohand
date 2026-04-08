import { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { ReactNode } from "react";

type ThemePreference = "system" | "light" | "dark";
type ResolvedTheme = "light" | "dark";

interface ThemeContextValue {
  theme: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: ThemePreference) => void;
}

const STORAGE_KEY = "pawn_theme";
const VALID_PREFERENCES = new Set<ThemePreference>(["system", "light", "dark"]);
const MQ = "(prefers-color-scheme: dark)";

function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia(MQ).matches ? "dark" : "light";
}

function readStoredPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && VALID_PREFERENCES.has(stored as ThemePreference)) {
      return stored as ThemePreference;
    }
  } catch { /* localStorage unavailable */ }
  return "system";
}

function resolve(pref: ThemePreference): ResolvedTheme {
  if (pref === "system") return getSystemTheme();
  return pref;
}

function applyTheme(resolved: ResolvedTheme) {
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");

  // Update meta tags
  const colorScheme = document.querySelector('meta[name="color-scheme"]');
  if (colorScheme) colorScheme.setAttribute("content", resolved);

  const themeColor = document.querySelector('meta[name="theme-color"]');
  if (themeColor) {
    themeColor.setAttribute("content", resolved === "dark" ? "#0d0c0a" : "#f7f5f2");
  }
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemePreference>(readStoredPreference);
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => resolve(theme));

  const setTheme = useCallback((next: ThemePreference) => {
    setThemeState(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* ignore */ }
  }, []);

  // Apply theme to DOM whenever preference or system pref changes
  useEffect(() => {
    const resolved = resolve(theme);
    setResolvedTheme(resolved);
    applyTheme(resolved);

    if (theme !== "system") return;

    // Listen for system preference changes when in "system" mode
    const mq = window.matchMedia(MQ);
    const handler = () => {
      const next = resolve("system");
      setResolvedTheme(next);
      applyTheme(next);
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
