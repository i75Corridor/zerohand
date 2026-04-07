/**
 * SectionPanel -- Card with an optional header bar for data sections.
 *
 * Usage:
 *   <SectionPanel title="Recent Pipeline Runs" action={<Link>View All</Link>}>
 *     <table>...</table>
 *   </SectionPanel>
 */

import type { ReactNode } from "react";

interface SectionPanelProps {
  /** Section heading shown in the header bar. Omit for a headerless card. */
  title?: string;
  /** Right-aligned element in the header bar. */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

export default function SectionPanel({ title, action, children, className = "" }: SectionPanelProps) {
  return (
    <div className={`bg-pawn-surface-900/40 border border-pawn-surface-800/50 rounded-card overflow-hidden ${className}`}>
      {title && (
        <div className="px-6 py-4 border-b border-pawn-surface-800 flex items-center justify-between bg-pawn-surface-900/60">
          <h2 className="text-xs font-semibold text-pawn-surface-400 uppercase tracking-wider">{title}</h2>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}
