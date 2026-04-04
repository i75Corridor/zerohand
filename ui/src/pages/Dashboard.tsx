import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Zap, Activity, CreditCard, Square, AlertCircle, GitBranch } from "lucide-react";
import { api } from "../lib/api.ts";
import { useWebSocket } from "../lib/ws.ts";
import StatCard from "../components/StatCard.tsx";
import StatusBadge from "../components/StatusBadge.tsx";
import LoadingState from "../components/LoadingState.tsx";
import EmptyState from "../components/EmptyState.tsx";
import PageHeader from "../components/PageHeader.tsx";
import SectionPanel from "../components/SectionPanel.tsx";
import { formatCost } from "../lib/format.ts";
import type { WsMessage } from "@zerohand/shared";
import type { ApiPipelineRun } from "@zerohand/shared";

function RunRow({ run, onCancel, cancellingId }: { run: ApiPipelineRun; onCancel: (id: string) => void; cancellingId: string | null }) {
  const duration = run.finishedAt
    ? `${Math.round((new Date(run.finishedAt).getTime() - new Date(run.startedAt ?? run.createdAt).getTime()) / 1000)}s`
    : run.startedAt
    ? "running..."
    : "queued";
  const isActive = run.status === "running" || run.status === "queued";
  const isCancelling = cancellingId === run.id;

  return (
    <tr className="hover:bg-slate-800/30 transition-colors cursor-pointer group">
      <td className="px-3 sm:px-6 py-3 sm:py-4">
        <Link to={`/runs/${run.id}`} className="contents">
          <StatusBadge status={run.status} />
        </Link>
      </td>
      <td className="px-6 py-4 max-w-[200px]">
        <Link to={`/runs/${run.id}`} className="text-sm font-medium text-slate-100 group-hover:text-sky-400 transition-colors block truncate" title={run.pipelineName ?? run.pipelineId}>
          {run.pipelineName ?? run.pipelineId}
        </Link>
      </td>
      <td className="px-3 sm:px-6 py-3 sm:py-4 hidden sm:table-cell">
        <span className="text-xs text-slate-400">{run.triggerType}</span>
      </td>
      <td className="px-6 py-4 text-xs text-slate-500 whitespace-nowrap">
        {new Date(run.createdAt).toLocaleString()}
      </td>
      <td className="px-6 py-4 text-right text-xs font-mono text-slate-400">
        {isActive ? (
          <button
            className="inline-flex items-center gap-1 text-rose-400 hover:text-rose-300 transition-colors disabled:opacity-50"
            onClick={(e) => { e.preventDefault(); onCancel(run.id); }}
            disabled={isCancelling}
            title="Stop run"
            aria-label={`Stop run for ${run.pipelineName ?? run.pipelineId}`}
          >
            <Square size={11} />
            {isCancelling ? "Stopping..." : "Stop"}
          </button>
        ) : duration}
      </td>
    </tr>
  );
}

export default function Dashboard() {
  const queryClient = useQueryClient();
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const cancelRun = useMutation({
    mutationFn: (runId: string) => {
      setCancellingId(runId);
      setCancelError(null);
      return api.cancelRun(runId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["runs"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
    },
    onError: (err: Error) => {
      setCancelError(err.message);
    },
    onSettled: () => {
      setCancellingId(null);
    },
  });

  const { data: runs = [], isLoading: runsLoading, error: runsError } = useQuery({
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
    return <LoadingState message="Loading dashboard..." />;
  }

  if (runsError) {
    return (
      <div className="p-8 max-w-lg" role="alert">
        <div className="flex items-start gap-3 p-4 bg-rose-950/30 border border-rose-900/50 rounded-xl">
          <AlertCircle size={16} className="text-rose-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-rose-300 mb-1">Failed to load dashboard</p>
            <p className="text-xs text-slate-400">{(runsError as Error).message}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-10 max-w-6xl pt-14 lg:pt-10">
      {/* Header */}
      <PageHeader
        title="Dashboard"
        subtitle="Overview"
        actions={
          <Link
            to="/pipelines/new"
            className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-medium btn-press"
          >
            New Pipeline
          </Link>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-10">
        <StatCard icon={Zap} label="Runs this month" value={stats ? String(stats.runsThisMonth) : "\u2014"} accent="text-sky-400" />
        <StatCard icon={Activity} label="Active instances" value={stats ? String(stats.activeRuns) : "\u2014"} sub={stats?.activeRuns === 0 ? "idle" : "running or queued"} accent="text-emerald-400" />
        <StatCard icon={CreditCard} label="Accrued cost" value={stats ? formatCost(stats.costCentsThisMonth) : "\u2014"} sub="estimated monthly total" accent="text-amber-400" />
      </div>

      {/* Cancel error banner */}
      {cancelError && (
        <div className="mb-4 flex items-start gap-2 p-3 bg-rose-950/30 border border-rose-900/50 rounded-xl" role="alert">
          <AlertCircle size={14} className="text-rose-400 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-rose-300">Failed to cancel run: {cancelError}</p>
          <button onClick={() => setCancelError(null)} className="ml-auto text-xs text-slate-500 hover:text-slate-300" aria-label="Dismiss error">Dismiss</button>
        </div>
      )}

      {/* Recent runs */}
      <SectionPanel
        title="Recent Pipeline Runs"
        action={<Link to="/pipelines" className="text-xs text-sky-400 hover:text-sky-300 font-medium transition-colors">View All</Link>}
      >
        {runs.length === 0 ? (
          <div className="px-3 sm:px-6 py-3 sm:py-4">
            <EmptyState
              compact
              icon={GitBranch}
              title="No pipeline runs yet"
              description="Pipeline runs will appear here as they execute. Each run shows its status, trigger source, and duration in real time."
              actions={[
                { label: "Create a Pipeline", to: "/pipelines/new" },
                { label: "Browse Pipelines", to: "/pipelines", variant: "secondary" },
              ]}
              hint="Runs can be triggered manually, on a cron schedule, or via webhook."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-900/20">
                <tr>
                  <th scope="col" className="px-3 sm:px-6 py-3 text-caption font-medium text-slate-500 uppercase tracking-wider border-b border-slate-800">Status</th>
                  <th scope="col" className="px-6 py-3 text-caption font-medium text-slate-500 uppercase tracking-wider border-b border-slate-800">Pipeline</th>
                  <th scope="col" className="px-3 sm:px-6 py-3 text-caption font-medium text-slate-500 uppercase tracking-wider border-b border-slate-800 hidden sm:table-cell">Trigger</th>
                  <th scope="col" className="px-6 py-3 text-caption font-medium text-slate-500 uppercase tracking-wider border-b border-slate-800">Timestamp</th>
                  <th scope="col" className="px-6 py-3 text-right text-caption font-medium text-slate-500 uppercase tracking-wider border-b border-slate-800">Duration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40">
                {runs.map((run) => (
                  <RunRow key={run.id} run={run} onCancel={(id) => cancelRun.mutate(id)} cancellingId={cancellingId} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionPanel>
    </div>
  );
}
