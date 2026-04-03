import { NavLink } from "react-router-dom";
import { LayoutDashboard, GitBranch, CheckSquare, Image, Settings, MessageSquare, Package, Cpu, DollarSign } from "lucide-react";

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

import { useState, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { api } from "../lib/api.ts";
import GlobalChatPanel from "./GlobalChatPanel.tsx";
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
        `group relative flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all overflow-hidden ${
          isActive
            ? "bg-slate-800/50 text-sky-400 ring-1 ring-slate-700/50"
            : "text-slate-400 hover:text-white hover:bg-slate-800/40"
        }`
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-sky-500 rounded-r-full" />
          )}
          <CheckSquare size={16} className={isActive ? "" : "group-hover:text-sky-400 transition-colors"} />
          <span className="flex-1">Approvals</span>
          {pending.length > 0 && (
            <span className="bg-sky-500/10 text-sky-400 border border-sky-500/30 text-[10px] font-bold px-1.5 py-0.5 rounded-md leading-none">
              {pending.length}
            </span>
          )}
        </>
      )}
    </NavLink>
  );
}

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/pipelines", label: "Pipelines", icon: GitBranch },
  { to: "/skills", label: "Skills", icon: Cpu },
  { to: "/packages", label: "Packages", icon: Package },
  { to: "/costs", label: "Costs", icon: DollarSign },
  { to: "/canvas", label: "Canvas", icon: Image },
];

const bottomNav = [
  { to: "/settings", label: "Settings", icon: Settings },
];

export default function Layout({ children }: { children: ReactNode }) {
  useDataChangedListener();
  const [agentOpen, setAgentOpen] = useState(false);
  const [agentWidth, setAgentWidth] = useState(384); // 96 * 4 = w-96 default
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const onDragStart = useCallback((e: React.MouseEvent) => {
    isDragging.current = true;
    startX.current = e.clientX;
    startWidth.current = agentWidth;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const onMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const delta = startX.current - e.clientX;
      setAgentWidth(Math.min(700, Math.max(280, startWidth.current + delta)));
    };
    const onUp = () => {
      isDragging.current = false;
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
      {/* Sidebar */}
      <aside className="w-64 flex-shrink-0 glass-sidebar flex flex-col z-50">
        {/* Logo */}
        <div className="px-6 py-6 flex items-center gap-3">
          <div className="relative">
            <div className="absolute inset-0 bg-sky-500/20 blur-xl rounded-full" />
            <FistIcon size={24} className="text-sky-400 relative logo-glow" />
          </div>
          <span className="font-display text-xl text-white tracking-tighter">Zerohand</span>
        </div>

        {/* Main nav */}
        <nav className="flex-1 px-4 py-4 space-y-1.5">
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `group relative flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all overflow-hidden ${
                  isActive
                    ? "bg-slate-800/50 text-sky-400 ring-1 ring-slate-700/50"
                    : "text-slate-400 hover:text-white hover:bg-slate-800/40"
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
          <ApprovalsNavItem />
        </nav>

        {/* Bottom nav */}
        <div className="mt-auto p-4">
          <div className="glass-footer rounded-2xl p-2 space-y-1">
            {bottomNav.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `group relative flex items-center gap-3 px-4 py-2 rounded-lg text-sm font-medium transition-all overflow-hidden ${
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
              className={`w-full group flex items-center gap-3 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
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
        <main className="flex-1 min-w-0 overflow-y-auto bg-slate-950 relative">
          <div className="absolute top-0 left-0 w-full h-64 bg-gradient-to-b from-sky-500/5 to-transparent pointer-events-none" />
          <div className="relative">
            {children}
          </div>
        </main>

        {agentOpen && (
          <>
            <div
              className="w-1 flex-shrink-0 cursor-col-resize hover:bg-sky-500/40 active:bg-sky-500/60 transition-colors"
              onMouseDown={onDragStart}
            />
            <div className="flex-shrink-0" style={{ width: agentWidth }}>
              <GlobalChatPanel onClose={() => setAgentOpen(false)} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
