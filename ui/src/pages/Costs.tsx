import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DollarSign, TrendingUp, Calendar, Award, GitBranch } from "lucide-react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { api } from "../lib/api.ts";

function formatCost(cents: number): string {
  if (cents === 0) return "$0.00";
  if (cents < 1) return "<$0.01";
  return `$${(cents / 100).toFixed(2)}`;
}

function formatCostShort(cents: number): string {
  if (cents === 0) return "$0";
  if (cents < 100) return `<$1`;
  return `$${(cents / 100).toFixed(0)}`;
}

type Range = "7d" | "30d" | "90d";

function getRangeDates(range: Range): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  if (range === "7d") from.setDate(from.getDate() - 7);
  else if (range === "30d") from.setDate(from.getDate() - 30);
  else from.setDate(from.getDate() - 90);
  return {
    from: from.toISOString().split("T")[0],
    to: to.toISOString().split("T")[0],
  };
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  iconBg = "bg-sky-500/10",
}: {
  icon: typeof DollarSign;
  label: string;
  value: string;
  sub?: string;
  iconBg?: string;
}) {
  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 transition-all duration-300 card-glow group">
      <div className="flex justify-between items-start mb-4">
        <div className={`p-2.5 ${iconBg} rounded-xl`}>
          <Icon size={22} className="text-sky-400" />
        </div>
      </div>
      <div className="text-xs text-slate-500 font-bold uppercase tracking-wider">{label}</div>
      <div className="text-2xl font-display font-bold text-white mt-1 group-hover:text-sky-400 transition-colors truncate">
        {value}
      </div>
      {sub && <div className="text-xs text-slate-500 mt-2">{sub}</div>}
    </div>
  );
}

const CHART_TOOLTIP_STYLE = {
  contentStyle: {
    background: "rgb(15 23 42 / 0.95)",
    border: "1px solid rgb(30 41 59)",
    borderRadius: "12px",
    color: "#f1f5f9",
    fontSize: 12,
  },
  labelStyle: { color: "#94a3b8" },
};

