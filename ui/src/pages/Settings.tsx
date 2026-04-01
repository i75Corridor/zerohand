import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Plus, Trash2, Save, Settings as SettingsIcon } from "lucide-react";
import { api } from "../lib/api.ts";
import type { ModelCostEntry } from "@zerohand/shared";

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
    </div>
  );
}
