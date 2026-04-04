import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, Link } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import { ArrowLeft, ChevronDown, ChevronRight, Square } from "lucide-react";
import { api } from "../lib/api.ts";
import { statusColor as getStatusColor, STATUS_BORDER_COLORS, STATUS_TEXT_COLORS } from "../components/StatusBadge.tsx";
import LoadingState from "../components/LoadingState.tsx";
import { useWebSocket } from "../lib/ws.ts";
import OutputPreview from "../components/OutputPreview.tsx";
import type { WsMessage, ApiStepRun } from "@zerohand/shared";



interface LiveStep {
  stepIndex: number;
  stepRunId: string;
  status: string;
  text: string;
}

function StepCard({
  step,
  name,
  liveData,
}: {
  step: ApiStepRun;
  name?: string;
  liveData?: LiveStep;
}) {
  const [expanded, setExpanded] = useState(step.status === "running" || step.status === "failed");
  const prevStatus = useRef(step.status);
  const colorClass = STATUS_TEXT_COLORS[step.status] ?? "text-slate-400";
  const leftBorderColor = STATUS_BORDER_COLORS[step.status] ?? "border-l-slate-700";
  const textRef = useRef<HTMLDivElement>(null);

  const displayText = liveData?.text ?? (step.output as { text?: string })?.text ?? step.error ?? "";
  const isRunning = step.status === "running";

  useEffect(() => {
    if (prevStatus.current !== step.status) {
      prevStatus.current = step.status;
      if (step.status === "running") setExpanded(true);
      if (step.status === "completed") setExpanded(false);
    }
  }, [step.status]);

  useEffect(() => {
    if (isRunning && textRef.current) {
      textRef.current.scrollTop = textRef.current.scrollHeight;
    }
  }, [displayText, isRunning]);

  return (
    <div className={`border border-slate-800 border-l-4 ${leftBorderColor} rounded-xl overflow-hidden`}>
      <button
        className="w-full flex items-center gap-3 px-4 py-3 bg-slate-900/40 hover:bg-slate-900/60 transition-colors text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span className="text-sm font-medium text-slate-200">
          {name || `Step ${step.stepIndex + 1}`}
        </span>
        <span className={`ml-auto text-xs font-medium ${colorClass.split(" ").slice(1).join(" ")}`}>
          {step.status}
        </span>
        {step.startedAt && step.finishedAt && (
          <span className="text-xs text-slate-500 ml-2">
            {Math.round(
              (new Date(step.finishedAt).getTime() - new Date(step.startedAt).getTime()) / 1000,
            )}s
          </span>
        )}
      </button>

      {expanded && (
        <div className="bg-slate-950 p-4" ref={textRef}>
          {displayText ? (
            isRunning ? (
              <pre className="text-xs text-slate-300 whitespace-pre-wrap font-mono max-h-96 overflow-y-auto leading-relaxed">
                {displayText}
              </pre>
            ) : (
              <OutputPreview text={displayText} compact />
            )
          ) : (
            <span className="text-xs text-slate-600 italic">
              {step.status === "queued" ? "Waiting to start..." : "No output yet"}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

const EVENT_COLORS: Record<string, string> = {
  run_start: "text-slate-400",
  run_end: "text-slate-400",
  step_start: "text-sky-400",
  step_end: "text-emerald-400",
  prompt: "text-violet-400",
  tool_call: "text-amber-400",
  tool_result: "text-amber-300",
  llm_delta: "text-slate-500",
  llm_output: "text-emerald-300",
  error: "text-rose-400",
};

function DebugLogTab({ runId }: { runId: string }) {
  const { data: entries = [] } = useQuery({
    queryKey: ["run-log", runId],
    queryFn: () => api.getRunLog(runId),
    refetchInterval: 5000,
  });

  if (entries.length === 0) {
    return (
      <div className="text-sm text-slate-500 italic">
        No log entries. Set <code className="bg-slate-900 px-1 rounded">LOG_LEVEL=info</code> or <code className="bg-slate-900 px-1 rounded">LOG_LEVEL=debug</code> to enable logging.
      </div>
    );
  }

  return (
    <div className="space-y-1 font-mono text-xs overflow-x-auto">
      {entries.map((entry, i) => {
        const { ts, event, ...rest } = entry;
        const color = EVENT_COLORS[event as string] ?? "text-slate-400";
        const tsStr = typeof ts === "string" ? new Date(ts).toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "";
        return (
          <div key={i} className="flex gap-3 py-0.5 border-b border-slate-900 content-auto">
            <span className="text-slate-600 shrink-0 w-20 sm:w-28">{tsStr}</span>
            <span className={`shrink-0 w-24 ${color}`}>{String(event)}</span>
            <span className="text-slate-400 truncate">{JSON.stringify(rest)}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function RunDetail() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [liveSteps, setLiveSteps] = useState<Map<number, LiveStep>>(new Map());
  const [activeTab, setActiveTab] = useState<"steps" | "log">("steps");

  const { data: run, error: runError } = useQuery({
    queryKey: ["run", id],
    queryFn: () => api.getRun(id!),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "running" || status === "queued" ? 3000 : false;
    },
  });

  const { data: steps = [] } = useQuery({
    queryKey: ["run-steps", id],
    queryFn: () => api.getRunSteps(id!),
    refetchInterval: (query) => {
      const hasActiveStep = query.state.data?.some(
        (s) => s.status === "running" || s.status === "queued",
      );
      return hasActiveStep ? 2000 : false;
    },
    enabled: !!run,
  });

  const { data: pipelineSteps = [] } = useQuery({
    queryKey: ["pipeline-steps", run?.pipelineId],
    queryFn: () => api.listSteps(run!.pipelineId),
    enabled: !!run,
    staleTime: Infinity,
  });

  useWebSocket((msg: WsMessage) => {
    if (msg.type === "run_status" && msg.pipelineRunId === id) {
      queryClient.invalidateQueries({ queryKey: ["run", id] });
      queryClient.invalidateQueries({ queryKey: ["run-steps", id] });
    }

    if (msg.type === "step_status" && msg.pipelineRunId === id) {
      queryClient.invalidateQueries({ queryKey: ["run-steps", id] });
      setLiveSteps((prev) => {
        const next = new Map(prev);
        const existing = next.get(msg.stepIndex);
        next.set(msg.stepIndex, {
          stepIndex: msg.stepIndex,
          stepRunId: msg.stepRunId,
          status: msg.status,
          text: existing?.text ?? "",
        });
        return next;
      });
    }

    if (msg.type === "step_event" && msg.pipelineRunId === id && msg.eventType === "text_delta") {
      setLiveSteps((prev) => {
        const next = new Map(prev);
        const existing = next.get(msg.stepIndex);
        next.set(msg.stepIndex, {
          stepIndex: msg.stepIndex,
          stepRunId: msg.stepRunId,
          status: existing?.status ?? "running",
          text: (existing?.text ?? "") + (msg.message ?? ""),
        });
        return next;
      });
    }
  });

  if (!run) return <LoadingState />;

  const statusColor = getStatusColor(run.status);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl pt-14 lg:pt-8">
      <Link to="/dashboard" className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 mb-5 transition-colors">
        <ArrowLeft size={12} />
        Back to Dashboard
      </Link>

      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-xl font-semibold font-display text-white tracking-tight">
            {run.pipelineName ?? run.pipelineId}
          </h1>
          <span className={`text-sm font-medium ${statusColor}`}>{run.status}</span>
          {(run.status === "running" || run.status === "queued") && (
            <button
              className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-rose-400 border border-rose-800/60 rounded-lg hover:bg-rose-950/40 transition-colors"
              aria-label="Stop run"
              onClick={() => {
                void api.cancelRun(id!).then(() => {
                  queryClient.invalidateQueries({ queryKey: ["run", id] });
                  queryClient.invalidateQueries({ queryKey: ["run-steps", id] });
                });
              }}
            >
              <Square size={11} />
              Stop
            </button>
          )}
        </div>
        <div className="text-xs text-slate-500 tabular-nums">
          {run.triggerType} · {new Date(run.createdAt).toLocaleString()}
          {run.finishedAt && (
            <> · {Math.round((new Date(run.finishedAt).getTime() - new Date(run.startedAt ?? run.createdAt).getTime()) / 1000)}s total</>
          )}
        </div>
        {Object.keys(run.inputParams).length > 0 && (
          <div className="mt-3 text-xs">
            <span className="text-slate-500 mr-2">Inputs:</span>
            <code className="text-slate-300 bg-slate-900 px-2 py-1 rounded">
              {JSON.stringify(run.inputParams)}
            </code>
          </div>
        )}
      </div>

      {run.error && (
        <div className="mb-6 p-4 bg-rose-950/30 border border-rose-900/50 rounded-lg text-sm text-rose-300">
          {run.error}
        </div>
      )}

      <div className="flex gap-1 mb-4 border-b border-slate-800">
        <button
          className={`px-4 py-2 text-sm font-medium transition-colors ${activeTab === "steps" ? "text-white border-b-2 border-sky-500" : "text-slate-500 hover:text-slate-300"}`}
          onClick={() => setActiveTab("steps")}
        >
          Steps
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium transition-colors ${activeTab === "log" ? "text-white border-b-2 border-sky-500" : "text-slate-500 hover:text-slate-300"}`}
          onClick={() => setActiveTab("log")}
        >
          Debug Log
        </button>
      </div>

      {activeTab === "steps" && (
        <div className="space-y-3 animate-fade-in">
          {pipelineSteps.map((ps) => {
            const stepRun = steps.find((s) => s.stepIndex === ps.stepIndex);
            if (stepRun) {
              return (
                <StepCard
                  key={stepRun.id}
                  step={stepRun}
                  name={ps.name}
                  liveData={liveSteps.get(stepRun.stepIndex)}
                />
              );
            }
            return (
              <div
                key={ps.id}
                className="border border-slate-800 border-l-4 border-l-slate-800 rounded-xl overflow-hidden opacity-40"
              >
                <div className="flex items-center gap-3 px-4 py-3 bg-slate-900/40">
                  <ChevronRight size={14} className="text-slate-600" />
                  <span className="text-sm font-medium text-slate-400">{ps.name || `Step ${ps.stepIndex + 1}`}</span>
                  <span className="ml-auto text-xs font-medium text-slate-600">pending</span>
                </div>
              </div>
            );
          })}
          {pipelineSteps.length === 0 && steps.length === 0 && run.status === "queued" && (
            <div className="text-sm text-slate-500">Waiting to start...</div>
          )}
        </div>
      )}

      {activeTab === "log" && <div className="animate-fade-in"><DebugLogTab runId={id!} /></div>}
    </div>
  );
}
