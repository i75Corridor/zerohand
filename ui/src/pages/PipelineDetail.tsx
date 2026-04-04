import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { ReactFlow, Background, Handle, Position, type Node, type Edge, type NodeProps } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ArrowLeft, Play, Pencil, Clock, CheckSquare, GitBranch, Copy, Check, Square, Download, Upload, X, Trash2, AlertTriangle } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { api } from "../lib/api.ts";
import StatusBadge from "../components/StatusBadge.tsx";
import LoadingState from "../components/LoadingState.tsx";
import EmptyState from "../components/EmptyState.tsx";
import type { ApiPipeline, ApiPipelineStep, ApiPipelineRun } from "@zerohand/shared";


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
        <Handle type="target" position={Position.Top} className="!bg-indigo-500 !w-2 !h-2 !border-0" />
      )}

      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-500/80 flex items-center justify-center text-xs font-semibold text-white">
          {step.stepIndex + 1}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-white">{step.name}</div>
          {step.skillName && (
            <div className="text-xs text-violet-400 mt-0.5">
              skill: {step.skillName}
            </div>
          )}
          {preview && (
            <div className="text-xs text-slate-500 mt-1.5 font-mono leading-relaxed">{preview}</div>
          )}
          <div className="flex items-center gap-2 mt-2">
            <span className="text-xs text-slate-500 flex items-center gap-1"><Clock size={10} /> {step.timeoutSeconds}s</span>
            {step.approvalRequired && (
              <span className="text-xs text-amber-400 flex items-center gap-0.5">
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
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 z-50 animate-overlay-in" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-slate-900 border border-slate-700/60 rounded-xl p-4 sm:p-6 w-[calc(100%-2rem)] max-w-md shadow-lg animate-scale-in">
          <Dialog.Title className="text-lg font-semibold text-white mb-4">Run: {pipeline.name}</Dialog.Title>
          {fields.length === 0 ? (
            <p className="text-sm text-slate-500 mb-4">No inputs required.</p>
          ) : (
            <div className="space-y-4 mb-4">
              {fields.map(([key, prop]) => (
                <div key={key}>
                  <label className="block text-sm text-slate-400 mb-1">
                    {key}{required.has(key) && <span className="text-rose-400 ml-1">*</span>}
                  </label>
                  {prop.description && <p className="text-xs text-slate-500 mb-1">{prop.description}</p>}
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
              className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white text-sm font-medium rounded-lg disabled:opacity-50"
              disabled={trigger.isPending}
              onClick={() => trigger.mutate()}
            >
              {trigger.isPending ? "Starting..." : "Run Pipeline"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ── Recent runs ───────────────────────────────────────────────────────────────

function RecentRuns({ pipelineId }: { pipelineId: string }) {
  const queryClient = useQueryClient();
  const { data: runs = [] } = useQuery({
    queryKey: ["runs", pipelineId],
    queryFn: () => api.listRuns(pipelineId),
    refetchInterval: 10_000,
  });

  function handleCancel(runId: string) {
    void api.cancelRun(runId).then(() => {
      queryClient.invalidateQueries({ queryKey: ["runs", pipelineId] });
    });
  }

  if (runs.length === 0) {
    return (
      <EmptyState
        compact
        icon={Play}
        title="No runs yet"
        description="Runs will appear here once this pipeline is triggered."
      />
    );
  }

  return (
    <div className="space-y-2">
      {runs.slice(0, 10).map((run) => {
        
        const duration = run.startedAt && run.finishedAt
          ? Math.round((new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime()) / 1000)
          : null;
        const isActive = run.status === "running" || run.status === "queued";
        return (
          <Link
            key={run.id}
            to={`/runs/${run.id}`}
            className="flex items-center gap-3 px-4 py-2.5 bg-slate-900/50 border border-slate-800/60 rounded-xl hover:border-slate-700 transition-colors"
          >
            <StatusBadge status={run.status} />
            <span className="text-xs text-slate-500 capitalize">{run.triggerType}</span>
            <span className="text-xs text-slate-500 flex-1 text-right">
              {new Date(run.createdAt).toLocaleString()}
              {duration !== null && ` · ${duration}s`}
            </span>
            {isActive && (
              <button
                className="flex items-center gap-1 text-xs text-rose-400 hover:text-rose-300 transition-colors shrink-0"
                onClick={(e) => { e.preventDefault(); handleCancel(run.id); }}
                title="Stop run"
                aria-label="Stop run"
              >
                <Square size={11} />
                Stop
              </button>
            )}
          </Link>
        );
      })}
    </div>
  );
}

// ── Publish modal ─────────────────────────────────────────────────────────────

function PublishModal({ pipeline, onClose }: { pipeline: ApiPipeline; onClose: () => void }) {
  const queryClient = useQueryClient();
  const slugName = pipeline.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const [repo, setRepo] = useState(slugName);
  const [isPrivate, setIsPrivate] = useState(false);
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null);

  const publish = useMutation({
    mutationFn: () =>
      api.publishPackage({
        pipelineId: pipeline.id,
        repo,
        private: isPrivate,
        description: pipeline.description ?? undefined,
      }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["packages"] });
      setPublishedUrl(result.repoUrl);
    },
  });

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 z-50 animate-overlay-in" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-slate-900 border border-slate-700/60 rounded-xl p-4 sm:p-6 w-[calc(100%-2rem)] max-w-md shadow-lg animate-scale-in">
          <div className="flex items-center justify-between mb-4">
            <Dialog.Title className="text-lg font-semibold text-white">Publish to GitHub</Dialog.Title>
            <Dialog.Close asChild>
              <button className="text-slate-500 hover:text-slate-300 transition-colors" aria-label="Close"><X size={16} /></button>
            </Dialog.Close>
          </div>

          {publishedUrl ? (
            <div className="space-y-4">
              <p className="text-sm text-emerald-400">Published successfully!</p>
              <a
                href={publishedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-xs font-mono text-sky-400 hover:text-sky-300 bg-slate-800 rounded-xl px-4 py-3 truncate"
              >
                {publishedUrl}
              </a>
              <button
                onClick={onClose}
                className="w-full px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium rounded-xl transition-colors"
              >
                Close
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Repository name</label>
                <input
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 font-mono"
                  value={repo}
                  onChange={(e) => setRepo(e.target.value)}
                />
                <p className="text-xs text-slate-500 mt-1">Use <code>owner/repo</code> for a specific org, or just <code>repo</code> for your personal account.</p>
              </div>
              <div>
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="private-toggle"
                    checked={isPrivate}
                    onChange={(e) => setIsPrivate(e.target.checked)}
                    className="rounded"
                  />
                  <label htmlFor="private-toggle" className="text-sm text-slate-400">Private repository</label>
                </div>
                {isPrivate && (
                  <div className="flex items-center gap-2 mt-2 px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                    <AlertTriangle size={13} className="text-amber-400 flex-shrink-0" />
                    <p className="text-xs text-amber-300">Private repos won't be discoverable via <code>zerohand packages discover</code> and won't appear in the package registry.</p>
                  </div>
                )}
              </div>
              {publish.isError && (
                <p className="text-xs text-rose-400">{(publish.error as Error).message}</p>
              )}
              <div className="flex gap-3 justify-end">
                <button className="px-4 py-2 text-sm text-slate-400 hover:text-white" onClick={onClose}>Cancel</button>
                <button
                  className="flex items-center gap-1.5 px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white text-sm font-medium rounded-lg disabled:opacity-50"
                  disabled={!repo || publish.isPending}
                  onClick={() => publish.mutate()}
                >
                  <Upload size={13} />
                  {publish.isPending ? "Publishing..." : "Publish"}
                </button>
              </div>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PipelineDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showRun, setShowRun] = useState(false);
  const [showPublish, setShowPublish] = useState(false);
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const [deleteError, setDeleteError] = useState("");

  const deletePipeline = useMutation({
    mutationFn: () => api.deletePipeline(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pipelines"] });
      navigate("/pipelines");
    },
    onError: (err: Error) => {
      setDeleteError(err.message);
    },
  });

  const { data: pipeline, isLoading, error } = useQuery({
    queryKey: ["pipeline", id],
    queryFn: () => api.getPipeline(id!),
    enabled: !!id,
  });

  const { data: packages = [] } = useQuery({
    queryKey: ["packages"],
    queryFn: () => api.listInstalledPackages(),
  });

  if (isLoading) return <LoadingState />;
  if (error || !pipeline) return <div className="p-8 text-rose-400" role="alert">Pipeline not found.</div>;

  const isFromPackage = packages.some((pkg) => pkg.pipelineId === pipeline.id);
  const exportCmd = `zerohand packages export "${pipeline.name}"`;

  function handleCopy() {
    navigator.clipboard.writeText(exportCmd).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  async function handleExport() {
    setExporting(true);
    setExportError("");
    try {
      await api.exportPackage(pipeline!.id);
    } catch (err) {
      setExportError((err as Error).message);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-10 max-w-5xl pt-14 lg:pt-10">
      {/* Header */}
      <div className="mb-8">
        <Link to="/pipelines" className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 mb-5 transition-colors">
          <ArrowLeft size={12} /> Pipelines
        </Link>
        <div className="flex flex-col sm:flex-row items-start gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <GitBranch size={20} className="text-indigo-400 flex-shrink-0" />
              <h1 className="text-2xl font-semibold font-display text-white tracking-tight truncate">{pipeline.name}</h1>
              <span className="text-xs text-slate-500 px-2 py-0.5 bg-slate-800 border border-slate-700/50 rounded-full">{pipeline.status}</span>
            </div>
            {pipeline.description && (
              <p className="text-sm text-slate-500 mt-1 ml-8">{pipeline.description}</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2 flex-shrink-0">
            <button
              onClick={() => {
                if (!confirm(`Delete "${pipeline.name}"? This will also remove any skills used only by this pipeline.`)) return;
                deletePipeline.mutate();
              }}
              disabled={deletePipeline.isPending}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-rose-900/40 hover:text-rose-400 text-slate-500 text-sm font-medium rounded-xl transition-colors disabled:opacity-50"
              title="Delete pipeline"
              aria-label="Delete pipeline"
            >
              <Trash2 size={13} />
            </button>
            <Link
              to={`/pipelines/${id}/edit`}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium rounded-xl transition-colors"
            >
              <Pencil size={13} />
              Edit
            </Link>
            <button
              className="flex items-center gap-1.5 px-3 py-2 bg-sky-600 hover:bg-sky-500 text-white text-sm font-medium rounded-xl transition-colors"
              onClick={() => setShowRun(true)}
            >
              <Play size={13} />
              Run
            </button>
          </div>
        </div>
      </div>

      {/* DAG */}
      <div className="mb-10">
        <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">
          Steps ({pipeline.steps.length})
        </h2>
        {pipeline.steps.length === 0 ? (
          <EmptyState
            compact
            icon={GitBranch}
            title="No steps defined"
            description="Steps are the building blocks of a pipeline. Each step invokes a skill with a prompt template."
            actions={[
              { label: "Add Steps", to: `/pipelines/${id}/edit` },
            ]}
          />
        ) : (
          <PipelineDAG pipeline={pipeline} />
        )}
      </div>

      {/* Export & Publish */}
      <div className="mb-10">
        <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">
          Export & Publish
        </h2>
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium rounded-xl transition-colors disabled:opacity-50"
          >
            <Download size={13} />
            {exporting ? "Exporting..." : "Export as Package"}
          </button>
          <button
            onClick={() => setShowPublish(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium rounded-xl transition-colors"
          >
            <Upload size={13} />
            Publish to GitHub
          </button>
        </div>
        {exportError && <p className="text-xs text-rose-400 mb-2" role="alert">{exportError}</p>}
        {deleteError && <p className="text-xs text-rose-400 mb-2" role="alert">Delete failed: {deleteError}</p>}
        {!isFromPackage && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 flex items-center gap-3">
            <code className="font-mono text-xs text-slate-500 flex-1">{exportCmd}</code>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-400 transition-colors flex-shrink-0"
              title="Copy CLI command"
            >
              {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        )}
      </div>

      {/* Recent runs */}
      <div>
        <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">
          Recent Runs
        </h2>
        <RecentRuns pipelineId={pipeline.id} />
      </div>

      {showRun && <RunModal pipeline={pipeline} onClose={() => setShowRun(false)} />}
      {showPublish && <PublishModal pipeline={pipeline} onClose={() => setShowPublish(false)} />}
    </div>
  );
}
