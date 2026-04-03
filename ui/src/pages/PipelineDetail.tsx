import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { ReactFlow, Background, Handle, Position, type Node, type Edge, type NodeProps } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ArrowLeft, Play, Pencil, Clock, CheckSquare, GitBranch, Copy, Check } from "lucide-react";
import { api } from "../lib/api.ts";
import type { ApiPipeline, ApiPipelineStep, ApiPipelineRun } from "@zerohand/shared";

// ── Status helpers ────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  queued: "text-slate-400 bg-slate-700/30 border border-slate-700/50",
  running: "text-sky-400 bg-sky-500/10 border border-sky-500/20",
  completed: "text-emerald-400 bg-emerald-500/10 border border-emerald-500/20",
  failed: "text-rose-400 bg-rose-500/10 border border-rose-500/20",
  cancelled: "text-slate-400 bg-slate-700/30 border border-slate-700/50",
  paused: "text-amber-400 bg-amber-500/10 border border-amber-500/20",
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
    <div className="bg-slate-900 border border-slate-700/60 rounded-xl p-4 w-80 shadow-lg">
      {step.stepIndex > 0 && (
        <Handle type="target" position={Position.Top} className="!bg-sky-500 !w-2 !h-2 !border-0" />
      )}

      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-sky-500 flex items-center justify-center text-xs font-bold text-slate-950">
          {step.stepIndex + 1}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-white">{step.name}</div>
          {step.skillName && (
            <div className="text-xs text-sky-400 mt-0.5">
              skill: {step.skillName}
            </div>
          )}
          {preview && (
            <div className="text-xs text-slate-500 mt-1.5 font-mono leading-relaxed">{preview}</div>
          )}
          <div className="flex items-center gap-2 mt-2">
            <span className="text-xs text-slate-600 flex items-center gap-1"><Clock size={10} /> {step.timeoutSeconds}s</span>
            {step.approvalRequired && (
              <span className="text-xs text-amber-400 flex items-center gap-0.5">
                <CheckSquare size={10} /> approval
              </span>
            )}
          </div>
        </div>
      </div>

      {!isLast && (
        <Handle type="source" position={Position.Bottom} className="!bg-sky-500 !w-2 !h-2 !border-0" />
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
    <div className="h-[500px] rounded-xl overflow-hidden border border-slate-800/60">
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
        style={{ background: "#0f172a" }}
      >
        <Background color="#1e293b" gap={24} />
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
      <div className="bg-slate-900 border border-slate-700/60 rounded-2xl p-6 w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-white mb-4">Run: {pipeline.name}</h2>
        {fields.length === 0 ? (
          <p className="text-sm text-slate-500 mb-4">No inputs required.</p>
        ) : (
          <div className="space-y-4 mb-4">
            {fields.map(([key, prop]) => (
              <div key={key}>
                <label className="block text-sm text-slate-400 mb-1">
                  {key}{required.has(key) && <span className="text-rose-400 ml-1">*</span>}
                </label>
                {prop.description && <p className="text-xs text-slate-600 mb-1">{prop.description}</p>}
                <input
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
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
          <button className="px-4 py-2 text-sm text-slate-400 hover:text-white" onClick={onClose}>Cancel</button>
          <button
            className="px-4 py-2 bg-sky-500 hover:bg-sky-400 text-slate-950 text-sm font-bold rounded-xl disabled:opacity-50"
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
    return <p className="text-sm text-slate-600">No runs yet.</p>;
  }

  return (
    <div className="space-y-2">
      {runs.slice(0, 10).map((run) => {
        const colorClass = STATUS_COLORS[run.status] ?? "text-slate-400 bg-slate-700/30 border border-slate-700/50";
        const duration = run.startedAt && run.finishedAt
          ? Math.round((new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime()) / 1000)
          : null;
        return (
          <Link
            key={run.id}
            to={`/runs/${run.id}`}
            className="flex items-center gap-3 px-4 py-2.5 bg-slate-900/50 border border-slate-800/60 rounded-xl hover:border-slate-700 transition-colors"
          >
            <span className={`text-xs font-medium px-2 py-0.5 rounded-md ${colorClass}`}>
              {run.status}
            </span>
            <span className="text-xs text-slate-500 capitalize">{run.triggerType}</span>
            <span className="text-xs text-slate-600 flex-1 text-right">
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
  const [copied, setCopied] = useState(false);

  const { data: pipeline, isLoading, error } = useQuery({
    queryKey: ["pipeline", id],
    queryFn: () => api.getPipeline(id!),
    enabled: !!id,
  });

  const { data: packages = [] } = useQuery({
    queryKey: ["packages"],
    queryFn: () => api.listInstalledPackages(),
  });

  if (isLoading) return <div className="p-8 text-slate-500">Loading...</div>;
  if (error || !pipeline) return <div className="p-8 text-rose-400">Pipeline not found.</div>;

  const isFromPackage = packages.some((pkg) => pkg.pipelineId === pipeline.id);
  const exportCmd = `zerohand packages export "${pipeline.name}"`;

  function handleCopy() {
    navigator.clipboard.writeText(exportCmd).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="p-8 max-w-4xl">
      {/* Header */}
      <div className="mb-6">
        <Link to="/pipelines" className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 mb-4 transition-colors">
          <ArrowLeft size={12} /> Pipelines
        </Link>
        <div className="flex items-start gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <GitBranch size={20} className="text-sky-400 flex-shrink-0" />
              <h1 className="text-2xl font-bold text-white">{pipeline.name}</h1>
              <span className="text-xs text-slate-500 px-2 py-0.5 bg-slate-800 border border-slate-700/50 rounded-full">{pipeline.status}</span>
            </div>
            {pipeline.description && (
              <p className="text-sm text-slate-500 mt-1 ml-8">{pipeline.description}</p>
            )}
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <Link
              to={`/pipelines/${id}/edit`}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium rounded-xl transition-colors"
            >
              <Pencil size={13} />
              Edit
            </Link>
            <button
              className="flex items-center gap-1.5 px-3 py-2 bg-sky-500 hover:bg-sky-400 text-slate-950 text-sm font-bold rounded-xl transition-colors"
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
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
          Steps ({pipeline.steps.length})
        </h2>
        {pipeline.steps.length === 0 ? (
          <div className="text-slate-600 text-sm border border-dashed border-slate-800 rounded-xl p-8 text-center">
            No steps defined.{" "}
            <Link to={`/pipelines/${id}/edit`} className="text-sky-400 hover:text-sky-300">
              Add steps →
            </Link>
          </div>
        ) : (
          <PipelineDAG pipeline={pipeline} />
        )}
      </div>

      {/* Export snippet */}
      {!isFromPackage && (
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
            Export
          </h2>
          <div className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 flex items-center gap-3">
            <code className="font-mono text-xs text-sky-300 flex-1">{exportCmd}</code>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors flex-shrink-0"
              title="Copy to clipboard"
            >
              {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      )}

      {/* Recent runs */}
      <div>
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
          Recent Runs
        </h2>
        <RecentRuns pipelineId={pipeline.id} />
      </div>

      {showRun && <RunModal pipeline={pipeline} onClose={() => setShowRun(false)} />}
    </div>
  );
}
