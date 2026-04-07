/**
 * StatusBadge -- Unified status indicator for pipeline runs and steps.
 *
 * Usage:
 *   <StatusBadge status="running" />
 *   <StatusBadge status="completed" size="sm" />
 */

const STATUS_STYLES: Record<string, { badge: string; dot?: string }> = {
  queued:             { badge: "bg-pawn-surface-700/30 text-pawn-surface-400 border border-pawn-surface-700/50" },
  running:            { badge: "bg-pawn-gold-500/10 text-pawn-gold-400 border border-pawn-gold-500/20", dot: "bg-pawn-gold-400 animate-pulse" },
  paused:             { badge: "bg-amber-500/10 text-amber-400 border border-amber-500/20" },
  awaiting_approval:  { badge: "bg-amber-500/10 text-amber-400 border border-amber-500/20" },
  completed:          { badge: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" },
  failed:             { badge: "bg-rose-500/10 text-rose-400 border border-rose-500/20" },
  cancelled:          { badge: "bg-pawn-surface-700/30 text-pawn-surface-400 border border-pawn-surface-700/50" },
};

/** Semantic left-border colors for step cards and run rows. */
export const STATUS_BORDER_COLORS: Record<string, string> = {
  queued:             "border-l-pawn-surface-700",
  running:            "border-l-pawn-gold-500",
  awaiting_approval:  "border-l-amber-500",
  completed:          "border-l-emerald-500",
  failed:             "border-l-rose-500",
  cancelled:          "border-l-pawn-surface-700",
};

/** Semantic text color only (for inline status labels). */
export const STATUS_TEXT_COLORS: Record<string, string> = {
  queued:             "text-pawn-surface-400",
  running:            "text-pawn-gold-400",
  awaiting_approval:  "text-amber-400",
  completed:          "text-emerald-400",
  failed:             "text-rose-400",
  cancelled:          "text-pawn-surface-400",
};

export function statusColor(status: string): string {
  return STATUS_TEXT_COLORS[status] ?? "text-pawn-surface-400";
}

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export default function StatusBadge({ status, className = "" }: StatusBadgeProps) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.queued;
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-caption px-2.5 py-1 rounded-badge font-semibold uppercase tracking-wide ${style.badge} ${className}`}
    >
      {style.dot && <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />}
      {status.replace(/_/g, " ")}
    </span>
  );
}
