import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Zap, Activity, CreditCard, Square } from "lucide-react";
import { api } from "../lib/api.ts";
import { useWebSocket } from "../lib/ws.ts";
import type { WsMessage } from "@zerohand/shared";
import type { ApiPipelineRun } from "@zerohand/shared";

const STATUS_STYLES: Record<string, { badge: string; dot?: string }> = {
  queued:    { badge: "bg-slate-700/30 text-slate-400 border border-slate-700/50" },
  running:   { badge: "bg-sky-500/10 text-sky-400 border border-sky-500/20", dot: "bg-sky-500 animate-pulse" },
  paused:    { badge: "bg-amber-500/10 text-amber-400 border border-amber-500/20" },
  completed: { badge: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" },
  failed:    { badge: "bg-rose-500/10 text-rose-400 border border-rose-500/20" },
  cancelled: { badge: "bg-slate-700/30 text-slate-400 border border-slate-700/50" },
};

function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.queued;
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-md font-bold uppercase ${style.badge}`}>
      {style.dot && <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />}
      {status}
    </span>
  );
}

function StatCard({ icon: Icon, label, value, sub, iconBg }: {
  icon: typeof Activity;
  label: string;
  value: string;
  sub?: string;
  iconBg?: string;
}) {
  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 transition-all duration-300 card-glow group">
      <div className="flex justify-between items-start mb-4">
        <div className={`p-2.5 ${iconBg ?? "bg-sky-500/10"} rounded-xl`}>
          <Icon size={22} className="text-sky-400" />
        </div>
      </div>
      <div className="text-xs text-slate-500 font-bold uppercase tracking-wider">{label}</div>
      <div className="text-3xl font-display font-bold text-white mt-1 group-hover:text-sky-400 transition-colors">{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-2">{sub}</div>}
    </div>
  );
}

function formatCost(cents: number): string {
  if (cents === 0) return "$0.00";
  if (cents < 1) return `<$0.01`;
  return `$${(cents / 100).toFixed(2)}`;
}

function RunRow({ run, onCancel }: { run: ApiPipelineRun; onCancel: (id: string) => void }) {
  const duration = run.finishedAt
    ? `${Math.round((new Date(run.finishedAt).getTime() - new Date(run.startedAt ?? run.createdAt).getTime()) / 1000)}s`
    : run.startedAt
    ? "running..."
    : "queued";
  const isActive = run.status === "running" || run.status === "queued";

  return (
    <tr className="hover:bg-slate-800/30 transition-colors cursor-pointer group">
      <td className="px-6 py-4">
        <Link to={`/runs/${run.id}`} className="contents">
          <StatusBadge status={run.status} />
        </Link>
      </td>
      <td className="px-6 py-4">
        <Link to={`/runs/${run.id}`} className="text-sm font-bold text-slate-100 group-hover:text-sky-400 transition-colors block">
          {run.pipelineName ?? run.pipelineId}
        </Link>
      </td>
      <td className="px-6 py-4">
        <span className="text-xs text-slate-400">{run.triggerType}</span>
      </td>
      <td className="px-6 py-4 text-xs text-slate-500">
        {new Date(run.createdAt).toLocaleString()}
      </td>
      <td className="px-6 py-4 text-right text-xs font-mono text-slate-400">
        {isActive ? (
          <button
            className="inline-flex items-center gap-1 text-rose-400 hover:text-rose-300 transition-colors"
            onClick={(e) => { e.preventDefault(); onCancel(run.id); }}
            title="Stop run"
          >
            <Square size={11} />
            Stop
          </button>
        ) : duration}
      </td>
    </tr>
  );
}

export default function Dashboard() {
  const queryClient = useQueryClient();

  function handleCancel(runId: string) {
    void api.cancelRun(runId).then(() => {
      queryClient.invalidateQueries({ queryKey: ["runs"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
    });
  }

  const { data: runs = [], isLoading: runsLoading } = useQuery({
    queryKey: ["runs"],
    queryFn: () => api.listRuns(),
    refetchInterval: 5000,
  });

  const { data: stats } = useQuery({
    queryKey: ["stats"],
    queryFn: () => api.getStats(),
    refetchInterval: 15_000,
  });

  useWebSocket((msg: WsMessage) => {
    if (msg.type === "run_status") {
      queryClient.invalidateQueries({ queryKey: ["runs"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
    }
  });

  if (runsLoading) {
    return <div className="p-8 text-slate-500">Loading...</div>;
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex justify-between items-end mb-8">
        <div>
          <p className="text-sky-500 text-xs font-bold uppercase tracking-widest mb-1">Overview</p>
          <h1 className="text-3xl font-display font-bold text-white tracking-tight">Dashboard</h1>
        </div>
        <Link
          to="/pipelines/new"
          className="px-4 py-2 bg-sky-500 hover:bg-sky-400 text-slate-950 rounded-xl text-xs font-bold transition-all shadow-lg shadow-sky-500/20"
        >
          New Pipeline
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-6 mb-10">
        <StatCard
          icon={Zap}
          label="Runs this month"
          value={stats ? String(stats.runsThisMonth) : "—"}
          iconBg="bg-sky-500/10"
        />
        <StatCard
          icon={Activity}
          label="Active instances"
          value={stats ? String(stats.activeRuns) : "—"}
          sub={stats?.activeRuns === 0 ? "idle" : "running or queued"}
          iconBg="bg-emerald-500/10"
        />
        <StatCard
          icon={CreditCard}
          label="Accrued cost"
          value={stats ? formatCost(stats.costCentsThisMonth) : "—"}
          sub="estimated monthly total"
          iconBg="bg-slate-800"
        />
      </div>

      {/* Recent runs */}
      <div className="bg-slate-900/40 border border-slate-800/50 rounded-2xl overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
          <h2 className="text-sm font-bold text-white uppercase tracking-widest">Recent Pipeline Runs</h2>
          <Link to="/pipelines" className="text-xs text-sky-400 hover:text-sky-300 font-bold transition-colors">
            View All
          </Link>
        </div>

        {runs.length === 0 ? (
          <div className="px-6 py-12 text-center text-slate-500 text-sm">
            No runs yet.{" "}
            <Link to="/pipelines" className="text-sky-400 hover:underline">
              Trigger a pipeline
            </Link>{" "}
            to get started.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-900/20">
                <tr>
                  <th className="px-6 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-800">Status</th>
                  <th className="px-6 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-800">Pipeline</th>
                  <th className="px-6 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-800">Trigger</th>
                  <th className="px-6 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-800">Timestamp</th>
                  <th className="px-6 py-3 text-right text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-800">Duration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40">
                {runs.map((run) => (
                  <RunRow key={run.id} run={run} onCancel={handleCancel} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
