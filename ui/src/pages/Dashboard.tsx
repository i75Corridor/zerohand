import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Zap, Activity, CreditCard, Square, AlertCircle, GitBranch } from "lucide-react";
import { api } from "../lib/api.ts";
import { useWebSocket } from "../lib/ws.ts";
import StatusBadge from "../components/StatusBadge.tsx";
import LoadingState from "../components/LoadingState.tsx";
import EmptyState from "../components/EmptyState.tsx";
import PageHeader from "../components/PageHeader.tsx";
import SectionPanel from "../components/SectionPanel.tsx";
import { formatCost } from "../lib/format.ts";
import type { WsMessage } from "@pawn/shared";
import type { ApiPipelineRun } from "@pawn/shared";

function RunRow({ run, onCancel, cancellingId }: { run: ApiPipelineRun; onCancel: (id: string) => void; cancellingId: string | null }) {
  const duration = run.finishedAt
    ? `${Math.round((new Date(run.finishedAt).getTime() - new Date(run.startedAt ?? run.createdAt).getTime()) / 1000)}s`
    : run.startedAt
    ? "running..."
    : "queued";
  const isActive = run.status === "running" || run.status === "queued";
  const isCancelling = cancellingId === run.id;

  return (
    <tr className="hover:bg-pawn-surface-800/30 transition-colors cursor-pointer group">
      <td className="px-3 sm:px-6 py-3 sm:py-4">
        <Link to={`/runs/${run.id}`} className="contents">
          <StatusBadge status={run.status} />
        </Link>
      </td>
      <td className="px-6 py-4 max-w-[200px]">
        <Link to={`/runs/${run.id}`} className="text-sm font-medium text-pawn-text-primary group-hover:text-pawn-gold-400 transition-colors block truncate" title={run.pipelineName ?? run.pipelineId}>
          {run.pipelineName ?? run.pipelineId}
        </Link>
      </td>
      <td className="px-3 sm:px-6 py-3 sm:py-4 hidden sm:table-cell">
        <span className="text-xs text-pawn-surface-400">{run.triggerType}</span>
      </td>
      <td className="px-6 py-4 text-xs text-pawn-surface-500 whitespace-nowrap">
        {new Date(run.createdAt).toLocaleString()}
      </td>
      <td className="px-6 py-4 text-right text-xs font-mono text-pawn-surface-400">
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
        <div className="flex items-start gap-3 p-4 bg-rose-950/30 border border-rose-900/50 rounded-card">
          <AlertCircle size={16} className="text-rose-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-rose-300 mb-1">Failed to load dashboard</p>
            <p className="text-xs text-pawn-surface-400">{(runsError as Error).message}</p>
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
            className={`px-4 py-2 rounded-button text-xs font-bold btn-press ${
              runs.length === 0
                ? "bg-pawn-surface-800 hover:bg-pawn-surface-700 text-pawn-surface-300"
                : "bg-pawn-gold-500 hover:bg-pawn-gold-400 text-pawn-surface-950"
            }`}
          >
            New Pipeline
          </Link>
        }
      />

      {/* Summary card — Settings-style */}
      <div className="bg-pawn-surface-900 border border-pawn-surface-800 rounded-card mb-8 overflow-hidden">
        <div className="px-6 py-4 border-b border-pawn-surface-800 flex items-center gap-3">
          <Zap size={14} className="text-pawn-gold-400" />
          <h2 className="text-xs font-semibold text-pawn-surface-400 uppercase tracking-wider">Overview</h2>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-3 gap-6">
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <Zap size={12} className="text-pawn-gold-400 opacity-70" />
                <span className="text-xs text-pawn-surface-500">Runs this month</span>
              </div>
              <div className="text-2xl font-display font-bold text-pawn-text-primary tabular-nums tracking-tight">
                {stats ? String(stats.runsThisMonth) : "\u2014"}
              </div>
            </div>
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <Activity size={12} className="text-emerald-400 opacity-70" />
                <span className="text-xs text-pawn-surface-500">Active</span>
              </div>
              <div className="text-2xl font-display font-bold text-pawn-text-primary tabular-nums tracking-tight">
                {stats ? String(stats.activeRuns) : "\u2014"}
              </div>
              <span className="text-xs text-pawn-surface-500">{stats?.activeRuns === 0 ? "idle" : "running"}</span>
            </div>
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <CreditCard size={12} className="text-amber-400 opacity-70" />
                <span className="text-xs text-pawn-surface-500">Accrued cost</span>
              </div>
              <div className="text-2xl font-display font-bold text-pawn-text-primary tabular-nums tracking-tight">
                {stats ? formatCost(stats.costCentsThisMonth) : "\u2014"}
              </div>
              <span className="text-xs text-pawn-surface-500">this month</span>
            </div>
          </div>
        </div>
      </div>

      {/* Cancel error banner */}
      {cancelError && (
        <div className="mb-4 flex items-start gap-2 p-3 bg-rose-950/30 border border-rose-900/50 rounded-card" role="alert">
          <AlertCircle size={14} className="text-rose-400 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-rose-300">Failed to cancel run: {cancelError}</p>
          <button onClick={() => setCancelError(null)} className="ml-auto text-xs text-pawn-surface-500 hover:text-pawn-surface-300" aria-label="Dismiss error">Dismiss</button>
        </div>
      )}

      {/* Recent runs */}
      <SectionPanel
        title="Recent Pipeline Runs"
        variant="solid"
        action={runs.length > 0 ? <Link to="/pipelines" className="text-xs text-pawn-gold-400 hover:text-pawn-gold-300 font-medium transition-colors">View All</Link> : undefined}
      >
        {runs.length === 0 ? (
          <div className="px-3 sm:px-6 py-3 sm:py-4">
            <EmptyState
              compact
              icon={GitBranch}
              title="No moves yet"
              description="Your opening position is clear. Pipeline runs will appear here as they execute, showing status, trigger source, and duration in real time."
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
              <thead className="bg-pawn-surface-900/20">
                <tr>
                  <th scope="col" className="px-3 sm:px-6 py-3 text-caption font-medium text-pawn-surface-400 uppercase tracking-wider border-b border-pawn-surface-800/40">Status</th>
                  <th scope="col" className="px-6 py-3 text-caption font-medium text-pawn-surface-400 uppercase tracking-wider border-b border-pawn-surface-800/40">Pipeline</th>
                  <th scope="col" className="px-3 sm:px-6 py-3 text-caption font-medium text-pawn-surface-400 uppercase tracking-wider border-b border-pawn-surface-800/40 hidden sm:table-cell">Trigger</th>
                  <th scope="col" className="px-6 py-3 text-caption font-medium text-pawn-surface-400 uppercase tracking-wider border-b border-pawn-surface-800/40">Timestamp</th>
                  <th scope="col" className="px-6 py-3 text-right text-caption font-medium text-pawn-surface-400 uppercase tracking-wider border-b border-pawn-surface-800/40">Duration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-pawn-surface-800/40 row-alternate">
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
