import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Bot, DollarSign, Plus, Pencil, Trash2, X } from "lucide-react";
import { api } from "../lib/api.ts";
import type { ApiWorker } from "@zerohand/shared";

const STATUS_COLORS: Record<string, string> = {
  idle: "text-gray-400",
  active: "text-green-400",
  paused: "text-yellow-400",
  error: "text-red-400",
};

const WORKER_TYPES = ["pi", "imagen", "publish", "function", "api"] as const;

// ── Worker Form Modal ──────────────────────────────────────────────────────────

interface WorkerFormState {
  name: string;
  description: string;
  workerType: string;
  modelProvider: string;
  modelName: string;
  systemPrompt: string;
  skills: string[];
  customTools: string;
  budgetDollars: string;
}

function defaultForm(worker?: ApiWorker): WorkerFormState {
  return {
    name: worker?.name ?? "",
    description: worker?.description ?? "",
    workerType: worker?.workerType ?? "pi",
    modelProvider: worker?.modelProvider ?? "anthropic",
    modelName: worker?.modelName ?? "claude-sonnet-4-5-20251001",
    systemPrompt: worker?.systemPrompt ?? "",
    skills: worker?.skills ?? [],
    customTools: (worker?.customTools ?? []).join(", "),
    budgetDollars: worker ? String((worker.budgetMonthlyCents / 100).toFixed(2)) : "0",
  };
}

