import { NavLink } from "react-router-dom";
import { LayoutDashboard, GitBranch, CheckSquare, Image, Settings, MessageSquare, Package, Cpu, DollarSign, Menu } from "lucide-react";

function FistIcon({ size = 24, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 100 110"
      width={size}
      height={size}
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Thumb */}
      <rect x="3" y="28" width="22" height="56" rx="11" fill="currentColor" transform="rotate(-6 14 56)" />
      {/* Knuckles: pinky → index */}
      <rect x="22" y="17" width="17" height="38" rx="8"  fill="currentColor" />
      <rect x="42" y="11" width="18" height="44" rx="9"  fill="currentColor" />
      <rect x="63" y="7"  width="18" height="48" rx="9"  fill="currentColor" />
      <rect x="83" y="13" width="15" height="43" rx="7"  fill="currentColor" />
      {/* Main fist body */}
      <rect x="18" y="47" width="80" height="58" rx="17" fill="currentColor" />
      {/* Knuckle crease */}
      <path d="M 24 51 Q 58 44 96 51" stroke="rgba(15,23,42,0.18)" strokeWidth="2.5" fill="none" strokeLinecap="round" />
    </svg>
  );
}

import { useState, useRef, useCallback, lazy, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { api } from "../lib/api.ts";
const GlobalChatPanel = lazy(() => import("./GlobalChatPanel.tsx"));
import { useDataChangedListener } from "../hooks/useDataChangedListener.ts";

function ApprovalsNavItem() {
  const { data: pending = [] } = useQuery({
    queryKey: ["approvals"],
    queryFn: () => api.listApprovals("pending"),
    refetchInterval: 15_000,
  });

  return (
    <NavLink
      to="/approvals"
      className={({ isActive }) =>
        `group relative flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors overflow-hidden ${
          isActive
            ? "bg-slate-800/50 text-emerald-400 ring-1 ring-slate-700/50"
            : "text-slate-400 hover:text-white hover:bg-slate-800/40"
        }`
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-emerald-500 rounded-r-full" />
          )}
          <CheckSquare size={16} className={isActive ? "" : "group-hover:text-emerald-400 transition-colors"} />
          <span className="flex-1">Approvals</span>
          {pending.length > 0 && (
            <span className="bg-amber-500/10 text-amber-400 border border-amber-500/30 text-caption font-bold px-1.5 py-0.5 rounded-md leading-none tabular-nums">
              {pending.length}
            </span>
          )}
        </>
      )}
    </NavLink>
  );
}

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, accent: "sky" },
  { to: "/pipelines", label: "Pipelines", icon: GitBranch, accent: "indigo" },
  { to: "/skills", label: "Skills", icon: Cpu, accent: "violet" },
  { to: "/packages", label: "Packages", icon: Package, accent: "teal" },
  { to: "/costs", label: "Costs", icon: DollarSign, accent: "amber" },
  { to: "/canvas", label: "Canvas", icon: Image, accent: "rose" },
] as const;

const ACCENT_ACTIVE_TEXT: Record<string, string> = {
  sky: "text-sky-400",
  indigo: "text-indigo-400",
  violet: "text-violet-400",
  teal: "text-teal-400",
  amber: "text-amber-400",
  rose: "text-rose-400",
  slate: "text-sky-400",
};

const ACCENT_BAR: Record<string, string> = {
  sky: "bg-sky-500",
  indigo: "bg-indigo-500",
  violet: "bg-violet-500",
  teal: "bg-teal-500",
  amber: "bg-amber-500",
  rose: "bg-rose-500",
  slate: "bg-sky-500",
};

const ACCENT_HOVER: Record<string, string> = {
  sky: "group-hover:text-sky-400",
  indigo: "group-hover:text-indigo-400",
  violet: "group-hover:text-violet-400",
  teal: "group-hover:text-teal-400",
  amber: "group-hover:text-amber-400",
  rose: "group-hover:text-rose-400",
  slate: "group-hover:text-sky-400",
};

const bottomNav = [
  { to: "/settings", label: "Settings", icon: Settings },
];

