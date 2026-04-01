import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { ReactFlow, Background, Handle, Position, type Node, type Edge, type NodeProps } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ArrowLeft, Play, Pencil, Clock, CheckSquare, GitBranch } from "lucide-react";
import { api } from "../lib/api.ts";
import type { ApiPipeline, ApiPipelineStep, ApiPipelineRun } from "@zerohand/shared";

// ── Status helpers ────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  queued: "text-yellow-400 bg-yellow-900/30",
  running: "text-blue-400 bg-blue-900/30",
  completed: "text-green-400 bg-green-900/30",
  failed: "text-red-400 bg-red-900/30",
  cancelled: "text-gray-400 bg-gray-800",
  paused: "text-orange-400 bg-orange-900/30",
};

// ── Custom reactflow step node ────────────────────────────────────────────────

interface StepNodeData extends Record<string, unknown> {
  step: ApiPipelineStep;
  isLast: boolean;
}

function StepNode({ data }: NodeProps<Node<StepNodeData>>) {
  const { step, isLast } = data;
  const preview = step.promptTemplate.length > 80
    ? step.promptTemplate.slice(0, 80) + "…"
    : step.promptTemplate;

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 w-80 shadow-lg">
      {step.stepIndex > 0 && (
        <Handle type="target" position={Position.Top} className="!bg-indigo-500 !w-2 !h-2 !border-0" />
      )}

      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center text-xs font-bold text-white">
          {step.stepIndex + 1}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-white">{step.name}</div>
          {(step.skillName || step.workerName) && (
            <div className="text-xs text-indigo-400 mt-0.5">
              {step.skillName ? `skill: ${step.skillName}` : step.workerName}
            </div>
          )}
          {preview && (
            <div className="text-xs text-gray-500 mt-1.5 font-mono leading-relaxed">{preview}</div>
          )}
          <div className="flex items-center gap-2 mt-2">
            <span className="text-xs text-gray-600 flex items-center gap-1"><Clock size={10} /> {step.timeoutSeconds}s</span>
            {step.approvalRequired && (
              <span className="text-xs text-yellow-500 flex items-center gap-0.5">
                <CheckSquare size={10} /> approval
              </span>
            )}
          </div>
        </div>
      </div>

      {!isLast && (
        <Handle type="source" position={Position.Bottom} className="!bg-indigo-500 !w-2 !h-2 !border-0" />
      )}
    </div>
  );
}

const nodeTypes = { stepNode: StepNode };

// ── DAG component ─────────────────────────────────────────────────────────────

function PipelineDAG({ pipeline }: { pipeline: ApiPipeline }) {
  const steps = [...pipeline.steps].sort((a, b) => a.stepIndex - b.stepIndex);

  const nodes: Node<StepNodeData>[] = steps.map((step, i) => ({
    id: `step-${step.stepIndex}`,
    type: "stepNode",
    position: { x: 0, y: i * 200 },
    data: { step, isLast: i === steps.length - 1 },
    draggable: false,
    selectable: false,
  }));

  const edges: Edge[] = steps.slice(0, -1).map((step) => ({
    id: `edge-${step.stepIndex}`,
    source: `step-${step.stepIndex}`,
    target: `step-${step.stepIndex + 1}`,
    style: { stroke: "#4f46e5", strokeWidth: 2 },
    animated: false,
  }));

  return (
    <div className="h-[500px] rounded-lg overflow-hidden border border-gray-800">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag
        zoomOnScroll
        zoomOnPinch
        zoomOnDoubleClick={false}
        minZoom={0.3}
        maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
        style={{ background: "#030712" }}
      >
        <Background color="#1f2937" gap={24} />
      </ReactFlow>
    </div>
  );
}

// ── Run modal ─────────────────────────────────────────────────────────────────

interface JsonSchemaProperty { type?: string; description?: string }
interface JsonSchema { type?: string; properties?: Record<string, JsonSchemaProperty>; required?: string[] }

