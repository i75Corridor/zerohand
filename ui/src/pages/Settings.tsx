import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Plus, Trash2, Save, Settings as SettingsIcon, KeyRound, Eye, EyeOff } from "lucide-react";
import { api } from "../lib/api.ts";
import type { ModelCostEntry, ApiSecret } from "@zerohand/shared";

type CostRow = { model: string; inputPerM: number; outputPerM: number };

function toCostRows(value: unknown): CostRow[] {
  if (!value || typeof value !== "object") return [];
  return Object.entries(value as Record<string, ModelCostEntry>).map(([model, costs]) => ({
    model,
    inputPerM: costs.inputPerM,
    outputPerM: costs.outputPerM,
  }));
}

function toMap(rows: CostRow[]): Record<string, ModelCostEntry> {
  return Object.fromEntries(
    rows.filter((r) => r.model.trim()).map((r) => [
      r.model.trim(),
      { inputPerM: r.inputPerM, outputPerM: r.outputPerM },
    ]),
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
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-5 mt-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="flex items-center gap-2">
            <KeyRound size={14} className="text-indigo-400" />
            <h2 className="text-sm font-semibold text-white">Secrets</h2>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            Encrypted at rest. Use <code className="text-indigo-300">{"{{secret.KEY}}"}</code> in pipeline prompts.
          </p>
        </div>
        {!isFormOpen && (
          <button
            onClick={() => { setAdding(true); setEditing(null); setShowValue(false); }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-medium rounded-md transition-colors"
          >
            <Plus size={12} />
            Add Secret
          </button>
        )}
      </div>

      {isFormOpen && (
        <div className="mb-4 p-3 bg-gray-800 rounded-md border border-gray-700 space-y-2">
          {adding && (
            <input
              className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
              placeholder="SECRET_KEY"
              value={form.key}
              onChange={(e) => setForm((f) => ({ ...f, key: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_") }))}
            />
          )}
          <div className="relative">
            <input
              type={showValue ? "text" : "password"}
              className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 pr-8 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
              placeholder={editing ? "New value (leave blank to keep current)" : "Secret value"}
              value={form.value}
              onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
            />
            <button
              type="button"
              onClick={() => setShowValue((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
            >
              {showValue ? <EyeOff size={12} /> : <Eye size={12} />}
            </button>
          </div>
          <input
            className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
            placeholder="Description (optional)"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
          <div className="flex gap-2 pt-1">
            <button
              disabled={isSubmitting || (adding ? !form.key || !form.value : !form.value && !form.description)}
              onClick={() => editing ? update.mutate() : create.mutate()}
              className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-md disabled:opacity-50 transition-colors"
            >
              <Save size={11} />
              {isSubmitting ? "Saving..." : editing ? "Update" : "Add"}
            </button>
            <button
              onClick={cancelForm}
              className="px-3 py-1.5 text-gray-400 hover:text-white text-xs transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {secrets.length === 0 && !isFormOpen ? (
        <p className="text-xs text-gray-600 text-center py-4">No secrets yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-500 uppercase tracking-wide border-b border-gray-800">
              <th className="text-left pb-2 pr-4 font-medium">Key</th>
              <th className="text-left pb-2 pr-4 font-medium">Value</th>
              <th className="text-left pb-2 pr-4 font-medium">Description</th>
              <th className="pb-2 w-16" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {secrets.map((s) => (
              <tr key={s.key} className={editing === s.key ? "opacity-40" : ""}>
                <td className="py-2 pr-4 font-mono text-xs text-indigo-300">{s.key}</td>
                <td className="py-2 pr-4 font-mono text-xs text-gray-400">{s.maskedValue}</td>
                <td className="py-2 pr-4 text-xs text-gray-500">{s.description ?? "—"}</td>
                <td className="py-2">
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => startEdit(s)}
                      className="text-xs text-gray-500 hover:text-indigo-400 transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => { if (confirm(`Delete secret "${s.key}"?`)) remove.mutate(s.key); }}
                      className="text-gray-600 hover:text-red-400 transition-colors"
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
    </div>
  );
}

export default function Settings() {
  const queryClient = useQueryClient();

  const { data: setting, isLoading } = useQuery({
    queryKey: ["settings", "model_costs"],
    queryFn: () => api.getSetting("model_costs"),
  });

  const [rows, setRows] = useState<CostRow[]>([]);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (setting) {
      setRows(toCostRows(setting.value));
      setDirty(false);
    }
  }, [setting]);

  const save = useMutation({
    mutationFn: () => api.updateSetting("model_costs", toMap(rows)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings", "model_costs"] });
      setDirty(false);
    },
  });

  const updateRow = (i: number, field: keyof CostRow, value: string | number) => {
    setRows((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], [field]: value };
      return next;
    });
    setDirty(true);
  };

  const removeRow = (i: number) => {
    setRows((prev) => prev.filter((_, idx) => idx !== i));
    setDirty(true);
  };

  const addRow = () => {
    setRows((prev) => [...prev, { model: "", inputPerM: 0, outputPerM: 0 }]);
    setDirty(true);
  };

  if (isLoading) return <div className="p-8 text-gray-500">Loading...</div>;

  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <SettingsIcon size={20} className="text-indigo-400" />
        <h1 className="text-2xl font-bold text-white">Settings</h1>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-lg p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-white">Model Pricing</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Cents per 1 million tokens. Used to estimate costs and enforce budget policies.
            </p>
          </div>
          <button
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-md disabled:opacity-50 transition-colors"
            disabled={!dirty || save.isPending}
            onClick={() => save.mutate()}
          >
            <Save size={12} />
            {save.isPending ? "Saving..." : "Save"}
          </button>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-500 uppercase tracking-wide border-b border-gray-800">
              <th className="text-left pb-2 pr-4 font-medium">Model</th>
              <th className="text-right pb-2 pr-4 font-medium">Input ¢/M tokens</th>
              <th className="text-right pb-2 pr-4 font-medium">Output ¢/M tokens</th>
              <th className="pb-2 w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {rows.map((row, i) => (
              <tr key={i}>
                <td className="py-2 pr-4">
                  <input
                    className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                    value={row.model}
                    onChange={(e) => updateRow(i, "model", e.target.value)}
                    placeholder="model-name"
                  />
                </td>
                <td className="py-2 pr-4">
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white text-right focus:outline-none focus:border-indigo-500"
                    value={row.inputPerM}
                    onChange={(e) => updateRow(i, "inputPerM", parseFloat(e.target.value) || 0)}
                  />
                </td>
                <td className="py-2 pr-4">
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white text-right focus:outline-none focus:border-indigo-500"
                    value={row.outputPerM}
                    onChange={(e) => updateRow(i, "outputPerM", parseFloat(e.target.value) || 0)}
                  />
                </td>
                <td className="py-2">
                  <button
                    onClick={() => removeRow(i)}
                    className="text-gray-600 hover:text-red-400 transition-colors"
                  >
                    <Trash2 size={13} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <button
          onClick={addRow}
          className="mt-3 flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
        >
          <Plus size={12} />
          Add model
        </button>

        {save.isError && (
          <p className="mt-3 text-xs text-red-400">Failed to save. Please try again.</p>
        )}
      </div>

      <SecretsSection />
    </div>
  );
}
