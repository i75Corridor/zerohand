import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Trash2, Save, Settings as SettingsIcon, KeyRound, Eye, EyeOff, Bot } from "lucide-react";
import { api } from "../lib/api.ts";
import type { ApiSecret } from "@zerohand/shared";
import ModelSelector from "../components/ModelSelector.tsx";

function ActiveModelsSection() {
  const queryClient = useQueryClient();

  const { data: agentModelSetting } = useQuery({
    queryKey: ["settings", "agent_model"],
    queryFn: () => api.getSetting("agent_model").catch(() => null),
  });

  const { data: pipelineModelSetting } = useQuery({
    queryKey: ["settings", "default_pipeline_model"],
    queryFn: () => api.getSetting("default_pipeline_model").catch(() => null),
  });

  const saveAgentModel = useMutation({
    mutationFn: (fullId: string) => api.updateSetting("agent_model", fullId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["settings", "agent_model"] }),
  });

  const savePipelineModel = useMutation({
    mutationFn: (fullId: string) => api.updateSetting("default_pipeline_model", fullId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["settings", "default_pipeline_model"] }),
  });

  const agentModel = typeof agentModelSetting?.value === "string" ? agentModelSetting.value : null;
  const pipelineModel = typeof pipelineModelSetting?.value === "string" ? pipelineModelSetting.value : null;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl mb-6 overflow-hidden">
      <div className="px-6 py-5 border-b border-slate-800 flex items-center gap-3">
        <Bot size={14} className="text-sky-400" />
        <h2 className="text-sm font-semibold text-white">Active Models</h2>
      </div>

      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
          <div>
            <div className="text-sm font-medium text-slate-200">Agent Model</div>
            <p className="text-xs text-slate-500 mt-0.5">Used by the global agent in the sidebar chat.</p>
          </div>
          <ModelSelector
            value={agentModel ?? "google/gemini-2.5-flash"}
            onChange={(fullId) => { if (fullId) saveAgentModel.mutate(fullId); }}
          />
        </div>

        <div className="h-px bg-slate-800" />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
          <div>
            <div className="text-sm font-medium text-slate-200">Default Pipeline Model</div>
            <p className="text-xs text-slate-500 mt-0.5">Fallback model for pipelines without an explicit model set.</p>
          </div>
          <ModelSelector
            value={pipelineModel ?? "google/gemini-2.5-flash"}
            onChange={(fullId) => { if (fullId) savePipelineModel.mutate(fullId); }}
          />
        </div>
      </div>
    </div>
  );
}

function SecretsSection() {
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({ key: "", value: "", description: "" });
  const [showValue, setShowValue] = useState(false);

  const { data: secrets = [] } = useQuery({
    queryKey: ["secrets"],
    queryFn: () => api.listSecrets(),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["secrets"] });

  const create = useMutation({
    mutationFn: () => api.createSecret(form.key, form.value, form.description || undefined),
    onSuccess: () => { invalidate(); setAdding(false); setForm({ key: "", value: "", description: "" }); },
  });

  const update = useMutation({
    mutationFn: () => api.updateSecret(editing!, form.value, form.description || undefined),
    onSuccess: () => { invalidate(); setEditing(null); setForm({ key: "", value: "", description: "" }); },
  });

  const remove = useMutation({
    mutationFn: (key: string) => api.deleteSecret(key),
    onSuccess: () => invalidate(),
  });

  const startEdit = (s: ApiSecret) => {
    setEditing(s.key);
    setForm({ key: s.key, value: "", description: s.description ?? "" });
    setAdding(false);
    setShowValue(false);
  };

  const cancelForm = () => {
    setAdding(false);
    setEditing(null);
    setForm({ key: "", value: "", description: "" });
    setShowValue(false);
  };

  const isFormOpen = adding || editing !== null;
  const isSubmitting = create.isPending || update.isPending;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
      <div className="px-6 py-5 border-b border-slate-800 flex items-center gap-3">
        <KeyRound size={14} className="text-sky-400" />
        <div className="flex-1">
          <h2 className="text-sm font-semibold text-white">Secrets</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Encrypted at rest. Use <code className="text-sky-300">{"{{secret.KEY}}"}</code> in pipeline prompts.
          </p>
        </div>
        {!isFormOpen && (
          <button
            onClick={() => { setAdding(true); setEditing(null); setShowValue(false); }}
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold text-sky-400 hover:bg-sky-500/10 rounded-lg transition-colors"
          >
            <Plus size={12} />
            Add Secret
          </button>
        )}
      </div>

      {secrets.length === 0 && !isFormOpen ? (
        <p className="text-xs text-slate-600 text-center py-4">No secrets yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-800">
              <th className="text-left py-3 px-6 font-bold">Key</th>
              <th className="text-left py-3 px-6 font-bold">Value</th>
              <th className="text-left py-3 px-6 font-bold">Description</th>
              <th className="py-3 px-6 w-16" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50">
            {secrets.map((s) => (
              <tr key={s.key} className={editing === s.key ? "opacity-40" : ""}>
                <td className="py-3 px-6 font-mono text-xs text-sky-300">{s.key}</td>
                <td className="py-3 px-6 font-mono text-xs text-slate-400">{s.maskedValue}</td>
                <td className="py-3 px-6 text-xs text-slate-500">{s.description ?? "—"}</td>
                <td className="py-3 px-6">
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => startEdit(s)}
                      className="text-xs text-slate-500 hover:text-sky-400 transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => { if (confirm(`Delete secret "${s.key}"?`)) remove.mutate(s.key); }}
                      className="text-slate-600 hover:text-red-400 transition-colors"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {isFormOpen && (
        <div className="p-6 bg-slate-900/60 border-t border-slate-800 space-y-2">
          {adding && (
            <input
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-sky-500"
              placeholder="SECRET_KEY"
              value={form.key}
              onChange={(e) => setForm((f) => ({ ...f, key: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_") }))}
            />
          )}
          <div className="relative">
            <input
              type={showValue ? "text" : "password"}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 pr-8 text-xs text-white font-mono focus:outline-none focus:border-sky-500"
              placeholder={editing ? "New value (leave blank to keep current)" : "Secret value"}
              value={form.value}
              onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
            />
            <button
              type="button"
              onClick={() => setShowValue((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
            >
              {showValue ? <EyeOff size={12} /> : <Eye size={12} />}
            </button>
          </div>
          <input
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-sky-500"
            placeholder="Description (optional)"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
          <div className="flex gap-2 pt-1">
            <button
              disabled={isSubmitting || (adding ? !form.key || !form.value : !form.value && !form.description)}
              onClick={() => editing ? update.mutate() : create.mutate()}
              className="flex items-center gap-1 px-3 py-1.5 bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-bold rounded-lg disabled:opacity-50 transition-colors"
            >
              <Save size={11} />
              {isSubmitting ? "Saving..." : editing ? "Update" : "Add"}
            </button>
            <button
              onClick={cancelForm}
              className="px-3 py-1.5 text-slate-400 hover:text-white text-xs transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Settings() {
  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-center gap-4 mb-6">
        <div className="p-3 bg-sky-500/10 rounded-2xl">
          <SettingsIcon size={20} className="text-sky-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold font-display text-white">Settings</h1>
          <p className="text-slate-400 text-sm">Manage your models, secrets, and preferences.</p>
        </div>
      </div>

      <ActiveModelsSection />
      <SecretsSection />
    </div>
  );
}
