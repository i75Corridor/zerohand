import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ExternalLink, Layers, ChevronDown, ChevronRight } from "lucide-react";
import { api } from "../lib/api.ts";
import LoadingState from "../components/LoadingState.tsx";
import OutputPreview from "../components/OutputPreview.tsx";
import EmptyState from "../components/EmptyState.tsx";
import PageHeader from "../components/PageHeader.tsx";
import type { ApiStepRun, ApiPipelineRun } from "@pawn/shared";

function getOutputText(step: ApiStepRun): string {
  return (step.output as { text?: string })?.text ?? "";
}

function isImage(step: ApiStepRun): boolean {
  return /\.(png|jpg|jpeg|gif|webp)$/i.test(getOutputText(step).trim());
}

function isMarkdown(step: ApiStepRun): boolean {
  return /\.md$/i.test(getOutputText(step).trim());
}

function hasFileOutput(step: ApiStepRun): boolean {
  return isImage(step) || isMarkdown(step);
}

function ArtifactViewer({ step }: { step: ApiStepRun }) {
  const text = getOutputText(step);
  const label = isImage(step) ? "Illustration" : isMarkdown(step) ? "Article" : `Step ${step.stepIndex + 1}`;

  return (
    <div className="flex flex-col gap-2 min-w-0">
      <div className="text-xs font-medium text-pawn-surface-500 uppercase tracking-wide">{label}</div>
      <div className="flex-1">
        <OutputPreview text={text} />
      </div>
    </div>
  );
}

function RunSection({ run, defaultExpanded }: { run: ApiPipelineRun; defaultExpanded: boolean }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const { data: steps = [], isLoading } = useQuery({
    queryKey: ["run-steps", run.id],
    queryFn: () => api.getRunSteps(run.id),
  });

  const artifacts = steps.filter((s) => s.status === "completed" && hasFileOutput(s));

  if (isLoading || artifacts.length === 0) return null;

  // Sort images before markdown so image appears on the left
  const sorted = [...artifacts].sort((a, b) => {
    if (isImage(a) && !isImage(b)) return -1;
    if (!isImage(a) && isImage(b)) return 1;
    return a.stepIndex - b.stepIndex;
  });

  const hasImg = sorted.some(isImage);
  const hasMd = sorted.some(isMarkdown);
  const isMixed = hasImg && hasMd;

  const topic = typeof run.inputParams?.topic === "string" ? run.inputParams.topic : null;
  const date = new Date(run.createdAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const time = new Date(run.createdAt).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div className="bg-pawn-surface-900 border border-pawn-surface-800 rounded-card overflow-hidden">
      {/* Run header */}
      <button
        className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-pawn-surface-800/30 transition-colors text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? (
          <ChevronDown size={14} className="text-pawn-surface-500 flex-shrink-0" />
        ) : (
          <ChevronRight size={14} className="text-pawn-surface-500 flex-shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-white">{run.pipelineName ?? run.pipelineId}</span>
            {topic && (
              <>
                <span className="text-pawn-surface-700">·</span>
                <span className="text-sm text-pawn-surface-400 truncate">{topic}</span>
              </>
            )}
          </div>
          <div className="text-xs text-pawn-surface-600 mt-0.5">{date} at {time}</div>
        </div>
        <Link
          to={`/runs/${run.id}`}
          className="flex items-center gap-1.5 text-xs text-pawn-surface-500 hover:text-pawn-gold-400 transition-colors flex-shrink-0"
          title="View run detail"
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLink size={12} />
          Run detail
        </Link>
      </button>

      {/* Artifacts */}
      {expanded && (
        <div
          className={
            isMixed
              ? "grid grid-cols-1 md:grid-cols-[2fr_3fr] gap-0 md:divide-x divide-y md:divide-y-0 divide-pawn-surface-800"
              : sorted.length > 1
              ? "grid grid-cols-1 md:grid-cols-2 gap-0 md:divide-x divide-y md:divide-y-0 divide-pawn-surface-800"
              : ""
          }
        >
          {sorted.map((step) => (
            <div key={step.id} className="p-5">
              <ArtifactViewer step={step} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Canvas() {
  const { data: runs = [], isLoading } = useQuery({
    queryKey: ["runs"],
    queryFn: () => api.listRuns(),
    refetchInterval: 30_000,
  });

  const completedRuns = runs
    .filter((r) => r.status === "completed")
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 20);

  if (isLoading) return <LoadingState />;

  return (
    <div className="p-4 sm:p-6 lg:p-10 max-w-6xl pt-14 lg:pt-10">
      <PageHeader
        title="Canvas"
        actions={
          <span className="text-sm text-pawn-surface-500">{completedRuns.length} completed runs</span>
        }
      />

      {completedRuns.length === 0 ? (
        <div className="bg-pawn-surface-900 border border-pawn-surface-800 rounded-card p-6">
          <EmptyState
            icon={Layers}
            title="No endgame yet"
            description="The canvas displays artifacts from completed pipeline runs -- images, markdown, and other generated output. Run a pipeline to see results here."
            actions={[
              { label: "Go to Pipelines", to: "/pipelines" },
            ]}
            hint="Only runs that produce file outputs (images, markdown) appear on the canvas."
          />
        </div>
      ) : (
        <div className="space-y-6">
          {completedRuns.map((run, i) => (
            <RunSection key={run.id} run={run} defaultExpanded={i === 0} />
          ))}
        </div>
      )}
    </div>
  );
}
