import { memo } from "react";
import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}

export default memo(function StatCard({ icon: Icon, label, value, sub, accent = "text-pawn-gold-400" }: StatCardProps) {
  return (
    <div className="bg-pawn-surface-900/50 rounded-card px-5 py-4 flex items-start gap-3.5">
      <Icon size={16} className={`${accent} mt-1 flex-shrink-0 opacity-70`} />
      <div className="min-w-0">
        <div className="text-xs text-pawn-surface-300 font-medium uppercase tracking-wider">{label}</div>
        <div className="text-xl font-display font-semibold text-white mt-1 truncate tabular-nums">{value}</div>
        {sub && <div className="text-xs text-pawn-surface-400 mt-0.5">{sub}</div>}
      </div>
    </div>
  );
});
