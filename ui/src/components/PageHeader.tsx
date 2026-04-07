/**
 * PageHeader -- Consistent page title area with optional subtitle and actions.
 *
 * Usage:
 *   <PageHeader title="Dashboard" subtitle="Overview" />
 *   <PageHeader title="Pipelines" actions={<Link to="/pipelines/new">New Pipeline</Link>} />
 */

import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  /** Small uppercase label above the title (e.g. "Overview", "Spend"). */
  subtitle?: string;
  /** Right-aligned action area (buttons, links). */
  actions?: ReactNode;
  className?: string;
}

export default function PageHeader({ title, subtitle, actions, className = "" }: PageHeaderProps) {
  return (
    <div className={`flex justify-between items-end mb-8 ${className}`}>
      <div>
        {subtitle && (
          <p className="text-pawn-gold-400/80 text-xs font-medium uppercase tracking-wider mb-1">
            {subtitle}
          </p>
        )}
        <h1 className="text-2xl font-display font-semibold text-white tracking-tight">{title}</h1>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
