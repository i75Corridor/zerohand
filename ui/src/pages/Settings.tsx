import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bot } from "lucide-react";
import { api } from "../lib/api.ts";
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
    <div className="bg-slate-900 border border-slate-800 rounded-xl mb-6 overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-800 flex items-center gap-3">
        <Bot size={14} className="text-sky-400" />
        <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Active Models</h2>
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

export default function Settings() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl pt-14 lg:pt-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold font-display text-white tracking-tight">Settings</h1>
        <p className="text-sm text-slate-500 mt-1">Manage your models and preferences.</p>
      </div>

      <ActiveModelsSection />
    </div>
  );
}
