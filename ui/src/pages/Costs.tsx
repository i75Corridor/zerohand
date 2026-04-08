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
import LoadingState from "../components/LoadingState.tsx";
import PageHeader from "../components/PageHeader.tsx";
import SectionPanel from "../components/SectionPanel.tsx";
import EmptyState from "../components/EmptyState.tsx";
import { formatCost, formatCostShort } from "../lib/format.ts";
import { useChartTheme, useChartTooltipStyle } from "../hooks/useChartTheme.ts";
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

export default function Costs() {
  const chart = useChartTheme();
  const tooltipStyle = useChartTooltipStyle();
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
                    ? "bg-pawn-gold-500 text-pawn-surface-950 border border-pawn-gold-500"
                    : "bg-pawn-surface-800/60 text-pawn-surface-400 border border-pawn-surface-700/40 hover:text-pawn-surface-200 hover:bg-pawn-surface-800 hover:border-pawn-surface-600 cursor-pointer"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        }
      />

      {/* Summary card — single container, Settings-style */}
      <div className="bg-pawn-surface-900 border border-pawn-surface-800 rounded-card mb-8 overflow-hidden">
        <div className="px-6 py-4 border-b border-pawn-surface-800 flex items-center gap-3">
          <DollarSign size={14} className="text-pawn-gold-400" />
          <h2 className="text-xs font-semibold text-pawn-surface-400 uppercase tracking-wider">Summary</h2>
        </div>

        <div className="p-6">
          {/* Total — hero weight */}
          <div className="mb-5">
            <div className="text-xs text-pawn-surface-500 mb-1">Total this month</div>
            <span className="text-3xl font-display font-bold text-pawn-text-primary tabular-nums tracking-tight">
              {data ? formatCost(data.summary.totalThisMonth) : "\u2014"}
            </span>
          </div>

          <div className="h-px bg-pawn-surface-800 mb-5" />

          {/* Secondary metrics — 2x2 grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <TrendingUp size={12} className="text-emerald-400 opacity-70" />
                <span className="text-xs text-pawn-surface-500">Daily average</span>
              </div>
              <div className="text-sm font-semibold text-pawn-text-secondary tabular-nums">
                {data ? formatCost(data.summary.dailyAverage) : "\u2014"}
              </div>
            </div>
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <Calendar size={12} className="text-amber-400 opacity-70" />
                <span className="text-xs text-pawn-surface-500">Projected month-end</span>
              </div>
              <div className="text-sm font-semibold text-pawn-text-secondary tabular-nums">
                {data ? formatCost(data.summary.projectedMonthEnd) : "\u2014"}
              </div>
            </div>
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <Award size={12} className="text-violet-400 opacity-70" />
                <span className="text-xs text-pawn-surface-500">Top skill</span>
              </div>
              <div className="text-sm font-medium text-pawn-text-secondary truncate">
                {data ? (data.summary.topSkill ?? "None") : "\u2014"}
              </div>
            </div>
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <GitBranch size={12} className="text-rose-400 opacity-70" />
                <span className="text-xs text-pawn-surface-500">Top pipeline</span>
              </div>
              <div className="text-sm font-medium text-pawn-text-secondary truncate">
                {data ? (data.summary.topPipeline ?? "None") : "\u2014"}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Line chart — spend over time */}
      <SectionPanel title="Spend Over Time" variant="solid" className="mb-8">
        <div className="p-6">
          {isLoading ? (
            <div className="h-48 flex items-center justify-center text-pawn-surface-400 text-sm" role="status" aria-live="polite">Loading...</div>
          ) : !data || data.daily.length === 0 ? (
            <EmptyState
              compact
              icon={TrendingUp}
              title="No spend recorded yet"
              description="Costs are tracked automatically when pipelines execute. Run your first pipeline to see spend data charted here over time."
              actions={[
                { label: "Browse Pipelines", to: "/pipelines", variant: "secondary" },
              ]}
              hint="Spend refreshes every five minutes once moves are in play."
            />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={data.daily} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} />
                <XAxis
                  dataKey="date"
                  tick={{ fill: chart.text, fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: string) => {
                    const d = new Date(v + "T00:00:00");
                    return `${d.getMonth() + 1}/${d.getDate()}`;
                  }}
                />
                <YAxis
                  tick={{ fill: chart.text, fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) => formatCostShort(v)}
                />
                <Tooltip
                  {...tooltipStyle}
                  formatter={(v) => [formatCost(Number(v ?? 0)), "Cost"]}
                />
                <Line
                  type="monotone"
                  dataKey="costCents"
                  stroke={chart.gold}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 5, fill: chart.gold }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </SectionPanel>

      {/* Bar charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* By skill */}
        <SectionPanel title="By Skill" variant="solid">
          <div className="p-6">
            {isLoading ? (
              <div className="h-48 flex items-center justify-center text-pawn-surface-400 text-sm" role="status" aria-live="polite">Loading...</div>
            ) : !data || data.bySkill.length === 0 ? (
              <EmptyState
                compact
                icon={Award}
                title="No pieces in play yet"
                description="Once skills start executing, their individual costs appear here ranked by spend."
                hint="Skills are the atomic moves — each one maps to a single AI capability."
              />
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart
                  data={data.bySkill.slice(0, 10)}
                  layout="vertical"
                  margin={{ top: 0, right: 8, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fill: chart.text, fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: number) => formatCostShort(v)}
                  />
                  <YAxis
                    type="category"
                    dataKey="skillName"
                    tick={{ fill: chart.textMuted, fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={100}
                  />
                  <Tooltip
                    {...tooltipStyle}
                    formatter={(v) => [formatCost(Number(v ?? 0)), "Cost"]}
                  />
                  <Bar dataKey="costCents" fill={chart.emerald} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </SectionPanel>

        {/* By pipeline */}
        <SectionPanel title="By Pipeline" variant="solid">
          <div className="p-6">
            {isLoading ? (
              <div className="h-48 flex items-center justify-center text-pawn-surface-400 text-sm" role="status" aria-live="polite">Loading...</div>
            ) : !data || data.byPipeline.length === 0 ? (
              <EmptyState
                compact
                icon={GitBranch}
                title="No gambits on the board"
                description="Pipeline-level costs appear here once workflows have completed at least one run."
                actions={[
                  { label: "Create a Pipeline", to: "/pipelines/new" },
                ]}
                hint="Each pipeline aggregates the cost of every skill it invokes."
              />
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart
                  data={data.byPipeline.slice(0, 10)}
                  layout="vertical"
                  margin={{ top: 0, right: 8, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fill: chart.text, fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: number) => formatCostShort(v)}
                  />
                  <YAxis
                    type="category"
                    dataKey="pipelineName"
                    tick={{ fill: chart.textMuted, fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={100}
                  />
                  <Tooltip
                    {...tooltipStyle}
                    formatter={(v) => [formatCost(Number(v ?? 0)), "Cost"]}
                  />
                  <Bar dataKey="costCents" fill={chart.indigo} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </SectionPanel>
      </div>
    </div>
  );
}