function WorkerFormModal({
  worker,
  onClose,
}: {
  worker?: ApiWorker;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const isEdit = !!worker;
  const [form, setForm] = useState<WorkerFormState>(() => defaultForm(worker));
  const [apiError, setApiError] = useState<string | null>(null);

  const { data: skills = [] } = useQuery({
    queryKey: ["skills"],
    queryFn: () => api.listSkills(),
  });

  const set = (patch: Partial<WorkerFormState>) => setForm((f) => ({ ...f, ...patch }));

  const toggleSkill = (name: string) => {
    set({
      skills: form.skills.includes(name)
        ? form.skills.filter((s) => s !== name)
        : [...form.skills, name],
    });
  };

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: form.name.trim() || "Unnamed Worker",
        description: form.description.trim() || undefined,
        workerType: form.workerType as ApiWorker["workerType"],
        modelProvider: form.modelProvider.trim(),
        modelName: form.modelName.trim(),
        systemPrompt: form.systemPrompt.trim() || undefined,
        skills: form.skills,
        customTools: form.customTools
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        budgetMonthlyCents: Math.round(parseFloat(form.budgetDollars || "0") * 100),
      };
      return isEdit
        ? api.updateWorker(worker.id, body)
        : api.createWorker(body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workers"] });
      onClose();
    },
    onError: (err) => setApiError(String(err)),
  });

  const showModel = form.workerType === "pi" || form.workerType === "imagen";
  const showSystemPrompt = form.workerType === "pi";

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-xl shadow-xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-800">
          <h2 className="text-base font-semibold text-white">{isEdit ? "Edit Worker" : "New Worker"}</h2>
          <button className="text-gray-500 hover:text-white" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Name <span className="text-red-400">*</span></label>
            <input
              className="w-full bg-gray-800 border border-gray-600 rounded-md px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
              value={form.name}
              onChange={(e) => set({ name: e.target.value })}
              placeholder="My Worker"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Description</label>
            <textarea
              className="w-full bg-gray-800 border border-gray-600 rounded-md px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 resize-none"
              rows={2}
              value={form.description}
              onChange={(e) => set({ description: e.target.value })}
              placeholder="What does this worker do?"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Worker type</label>
            <select
              className="w-full bg-gray-800 border border-gray-600 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
              value={form.workerType}
              onChange={(e) => set({ workerType: e.target.value })}
            >
              {WORKER_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          {showModel && (
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-xs text-gray-400 mb-1">Model provider</label>
                <input
                  className="w-full bg-gray-800 border border-gray-600 rounded-md px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
                  value={form.modelProvider}
                  onChange={(e) => set({ modelProvider: e.target.value })}
                  placeholder="anthropic"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs text-gray-400 mb-1">Model name</label>
                <input
                  className="w-full bg-gray-800 border border-gray-600 rounded-md px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
                  value={form.modelName}
                  onChange={(e) => set({ modelName: e.target.value })}
                  placeholder="claude-sonnet-4-5-20251001"
                />
              </div>
            </div>
          )}

          {showSystemPrompt && (
            <div>
              <label className="block text-xs text-gray-400 mb-1">System prompt</label>
              <textarea
                className="w-full bg-gray-800 border border-gray-600 rounded-md px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 font-mono resize-y"
                rows={4}
                value={form.systemPrompt}
                onChange={(e) => set({ systemPrompt: e.target.value })}
                placeholder="You are a helpful assistant..."
              />
            </div>
          )}

          {skills.length > 0 && (
            <div>
              <label className="block text-xs text-gray-400 mb-2">Skills</label>
              <div className="flex flex-wrap gap-2">
                {skills.map((s) => (
                  <label key={s.name} className="flex items-center gap-1.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      className="accent-indigo-500"
                      checked={form.skills.includes(s.name)}
                      onChange={() => toggleSkill(s.name)}
                    />
                    <span className="text-xs text-gray-300">{s.name}</span>
                    {s.description && (
                      <span className="text-xs text-gray-600">— {s.description}</span>
                    )}
                  </label>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs text-gray-400 mb-1">Custom tools <span className="text-gray-600">(comma-separated)</span></label>
            <input
              className="w-full bg-gray-800 border border-gray-600 rounded-md px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
              value={form.customTools}
              onChange={(e) => set({ customTools: e.target.value })}
              placeholder="web_search, code_runner"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Monthly budget (USD)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              className="w-full bg-gray-800 border border-gray-600 rounded-md px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
              value={form.budgetDollars}
              onChange={(e) => set({ budgetDollars: e.target.value })}
              placeholder="0"
            />
          </div>

          {apiError && <p className="text-xs text-red-400">{apiError}</p>}
        </div>

        <div className="flex gap-3 justify-end px-6 pb-5">
          <button className="px-4 py-2 text-sm text-gray-400 hover:text-white" onClick={onClose}>Cancel</button>
          <button
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-md disabled:opacity-50"
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? "Saving..." : isEdit ? "Save Changes" : "Create Worker"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Worker Card ────────────────────────────────────────────────────────────────

function WorkerCard({
  worker,
  onEdit,
  onDelete,
}: {
  worker: ApiWorker;
  onEdit: () => void;
  onDelete: () => void;
}) {
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
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            className="p-1.5 text-gray-500 hover:text-gray-200 transition-colors rounded"
            onClick={onEdit}
            title="Edit worker"
          >
            <Pencil size={13} />
          </button>
          <button
            className="p-1.5 text-gray-500 hover:text-red-400 transition-colors rounded"
            onClick={onDelete}
            title="Delete worker"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      <div className="text-xs text-gray-600 space-y-1">
        <div>
          <span className="text-gray-500">Type:</span>{" "}
          <span className="text-gray-400">{worker.workerType}</span>
          {(worker.modelProvider || worker.modelName) && (
            <>
              {" · "}
              <span className="text-gray-400">{worker.modelProvider}/{worker.modelName}</span>
            </>
          )}
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

// ── Delete confirm ─────────────────────────────────────────────────────────────

function DeleteConfirmModal({
  worker,
  onClose,
}: {
  worker: ApiWorker;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [conflictPipelines, setConflictPipelines] = useState<string[] | null>(null);

  const del = useMutation({
    mutationFn: () => api.deleteWorker(worker.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workers"] });
      onClose();
    },
    onError: async (err) => {
      const msg = String(err);
      // Parse 409 conflict list from error message
      if (msg.includes("409")) {
        try {
          const match = msg.match(/\{.*\}/s);
          if (match) {
            const body = JSON.parse(match[0]) as { pipelines?: string[] };
            setConflictPipelines(body.pipelines ?? []);
            return;
          }
        } catch {
          // fall through
        }
      }
      setConflictPipelines(null);
    },
  });

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-sm shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {conflictPipelines ? (
          <>
            <h2 className="text-base font-semibold text-white mb-2">Worker in use</h2>
            <p className="text-sm text-gray-400 mb-3">
              <span className="text-white">{worker.name}</span> is used by the following pipelines:
            </p>
            <ul className="mb-4 space-y-1">
              {conflictPipelines.map((p) => (
                <li key={p} className="text-xs text-indigo-400 bg-indigo-900/20 rounded px-3 py-1">{p}</li>
              ))}
            </ul>
            <p className="text-xs text-gray-500 mb-4">Remove this worker from those pipelines first, then try again.</p>
            <div className="flex justify-end">
              <button className="px-4 py-2 text-sm text-gray-400 hover:text-white" onClick={onClose}>Close</button>
            </div>
          </>
        ) : (
          <>
            <h2 className="text-base font-semibold text-white mb-2">Delete worker?</h2>
            <p className="text-sm text-gray-400 mb-4">
              Are you sure you want to delete <span className="text-white">{worker.name}</span>? This cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button className="px-4 py-2 text-sm text-gray-400 hover:text-white" onClick={onClose}>Cancel</button>
              <button
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-medium rounded-md disabled:opacity-50"
                disabled={del.isPending}
                onClick={() => del.mutate()}
              >
                {del.isPending ? "Deleting..." : "Delete"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function Workers() {
  const { data: workers = [], isLoading } = useQuery({
    queryKey: ["workers"],
    queryFn: () => api.listWorkers(),
  });

  const [editingWorker, setEditingWorker] = useState<ApiWorker | null>(null);
  const [deletingWorker, setDeletingWorker] = useState<ApiWorker | null>(null);
  const [showNew, setShowNew] = useState(false);

  if (isLoading) return <div className="p-8 text-gray-500">Loading...</div>;

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Workers</h1>
        <button
          className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-md transition-colors"
          onClick={() => setShowNew(true)}
        >
          <Plus size={14} />
          New Worker
        </button>
      </div>

      {workers.length === 0 ? (
        <div className="text-gray-500 text-sm">No workers configured.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {workers.map((w) => (
            <WorkerCard
              key={w.id}
              worker={w}
              onEdit={() => setEditingWorker(w)}
              onDelete={() => setDeletingWorker(w)}
            />
          ))}
        </div>
      )}

      {showNew && <WorkerFormModal onClose={() => setShowNew(false)} />}
      {editingWorker && <WorkerFormModal worker={editingWorker} onClose={() => setEditingWorker(null)} />}
      {deletingWorker && <DeleteConfirmModal worker={deletingWorker} onClose={() => setDeletingWorker(null)} />}
    </div>
  );
}
