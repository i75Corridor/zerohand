/**
 * EmptyState -- Rich empty / zero-data placeholder with icon, description,
 * actions, and optional hint text.
 *
 * Usage:
 *   <EmptyState
 *     icon={GitBranch}
 *     title="No pipelines yet"
 *     description="Pipelines define multi-step AI agent workflows."
 *     actions={[
 *       { label: "Create Pipeline", to: "/pipelines/new" },
 *       { label: "Install a Package", to: "/packages", variant: "secondary" },
 *     ]}
 *     hint="Pipelines can be triggered manually, on a schedule, or via webhook."
 *   />
 *
 * Compact mode reduces vertical padding for inline/nested contexts:
 *   <EmptyState compact icon={...} title="..." description="..." />
 *
 * Legacy API (still supported):
 *   <EmptyState message="No runs yet." />
 */

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";

interface EmptyStateAction {
  label: string;
  to?: string;
  onClick?: () => void;
  variant?: "primary" | "secondary";
}

interface EmptyStateProps {
  /** Lucide icon to display above the title */
  icon?: LucideIcon;
  /** Short heading (e.g. "No pipelines yet") */
  title?: string;
  /** One sentence explaining what goes here and why it matters */
  description?: string;
  /** CTA buttons / links */
  actions?: EmptyStateAction[];
  /** Small footnote text below actions */
  hint?: string;
  /** Reduce padding for nested/inline usage */
  compact?: boolean;
  /** @deprecated Use title + description instead */
  message?: string;
  /** @deprecated Use actions instead */
  children?: ReactNode;
  className?: string;
}

export default function EmptyState({
  icon: Icon,
  title,
  description,
  actions = [],
  hint,
  compact = false,
  message,
  children,
  className = "",
}: EmptyStateProps) {
  // Legacy API: just message + children
  if (!Icon && !title && message) {
    return (
      <div
        className={`text-sm text-pawn-surface-500 border border-dashed border-pawn-surface-800 rounded-card p-8 text-center ${className}`}
      >
        {message}
        {children && <> {children}</>}
      </div>
    );
  }

  return (
    <div
      className={`border border-dashed border-pawn-surface-800 rounded-card text-center ${
        compact ? "px-6 py-8" : "px-8 py-14"
      } ${className}`}
    >
      {Icon && (
        <div
          className={`mx-auto flex items-center justify-center rounded-card bg-pawn-surface-800/40 border border-pawn-surface-700/30 ${
            compact ? "w-10 h-10 mb-3" : "w-12 h-12 mb-4"
          }`}
        >
          <Icon size={compact ? 18 : 22} className="text-pawn-surface-500" />
        </div>
      )}
      {title && (
        <h3
          className={`font-medium text-pawn-surface-200 ${
            compact ? "text-sm mb-1" : "text-base mb-1.5"
          }`}
        >
          {title}
        </h3>
      )}
      {description && (
        <p
          className={`text-pawn-surface-500 max-w-md mx-auto leading-relaxed ${
            compact ? "text-xs" : "text-sm"
          }`}
        >
          {description}
        </p>
      )}
      {actions.length > 0 && (
        <div className={`flex items-center justify-center gap-3 flex-wrap ${compact ? "mt-4" : "mt-6"}`}>
          {actions.map((action) => {
            const isPrimary = action.variant !== "secondary";
            const cls = isPrimary
              ? "px-4 py-2 bg-pawn-gold-600 hover:bg-pawn-gold-500 text-white text-xs font-medium rounded-button transition-colors"
              : "px-4 py-2 bg-pawn-surface-800 hover:bg-pawn-surface-700 text-pawn-surface-300 text-xs font-medium rounded-button transition-colors";

            if (action.to) {
              return (
                <Link key={action.label} to={action.to} className={cls}>
                  {action.label}
                </Link>
              );
            }
            return (
              <button key={action.label} onClick={action.onClick} className={cls}>
                {action.label}
              </button>
            );
          })}
        </div>
      )}
      {hint && (
        <p className={`text-pawn-surface-400 max-w-sm mx-auto ${compact ? "text-caption mt-3" : "text-xs mt-4"}`}>
          {hint}
        </p>
      )}
      {children && <div className={compact ? "mt-3" : "mt-4"}>{children}</div>}
    </div>
  );
}
