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
import StatCard from "../components/StatCard.tsx";
import LoadingState from "../components/LoadingState.tsx";
import { formatCost, formatCostShort } from "../lib/format.ts";
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

  const { data, isLoading, error: fetchError } = useQuery({
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
    <div className="p-4 sm:p-6 lg:p-10 max-w-6xl pt-14 lg:pt-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 mb-6 sm:mb-8">
        <div>
          <p className="text-amber-400/80 text-xs font-medium uppercase tracking-wider mb-1">Spend</p>
          <h1 className="text-2xl font-display font-semibold text-white tracking-tight">Cost Dashboard</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {ranges.map((r) => (
            <button
              key={r.value}
              onClick={() => setRange(r.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                range === r.value
                  ? "bg-sky-600 text-white"
                  : "bg-slate-800/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-5 mb-10">
        <StatCard
          icon={DollarSign}
          label="Total this month"
          value={data ? formatCost(data.summary.totalThisMonth) : "—"}
          accent="text-sky-400"
        />
        <StatCard
          icon={TrendingUp}
          label="Daily average"
          value={data ? formatCost(data.summary.dailyAverage) : "—"}
          sub="based on range"
          accent="text-emerald-400"
        />
        <StatCard
          icon={Calendar}
          label="Projected month-end"
          value={data ? formatCost(data.summary.projectedMonthEnd) : "—"}
          sub="at current rate"
          accent="text-amber-400"
        />
        <StatCard
          icon={Award}
          label="Top skill"
          value={data ? (data.summary.topSkill ?? "None") : "—"}
          sub="most expensive"
          accent="text-violet-400"
        />
        <StatCard
          icon={GitBranch}
          label="Top pipeline"
          value={data ? (data.summary.topPipeline ?? "None") : "—"}
          sub="most expensive"
          accent="text-rose-400"
        />
      </div>

      {/* Line chart — spend over time */}
      <div className="bg-slate-900/40 border border-slate-800/50 rounded-xl overflow-hidden mb-8">
        <div className="px-6 py-4 border-b border-slate-800 bg-slate-900/60">
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Spend Over Time</h2>
        </div>
        <div className="p-6">
          {isLoading ? (
            <div className="h-48 flex items-center justify-center text-slate-400 text-sm" role="status" aria-live="polite">Loading...</div>
          ) : !data || data.daily.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-slate-400 text-sm">No cost data for this period.</div>
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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* By skill */}
        <div className="bg-slate-900/40 border border-slate-800/50 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-800 bg-slate-900/60">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">By Skill</h2>
          </div>
          <div className="p-6">
            {isLoading ? (
              <div className="h-48 flex items-center justify-center text-slate-400 text-sm" role="status" aria-live="polite">Loading...</div>
            ) : !data || data.bySkill.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-slate-400 text-sm">No data.</div>
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
                  <Bar dataKey="costCents" fill="#34d399" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* By pipeline */}
        <div className="bg-slate-900/40 border border-slate-800/50 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-800 bg-slate-900/60">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">By Pipeline</h2>
          </div>
          <div className="p-6">
            {isLoading ? (
              <div className="h-48 flex items-center justify-center text-slate-400 text-sm" role="status" aria-live="polite">Loading...</div>
            ) : !data || data.byPipeline.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-slate-400 text-sm">No data.</div>
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
