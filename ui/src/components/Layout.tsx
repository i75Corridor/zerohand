import { NavLink } from "react-router-dom";
import { LayoutDashboard, GitBranch, CheckSquare, Image, Settings, MessageSquare } from "lucide-react";

function ZerohandIcon({ size = 20, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="136 132 126 152"
      width={size}
      height={size}
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M 138,180 C 136,170 136,159 141,153 C 144,147 151,146 156,149 C 157,142 162,135 170,134 C 178,133 185,138 187,145 C 189,138 196,132 205,132 C 214,132 221,138 222,145 C 224,139 231,135 239,137 C 248,139 253,147 251,156 C 254,153 260,156 262,165 C 265,176 262,191 255,202 C 260,207 262,220 257,230 C 251,240 239,242 232,236 L 230,266 C 229,277 222,284 210,284 L 162,284 C 150,284 143,277 142,266 Z" />
      <circle cx="149" cy="151" r="5" fill="currentColor" stroke="none" />
      <circle cx="176" cy="142" r="5" fill="currentColor" stroke="none" />
      <circle cx="205" cy="136" r="5.5" fill="currentColor" stroke="none" />
      <circle cx="233" cy="141" r="5" fill="currentColor" stroke="none" />
    </svg>
  );
}
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { api } from "../lib/api.ts";
import GlobalChatPanel from "./GlobalChatPanel.tsx";

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
        `flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
          isActive
            ? "bg-indigo-600 text-white"
            : "text-gray-400 hover:text-white hover:bg-gray-800"
        }`
      }
    >
      <CheckSquare size={16} />
      <span className="flex-1">Approvals</span>
      {pending.length > 0 && (
        <span className="bg-yellow-500 text-black text-xs font-bold px-1.5 py-0.5 rounded-full leading-none">
          {pending.length}
        </span>
      )}
    </NavLink>
  );
}

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/pipelines", label: "Pipelines", icon: GitBranch },
  { to: "/canvas", label: "Canvas", icon: Image },
];

const bottomNav = [
  { to: "/settings", label: "Settings", icon: Settings },
];

export default function Layout({ children }: { children: ReactNode }) {
  const [agentOpen, setAgentOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col">
        <div className="px-5 py-4 border-b border-gray-800 flex items-center gap-2">
          <ZerohandIcon size={20} className="text-indigo-400" />
          <span className="font-semibold text-white tracking-tight">Zerohand</span>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-indigo-600 text-white"
                    : "text-gray-400 hover:text-white hover:bg-gray-800"
                }`
              }
            >
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
          <ApprovalsNavItem />
        </nav>
        <div className="px-3 py-3 border-t border-gray-800 space-y-1">
          {bottomNav.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-indigo-600 text-white"
                    : "text-gray-400 hover:text-white hover:bg-gray-800"
                }`
              }
            >
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
          <button
            onClick={() => setAgentOpen((o) => !o)}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
              agentOpen
                ? "bg-indigo-600 text-white"
                : "text-gray-400 hover:text-white hover:bg-gray-800"
            }`}
          >
            <MessageSquare size={16} />
            Agent
          </button>
        </div>
      </aside>

      {/* Main content + Agent panel */}
      <div className="flex flex-1 min-w-0 overflow-hidden">
        <main className="flex-1 min-w-0 overflow-y-auto bg-gray-950">
          {children}
        </main>

        {agentOpen && (
          <div className="w-96 flex-shrink-0">
            <GlobalChatPanel onClose={() => setAgentOpen(false)} />
          </div>
        )}
      </div>
    </div>
  );
}
