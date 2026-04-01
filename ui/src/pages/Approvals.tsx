import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle, XCircle, Clock, ExternalLink } from "lucide-react";
import { api } from "../lib/api.ts";
import type { ApiApproval } from "@zerohand/shared";

function ApprovalCard({ approval }: { approval: ApiApproval }) {
  const queryClient = useQueryClient();
  const [note, setNote] = useState("");
  const [showNote, setShowNote] = useState(false);
  const [pendingDecision, setPendingDecision] = useState<"approve" | "reject" | null>(null);

  const decide = useMutation({
    mutationFn: ({ decision, n }: { decision: "approve" | "reject"; n: string }) =>
      decision === "approve"
        ? api.approveStep(approval.id, n || undefined)
        : api.rejectStep(approval.id, n || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["approvals"] });
      setShowNote(false);
      setNote("");
      setPendingDecision(null);
    },
  });

  const handleDecision = (decision: "approve" | "reject") => {
    if (showNote && pendingDecision === decision) {
      decide.mutate({ decision, n: note });
    } else {
      setPendingDecision(decision);
      setShowNote(true);
    }
  };

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-5">
      <div className="flex items-start gap-3 mb-3">
        <Clock size={16} className="text-yellow-400 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {approval.pipelineName && (
              <span className="text-sm font-medium text-gray-100">{approval.pipelineName}</span>
            )}
            {approval.stepName && (
              <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded">
                {approval.stepName}
              </span>
            )}
            <Link
              to={`/runs/${approval.pipelineRunId}`}
              className="ml-auto flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300"
            >
              View run <ExternalLink size={10} />
            </Link>
          </div>
          <div className="text-xs text-gray-600 mt-1">
            Requested {new Date(approval.createdAt).toLocaleString()}
          </div>
        </div>
      </div>

      {Object.keys(approval.payload).length > 0 && (
        <div className="mb-3 text-xs text-gray-500 bg-gray-800 rounded p-2 font-mono">
          {JSON.stringify(approval.payload, null, 2)}
        </div>
      )}

      {showNote && (
        <div className="mb-3">
          <input
            className="w-full bg-gray-800 border border-gray-600 rounded-md px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
            placeholder={`Note for ${pendingDecision} (optional)`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && pendingDecision && handleDecision(pendingDecision)}
            autoFocus
          />
        </div>
      )}

      <div className="flex gap-2">
        <button
          className="flex items-center gap-1.5 px-3 py-1.5 bg-green-700 hover:bg-green-600 text-white text-xs font-medium rounded-md transition-colors disabled:opacity-50"
          disabled={decide.isPending}
          onClick={() => handleDecision("approve")}
        >
          <CheckCircle size={13} />
          {showNote && pendingDecision === "approve" ? "Confirm Approve" : "Approve"}
        </button>
        <button
          className="flex items-center gap-1.5 px-3 py-1.5 bg-red-800 hover:bg-red-700 text-white text-xs font-medium rounded-md transition-colors disabled:opacity-50"
          disabled={decide.isPending}
          onClick={() => handleDecision("reject")}
        >
          <XCircle size={13} />
          {showNote && pendingDecision === "reject" ? "Confirm Reject" : "Reject"}
        </button>
        {showNote && (
          <button
            className="px-3 py-1.5 text-xs text-gray-400 hover:text-white transition-colors"
            onClick={() => { setShowNote(false); setPendingDecision(null); setNote(""); }}
          >
            Cancel
          </button>
        )}
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

  if (isLoading) return <div className="p-8 text-gray-500">Loading...</div>;

  return (
    <div className="p-8 max-w-3xl">
      <h1 className="text-2xl font-bold text-white mb-6">
        Approvals
        {pending.length > 0 && (
          <span className="ml-3 text-sm font-normal bg-yellow-600 text-white px-2 py-0.5 rounded-full">
            {pending.length} pending
          </span>
        )}
      </h1>

      {pending.length === 0 ? (
        <div className="text-gray-500 text-sm">No pending approvals.</div>
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
