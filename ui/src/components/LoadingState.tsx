/**
 * LoadingState -- Skeleton shimmer loading placeholders.
 *
 * Usage:
 *   <LoadingState />                        // page variant (default)
 *   <LoadingState variant="section" />       // rows for inside SectionPanel
 *   <LoadingState variant="inline" />        // single line placeholder
 *   <LoadingState message="Loading..." />    // backward-compat text fallback
 */

type LoadingVariant = "page" | "section" | "inline";

interface LoadingStateProps {
  variant?: LoadingVariant;
  message?: string;
  className?: string;
}

function StatCardSkeleton() {
  return (
    <div className="bg-pawn-surface-800 rounded-card px-5 py-4 flex items-start gap-3.5">
      {/* Icon placeholder */}
      <div className="skeleton w-4 h-4 rounded-full mt-1 flex-shrink-0" />
      <div className="flex-1 space-y-2">
        {/* Label */}
        <div className="skeleton h-3 w-20 rounded-button" />
        {/* Value */}
        <div className="skeleton h-5 w-14 rounded-button" />
      </div>
    </div>
  );
}

function TableRowSkeleton({ widthClass = "w-3/4" }: { widthClass?: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      {/* Left cell */}
      <div className={`skeleton h-3.5 ${widthClass} rounded-button`} />
      {/* Right cell */}
      <div className="skeleton h-3.5 w-16 rounded-button ml-auto" />
    </div>
  );
}

const rowWidths = ["w-3/4", "w-2/3", "w-5/6", "w-1/2", "w-3/5", "w-2/5"] as const;

function PageSkeleton() {
  return (
    <div className="space-y-6">
      {/* Stat cards row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
      </div>

      {/* Table rows */}
      <div className="bg-pawn-surface-800/40 rounded-card border border-pawn-surface-800/50 divide-y divide-pawn-surface-800/50">
        {rowWidths.map((w, i) => (
          <TableRowSkeleton key={i} widthClass={w} />
        ))}
      </div>
    </div>
  );
}

function SectionSkeleton() {
  return (
    <div className="divide-y divide-pawn-surface-800/50">
      {(["w-3/4", "w-2/3", "w-5/6", "w-1/2", "w-3/5"] as const).map((w, i) => (
        <TableRowSkeleton key={i} widthClass={w} />
      ))}
    </div>
  );
}

function InlineSkeleton() {
  return <div className="skeleton h-4 w-32 rounded-button" />;
}

export default function LoadingState({
  variant = "page",
  message,
  className = "",
}: LoadingStateProps) {
  return (
    <div
      className={`p-8 ${className}`}
      role="status"
      aria-live="polite"
    >
      {/* Screen-reader accessible label */}
      <span className="sr-only">{message ?? "Loading\u2026"}</span>

      {variant === "page" && <PageSkeleton />}
      {variant === "section" && <SectionSkeleton />}
      {variant === "inline" && <InlineSkeleton />}
    </div>
  );
}
