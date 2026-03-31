import { useQuery } from "@tanstack/react-query";
import { Bot, DollarSign } from "lucide-react";
import { api } from "../lib/api.ts";
import type { ApiWorker } from "@zerohand/shared";

const STATUS_COLORS: Record<string, string> = {
  idle: "text-gray-400",
  active: "text-green-400",
  paused: "text-yellow-400",
  error: "text-red-400",
};

function WorkerCard({ worker }: { worker: ApiWorker }) {
  const statusColor = STATUS_COLORS[worker.status] ?? "text-gray-400";
  const budgetUsedPct = worker.budgetMonthlyCents > 0
    ? Math.round((worker.spentMonthlyCents / worker.budgetMonthlyCents) * 100)
    : 0;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-5">
      <div className="flex items-start gap-3 mb-3">
        <Bot size={18} className="text-indigo-400 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-100">{worker.name}</span>
            <span className={`text-xs ${statusColor}`}>{worker.status}</span>
          </div>
          {worker.description && (
            <div className="text-xs text-gray-500 mt-0.5">{worker.description}</div>
          )}
        </div>
      </div>

      <div className="text-xs text-gray-600 space-y-1">
        <div>
          <span className="text-gray-500">Model:</span>{" "}
          <span className="text-gray-400">{worker.modelProvider}/{worker.modelName}</span>
        </div>
        {worker.skills.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-gray-500">Skills:</span>
            {worker.skills.map((s) => (
              <span key={s} className="bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded text-xs">
                {s}
              </span>
            ))}
          </div>
        )}
        {worker.budgetMonthlyCents > 0 && (
          <div className="flex items-center gap-1.5 mt-2">
            <DollarSign size={11} className="text-gray-600" />
            <div className="flex-1 bg-gray-800 rounded-full h-1.5">
              <div
                className={`h-1.5 rounded-full ${budgetUsedPct > 80 ? "bg-red-500" : "bg-indigo-500"}`}
                style={{ width: `${Math.min(100, budgetUsedPct)}%` }}
              />
            </div>
            <span className="text-gray-500">
              ${(worker.spentMonthlyCents / 100).toFixed(2)} / ${(worker.budgetMonthlyCents / 100).toFixed(2)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Workers() {
  const { data: workers = [], isLoading } = useQuery({
    queryKey: ["workers"],
    queryFn: () => api.listWorkers(),
  });

  if (isLoading) return <div className="p-8 text-gray-500">Loading...</div>;

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-white mb-6">Workers</h1>
      {workers.length === 0 ? (
        <div className="text-gray-500 text-sm">No workers configured.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {workers.map((w) => (
            <WorkerCard key={w.id} worker={w} />
          ))}
        </div>
      )}
    </div>
  );
}
