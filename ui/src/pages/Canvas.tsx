import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ExternalLink, Image } from "lucide-react";
import { api } from "../lib/api.ts";
import OutputPreview from "../components/OutputPreview.tsx";
import type { ApiStepRun } from "@zerohand/shared";

function hasFileOutput(step: ApiStepRun): boolean {
  const text = (step.output as { text?: string })?.text ?? "";
  return text.match(/\.(png|jpg|jpeg|gif|webp|md)$/i) !== null;
}

function OutputCard({
  step,
  runId,
  pipelineName,
  runDate,
}: {
  step: ApiStepRun;
  runId: string;
  pipelineName: string;
  runDate: string;
}) {
  const text = (step.output as { text?: string })?.text ?? "";

  return (
    <div className="bg-slate-900/50 border border-slate-800/60 rounded-2xl overflow-hidden flex flex-col card-glow">
      <div className="px-4 py-3 border-b border-slate-800/60 flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium text-slate-200 truncate">{pipelineName}</div>
          <div className="text-xs text-slate-500">
            Step {step.stepIndex + 1} · {new Date(runDate).toLocaleDateString()}
          </div>
        </div>
        <Link
          to={`/runs/${runId}`}
          className="text-sky-400 hover:text-sky-300 flex-shrink-0 transition-colors"
          title="View run"
        >
          <ExternalLink size={12} />
        </Link>
      </div>
      <div className="p-4 flex-1">
        <OutputPreview text={text} compact />
      </div>
    </div>
  );
}

function RunOutputs({ runId, pipelineName, runDate }: { runId: string; pipelineName: string; runDate: string }) {
  const { data: steps = [] } = useQuery({
    queryKey: ["run-steps", runId],
    queryFn: () => api.getRunSteps(runId),
  });

  const outputSteps = steps.filter((s) => s.status === "completed" && hasFileOutput(s));
  if (outputSteps.length === 0) return null;

  return (
    <>
      {outputSteps.map((step) => (
        <OutputCard
          key={step.id}
          step={step}
          runId={runId}
          pipelineName={pipelineName}
          runDate={runDate}
        />
      ))}
    </>
  );
}

export default function Canvas() {
  const { data: runs = [], isLoading } = useQuery({
    queryKey: ["runs"],
    queryFn: () => api.listRuns(),
    refetchInterval: 30_000,
  });

  const completedRuns = runs.filter((r) => r.status === "completed").slice(0, 20);

  if (isLoading) return <div className="p-8 text-slate-500">Loading...</div>;

  return (
    <div className="p-8">
      <div className="flex items-center gap-3 mb-6">
        <Image size={20} className="text-sky-400" />
        <h1 className="text-2xl font-display font-bold text-white tracking-tight">Canvas</h1>
        <span className="text-sm text-slate-500">{completedRuns.length} completed runs</span>
      </div>

      {completedRuns.length === 0 ? (
        <div className="text-slate-500 text-sm">
          No completed runs yet.{" "}
          <Link to="/pipelines" className="text-sky-400 hover:text-sky-300 transition-colors">
            Trigger a pipeline
          </Link>{" "}
          to generate output.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {completedRuns.map((run) => (
            <RunOutputs
              key={run.id}
              runId={run.id}
              pipelineName={run.pipelineName ?? run.pipelineId}
              runDate={run.createdAt}
            />
          ))}
        </div>
      )}
    </div>
  );
}