export default function Costs() {
  const [range, setRange] = useState<Range>("30d");
  const { from, to } = getRangeDates(range);

  const { data, isLoading } = useQuery({
    queryKey: ["costBreakdown", from, to],
    queryFn: () => api.getCostBreakdown(from, to),
    refetchInterval: 60_000,
  });

  const ranges: { label: string; value: Range }[] = [
    { label: "7 days", value: "7d" },
    { label: "30 days", value: "30d" },
    { label: "90 days", value: "90d" },
  ];

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex justify-between items-end mb-8">
        <div>
          <p className="text-sky-500 text-xs font-bold uppercase tracking-widest mb-1">Spend</p>
          <h1 className="text-3xl font-display font-bold text-white tracking-tight">Cost Dashboard</h1>
        </div>
        <div className="flex gap-2">
          {ranges.map((r) => (
            <button
              key={r.value}
              onClick={() => setRange(r.value)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                range === r.value
                  ? "bg-sky-500 text-slate-950 shadow-lg shadow-sky-500/20"
                  : "bg-slate-800/60 text-slate-400 hover:text-white hover:bg-slate-800"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        <StatCard
          icon={DollarSign}
          label="Total this month"
          value={data ? formatCost(data.summary.totalThisMonth) : "—"}
          iconBg="bg-sky-500/10"
        />
        <StatCard
          icon={TrendingUp}
          label="Daily average"
          value={data ? formatCost(data.summary.dailyAverage) : "—"}
          sub="based on range"
          iconBg="bg-emerald-500/10"
        />
        <StatCard
          icon={Calendar}
          label="Projected month-end"
          value={data ? formatCost(data.summary.projectedMonthEnd) : "—"}
          sub="at current rate"
          iconBg="bg-amber-500/10"
        />
        <StatCard
          icon={Award}
          label="Top skill"
          value={data ? (data.summary.topSkill ?? "None") : "—"}
          sub="most expensive"
          iconBg="bg-purple-500/10"
        />
        <StatCard
          icon={GitBranch}
          label="Top pipeline"
          value={data ? (data.summary.topPipeline ?? "None") : "—"}
          sub="most expensive"
          iconBg="bg-rose-500/10"
        />
      </div>

      {/* Line chart — spend over time */}
      <div className="bg-slate-900/40 border border-slate-800/50 rounded-2xl overflow-hidden mb-6">
        <div className="px-6 py-5 border-b border-slate-800 bg-slate-900/60">
          <h2 className="text-sm font-bold text-white uppercase tracking-widest">Spend Over Time</h2>
        </div>
        <div className="p-6">
          {isLoading ? (
            <div className="h-48 flex items-center justify-center text-slate-500 text-sm">Loading...</div>
          ) : !data || data.daily.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-slate-500 text-sm">No cost data for this period.</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={data.daily} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(30 41 59 / 0.6)" />
                <XAxis
                  dataKey="date"
                  tick={{ fill: "#64748b", fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: string) => {
                    const d = new Date(v + "T00:00:00");
                    return `${d.getMonth() + 1}/${d.getDate()}`;
                  }}
                />
                <YAxis
                  tick={{ fill: "#64748b", fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) => formatCostShort(v)}
                />
                <Tooltip
                  {...CHART_TOOLTIP_STYLE}
                  formatter={(v) => [formatCost(Number(v ?? 0)), "Cost"]}
                />
                <Line
                  type="monotone"
                  dataKey="costCents"
                  stroke="#38bdf8"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 5, fill: "#38bdf8" }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Bar charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* By skill */}
        <div className="bg-slate-900/40 border border-slate-800/50 rounded-2xl overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-800 bg-slate-900/60">
            <h2 className="text-sm font-bold text-white uppercase tracking-widest">By Skill</h2>
          </div>
          <div className="p-6">
            {isLoading ? (
              <div className="h-48 flex items-center justify-center text-slate-500 text-sm">Loading...</div>
            ) : !data || data.bySkill.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-slate-500 text-sm">No data.</div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart
                  data={data.bySkill.slice(0, 10)}
                  layout="vertical"
                  margin={{ top: 0, right: 8, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="rgb(30 41 59 / 0.6)" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fill: "#64748b", fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: number) => formatCostShort(v)}
                  />
                  <YAxis
                    type="category"
                    dataKey="skillName"
                    tick={{ fill: "#94a3b8", fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={100}
                  />
                  <Tooltip
                    {...CHART_TOOLTIP_STYLE}
                    formatter={(v) => [formatCost(Number(v ?? 0)), "Cost"]}
                  />
                  <Bar dataKey="costCents" fill="#38bdf8" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* By pipeline */}
        <div className="bg-slate-900/40 border border-slate-800/50 rounded-2xl overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-800 bg-slate-900/60">
            <h2 className="text-sm font-bold text-white uppercase tracking-widest">By Pipeline</h2>
          </div>
          <div className="p-6">
            {isLoading ? (
              <div className="h-48 flex items-center justify-center text-slate-500 text-sm">Loading...</div>
            ) : !data || data.byPipeline.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-slate-500 text-sm">No data.</div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart
                  data={data.byPipeline.slice(0, 10)}
                  layout="vertical"
                  margin={{ top: 0, right: 8, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="rgb(30 41 59 / 0.6)" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fill: "#64748b", fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: number) => formatCostShort(v)}
                  />
                  <YAxis
                    type="category"
                    dataKey="pipelineName"
                    tick={{ fill: "#94a3b8", fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={100}
                  />
                  <Tooltip
                    {...CHART_TOOLTIP_STYLE}
                    formatter={(v) => [formatCost(Number(v ?? 0)), "Cost"]}
                  />
                  <Bar dataKey="costCents" fill="#818cf8" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
