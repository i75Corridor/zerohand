import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, Link, useNavigate } from "react-router-dom";
import React, { useState } from "react";
import { ReactFlow, Background, Handle, Position, type Node, type Edge, type NodeProps } from "@xyflow/react";
import { useChartTheme } from "../hooks/useChartTheme.ts";
import "@xyflow/react/dist/style.css";
import { ArrowLeft, Play, Pencil, Clock, CheckSquare, GitBranch, Copy, Check, Square, Download, Upload, X, Trash2, AlertTriangle, ShieldCheck, History, RotateCcw, ChevronDown, ChevronRight, Loader, AlertCircle, Eye, ExternalLink } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { api } from "../lib/api.ts";
import StatusBadge from "../components/StatusBadge.tsx";
import LoadingState from "../components/LoadingState.tsx";
import EmptyState from "../components/EmptyState.tsx";
import type { ApiPipeline, ApiPipelineStep, ApiPipelineRun, ApiValidationResult, ApiPipelineVersion, ApiBlueprintPreview } from "@pawn/shared";


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
    <div className="bg-pawn-surface-900 border border-pawn-surface-800 rounded-card p-4 w-80 shadow-lg">
      {step.stepIndex > 0 && (
        <Handle type="target" position={Position.Top} className="!bg-indigo-500 !w-2 !h-2 !border-0" />
      )}

      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-500/80 flex items-center justify-center text-xs font-semibold text-white">
          {step.stepIndex + 1}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-pawn-text-primary">{step.name}</div>
          {step.skillName ? (
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              <span className="text-xs text-violet-400">{step.skillName}</span>
              {step.skillFound === false && (
                <span className="text-xs text-rose-400 bg-rose-900/30 border border-rose-800/50 rounded px-1.5 py-0.5 leading-none">
                  not found
                </span>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-1 mt-0.5">
              <span className="text-xs text-amber-500/80 bg-amber-900/20 border border-amber-800/30 rounded px-1.5 py-0.5 leading-none">
                no skill
              </span>
            </div>
          )}
          {preview && (
            <div className="text-xs text-pawn-surface-500 mt-1.5 font-mono leading-relaxed">{preview}</div>
          )}
          <div className="flex items-center gap-2 mt-2">
            <span className="text-xs text-pawn-surface-500 flex items-center gap-1"><Clock size={10} /> {step.timeoutSeconds}s</span>
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
  const chart = useChartTheme();
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
    style: { stroke: chart.violet, strokeWidth: 2 },
    animated: false,
  }));

  return (
    <div className="h-[500px] rounded-card overflow-hidden border border-pawn-surface-800">
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
        style={{ background: chart.surface950 }}
      >
        <Background color={chart.surface800} gap={24} />
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
  const [stepByStep, setStepByStep] = useState(false);

  const { data: validation } = useQuery({
    queryKey: ["validate-for-run", pipeline.id],
    queryFn: () => api.validatePipeline(pipeline.id),
    staleTime: 30_000,
  });

  const hasValidationItems = validation && (validation.errors.length > 0 || validation.warnings.length > 0);

  const trigger = useMutation({
    mutationFn: () => {
      const params = Object.fromEntries(Object.entries(values).filter(([, v]) => v.trim() !== ""));
      return api.triggerRun(pipeline.id, params, stepByStep ? "step_by_step" : undefined);
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
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-pawn-surface-900 border border-pawn-surface-800 rounded-panel p-4 sm:p-6 w-[calc(100%-2rem)] max-w-md shadow-lg animate-scale-in">
          <Dialog.Title className="text-lg font-semibold text-pawn-text-primary mb-4">Run: {pipeline.name}</Dialog.Title>
          {fields.length === 0 ? (
            <p className="text-sm text-pawn-surface-500 mb-4">No inputs required.</p>
          ) : (
            <div className="space-y-4 mb-4">
              {fields.map(([key, prop]) => (
                <div key={key}>
                  <label className="block text-sm text-pawn-surface-400 mb-1">
                    {key}{required.has(key) && <span className="text-rose-400 ml-1">*</span>}
                  </label>
                  {prop.description && <p className="text-xs text-pawn-surface-500 mb-1">{prop.description}</p>}
                  <input
                    className="w-full bg-pawn-surface-800 border border-pawn-surface-700 rounded-button px-3 py-2 text-sm text-pawn-text-primary placeholder-pawn-surface-500 focus:outline-none focus:border-pawn-gold-500 focus:ring-1 focus:ring-pawn-gold-500"
                    placeholder={prop.description ?? key}
                    value={values[key] ?? ""}
                    onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
                    onKeyDown={(e) => e.key === "Enter" && trigger.mutate()}
                  />
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2 mb-4">
            <input
              type="checkbox"
              id="step-by-step"
              checked={stepByStep}
              onChange={(e) => setStepByStep(e.target.checked)}
              className="rounded"
            />
            <label htmlFor="step-by-step" className="text-sm text-pawn-surface-400">
              Step-by-step mode <span className="text-pawn-surface-600">(pause after each step)</span>
            </label>
          </div>
          {hasValidationItems && (
            <div className="mb-4 border border-amber-800/40 bg-amber-900/10 rounded-card p-3">
              <div className="flex items-center gap-1.5 text-xs font-medium text-amber-400 mb-2">
                <AlertTriangle size={12} />
                {validation.errors.length > 0
                  ? `${validation.errors.length} error(s), ${validation.warnings.length} warning(s)`
                  : `${validation.warnings.length} warning(s)`}
              </div>
              {[...validation.errors, ...validation.warnings].map((e, i) => (
                <div key={i} className={`text-xs mb-1 ${e.severity === "error" ? "text-rose-300" : "text-amber-300"}`}>
                  {e.severity === "error" ? "✕" : "⚠"}{e.stepIndex !== undefined ? ` Step ${e.stepIndex}:` : ""} {e.message}
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-3 justify-end items-center">
            {validation && validation.errors.length > 0 && (
              <span className="text-xs text-rose-400 flex-1">Fix validation errors before running.</span>
            )}
            <button className="px-4 py-2 text-sm text-pawn-surface-400 hover:text-pawn-text-primary" onClick={onClose}>Cancel</button>
            <button
              className="px-4 py-2 bg-pawn-gold-500 hover:bg-pawn-gold-400 text-pawn-surface-950 text-sm font-medium rounded-button disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={trigger.isPending || (validation?.errors.length ?? 0) > 0}
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
            className="flex items-center gap-3 px-4 py-2.5 bg-pawn-surface-800/50 border border-pawn-surface-800 rounded-card hover:border-pawn-surface-700 transition-colors"
          >
            <StatusBadge status={run.status} />
            <span className="text-xs text-pawn-surface-500 capitalize">{run.triggerType}</span>
            <span className="text-xs text-pawn-surface-500 flex-1 text-right">
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
  const [publishResult, setPublishResult] = useState<{
    repoUrl: string;
    prUrl?: string;
    noChanges?: boolean;
  } | null>(null);

  const publish = useMutation({
    mutationFn: () =>
      api.publishBlueprint({
        pipelineId: pipeline.id,
        repo,
        private: isPrivate,
        description: pipeline.description ?? undefined,
      }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["blueprints"] });
      setPublishResult({ repoUrl: result.repoUrl, prUrl: result.prUrl, noChanges: result.noChanges });
    },
  });

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50 animate-overlay-in" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[calc(100%-2rem)] max-w-lg shadow-2xl animate-scale-in rounded-panel overflow-hidden bg-pawn-surface-950 dark:bg-pawn-surface-900 border border-pawn-surface-800">

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-pawn-surface-800">
            <Dialog.Title className="text-base font-semibold text-pawn-text-primary">Publish to GitHub</Dialog.Title>
            <Dialog.Close asChild>
              <button className="text-pawn-surface-500 hover:text-pawn-text-primary transition-colors rounded p-0.5" aria-label="Close">
                <X size={16} />
              </button>
            </Dialog.Close>
          </div>

          <div className="px-6 py-5">
            {publishResult ? (
              <div className="space-y-5">
                {publishResult.noChanges ? (
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-pawn-surface-800 flex items-center justify-center mt-0.5">
                      <GitBranch size={15} className="text-pawn-surface-400" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-pawn-text-primary">Already up to date</p>
                      <p className="text-sm text-pawn-surface-400 mt-0.5">No changes detected — the repository matches the current pipeline.</p>
                    </div>
                  </div>
                ) : publishResult.prUrl ? (
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-500/15 flex items-center justify-center mt-0.5">
                      <GitBranch size={15} className="text-emerald-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-pawn-text-primary">Pull request created</p>
                      <p className="text-sm text-pawn-surface-400 mt-0.5">Review and merge the changes on GitHub.</p>
                      <a
                        href={publishResult.prUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 mt-3 text-sm font-medium text-pawn-gold-500 hover:text-pawn-gold-400 transition-colors break-all"
                      >
                        <ExternalLink size={13} className="flex-shrink-0" />
                        {publishResult.prUrl}
                      </a>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-500/15 flex items-center justify-center mt-0.5">
                      <Upload size={15} className="text-emerald-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-pawn-text-primary">Published successfully</p>
                      <p className="text-sm text-pawn-surface-400 mt-0.5">Your blueprint is live on GitHub.</p>
                      <a
                        href={publishResult.repoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 mt-3 text-sm font-medium text-pawn-gold-500 hover:text-pawn-gold-400 transition-colors break-all"
                      >
                        <ExternalLink size={13} className="flex-shrink-0" />
                        {publishResult.repoUrl}
                      </a>
                    </div>
                  </div>
                )}
                <div className="flex justify-end pt-1 border-t border-pawn-surface-800">
                  <button
                    onClick={onClose}
                    className="px-4 py-2 text-sm font-medium text-pawn-surface-400 hover:text-pawn-text-primary transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-pawn-text-primary mb-1.5">Repository name</label>
                  <input
                    className="w-full bg-pawn-surface-800 border border-pawn-surface-700 rounded-button px-3 py-2 text-sm text-pawn-text-primary placeholder-pawn-surface-500 focus:outline-none focus:border-pawn-gold-500 focus:ring-1 focus:ring-pawn-gold-500/30 font-mono"
                    value={repo}
                    onChange={(e) => setRepo(e.target.value)}
                    placeholder="owner/repo-name"
                    autoFocus
                  />
                  <p className="text-xs text-pawn-surface-500 mt-1.5">
                    Use <code className="font-mono text-pawn-surface-400">owner/repo</code> to publish to an org, or just <code className="font-mono text-pawn-surface-400">repo</code> for your personal account.
                  </p>
                </div>

                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    id="private-toggle"
                    checked={isPrivate}
                    onChange={(e) => setIsPrivate(e.target.checked)}
                    className="w-4 h-4 rounded accent-pawn-gold-500"
                  />
                  <span className="text-sm text-pawn-text-primary">Private repository</span>
                </label>

                {isPrivate && (
                  <div className="flex items-start gap-2.5 px-3 py-2.5 bg-amber-500/8 border border-amber-500/20 rounded-card">
                    <AlertTriangle size={13} className="text-amber-500 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-pawn-surface-300">
                      Private repos won't appear in blueprint discovery or the public registry.
                    </p>
                  </div>
                )}

                {publish.isError && (
                  <p className="text-sm text-rose-400">{(publish.error as Error).message}</p>
                )}

                <div className="flex items-center justify-end gap-3 pt-1 border-t border-pawn-surface-800">
                  <button className="px-4 py-2 text-sm text-pawn-surface-400 hover:text-pawn-text-primary transition-colors" onClick={onClose}>
                    Cancel
                  </button>
                  <button
                    className="flex items-center gap-1.5 px-4 py-2 bg-pawn-gold-500 hover:bg-pawn-gold-400 text-pawn-surface-950 text-sm font-semibold rounded-button disabled:opacity-50 transition-colors"
                    disabled={!repo || publish.isPending}
                    onClick={() => publish.mutate()}
                  >
                    <Upload size={13} />
                    {publish.isPending ? "Publishing…" : "Publish"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ── Blueprint preview modal ───────────────────────────────────────────────────

function PreviewModal({ pipelineId, onClose }: { pipelineId: string; onClose: () => void }) {
  const [preview, setPreview] = useState<ApiBlueprintPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [activeSkill, setActiveSkill] = useState<number>(0);
  const [tab, setTab] = useState<"yaml" | "skills" | "validation">("yaml");

  React.useEffect(() => {
    api.previewBlueprint(pipelineId)
      .then(setPreview)
      .catch((e: Error) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [pipelineId]);

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-pawn-surface-900 border border-pawn-surface-800 rounded-panel w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-pawn-surface-800">
          <h2 className="text-lg font-semibold text-pawn-text-primary">Blueprint Preview</h2>
          <button onClick={onClose} className="text-pawn-surface-500 hover:text-pawn-surface-300 transition-colors">
            <X size={16} />
          </button>
        </div>

        {loading && (
          <div className="flex-1 flex items-center justify-center">
            <Loader size={20} className="animate-spin text-pawn-surface-500" />
          </div>
        )}

        {err && (
          <div className="flex-1 p-6 text-rose-400 text-sm">{err}</div>
        )}

        {preview && (
          <>
            {/* Tabs */}
            <div className="flex gap-1 px-6 pt-3 border-b border-pawn-surface-800">
              {(["yaml", "skills", "validation"] as const).map((t) => (
                <button
                  key={t}
                  className={`px-4 py-2 text-sm font-medium transition-colors capitalize ${tab === t ? "text-pawn-text-primary border-b-2 border-pawn-gold-500" : "text-pawn-surface-500 hover:text-pawn-surface-300"}`}
                  onClick={() => setTab(t)}
                >
                  {t === "validation"
                    ? `Validation ${preview.validation.valid ? "✓" : `(${preview.validation.errors.length} errors)`}`
                    : t === "skills"
                    ? `Skills (${preview.skills.length})`
                    : "pipeline.yaml"}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {tab === "yaml" && (
                <pre className="text-xs text-pawn-surface-300 font-mono whitespace-pre-wrap leading-relaxed bg-pawn-surface-950 rounded-card p-4">
                  {preview.pipelineYaml}
                </pre>
              )}

              {tab === "skills" && (
                <div className="flex gap-4 h-full">
                  {preview.skills.length === 0 ? (
                    <p className="text-sm text-pawn-surface-500">No skills bundled.</p>
                  ) : (
                    <>
                      <div className="w-40 flex-shrink-0 space-y-1">
                        {preview.skills.map((s, i) => (
                          <button
                            key={i}
                            className={`w-full text-left px-3 py-2 rounded-button text-xs transition-colors ${activeSkill === i ? "bg-pawn-gold-900/30 text-pawn-gold-300" : "text-pawn-surface-400 hover:bg-pawn-surface-800"}`}
                            onClick={() => setActiveSkill(i)}
                          >
                            {s.name}
                          </button>
                        ))}
                      </div>
                      <div className="flex-1 min-w-0 space-y-3">
                        {preview.skills[activeSkill] && (
                          <>
                            <div>
                              <div className="text-xs text-pawn-surface-500 mb-1 font-mono">SKILL.md</div>
                              <pre className="text-xs text-pawn-surface-300 font-mono whitespace-pre-wrap bg-pawn-surface-950 rounded-card p-4 max-h-48 overflow-y-auto">
                                {preview.skills[activeSkill].skillMd}
                              </pre>
                            </div>
                            {preview.skills[activeSkill].scripts.map((sc) => (
                              <div key={sc.filename}>
                                <div className="text-xs text-pawn-surface-500 mb-1 font-mono">{sc.filename}</div>
                                <pre className="text-xs text-pawn-surface-300 font-mono whitespace-pre-wrap bg-pawn-surface-950 rounded-card p-4 max-h-48 overflow-y-auto">
                                  {sc.content}
                                </pre>
                              </div>
                            ))}
                          </>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}

              {tab === "validation" && (
                <div>
                  <div className={`flex items-center gap-2 text-sm font-medium mb-4 ${preview.validation.valid ? "text-emerald-400" : "text-rose-400"}`}>
                    {preview.validation.valid ? <Check size={14} /> : <AlertCircle size={14} />}
                    {preview.validation.valid ? "All checks passed" : `${preview.validation.errors.length} error${preview.validation.errors.length !== 1 ? "s" : ""}`}
                    {preview.validation.warnings.length > 0 && (
                      <span className="text-amber-400 text-xs ml-1">· {preview.validation.warnings.length} warning{preview.validation.warnings.length !== 1 ? "s" : ""}</span>
                    )}
                  </div>
                  {[...preview.validation.errors, ...preview.validation.warnings].map((e, i) => (
                    <div key={i} className={`flex items-start gap-2 text-xs mb-1.5 ${e.severity === "error" ? "text-rose-300" : "text-amber-300"}`}>
                      <span className="flex-shrink-0 mt-0.5">{e.severity === "error" ? "✕" : "⚠"}</span>
                      <span>{e.stepIndex !== undefined ? `Step ${e.stepIndex}: ` : ""}{e.message}</span>
                    </div>
                  ))}
                  {[...preview.validation.errors, ...preview.validation.warnings].length === 0 && (
                    <p className="text-sm text-pawn-surface-500">No issues found.</p>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Validation panel ──────────────────────────────────────────────────────────

function ValidationPanel({ pipelineId }: { pipelineId: string }) {
  const { data: result, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["validate", pipelineId],
    queryFn: () => api.validatePipeline(pipelineId),
    staleTime: 60_000,
  });

  return (
    <div className="mb-8 bg-pawn-surface-900 border border-pawn-surface-800 rounded-card">
      <div className="flex items-center justify-between px-6 py-4 border-b border-pawn-surface-800">
        <h2 className="text-xs font-semibold text-pawn-surface-400 uppercase tracking-wider">Validation</h2>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-pawn-surface-800 hover:bg-pawn-surface-700 text-pawn-surface-300 rounded-button transition-colors disabled:opacity-50"
        >
          {isFetching ? <Loader size={12} className="animate-spin" /> : <ShieldCheck size={12} />}
          {isFetching ? "Checking..." : "Re-validate"}
        </button>
      </div>

      <div className="p-5">
        {isLoading && (
          <div className="flex items-center gap-2 text-xs text-pawn-surface-500 px-1">
            <Loader size={12} className="animate-spin" /> Checking pipeline…
          </div>
        )}

        {result && (
          <div className={`border rounded-card p-4 ${result.valid ? "border-emerald-800/40 bg-emerald-900/10" : "border-rose-800/40 bg-rose-900/10"}`}>
            <div className={`flex items-center gap-2 text-sm font-medium mb-3 ${result.valid ? "text-emerald-400" : "text-rose-400"}`}>
              {result.valid ? <Check size={14} /> : <AlertCircle size={14} />}
              {result.valid ? "All checks passed" : `${result.errors.length} error${result.errors.length !== 1 ? "s" : ""}`}
              {result.warnings.length > 0 && (
                <span className="text-amber-400 text-xs ml-1">· {result.warnings.length} warning{result.warnings.length !== 1 ? "s" : ""}</span>
              )}
            </div>
            {[...result.errors, ...result.warnings].map((e, i) => (
              <div key={i} className={`flex items-start gap-2 text-xs mb-1 ${e.severity === "error" ? "text-rose-300" : "text-amber-300"}`}>
                <span className="flex-shrink-0 mt-0.5">{e.severity === "error" ? "✕" : "⚠"}</span>
                <span>{e.stepIndex !== undefined ? `Step ${e.stepIndex}: ` : ""}{e.message}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Version History ───────────────────────────────────────────────────────────

function VersionHistory({ pipelineId }: { pipelineId: string }) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [restoring, setRestoring] = useState<number | null>(null);

  const { data: versions = [], isLoading } = useQuery({
    queryKey: ["pipeline-versions", pipelineId],
    queryFn: () => api.listPipelineVersions(pipelineId),
    enabled: expanded,
  });

  async function handleRestore(versionNumber: number) {
    if (!confirm(`Restore pipeline to version ${versionNumber}? The current state will be saved as a new version.`)) return;
    setRestoring(versionNumber);
    try {
      await api.restorePipelineVersion(pipelineId, versionNumber);
      queryClient.invalidateQueries({ queryKey: ["pipeline", pipelineId] });
      queryClient.invalidateQueries({ queryKey: ["pipeline-versions", pipelineId] });
    } finally {
      setRestoring(null);
    }
  }

  return (
    <div className="mb-8 bg-pawn-surface-900 border border-pawn-surface-800 rounded-card">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full px-6 py-4 text-xs font-semibold text-pawn-surface-400 uppercase tracking-wider hover:text-pawn-surface-300 transition-colors"
      >
        {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        <History size={13} />
        Version History
      </button>

      {expanded && (
        <div className="px-5 pb-5 space-y-1.5 border-t border-pawn-surface-800 pt-4">
          {isLoading && <div className="text-pawn-surface-500 text-sm">Loading...</div>}
          {!isLoading && versions.length === 0 && (
            <div className="text-pawn-surface-600 text-sm">No versions saved yet — edit the pipeline to create one.</div>
          )}
          {versions.map((v) => (
            <div key={v.id} className="flex items-center gap-3 px-3 py-2 bg-pawn-surface-800/50 border border-pawn-surface-800 rounded-card">
              <span className="text-xs font-mono text-pawn-gold-400 flex-shrink-0">v{v.versionNumber}</span>
              <span className="text-xs text-pawn-surface-500 flex-1 truncate">{v.changeSummary ?? "Snapshot"}</span>
              <span className="text-xs text-pawn-surface-600">{new Date(v.createdAt).toLocaleString()}</span>
              <button
                onClick={() => handleRestore(v.versionNumber)}
                disabled={restoring === v.versionNumber}
                className="flex items-center gap-1 text-xs text-pawn-surface-500 hover:text-pawn-gold-400 transition-colors flex-shrink-0 disabled:opacity-50"
                title="Restore this version"
              >
                <RotateCcw size={11} />
                {restoring === v.versionNumber ? "Restoring..." : "Restore"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PipelineDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showRun, setShowRun] = useState(false);
  const [showPublish, setShowPublish] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
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

  const { data: blueprints = [] } = useQuery({
    queryKey: ["blueprints"],
    queryFn: () => api.listInstalledBlueprints(),
  });

  const { data: ghStatus } = useQuery({
    queryKey: ["gh-status"],
    queryFn: () => api.getGhStatus(),
    staleTime: 60_000,
  });

  if (isLoading) return <LoadingState />;
  if (error || !pipeline) return <div className="p-8 text-rose-400" role="alert">Pipeline not found.</div>;

  const isFromBlueprint = blueprints.some((pkg) => pkg.pipelineId === pipeline.id);
  const exportCmd = `pawn blueprints export "${pipeline.name}"`;

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
      await api.exportBlueprint(pipeline!.id);
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
        <Link to="/pipelines" className="flex items-center gap-1.5 text-xs text-pawn-surface-500 hover:text-pawn-surface-300 mb-5 transition-colors">
          <ArrowLeft size={12} /> Pipelines
        </Link>
        <div className="flex flex-col sm:flex-row items-start gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <GitBranch size={20} className="text-indigo-400 flex-shrink-0" />
              <h1 className="text-2xl font-semibold font-display text-pawn-text-primary tracking-tight truncate">{pipeline.name}</h1>
              <span className="text-xs text-pawn-surface-500 px-2 py-0.5 bg-pawn-surface-800 border border-pawn-surface-700/50 rounded-full">{pipeline.status}</span>
            </div>
            {pipeline.description && (
              <p className="text-sm text-pawn-surface-500 mt-1 ml-8">{pipeline.description}</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2 flex-shrink-0">
            <button
              onClick={() => setShowDeleteConfirm(true)}
              disabled={deletePipeline.isPending}
              className="flex items-center gap-1.5 px-3 py-2 bg-pawn-surface-800 hover:bg-rose-900/40 hover:text-rose-400 text-pawn-surface-500 text-sm font-medium rounded-button transition-colors disabled:opacity-50"
              title="Delete pipeline"
              aria-label="Delete pipeline"
            >
              <Trash2 size={13} />
            </button>
            <Link
              to={`/pipelines/${id}/edit`}
              className="flex items-center gap-1.5 px-3 py-2 bg-pawn-surface-800 hover:bg-pawn-surface-700 text-pawn-surface-300 text-sm font-medium rounded-button transition-colors"
            >
              <Pencil size={13} />
              Edit
            </Link>
            <button
              className="flex items-center gap-1.5 px-3 py-2 bg-pawn-gold-500 hover:bg-pawn-gold-400 text-pawn-surface-950 text-sm font-medium rounded-button transition-colors"
              onClick={() => setShowRun(true)}
            >
              <Play size={13} />
              Run
            </button>
          </div>
        </div>
      </div>

      {/* DAG */}
      <div className="mb-10 bg-pawn-surface-900 border border-pawn-surface-800 rounded-card">
        <div className="px-6 py-4 border-b border-pawn-surface-800">
          <h2 className="text-xs font-semibold text-pawn-surface-400 uppercase tracking-wider">
            Steps ({pipeline.steps.length})
          </h2>
        </div>
        <div className="p-5">
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
      </div>

      {/* Export & Publish */}
      <div className="mb-10 bg-pawn-surface-900 border border-pawn-surface-800 rounded-card">
        <div className="px-6 py-4 border-b border-pawn-surface-800">
          <h2 className="text-xs font-semibold text-pawn-surface-400 uppercase tracking-wider">
            Export & Publish
          </h2>
        </div>
        <div className="p-5">
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <button
              onClick={() => setShowPreview(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-pawn-surface-800 hover:bg-pawn-surface-700 text-pawn-surface-300 text-sm font-medium rounded-button transition-colors"
            >
              <Eye size={13} />
              Preview
            </button>
            <button
              onClick={handleExport}
              disabled={exporting}
              className="flex items-center gap-1.5 px-3 py-2 bg-pawn-surface-800 hover:bg-pawn-surface-700 text-pawn-surface-300 text-sm font-medium rounded-button transition-colors disabled:opacity-50"
            >
              <Download size={13} />
              {exporting ? "Exporting..." : "Export as Blueprint"}
            </button>
            <button
              onClick={() => ghStatus?.available !== false && setShowPublish(true)}
              disabled={ghStatus?.available === false}
              title={ghStatus?.available === false ? "gh CLI not found — install from https://cli.github.com" : undefined}
              className="flex items-center gap-1.5 px-3 py-2 bg-pawn-surface-800 hover:bg-pawn-surface-700 text-pawn-surface-300 text-sm font-medium rounded-button transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Upload size={13} />
              Publish to GitHub
              {ghStatus?.available === false && (
                <span className="flex items-center gap-1 ml-1 px-1.5 py-0.5 bg-amber-500/15 border border-amber-500/30 rounded text-amber-400 text-xs font-normal">
                  <AlertTriangle size={10} />
                  gh missing
                </span>
              )}
            </button>
          </div>
          {exportError && <p className="text-xs text-rose-400 mb-2" role="alert">{exportError}</p>}
          {deleteError && <p className="text-xs text-rose-400 mb-2" role="alert">Delete failed: {deleteError}</p>}
          {!isFromBlueprint && (
            <div className="bg-pawn-surface-800/50 border border-pawn-surface-800 rounded-card px-4 py-3 flex items-center gap-3">
              <code className="font-mono text-xs text-pawn-surface-500 flex-1">{exportCmd}</code>
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 text-xs text-pawn-surface-500 hover:text-pawn-surface-400 transition-colors flex-shrink-0"
                title="Copy CLI command"
              >
                {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Validation */}
      <ValidationPanel pipelineId={pipeline.id} />

      {/* Version History */}
      <VersionHistory pipelineId={pipeline.id} />

      {/* Recent runs */}
      <div className="bg-pawn-surface-900 border border-pawn-surface-800 rounded-card">
        <div className="px-6 py-4 border-b border-pawn-surface-800">
          <h2 className="text-xs font-semibold text-pawn-surface-400 uppercase tracking-wider">
            Recent Runs
          </h2>
        </div>
        <div className="p-5">
          <RecentRuns pipelineId={pipeline.id} />
        </div>
      </div>

      {showRun && <RunModal pipeline={pipeline} onClose={() => setShowRun(false)} />}
      {showPublish && <PublishModal pipeline={pipeline} onClose={() => setShowPublish(false)} />}
      {showPreview && <PreviewModal pipelineId={pipeline.id} onClose={() => setShowPreview(false)} />}

      {/* Delete confirmation dialog */}
      <Dialog.Root open={showDeleteConfirm} onOpenChange={(open) => { setShowDeleteConfirm(open); if (!open) setDeleteError(""); }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/60 z-50 animate-overlay-in" />
          <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-pawn-surface-900 border border-pawn-surface-800 rounded-panel p-6 w-[calc(100%-2rem)] max-w-sm shadow-lg animate-scale-in">
            <div className="flex items-start gap-3 mb-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-rose-900/40 flex items-center justify-center">
                <Trash2 size={14} className="text-rose-400" />
              </div>
              <div>
                <Dialog.Title className="text-base font-semibold text-pawn-text-primary">Delete pipeline?</Dialog.Title>
                <Dialog.Description className="text-sm text-pawn-surface-400 mt-1">
                  <span className="text-pawn-text-primary font-medium">{pipeline.name}</span> and any skills used only by this pipeline will be permanently removed.
                </Dialog.Description>
              </div>
            </div>
            {deleteError && (
              <p className="text-xs text-rose-400 bg-rose-900/20 border border-rose-800/40 rounded-card px-3 py-2 mb-4">{deleteError}</p>
            )}
            <div className="flex justify-end gap-2">
              <Dialog.Close asChild>
                <button className="px-4 py-2 text-sm font-medium text-pawn-surface-300 bg-pawn-surface-800 hover:bg-pawn-surface-700 rounded-button transition-colors">
                  Cancel
                </button>
              </Dialog.Close>
              <button
                onClick={() => deletePipeline.mutate()}
                disabled={deletePipeline.isPending}
                className="px-4 py-2 text-sm font-medium text-white bg-rose-700 hover:bg-rose-600 rounded-button transition-colors disabled:opacity-50"
              >
                {deletePipeline.isPending ? "Deleting…" : "Delete"}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
