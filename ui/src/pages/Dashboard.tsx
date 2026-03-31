import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api.ts";
import { useWebSocket } from "../lib/ws.ts";
import type { WsMessage } from "@zerohand/shared";
import type { ApiPipelineRun } from "@zerohand/shared";

const STATUS_COLORS: Record<string, string> = {
  queued: "bg-gray-700 text-gray-300",
  running: "bg-blue-700 text-blue-100",
  paused: "bg-yellow-700 text-yellow-100",
  completed: "bg-green-700 text-green-100",
  failed: "bg-red-700 text-red-100",
  cancelled: "bg-gray-600 text-gray-300",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[status] ?? "bg-gray-700 text-gray-300"}`}>
      {status}
    </span>
  );
}

function RunRow({ run }: { run: ApiPipelineRun }) {
  return (
    <Link
      to={`/runs/${run.id}`}
      className="flex items-center gap-4 px-5 py-3 hover:bg-gray-900 transition-colors rounded-md"
    >
      <StatusBadge status={run.status} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-100 truncate">
          {run.pipelineName ?? run.pipelineId}
        </div>
        <div className="text-xs text-gray-500 truncate">
          {run.triggerType} · {new Date(run.createdAt).toLocaleString()}
        </div>
      </div>
      <div className="text-xs text-gray-500 text-right whitespace-nowrap">
        {run.finishedAt
          ? `${Math.round((new Date(run.finishedAt).getTime() - new Date(run.startedAt ?? run.createdAt).getTime()) / 1000)}s`
          : run.startedAt
          ? "running..."
          : "queued"}
      </div>
    </Link>
  );
}

export default function Dashboard() {
  const queryClient = useQueryClient();
  const { data: runs = [], isLoading } = useQuery({
    queryKey: ["runs"],
    queryFn: () => api.listRuns(),
    refetchInterval: 5000,
  });

  useWebSocket((msg: WsMessage) => {
    if (msg.type === "run_status") {
      queryClient.invalidateQueries({ queryKey: ["runs"] });
    }
  });

  if (isLoading) {
    return <div className="p-8 text-gray-500">Loading...</div>;
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-white mb-6">Recent Runs</h1>
      {runs.length === 0 ? (
        <div className="text-gray-500 text-sm">
          No runs yet.{" "}
          <Link to="/pipelines" className="text-indigo-400 hover:underline">
            Trigger a pipeline
          </Link>{" "}
          to get started.
        </div>
      ) : (
        <div className="space-y-1">
          {runs.map((run) => (
            <RunRow key={run.id} run={run} />
          ))}
        </div>
      )}
    </div>
  );
}