function RunModal({ pipeline, onClose }: { pipeline: ApiPipeline; onClose: () => void }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const schema = (pipeline.inputSchema ?? null) as JsonSchema | null;
  const fields = schema?.properties ? Object.entries(schema.properties) : [];
  const required = new Set(schema?.required ?? []);
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map(([k]) => [k, ""])),
  );

  const trigger = useMutation({
    mutationFn: () => {
      const params = Object.fromEntries(Object.entries(values).filter(([, v]) => v.trim() !== ""));
      return api.triggerRun(pipeline.id, params);
    },
    onSuccess: (run) => {
      queryClient.invalidateQueries({ queryKey: ["runs"] });
      onClose();
      navigate(`/runs/${run.id}`);
    },
  });

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-white mb-4">Run: {pipeline.name}</h2>
        {fields.length === 0 ? (
          <p className="text-sm text-gray-500 mb-4">No inputs required.</p>
        ) : (
          <div className="space-y-4 mb-4">
            {fields.map(([key, prop]) => (
              <div key={key}>
                <label className="block text-sm text-gray-400 mb-1">
                  {key}{required.has(key) && <span className="text-red-400 ml-1">*</span>}
                </label>
                {prop.description && <p className="text-xs text-gray-600 mb-1">{prop.description}</p>}
                <input
                  className="w-full bg-gray-800 border border-gray-600 rounded-md px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
                  placeholder={prop.description ?? key}
                  value={values[key] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
                  onKeyDown={(e) => e.key === "Enter" && trigger.mutate()}
                />
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-3 justify-end">
          <button className="px-4 py-2 text-sm text-gray-400 hover:text-white" onClick={onClose}>Cancel</button>
          <button
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-md disabled:opacity-50"
            disabled={trigger.isPending}
            onClick={() => trigger.mutate()}
          >
            {trigger.isPending ? "Starting..." : "Run Pipeline"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Recent runs ───────────────────────────────────────────────────────────────

function RecentRuns({ pipelineId }: { pipelineId: string }) {
  const { data: runs = [] } = useQuery({
    queryKey: ["runs", pipelineId],
    queryFn: () => api.listRuns(pipelineId),
    refetchInterval: 10_000,
  });

  if (runs.length === 0) {
    return <p className="text-sm text-gray-600">No runs yet.</p>;
  }

  return (
    <div className="space-y-2">
      {runs.slice(0, 10).map((run) => {
        const colorClass = STATUS_COLORS[run.status] ?? "text-gray-400 bg-gray-800";
        const duration = run.startedAt && run.finishedAt
          ? Math.round((new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime()) / 1000)
          : null;
        return (
          <Link
            key={run.id}
            to={`/runs/${run.id}`}
            className="flex items-center gap-3 px-4 py-2.5 bg-gray-900 border border-gray-800 rounded-lg hover:border-gray-700 transition-colors"
          >
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${colorClass}`}>
              {run.status}
            </span>
            <span className="text-xs text-gray-500 capitalize">{run.triggerType}</span>
            <span className="text-xs text-gray-600 flex-1 text-right">
              {new Date(run.createdAt).toLocaleString()}
              {duration !== null && ` · ${duration}s`}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PipelineDetail() {
  const { id } = useParams<{ id: string }>();
  const [showRun, setShowRun] = useState(false);

  const { data: pipeline, isLoading, error } = useQuery({
    queryKey: ["pipeline", id],
    queryFn: () => api.getPipeline(id!),
    enabled: !!id,
  });

  if (isLoading) return <div className="p-8 text-gray-500">Loading...</div>;
  if (error || !pipeline) return <div className="p-8 text-red-400">Pipeline not found.</div>;

  return (
    <div className="p-8 max-w-4xl">
      {/* Header */}
      <div className="mb-6">
        <Link to="/pipelines" className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 mb-4">
          <ArrowLeft size={12} /> Pipelines
        </Link>
        <div className="flex items-start gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <GitBranch size={20} className="text-indigo-400 flex-shrink-0" />
              <h1 className="text-2xl font-bold text-white">{pipeline.name}</h1>
              <span className="text-xs text-gray-500 px-2 py-0.5 bg-gray-800 rounded-full">{pipeline.status}</span>
            </div>
            {pipeline.description && (
              <p className="text-sm text-gray-500 mt-1 ml-8">{pipeline.description}</p>
            )}
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <Link
              to={`/pipelines/${id}/edit`}
              className="flex items-center gap-1.5 px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium rounded-md transition-colors"
            >
              <Pencil size={13} />
              Edit
            </Link>
            <button
              className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-md transition-colors"
              onClick={() => setShowRun(true)}
            >
              <Play size={13} />
              Run
            </button>
          </div>
        </div>
      </div>

      {/* DAG */}
      <div className="mb-8">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
          Steps ({pipeline.steps.length})
        </h2>
        {pipeline.steps.length === 0 ? (
          <div className="text-gray-600 text-sm border border-dashed border-gray-800 rounded-lg p-8 text-center">
            No steps defined.{" "}
            <Link to={`/pipelines/${id}/edit`} className="text-indigo-400 hover:text-indigo-300">
              Add steps →
            </Link>
          </div>
        ) : (
          <PipelineDAG pipeline={pipeline} />
        )}
      </div>

      {/* Recent runs */}
      <div>
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
          Recent Runs
        </h2>
        <RecentRuns pipelineId={pipeline.id} />
      </div>

      {showRun && <RunModal pipeline={pipeline} onClose={() => setShowRun(false)} />}
    </div>
  );
}
