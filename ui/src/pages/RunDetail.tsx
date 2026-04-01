import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, Link } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import { ArrowLeft, ChevronDown, ChevronRight } from "lucide-react";
import { api } from "../lib/api.ts";
import { useWebSocket } from "../lib/ws.ts";
import OutputPreview from "../components/OutputPreview.tsx";
import ChatPanel from "../components/ChatPanel.tsx";
import type { WsMessage, ApiStepRun, WsIncomingChat } from "@zerohand/shared";

const STATUS_COLORS: Record<string, string> = {
  queued: "border-gray-600 text-gray-400",
  running: "border-blue-500 text-blue-400",
  awaiting_approval: "border-yellow-500 text-yellow-400",
  completed: "border-green-500 text-green-400",
  failed: "border-red-500 text-red-400",
  cancelled: "border-gray-600 text-gray-400",
};

interface LiveStep {
  stepIndex: number;
  stepRunId: string;
  status: string;
  text: string;
}

function StepCard({
  step,
  liveData,
  onSend,
}: {
  step: ApiStepRun;
  liveData?: LiveStep;
  onSend: (msg: WsIncomingChat) => void;
}) {
  const [expanded, setExpanded] = useState(step.status === "running" || step.status === "failed");
  const prevStatus = useRef(step.status);
  const colorClass = STATUS_COLORS[step.status] ?? "border-gray-600 text-gray-400";
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
    <div className={`border rounded-lg overflow-hidden ${colorClass.split(" ")[0]}`}>
      <button
        className="w-full flex items-center gap-3 px-4 py-3 bg-gray-900 hover:bg-gray-800 transition-colors text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span className="text-sm font-medium text-gray-200">
          Step {step.stepIndex + 1}
        </span>
        <span className={`ml-auto text-xs font-medium ${colorClass.split(" ").slice(1).join(" ")}`}>
          {step.status}
        </span>
        {step.startedAt && step.finishedAt && (
          <span className="text-xs text-gray-500 ml-2">
            {Math.round(
              (new Date(step.finishedAt).getTime() - new Date(step.startedAt).getTime()) / 1000,
            )}s
          </span>
        )}
      </button>

      {expanded && isRunning && liveData?.stepRunId && (
        <div className="bg-gray-900 px-4 pt-3 pb-2 border-b border-gray-800">
          <ChatPanel stepRunId={liveData.stepRunId} onSend={onSend} />
        </div>
      )}

      {expanded && (
        <div className="bg-gray-950 p-4" ref={textRef}>
          {displayText ? (
            isRunning ? (
              <pre className="text-xs text-gray-300 whitespace-pre-wrap font-mono max-h-96 overflow-y-auto leading-relaxed">
                {displayText}
              </pre>
            ) : (
              <OutputPreview text={displayText} compact />
            )
          ) : (
            <span className="text-xs text-gray-600 italic">
              {step.status === "queued" ? "Waiting to start..." : "No output yet"}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export default function RunDetail() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [liveSteps, setLiveSteps] = useState<Map<number, LiveStep>>(new Map());

  const { data: run } = useQuery({
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

  const { send: wsSend } = useWebSocket((msg: WsMessage) => {
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

  if (!run) return <div className="p-8 text-gray-500">Loading...</div>;

  const statusColor =
    run.status === "completed"
      ? "text-green-400"
      : run.status === "failed"
      ? "text-red-400"
      : run.status === "running"
      ? "text-blue-400"
      : "text-gray-400";

  return (
    <div className="p-8 max-w-4xl">
      <Link to="/dashboard" className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-300 mb-6">
        <ArrowLeft size={14} />
        Back to Dashboard
      </Link>

      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-xl font-bold text-white">
            {run.pipelineName ?? run.pipelineId}
          </h1>
          <span className={`text-sm font-medium ${statusColor}`}>{run.status}</span>
        </div>
        <div className="text-xs text-gray-500">
          {run.triggerType} · {new Date(run.createdAt).toLocaleString()}
          {run.finishedAt && (
            <> · {Math.round((new Date(run.finishedAt).getTime() - new Date(run.startedAt ?? run.createdAt).getTime()) / 1000)}s total</>
          )}
        </div>
        {Object.keys(run.inputParams).length > 0 && (
          <div className="mt-3 text-xs">
            <span className="text-gray-500 mr-2">Inputs:</span>
            <code className="text-gray-300 bg-gray-900 px-2 py-1 rounded">
              {JSON.stringify(run.inputParams)}
            </code>
          </div>
        )}
      </div>

      {run.error && (
        <div className="mb-6 p-4 bg-red-950 border border-red-800 rounded-lg text-sm text-red-300">
          {run.error}
        </div>
      )}

      <div className="space-y-3">
        {steps.map((step) => (
          <StepCard
            key={step.id}
            step={step}
            liveData={liveSteps.get(step.stepIndex)}
            onSend={wsSend}
          />
        ))}
        {steps.length === 0 && run.status === "queued" && (
          <div className="text-sm text-gray-500">Waiting to start...</div>
        )}
      </div>
    </div>
  );
}
