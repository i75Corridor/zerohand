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
import PageHeader from "../components/PageHeader.tsx";
import SectionPanel from "../components/SectionPanel.tsx";
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
    background: "rgb(24 22 20 / 0.95)",
    border: "1px solid rgb(37 34 32)",
    borderRadius: "12px",
    color: "#f7f5f2",
    fontSize: 12,
  },
  labelStyle: { color: "#9e9889" },
};

export default function Costs() {
  const [range, setRange] = useState<Range>("30d");
  const { from, to } = getRangeDates(range);

  const { data, isLoading, error: fetchError } = useQuery({
    queryKey: ["costBreakdown", from, to],
    queryFn: () => api.getCostBreakdown(from, to),
    refetchInterval: 300_000,
  });

  const ranges: { label: string; value: Range }[] = [
    { label: "7 days", value: "7d" },
    { label: "30 days", value: "30d" },
    { label: "90 days", value: "90d" },
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-10 max-w-6xl pt-14 lg:pt-10">
      <PageHeader
        title="Cost Dashboard"
        subtitle="Spend"
        actions={
          <div className="flex flex-wrap gap-2">
            {ranges.map((r) => (
              <button
                key={r.value}
                onClick={() => setRange(r.value)}
                className={`px-3 py-1.5 rounded-button text-xs font-medium transition-colors ${
                  range === r.value
                    ? "bg-pawn-gold-600 text-white"
                    : "bg-pawn-surface-800/60 text-pawn-surface-400 hover:text-pawn-surface-200 hover:bg-pawn-surface-800"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        }
      />

      {/* Summary stats */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-5 mb-10">
        <StatCard
          icon={DollarSign}
          label="Total this month"
          value={data ? formatCost(data.summary.totalThisMonth) : "—"}
          accent="text-pawn-gold-400"
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
      <SectionPanel title="Spend Over Time" className="mb-8">
        <div className="p-6">
          {isLoading ? (
            <div className="h-48 flex items-center justify-center text-pawn-surface-400 text-sm" role="status" aria-live="polite">Loading...</div>
          ) : !data || data.daily.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-pawn-surface-400 text-sm">No cost data for this period.</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={data.daily} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(37 34 32 / 0.6)" />
                <XAxis
                  dataKey="date"
                  tick={{ fill: "#7d776a", fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: string) => {
                    const d = new Date(v + "T00:00:00");
                    return `${d.getMonth() + 1}/${d.getDate()}`;
                  }}
                />
                <YAxis
                  tick={{ fill: "#7d776a", fontSize: 11 }}
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
                  stroke="#c99a3e"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 5, fill: "#c99a3e" }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </SectionPanel>

      {/* Bar charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* By skill */}
        <SectionPanel title="By Skill">
          <div className="p-6">
            {isLoading ? (
              <div className="h-48 flex items-center justify-center text-pawn-surface-400 text-sm" role="status" aria-live="polite">Loading...</div>
            ) : !data || data.bySkill.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-pawn-surface-400 text-sm">No data.</div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart
                  data={data.bySkill.slice(0, 10)}
                  layout="vertical"
                  margin={{ top: 0, right: 8, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="rgb(37 34 32 / 0.6)" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fill: "#7d776a", fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: number) => formatCostShort(v)}
                  />
                  <YAxis
                    type="category"
                    dataKey="skillName"
                    tick={{ fill: "#9e9889", fontSize: 11 }}
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
        </SectionPanel>

        {/* By pipeline */}
        <SectionPanel title="By Pipeline">
          <div className="p-6">
            {isLoading ? (
              <div className="h-48 flex items-center justify-center text-pawn-surface-400 text-sm" role="status" aria-live="polite">Loading...</div>
            ) : !data || data.byPipeline.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-pawn-surface-400 text-sm">No data.</div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart
                  data={data.byPipeline.slice(0, 10)}
                  layout="vertical"
                  margin={{ top: 0, right: 8, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="rgb(37 34 32 / 0.6)" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fill: "#7d776a", fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: number) => formatCostShort(v)}
                  />
                  <YAxis
                    type="category"
                    dataKey="pipelineName"
                    tick={{ fill: "#9e9889", fontSize: 11 }}
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
        </SectionPanel>
      </div>
    </div>
  );
}