export default function Layout({ children }: { children: ReactNode }) {
  useDataChangedListener();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [agentOpen, setAgentOpen] = useState(false);
  const [agentWidth, setAgentWidth] = useState(384); // 96 * 4 = w-96 default
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);
  const rafId = useRef(0);

  const onDragStart = useCallback((e: React.MouseEvent) => {
    isDragging.current = true;
    startX.current = e.clientX;
    startWidth.current = agentWidth;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const onMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      cancelAnimationFrame(rafId.current);
      rafId.current = requestAnimationFrame(() => {
        const delta = startX.current - e.clientX;
        setAgentWidth(Math.min(700, Math.max(280, startWidth.current + delta)));
      });
    };
    const onUp = () => {
      isDragging.current = false;
      cancelAnimationFrame(rafId.current);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [agentWidth]);

  return (
    <div className="flex h-screen overflow-hidden">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:top-4 focus:left-4 focus:px-4 focus:py-2 focus:bg-sky-500 focus:text-slate-950 focus:rounded-lg focus:text-sm focus:font-medium">
        Skip to main content
      </a>

      {/* Backdrop overlay for mobile sidebar */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden animate-overlay-in" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 transform transition-transform duration-200 ease-out lg:relative lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} flex-shrink-0 sidebar flex flex-col`}>
        {/* Logo */}
        <div className="px-6 py-6 flex items-center gap-3">
          <FistIcon size={24} className="text-sky-400" />
          <span className="font-display text-xl text-white tracking-tighter">Zerohand</span>
        </div>

        {/* Main nav */}
        <nav className="flex-1 px-4 py-4 space-y-1">
          {nav.map(({ to, label, icon: Icon, accent }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `group relative flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors overflow-hidden ${
                  isActive
                    ? `bg-slate-800/50 ${ACCENT_ACTIVE_TEXT[accent]} ring-1 ring-slate-700/50`
                    : "text-slate-400 hover:text-white hover:bg-slate-800/40"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <div className={`absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 ${ACCENT_BAR[accent]} rounded-r-full`} />
                  )}
                  <Icon size={16} className={isActive ? "" : `${ACCENT_HOVER[accent]} transition-colors`} />
                  {label}
                </>
              )}
            </NavLink>
          ))}
          <div onClick={() => setSidebarOpen(false)}>
            <ApprovalsNavItem />
          </div>
        </nav>

        {/* Bottom nav */}
        <div className="mt-auto p-4">
          <div className="footer-well rounded-xl p-2 space-y-1">
            {bottomNav.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) =>
                  `group relative flex items-center gap-3 px-4 py-2 rounded-lg text-sm font-medium transition-colors overflow-hidden ${
                    isActive
                      ? "bg-slate-800/50 text-sky-400 ring-1 ring-slate-700/50"
                      : "text-slate-400 hover:text-white hover:bg-slate-800/60"
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-sky-500 rounded-r-full" />
                    )}
                    <Icon size={16} className={isActive ? "" : "group-hover:text-sky-400 transition-colors"} />
                    {label}
                  </>
                )}
              </NavLink>
            ))}
            <button
              onClick={() => setAgentOpen((o) => !o)}
              aria-label={agentOpen ? "Close agent panel" : "Open agent panel"}
              className={`w-full group flex items-center gap-3 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                agentOpen
                  ? "bg-slate-800/50 text-sky-400 ring-1 ring-slate-700/50"
                  : "text-slate-400 hover:text-white hover:bg-slate-800/60"
              }`}
            >
              <MessageSquare size={16} className={agentOpen ? "" : "group-hover:text-sky-400 transition-colors"} />
              Agent AI
            </button>
          </div>
        </div>
      </aside>

      {/* Main content + Agent panel */}
      <div className="flex flex-1 min-w-0 overflow-hidden">
        <main id="main-content" className="flex-1 min-w-0 overflow-y-auto bg-slate-950 relative">
          <button
            className="lg:hidden fixed top-3 left-3 z-30 p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center bg-slate-800 rounded-lg text-slate-400 hover:text-white active:bg-slate-700 transition-colors"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
          >
            <Menu size={20} />
          </button>
          <div className="relative">
            {children}
          </div>
        </main>

        {agentOpen && (
          <>
            {/* Desktop: side panel with resize handle */}
            <div className="hidden md:flex md:flex-shrink-0 animate-slide-in-right">
              <div
                className="w-1 flex-shrink-0 cursor-col-resize hover:bg-slate-600/40 active:bg-slate-500/50 transition-colors"
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize agent panel"
                onMouseDown={onDragStart}
              />
              <div className="flex-shrink-0" style={{ width: agentWidth }}>
                <Suspense fallback={<div className="flex items-center justify-center h-full text-slate-500 text-sm">Loading...</div>}><GlobalChatPanel onClose={() => setAgentOpen(false)} /></Suspense>
              </div>
            </div>
            {/* Mobile: full-screen overlay */}
            <div className="fixed inset-0 z-50 md:hidden animate-fade-in">
              <Suspense fallback={<div className="flex items-center justify-center h-full text-slate-500 text-sm">Loading...</div>}><GlobalChatPanel onClose={() => setAgentOpen(false)} /></Suspense>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
