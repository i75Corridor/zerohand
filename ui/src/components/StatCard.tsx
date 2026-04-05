import { memo } from "react";
import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}

export default memo(function StatCard({ icon: Icon, label, value, sub, accent = "text-sky-400" }: StatCardProps) {
  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-xl px-5 py-4 flex items-start gap-3.5">
      <Icon size={16} className={`${accent} mt-1 flex-shrink-0 opacity-70`} />
      <div className="min-w-0">
        <div className="text-xs text-slate-500 font-medium uppercase tracking-wider">{label}</div>
        <div className="text-xl font-display font-semibold text-white mt-1 truncate tabular-nums">{value}</div>
        {sub && <div className="text-xs text-slate-600 mt-0.5">{sub}</div>}
      </div>
    </div>
  );
});
