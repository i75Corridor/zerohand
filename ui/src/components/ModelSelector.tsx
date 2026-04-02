import { useQuery } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { api } from "../lib/api.ts";
import type { ApiModelEntry } from "@zerohand/shared";

const PROVIDER_LABELS: Record<string, string> = {
  google: "Google",
  anthropic: "Anthropic",
  openai: "OpenAI",
  xai: "xAI",
  groq: "Groq",
  mistral: "Mistral",
  openrouter: "OpenRouter",
};

function providerLabel(p: string): string {
  return PROVIDER_LABELS[p] ?? p;
}

interface ModelSelectorProps {
  value: string | null;
  onChange: (fullId: string | null) => void;
  /** When true, shows a "Use default" option (value = null) */
  allowNull?: boolean;
  defaultLabel?: string;
  className?: string;
}

export default function ModelSelector({
  value,
  onChange,
  allowNull = false,
  defaultLabel = "Use default",
  className = "",
}: ModelSelectorProps) {
  const { data: models = [] } = useQuery({
    queryKey: ["models"],
    queryFn: () => api.listModels(),
    staleTime: 60_000,
  });

  // Group by provider, available first
  const groups = models.reduce<Record<string, ApiModelEntry[]>>((acc, m) => {
    if (!acc[m.provider]) acc[m.provider] = [];
    acc[m.provider].push(m);
    return acc;
  }, {});

  const providers = Object.keys(groups).sort((a, b) => {
    const aAvail = groups[a].some((m) => m.available);
    const bAvail = groups[b].some((m) => m.available);
    if (aAvail && !bAvail) return -1;
    if (!aAvail && bAvail) return 1;
    return a.localeCompare(b);
  });

  const selectedModel = models.find((m) => m.fullId === value);

  return (
    <div className={`relative ${className}`}>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="w-full appearance-none bg-slate-800 border border-slate-700 rounded-xl pl-3 pr-8 py-2 text-sm text-white focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 cursor-pointer"
      >
        {allowNull && <option value="">{defaultLabel}</option>}
        {providers.map((provider) => (
          <optgroup key={provider} label={providerLabel(provider)}>
            {groups[provider].map((m) => (
              <option
                key={m.fullId}
                value={m.fullId}
                disabled={!m.available}
              >
                {m.name}
                {!m.available ? " (no API key)" : ""}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <ChevronDown
        size={14}
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"
      />
      {selectedModel && (
        <div className="mt-1 flex gap-3 text-xs text-gray-500">
          <span>{(selectedModel.contextWindow / 1000).toFixed(0)}k ctx</span>
          {selectedModel.costInputPerM > 0 && (
            <span>
              {selectedModel.costInputPerM}¢/{selectedModel.costOutputPerM}¢ per 1M
            </span>
          )}
          {selectedModel.reasoning && (
            <span className="text-sky-400">reasoning</span>
          )}
        </div>
      )}
    </div>
  );
}
