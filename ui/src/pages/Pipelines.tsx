import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Play, GitBranch } from "lucide-react";
import { api } from "../lib/api.ts";
import type { ApiPipeline } from "@zerohand/shared";

interface JsonSchemaProperty {
  type?: string;
  description?: string;
}

interface JsonSchema {
  type?: string;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
}

function TriggerModal({
  pipeline,
  onClose,
}: {
  pipeline: ApiPipeline;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const schema = (pipeline.inputSchema ?? null) as JsonSchema | null;
  const fields = schema?.properties ? Object.entries(schema.properties) : [];
  const required = new Set(schema?.required ?? []);

  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map(([key]) => [key, ""])),
  );

  const trigger = useMutation({
    mutationFn: () => {
      const params = Object.fromEntries(
        Object.entries(values).filter(([, v]) => v.trim() !== ""),
      );
      return api.triggerRun(pipeline.id, params);
    },
    onSuccess: (run) => {
      queryClient.invalidateQueries({ queryKey: ["runs"] });
      onClose();
      window.location.href = `/runs/${run.id}`;
    },
  });

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") trigger.mutate();
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-md shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-white mb-4">
          Run: {pipeline.name}
        </h2>

        {fields.length === 0 ? (
          <p className="text-sm text-gray-500 mb-4">No inputs required.</p>
        ) : (
          <div className="space-y-4 mb-4">
            {fields.map(([key, prop]) => (
              <div key={key}>
                <label className="block text-sm text-gray-400 mb-1">
                  {key}
                  {required.has(key) && <span className="text-red-400 ml-1">*</span>}
                </label>
                {prop.description && (
                  <p className="text-xs text-gray-600 mb-1">{prop.description}</p>
                )}
                <input
                  className="w-full bg-gray-800 border border-gray-600 rounded-md px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
                  placeholder={prop.description ?? key}
                  value={values[key] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
                  onKeyDown={handleKeyDown}
                />
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-3 justify-end">
          <button
            className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-md transition-colors disabled:opacity-50"
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

function PipelineRow({ pipeline }: { pipeline: ApiPipeline }) {
  const [showTrigger, setShowTrigger] = useState(false);

  return (
    <>
      <div className="flex items-center gap-4 px-5 py-4 bg-gray-900 rounded-lg border border-gray-800">
        <GitBranch size={16} className="text-indigo-400 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-gray-100">{pipeline.name}</div>
          {pipeline.description && (
            <div className="text-xs text-gray-500 mt-0.5 truncate">{pipeline.description}</div>
          )}
          <div className="text-xs text-gray-600 mt-0.5">
            {pipeline.steps.length} step{pipeline.steps.length !== 1 ? "s" : ""} · {pipeline.status}
          </div>
        </div>
        <button
          className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-md transition-colors"
          onClick={() => setShowTrigger(true)}
        >
          <Play size={12} />
          Run
        </button>
      </div>
      {showTrigger && (
        <TriggerModal pipeline={pipeline} onClose={() => setShowTrigger(false)} />
      )}
    </>
  );
}

export default function Pipelines() {
  const { data: pipelines = [], isLoading } = useQuery({
    queryKey: ["pipelines"],
    queryFn: () => api.listPipelines(),
  });

  if (isLoading) return <div className="p-8 text-gray-500">Loading...</div>;

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Pipelines</h1>
      </div>
      {pipelines.length === 0 ? (
        <div className="text-gray-500 text-sm">No pipelines yet.</div>
      ) : (
        <div className="space-y-3">
          {pipelines.map((p) => (
            <PipelineRow key={p.id} pipeline={p} />
          ))}
        </div>
      )}
    </div>
  );
}
