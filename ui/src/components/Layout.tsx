import { NavLink } from "react-router-dom";
import { LayoutDashboard, GitBranch, Bot, Zap, CheckSquare, Image, Settings } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { api } from "../lib/api.ts";

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
  { to: "/workers", label: "Workers", icon: Bot },
  { to: "/canvas", label: "Canvas", icon: Image },
];

const bottomNav = [
  { to: "/settings", label: "Settings", icon: Settings },
];

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col">
        <div className="px-5 py-4 border-b border-gray-800 flex items-center gap-2">
          <Zap className="text-indigo-400" size={20} />
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
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto bg-gray-950">
        {children}
      </main>
    </div>
  );
}
