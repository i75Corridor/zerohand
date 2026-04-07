import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle, XCircle, Clock, ExternalLink } from "lucide-react";
import { api } from "../lib/api.ts";
import LoadingState from "../components/LoadingState.tsx";
import EmptyState from "../components/EmptyState.tsx";
import type { ApiApproval } from "@pawn/shared";

function ApprovalCard({ approval }: { approval: ApiApproval }) {
  const queryClient = useQueryClient();
  const [note, setNote] = useState("");

  const decide = useMutation({
    mutationFn: ({ decision, n }: { decision: "approve" | "reject"; n: string }) =>
      decision === "approve"
        ? api.approveStep(approval.id, n || undefined)
        : api.rejectStep(approval.id, n || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["approvals"] });
      setNote("");
    },
    onError: () => {
      // Error is displayed via decide.isError below
    },
  });

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <div className="flex items-start gap-3 mb-3">
        <Clock size={16} className="text-amber-500 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {approval.pipelineName && (
              <span className="text-sm font-medium text-slate-100">{approval.pipelineName}</span>
            )}
            {approval.stepName && (
              <span className="bg-slate-800 text-slate-400 text-caption font-mono px-2 py-0.5 rounded-md">
                {approval.stepName}
              </span>
            )}
            <Link
              to={`/runs/${approval.pipelineRunId}`}
              className="ml-auto flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300"
            >
              View run <ExternalLink size={10} />
            </Link>
          </div>
          <div className="text-xs text-slate-600 mt-1">
            Requested {new Date(approval.createdAt).toLocaleString()}
          </div>
        </div>
      </div>

      {Object.keys(approval.payload).length > 0 && (
        <div className="mb-3 bg-slate-800/80 rounded-lg p-3 font-mono text-xs text-slate-300 border border-slate-700/50">
          {JSON.stringify(approval.payload, null, 2)}
        </div>
      )}

      <div className="mb-3">
        <input
          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-sm text-slate-300 placeholder:text-slate-600 focus:outline-none focus:border-sky-500/40 input-glow"
          placeholder="Add a note (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          className="flex flex-1 justify-center items-center gap-1.5 px-3 py-1.5 bg-emerald-600/90 hover:bg-emerald-600 text-white text-xs font-medium rounded-md btn-press disabled:opacity-50"
          disabled={decide.isPending}
          onClick={() => decide.mutate({ decision: "approve", n: note })}
        >
          <CheckCircle size={13} />
          Approve
        </button>
        <button
          className="flex flex-1 justify-center items-center gap-1.5 px-3 py-1.5 bg-rose-800 hover:bg-rose-700 text-white text-xs font-medium rounded-md btn-press disabled:opacity-50"
          disabled={decide.isPending}
          onClick={() => decide.mutate({ decision: "reject", n: note })}
        >
          <XCircle size={13} />
          Reject
        </button>
      </div>
    </div>
  );
}

export default function Approvals() {
  const { data: pending = [], isLoading } = useQuery({
    queryKey: ["approvals"],
    queryFn: () => api.listApprovals("pending"),
    refetchInterval: 10_000,
  });

  if (isLoading) return <LoadingState />;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl pt-14 lg:pt-8">
      <h1 className="text-2xl font-semibold font-display text-white tracking-tight mb-8">
        Approvals
        {pending.length > 0 && (
          <span className="ml-3 bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded-md px-2.5 py-1 text-xs font-semibold">
            {pending.length} pending
          </span>
        )}
      </h1>

      {pending.length === 0 ? (
        <EmptyState
          icon={CheckCircle}
          title="No pending approvals"
          description="When a pipeline step requires human review, it will pause and appear here. You can approve or reject with an optional note."
          actions={[
            { label: "View Pipelines", to: "/pipelines", variant: "secondary" },
          ]}
          hint="Add an approval gate to any pipeline step to require human review before proceeding."
        />
      ) : (
        <div className="space-y-4">
          {pending.map((a) => (
            <ApprovalCard key={a.id} approval={a} />
          ))}
        </div>
      )}
    </div>
  );
}
