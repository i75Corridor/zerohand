import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useParams, Link, useNavigate } from "react-router-dom";
import React, { useState, useCallback } from "react";
import { ArrowLeft, Plus, Trash2, ChevronUp, ChevronDown, GitBranch, CheckSquare, ExternalLink, Save, Key, Server, Play, Loader2 } from "lucide-react";
import { api } from "../lib/api.ts";
import LoadingState from "../components/LoadingState.tsx";
import type { ApiPipeline, ApiPipelineStep, ApiSkill, ApiValidationResult, WsMessage } from "@pawn/shared";
import ModelSelector from "../components/ModelSelector.tsx";
import { useWebSocket } from "../lib/ws.ts";
import { parseFrontMatter, serializeFrontMatter, type SkillFm, ScriptEditor, NewScriptForm, TagInput, SchemaFieldEditor } from "../components/SkillEditor.tsx";

// ── Draft step type (before saving) ───────────────────────────────────────────

interface DraftStep {
  /** undefined = new step not yet persisted */
  id?: string;
  name: string;
  skillName: string;
  promptTemplate: string;
  timeoutSeconds: number;
  approvalRequired: boolean;
}

// ── Input schema builder ───────────────────────────────────────────────────────

interface SchemaField {
  key: string;
  type: "string" | "number" | "boolean";
  description: string;
  required: boolean;
}

function buildJsonSchema(fields: SchemaField[]): Record<string, unknown> | null {
  if (fields.length === 0) return null;
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const f of fields) {
    if (!f.key.trim()) continue;
    properties[f.key] = { type: f.type, description: f.description };
    if (f.required) required.push(f.key);
  }
  if (Object.keys(properties).length === 0) return null;
  return { type: "object", properties, required };
}

function schemaToFields(schema: Record<string, unknown> | null): SchemaField[] {
  if (!schema || typeof schema !== "object") return [];
  const props = (schema as { properties?: Record<string, { type?: string; description?: string }> }).properties;
  if (!props) return [];
  const req = new Set((schema as { required?: string[] }).required ?? []);
  return Object.entries(props).map(([key, def]) => ({
    key,
    type: (def?.type ?? "string") as "string" | "number" | "boolean",
    description: def?.description ?? "",
    required: req.has(key),
  }));
}

// ── Inline skill editor ───────────────────────────────────────────────────────

function InlineSkillEditor({ skillName }: { skillName: string }) {
  const queryClient = useQueryClient();
  const [addingScript, setAddingScript] = useState(false);

  const { data: bundle, isLoading, refetch: refetchBundle } = useQuery({
    queryKey: ["skill-bundle", skillName],
    queryFn: () => api.getSkillBundle(skillName),
    enabled: !!skillName,
  });

  const { data: mcpServers = [] } = useQuery({
    queryKey: ["mcp-servers"],
    queryFn: () => api.listMcpServers(),
  });

  const [localFm, setLocalFm] = useState<SkillFm | null>(null);
  const [localBody, setLocalBody] = useState<string | null>(null);
  const [savedMd, setSavedMd] = useState(false);

  // Sync fm/body when bundle loads (or skill changes)
  const bundleKey = bundle?.skillMd;
  React.useEffect(() => {
    if (!bundle) return;
    const { fm, body } = parseFrontMatter(bundle.skillMd);
    setLocalFm(fm);
    setLocalBody(body);
  }, [bundleKey]);

  const saveMd = useMutation({
    mutationFn: (content: string) => api.updateSkillContent(skillName, content),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["skill-bundle", skillName] });
      setSavedMd(true);
      setTimeout(() => setSavedMd(false), 2000);
    },
  });

  if (isLoading || !bundle) {
    return <div className="py-8 text-center text-xs text-pawn-surface-500">Loading skill…</div>;
  }
  if (!localFm || localBody === null) return null;

  const fm = localFm;
  const update = (patch: Partial<SkillFm>) => setLocalFm((f) => f ? { ...f, ...patch } : f);

  const [ns, name] = skillName.includes("/") ? skillName.split("/") : ["local", skillName];

  function handleSaveMd() {
    if (!localFm || localBody === null) return;
    saveMd.mutate(serializeFrontMatter(localFm, localBody));
  }

  return (
    <div className="space-y-4">
      {/* Header with link to full editor */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono text-violet-300">{skillName}</span>
        <Link
          to={`/skills/${encodeURIComponent(ns)}/${encodeURIComponent(name)}`}
          className="flex items-center gap-1 text-xs text-pawn-surface-500 hover:text-pawn-surface-300 transition-colors"
          target="_blank"
          rel="noopener noreferrer"
        >
          Full editor <ExternalLink size={11} />
        </Link>
      </div>

      {/* Description */}
      <div>
        <label className="block text-xs text-pawn-surface-400 mb-1">Description</label>
        <textarea
          className="w-full bg-pawn-surface-800 border border-pawn-surface-700 rounded-button px-3 py-2 text-xs text-pawn-text-secondary placeholder-pawn-surface-500 focus:outline-none focus:border-pawn-gold-500 resize-none"
          rows={2}
          value={fm.description}
          onChange={(e) => update({ description: e.target.value })}
          placeholder="What does this skill do?"
        />
      </div>

      {/* Model override */}
      <div>
        <label className="block text-xs text-pawn-surface-400 mb-1">Model override</label>
        <ModelSelector value={fm.model} onChange={(v) => update({ model: v })} allowNull defaultLabel="Use pipeline default" />
      </div>

      {/* Bash tool */}
      <div className="flex items-center justify-between py-0.5">
        <span className="text-xs text-pawn-surface-400">Bash tool</span>
        <button
          role="switch"
          aria-checked={fm.bash}
          onClick={() => update({ bash: !fm.bash })}
          className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer items-center rounded-full transition-colors ${
            fm.bash ? "bg-pawn-gold-500" : "bg-pawn-surface-700"
          }`}
        >
          <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${fm.bash ? "translate-x-4" : "translate-x-1"}`} />
        </button>
      </div>

      {/* Secrets */}
      <TagInput label="Secrets" icon={Key} tags={fm.secrets} onChange={(secrets) => update({ secrets })} addLabel="+ Add" placeholder="ENV_VAR_NAME" />

      {/* MCP Servers */}
      <TagInput label="MCP Servers" icon={Server} tags={fm.mcpServers} onChange={(mcpServers) => update({ mcpServers })} addLabel="+ Attach" addOptions={mcpServers.map((s) => s.name)} />

      {/* I/O Schemas */}
      <div className="pt-3 border-t border-pawn-surface-800 space-y-4">
        <SchemaFieldEditor
          label="Input Schema (advisory)"
          fields={fm.inputSchema}
          onChange={(inputSchema) => update({ inputSchema })}
          addLabel="+ Add input field"
        />
        <SchemaFieldEditor
          label="Output Schema (enforced)"
          fields={fm.outputSchema}
          onChange={(outputSchema) => update({ outputSchema })}
          addLabel="+ Add output field"
        />
      </div>

      {/* System prompt body */}
      <div>
        <label className="block text-xs text-pawn-surface-400 mb-1">System prompt</label>
        <textarea
          className="w-full bg-pawn-surface-800 border border-pawn-surface-700 rounded-button px-3 py-2 text-xs text-pawn-surface-300 font-mono leading-relaxed placeholder-pawn-surface-500 focus:outline-none focus:border-pawn-gold-500 resize-y"
          rows={8}
          value={localBody}
          onChange={(e) => setLocalBody(e.target.value)}
          spellCheck={false}
          placeholder="Enter the core instructions for the AI agent…"
        />
      </div>

      {/* Save SKILL.md */}
      <button
        onClick={handleSaveMd}
        disabled={saveMd.isPending}
        className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-pawn-gold-500 hover:bg-pawn-gold-400 text-pawn-surface-950 font-semibold rounded-button transition-colors disabled:opacity-50"
      >
        <Save size={12} />
        {saveMd.isPending ? "Saving…" : savedMd ? "Saved!" : "Save SKILL.md"}
      </button>

      {/* Scripts */}
      <div className="pt-2 border-t border-pawn-surface-800">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold text-pawn-surface-400 uppercase tracking-wider">Scripts ({bundle.scripts.length})</span>
          {!addingScript && (
            <button
              onClick={() => setAddingScript(true)}
              className="flex items-center gap-1 text-xs text-pawn-surface-500 hover:text-pawn-surface-300 transition-colors"
            >
              <Plus size={12} /> Add script
            </button>
          )}
        </div>
        <div className="space-y-3">
          {bundle.scripts.map((script) => (
            <ScriptEditor key={script.filename} skillName={skillName} script={script} onDeleted={() => void refetchBundle()} />
          ))}
          {addingScript && (
            <NewScriptForm skillName={skillName} onCreated={() => setAddingScript(false)} onCancel={() => setAddingScript(false)} />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Step test panel ────────────────────────────────────────────────────────────

/** Parse a prompt template and return which {{input.X}} and {{steps.N.output[.field]}} tokens are used. */
function parsePromptTokens(template: string) {
  const inputKeys = new Set<string>();
  // stepIdx → set of sub-field paths ('' means the whole output is used directly)
  const stepFields = new Map<number, Set<string>>();

  for (const [, raw] of template.matchAll(/\{\{([^}]+)\}\}/g)) {
    const parts = raw.trim().split(".");
    if (parts[0] === "input" && parts.length >= 2) {
      inputKeys.add(parts[1]);
    } else if (parts[0] === "steps" && parts.length >= 3 && parts[2] === "output") {
      const idx = parseInt(parts[1], 10);
      if (!isNaN(idx)) {
        if (!stepFields.has(idx)) stepFields.set(idx, new Set());
        stepFields.get(idx)!.add(parts.length > 3 ? parts.slice(3).join(".") : "");
      }
    }
  }

  return {
    inputKeys: [...inputKeys],
    stepIndices: [...stepFields.keys()].sort((a, b) => a - b),
    stepFields,
  };
}

function JsonEditor({
  label,
  value,
  onChange,
  rows = 4,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
}) {
  const invalid = value.trim() !== "" && (() => { try { JSON.parse(value); return false; } catch { return true; } })();
  return (
    <div>
      <label className="block text-xs text-pawn-surface-500 mb-1 font-mono">{label}</label>
      <textarea
        className={`w-full bg-pawn-surface-800 border rounded-button px-3 py-2 text-xs text-pawn-text-primary font-mono leading-relaxed focus:outline-none resize-none ${
          invalid ? "border-rose-500/70 focus:border-rose-400" : "border-pawn-surface-700 focus:border-pawn-gold-500"
        }`}
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
      />
      {invalid && <p className="text-[10px] text-rose-400 mt-0.5">Invalid JSON</p>}
    </div>
  );
}

function StepTestPanel({
  pipelineId,
  stepIndex,
  promptTemplate,
}: {
  pipelineId: string;
  stepIndex: number;
  promptTemplate: string;
}) {
  const { inputKeys, stepIndices, stepFields } = parsePromptTokens(promptTemplate);

  const initInputsJson = (keys: string[]) =>
    keys.length === 0 ? "" : JSON.stringify(Object.fromEntries(keys.map((k) => [k, ""])), null, 2);

  const initStepsJson = (indices: number[], fields: Map<number, Set<string>>) => {
    const obj: Record<string, string> = {};
    for (const idx of indices) {
      const subFields = [...(fields.get(idx) ?? [])].filter(Boolean);
      obj[String(idx)] = subFields.length > 0
        ? JSON.stringify(Object.fromEntries(subFields.map((f) => [f, ""])), null, 2)
        : "";
    }
    return obj;
  };

  const [inputsJson, setInputsJson] = useState(() => initInputsJson(inputKeys));
  const [stepsJson, setStepsJson] = useState<Record<string, string>>(() => initStepsJson(stepIndices, stepFields));
  const [result, setResult] = useState<{ output: string; toolCalls: string[]; usage: Record<string, unknown> } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [showResult, setShowResult] = useState(true);

  // Sync when template tokens change — preserve existing values for keys still present
  React.useEffect(() => {
    setInputsJson((prev) => {
      if (inputKeys.length === 0) return "";
      try {
        const current = JSON.parse(prev) as Record<string, string>;
        return JSON.stringify(Object.fromEntries(inputKeys.map((k) => [k, current[k] ?? ""])), null, 2);
      } catch {
        return initInputsJson(inputKeys);
      }
    });
  }, [inputKeys.join(",")]);

  React.useEffect(() => {
    setStepsJson((prev) => {
      const next: Record<string, string> = {};
      for (const idx of stepIndices) {
        if (prev[String(idx)] !== undefined) {
          next[String(idx)] = prev[String(idx)];
        } else {
          const subFields = [...(stepFields.get(idx) ?? [])].filter(Boolean);
          next[String(idx)] = subFields.length > 0
            ? JSON.stringify(Object.fromEntries(subFields.map((f) => [f, ""])), null, 2)
            : "";
        }
      }
      return next;
    });
  }, [stepIndices.join(",")]);

  async function run() {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      let mockInputs: Record<string, string> = {};
      if (inputsJson.trim()) {
        try {
          mockInputs = JSON.parse(inputsJson) as Record<string, string>;
        } catch {
          setError("Pipeline inputs: invalid JSON");
          return;
        }
      }
      const previousOutputs: Record<string, string> = {};
      for (const [idxStr, val] of Object.entries(stepsJson)) {
        previousOutputs[idxStr] = val;
      }
      const res = await api.testStep(pipelineId, stepIndex, mockInputs, previousOutputs);
      setResult(res);
      setShowResult(true);
    } catch (err) {
      setError(String(err));
    } finally {
      setRunning(false);
    }
  }

  const hasAnything = inputKeys.length > 0 || stepIndices.length > 0;

  return (
    <div className="space-y-4">
      {/* Pipeline inputs */}
      {inputKeys.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-pawn-surface-400 uppercase tracking-wider mb-2">Pipeline inputs</p>
          <JsonEditor label="{ input }" value={inputsJson} onChange={setInputsJson} rows={Math.max(3, inputKeys.length * 2 + 2)} />
        </div>
      )}

      {/* Previous step outputs */}
      {stepIndices.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-pawn-surface-400 uppercase tracking-wider">Previous step outputs</p>
          {stepIndices.map((idx) => {
            const subFields = [...(stepFields.get(idx) ?? [])].filter(Boolean);
            return (
              <JsonEditor
                key={idx}
                label={`steps.${idx}.output`}
                value={stepsJson[String(idx)] ?? ""}
                onChange={(v) => setStepsJson((p) => ({ ...p, [String(idx)]: v }))}
                rows={subFields.length > 0 ? Math.max(3, subFields.length * 2 + 2) : 3}
              />
            );
          })}
        </div>
      )}

      {!hasAnything && (
        <p className="text-xs text-pawn-surface-500 italic">No inputs to mock — this step uses no tokens. Click Run to execute.</p>
      )}

      {/* Run button */}
      <button
        onClick={run}
        disabled={running}
        className="flex items-center gap-2 text-xs px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-button transition-colors disabled:opacity-50"
      >
        {running ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
        {running ? "Running…" : "Run test"}
      </button>

      {/* Error */}
      {error && (
        <div className="bg-rose-950/30 border border-rose-900/50 rounded-button p-3 text-xs text-rose-300 font-mono whitespace-pre-wrap">
          {error}
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="space-y-2">
          <button
            onClick={() => setShowResult((v) => !v)}
            className="flex items-center gap-1.5 text-xs font-semibold text-pawn-surface-400 uppercase tracking-wider hover:text-pawn-surface-200 transition-colors"
          >
            <ChevronDown size={12} className={`transition-transform ${showResult ? "" : "-rotate-90"}`} />
            Result
          </button>
          {showResult && (
            <div className="space-y-2">
              <pre className="bg-pawn-surface-800 border border-pawn-surface-700 rounded-button p-3 text-xs text-pawn-surface-300 font-mono whitespace-pre-wrap leading-relaxed max-h-64 overflow-auto">
                {result.output}
              </pre>
              {result.toolCalls.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[10px] text-pawn-surface-500 uppercase tracking-wider font-bold">Tool calls</p>
                  {result.toolCalls.map((tc, i) => (
                    <div key={i} className="text-xs font-mono text-violet-300 bg-pawn-surface-800 rounded px-2 py-1">{tc}</div>
                  ))}
                </div>
              )}
              {result.usage && (
                <p className="text-[10px] text-pawn-surface-600 font-mono">
                  {JSON.stringify(result.usage)}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Step form (right panel) ────────────────────────────────────────────────────

function StepForm({
  step,
  steps: allSteps,
  skills,
  inputKeys,
  stepIndex,
  totalSteps,
  onChange,
}: {
  step: DraftStep;
  steps: DraftStep[];
  skills: ApiSkill[];
  inputKeys: string[];
  stepIndex: number;
  totalSteps: number;
  onChange: (updated: DraftStep) => void;
}) {
  // Build a lookup map: stepIndex → skill outputSchema field names (for steps before this one)
  const priorStepOutputSchemas = Array.from({ length: stepIndex }, (_, i) => {
    const priorSkillName = allSteps[i]?.skillName ?? "";
    if (!priorSkillName) return [];
    const skillData = skills.find((s) => {
      const qn = `${s.namespace ?? "local"}/${s.name}`;
      return qn === priorSkillName || s.name === priorSkillName;
    });
    return skillData?.outputSchema ?? [];
  });

  // Token hints: input fields + for each prior step, the step-level token and any declared field tokens
  const tokenHints: Array<{ token: string; isField: boolean; stepIndex?: number }> = [
    ...inputKeys.map((k) => ({ token: `{{input.${k}}}`, isField: false })),
    ...Array.from({ length: stepIndex }, (_, i) => {
      const fields = priorStepOutputSchemas[i];
      const base = { token: `{{steps.${i + 1}.output}}`, isField: false, stepIndex: i };
      if (fields.length === 0) return [base];
      return [base, ...fields.map((f) => ({ token: `{{steps.${i + 1}.output.${f.name}}}`, isField: true, stepIndex: i }))];
    }).flat(),
  ];

  const insertToken = (token: string) => {
    onChange({ ...step, promptTemplate: step.promptTemplate + token });
  };

  // Skill I/O summary for the selected skill
  const selectedSkillData = step.skillName
    ? skills.find((s) => {
        const qn = `${s.namespace ?? "local"}/${s.name}`;
        return qn === step.skillName || s.name === step.skillName;
      })
    : null;

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs text-pawn-surface-400 mb-1">Step name</label>
        <input
          className="w-full bg-pawn-surface-800 border border-pawn-surface-700 rounded-button px-3 py-2 text-sm text-pawn-text-primary placeholder-pawn-surface-500 focus:outline-none focus:border-pawn-gold-500 focus:ring-1 focus:ring-pawn-gold-500"
          value={step.name}
          onChange={(e) => onChange({ ...step, name: e.target.value })}
          placeholder="Unnamed step"
        />
      </div>

      <div>
        <label className="block text-xs text-pawn-surface-400 mb-1">Skill</label>
        <select
          className="w-full bg-pawn-surface-800 border border-pawn-surface-700 rounded-button px-3 py-2 text-sm text-pawn-text-primary focus:outline-none focus:border-pawn-gold-500 focus:ring-1 focus:ring-pawn-gold-500"
          value={step.skillName}
          onChange={(e) => onChange({ ...step, skillName: e.target.value })}
        >
          <option value="">— select skill —</option>
          {/* Group skills by namespace */}
          {Array.from(
            skills.reduce((groups, s) => {
              const ns = s.namespace ?? "local";
              if (!groups.has(ns)) groups.set(ns, []);
              groups.get(ns)!.push(s);
              return groups;
            }, new Map<string, ApiSkill[]>()).entries()
          )
            .sort(([a], [b]) => (a === "local" ? -1 : b === "local" ? 1 : a.localeCompare(b)))
            .map(([ns, nsSkills]) => (
              <optgroup key={ns} label={ns}>
                {nsSkills.map((s) => {
                  const qn = `${ns}/${s.name}`;
                  return <option key={qn} value={qn}>{s.name}</option>;
                })}
              </optgroup>
            ))
          }
        </select>
        {/* Skill I/O summary */}
        {selectedSkillData && (selectedSkillData.inputSchema?.length || selectedSkillData.outputSchema?.length) ? (
          <div className="mt-1.5 space-y-0.5">
            {selectedSkillData.inputSchema && selectedSkillData.inputSchema.length > 0 && (
              <p className="text-[10px] text-pawn-surface-500">
                <span className="text-pawn-surface-600 font-medium">Expects:</span>{" "}
                {selectedSkillData.inputSchema.map((f) => (
                  <span key={f.name} className="font-mono text-pawn-surface-400">{f.name}{f.required ? "" : "?"}{" "}</span>
                ))}
              </p>
            )}
            {selectedSkillData.outputSchema && selectedSkillData.outputSchema.length > 0 && (
              <p className="text-[10px] text-pawn-surface-500">
                <span className="text-emerald-600 font-medium">Produces:</span>{" "}
                {selectedSkillData.outputSchema.map((f) => (
                  <span key={f.name} className="font-mono text-emerald-500/70">{f.name}{f.required ? "" : "?"}{" "}</span>
                ))}
              </p>
            )}
          </div>
        ) : null}
      </div>

      <div>
        <label className="block text-xs text-pawn-surface-400 mb-1">Prompt template</label>
        {tokenHints.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {tokenHints.map(({ token, isField }) => (
              <button
                key={token}
                type="button"
                className={`text-xs px-2 py-0.5 border rounded font-mono transition-colors ${
                  isField
                    ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20 hover:bg-emerald-500/20 ml-1"
                    : "bg-pawn-gold-500/10 text-pawn-gold-300 border-pawn-gold-500/20 hover:bg-pawn-gold-500/20"
                }`}
                onClick={() => insertToken(token)}
                title={isField ? "Output field reference" : undefined}
              >
                {token}
              </button>
            ))}
          </div>
        )}
        <textarea
          className="w-full bg-pawn-surface-800 border border-pawn-surface-700 rounded-button px-3 py-2 text-sm text-pawn-text-primary placeholder-pawn-surface-500 focus:outline-none focus:border-pawn-gold-500 focus:ring-1 focus:ring-pawn-gold-500 font-mono leading-relaxed resize-y"
          rows={6}
          value={step.promptTemplate}
          onChange={(e) => onChange({ ...step, promptTemplate: e.target.value })}
          placeholder="Write a satirical article about {{input.topic}}"
        />
        {/* Highlight unresolvable tokens */}
        {(() => {
          const allTokens = [...step.promptTemplate.matchAll(/\{\{([^}]+)\}\}/g)].map((m) => m[1].trim());
          const invalid = [...new Set(allTokens)].filter((token) => {
            if (token.startsWith("input.")) {
              return !inputKeys.includes(token.slice(6));
            }
            if (token.startsWith("steps.")) {
              const n = parseInt(token.split(".")[1], 10);
              // Token indices are 1-based (n=1 → first step); 0 is legacy compat for first step.
              const mapped = n >= 1 ? n - 1 : 0;
              return isNaN(n) || mapped >= stepIndex;
            }
            return false; // context/secret tokens — no red highlight
          });
          if (invalid.length === 0) return null;
          return (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {invalid.map((t) => (
                <span key={t} className="text-xs px-2 py-0.5 bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded font-mono">
                  {`{{${t}}}`} unresolvable
                </span>
              ))}
            </div>
          );
        })()}
      </div>

      <div className="flex gap-4">
        <div className="flex-1">
          <label className="block text-xs text-pawn-surface-400 mb-1">Timeout (seconds)</label>
          <input
            type="number"
            min="10"
            max="3600"
            className="w-full bg-pawn-surface-800 border border-pawn-surface-700 rounded-button px-3 py-2 text-sm text-pawn-text-primary focus:outline-none focus:border-pawn-gold-500 focus:ring-1 focus:ring-pawn-gold-500"
            value={step.timeoutSeconds}
            onChange={(e) => onChange({ ...step, timeoutSeconds: parseInt(e.target.value) || 300 })}
          />
        </div>
        <div className="flex items-end pb-2">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              className="w-4 h-4 accent-pawn-gold-500"
              checked={step.approvalRequired}
              onChange={(e) => onChange({ ...step, approvalRequired: e.target.checked })}
            />
            <span className="text-sm text-pawn-surface-300 flex items-center gap-1">
              <CheckSquare size={13} className="text-yellow-500" /> Require approval
            </span>
          </label>
        </div>
      </div>

      <p className="text-xs text-pawn-surface-600">Step {stepIndex + 1} of {totalSteps}</p>
    </div>
  );
}

// ── Step list (left panel) ─────────────────────────────────────────────────────

function StepList({
  steps,
  selectedIndex,
  validationResult,
  onSelect,
  onAdd,
  onRemove,
  onMove,
}: {
  steps: DraftStep[];
  selectedIndex: number | null;
  validationResult?: ApiValidationResult | null;
  onSelect: (i: number) => void;
  onAdd: () => void;
  onRemove: (i: number) => void;
  onMove: (from: number, to: number) => void;
}) {
  function stepMessages(i: number) {
    if (!validationResult) return [];
    return [...validationResult.errors, ...validationResult.warnings].filter((e) => e.stepIndex === i);
  }

  function stepNumberRing(i: number): { boxShadow?: string } {
    if (!validationResult) return {};
    const msgs = stepMessages(i);
    if (msgs.some((m) => m.severity === "error")) return { boxShadow: "0 0 0 2px #ef4444" };
    if (msgs.some((m) => m.severity === "warning")) return { boxShadow: "0 0 0 2px #fbbf24" };
    return { boxShadow: "0 0 0 2px #22c55e" };
  }

  return (
    <div className="space-y-2">
      {steps.map((step, i) => (
        <div key={i} className="relative group">
          <button
            className={`w-full text-left px-4 py-3 rounded-button border transition-colors ${
              selectedIndex === i
                ? "bg-indigo-900/20 border-indigo-500/40"
                : "bg-pawn-surface-800 border-pawn-surface-700 hover:border-pawn-surface-600"
            }`}
            onClick={() => onSelect(i)}
          >
            <div className="flex items-center gap-3">
              <div className="group/badge relative flex-shrink-0">
                <div className="w-6 h-6 rounded-full bg-indigo-500/80 flex items-center justify-center text-xs font-semibold text-white" style={stepNumberRing(i)}>
                  {i + 1}
                </div>
                {stepMessages(i).length > 0 && (
                  <div className="absolute left-8 top-1/2 -translate-y-1/2 z-50 w-72 bg-pawn-surface-800 border border-pawn-surface-700 rounded-card p-3 shadow-xl pointer-events-none hidden group-hover/badge:block">
                    <div className="space-y-1.5">
                      {stepMessages(i).map((m, j) => (
                        <div key={j} className="flex items-start gap-1.5 text-xs">
                          <span className={`flex-shrink-0 mt-0.5 ${m.severity === "error" ? "text-rose-400" : "text-amber-400"}`}>
                            {m.severity === "error" ? "✕" : "⚠"}
                          </span>
                          <span className="text-pawn-text-primary leading-tight">{m.message}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-pawn-text-primary truncate">{step.name || "Unnamed step"}</div>
                {step.skillName && (
                  <div className="text-xs text-violet-400 mt-0.5 truncate">
                    skill: {step.skillName}
                  </div>
                )}
              </div>
            </div>
          </button>

          {/* Reorder / delete controls */}
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-60 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
            <button
              className="p-1 text-pawn-surface-500 hover:text-pawn-surface-200 disabled:opacity-30"
              disabled={i === 0}
              onClick={(e) => { e.stopPropagation(); onMove(i, i - 1); }}
              aria-label="Move step up"
            >
              <ChevronUp size={13} />
            </button>
            <button
              className="p-1 text-pawn-surface-500 hover:text-pawn-surface-200 disabled:opacity-30"
              disabled={i === steps.length - 1}
              onClick={(e) => { e.stopPropagation(); onMove(i, i + 1); }}
              aria-label="Move step down"
            >
              <ChevronDown size={13} />
            </button>
            <button
              className="p-1 text-pawn-surface-500 hover:text-rose-400"
              onClick={(e) => { e.stopPropagation(); onRemove(i); }}
              aria-label="Remove step"
            >
              <Trash2 size={13} />
            </button>
          </div>

          {/* Connector line */}
          {i < steps.length - 1 && (
            <div className="flex justify-center my-1">
              <div className="w-0.5 h-3 bg-indigo-800" />
            </div>
          )}
        </div>
      ))}

      <button
        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-pawn-surface-900 border border-pawn-surface-800 hover:border-indigo-500/40 text-pawn-surface-500 hover:text-indigo-400 hover:bg-indigo-500/5 rounded-button transition-colors text-sm"
        onClick={onAdd}
      >
        <Plus size={14} /> Add step
      </button>
    </div>
  );
}

// ── Schema builder ─────────────────────────────────────────────────────────────

function SchemaBuilder({ fields, onChange }: { fields: SchemaField[]; onChange: (f: SchemaField[]) => void }) {
  const add = () => onChange([...fields, { key: "", type: "string", description: "", required: false }]);
  const remove = (i: number) => onChange(fields.filter((_, j) => j !== i));
  const update = (i: number, patch: Partial<SchemaField>) =>
    onChange(fields.map((f, j) => (j === i ? { ...f, ...patch } : f)));

  return (
    <div className="space-y-2">
      {fields.map((f, i) => (
        <div key={i} className="flex items-start gap-2 p-3 bg-pawn-surface-800/50 rounded-button">
          <div className="flex-1 space-y-2">
            <div className="flex gap-2">
              <input
                className="flex-1 bg-pawn-surface-700 border border-pawn-surface-600 rounded px-2 py-1 text-xs text-pawn-text-primary placeholder-pawn-surface-500 focus:outline-none focus:border-pawn-gold-500"
                placeholder="field_name"
                value={f.key}
                onChange={(e) => update(i, { key: e.target.value })}
              />
              <select
                className="bg-pawn-surface-700 border border-pawn-surface-600 rounded px-2 py-1 text-xs text-pawn-text-primary focus:outline-none focus:border-pawn-gold-500"
                value={f.type}
                onChange={(e) => update(i, { type: e.target.value as "string" | "number" | "boolean" })}
              >
                <option value="string">string</option>
                <option value="number">number</option>
                <option value="boolean">boolean</option>
              </select>
              <label className="flex items-center gap-1 text-xs text-pawn-surface-400 whitespace-nowrap">
                <input
                  type="checkbox"
                  className="accent-pawn-gold-500"
                  checked={f.required}
                  onChange={(e) => update(i, { required: e.target.checked })}
                />
                required
              </label>
            </div>
            <input
              className="w-full bg-pawn-surface-700 border border-pawn-surface-600 rounded px-2 py-1 text-xs text-pawn-text-primary placeholder-pawn-surface-500 focus:outline-none focus:border-pawn-gold-500"
              placeholder="Description (shown as hint)"
              value={f.description}
              onChange={(e) => update(i, { description: e.target.value })}
            />
          </div>
          <button className="text-pawn-surface-600 hover:text-rose-400 mt-1" onClick={() => remove(i)} aria-label="Remove field">
            <Trash2 size={13} />
          </button>
        </div>
      ))}
      <button
        className="flex items-center gap-1.5 text-xs text-pawn-gold-400 hover:text-pawn-gold-300 transition-colors"
        onClick={add}
      >
        <Plus size={12} /> Add input field
      </button>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function PipelineBuilder() {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Load existing pipeline (edit mode)
  const { data: existing, isLoading: loadingPipeline } = useQuery({
    queryKey: ["pipeline", id],
    queryFn: () => api.getPipeline(id!),
    enabled: isEdit,
  });

  // Auto-validate on load in edit mode so step rings always reflect current state
  const { data: autoValidation } = useQuery({
    queryKey: ["validate-builder", id],
    queryFn: () => api.validatePipeline(id!),
    enabled: isEdit,
    staleTime: 30_000,
  });

  const { data: skills = [], isLoading: loadingSkills } = useQuery({
    queryKey: ["skills"],
    queryFn: () => api.listSkills(),
  });

  // Pipeline metadata
  const [name, setName] = useState(() => existing?.name ?? "");
  const [description, setDescription] = useState(() => existing?.description ?? "");
  const [schemaFields, setSchemaFields] = useState<SchemaField[]>(() =>
    schemaToFields((existing?.inputSchema ?? null) as Record<string, unknown> | null),
  );
  const [modelFullId, setModelFullId] = useState<string | null>(() =>
    existing?.modelProvider && existing?.modelName
      ? `${existing.modelProvider}/${existing.modelName}`
      : null,
  );

  // Sync from loaded existing pipeline (first load in edit mode)
  const [synced, setSynced] = useState(false);
  if (existing && !synced) {
    setName(existing.name);
    setDescription(existing.description ?? "");
    setSchemaFields(schemaToFields((existing.inputSchema ?? null) as Record<string, unknown> | null));
    setModelFullId(
      existing.modelProvider && existing.modelName
        ? `${existing.modelProvider}/${existing.modelName}`
        : null,
    );
    setSynced(true);
  }

  // Steps
  const [steps, setSteps] = useState<DraftStep[]>(() => {
    if (!existing) return [];
    return [...existing.steps]
      .sort((a, b) => a.stepIndex - b.stepIndex)
      .map((s) => ({
        id: s.id,
        name: s.name,
        skillName: s.skillName ?? "",
        promptTemplate: s.promptTemplate,
        timeoutSeconds: s.timeoutSeconds,
        approvalRequired: s.approvalRequired,
      }));
  });

  // Sync steps from existing once loaded
  const [stepsSynced, setStepsSynced] = useState(false);
  if (existing && !stepsSynced) {
    setSteps(
      [...existing.steps]
        .sort((a, b) => a.stepIndex - b.stepIndex)
        .map((s) => ({
          id: s.id,
          name: s.name,
          skillName: s.skillName ?? "",
          promptTemplate: s.promptTemplate,
          timeoutSeconds: s.timeoutSeconds,
          approvalRequired: s.approvalRequired,
        })),
    );
    setStepsSynced(true);
  }

  // Reset sync flags when the agent modifies the pipeline externally so re-fetched data is applied
  useWebSocket(useCallback((msg: WsMessage) => {
    if (msg.type !== "data_changed") return;
    if ((msg.entity === "step" || msg.entity === "pipeline") && isEdit) {
      queryClient.invalidateQueries({ queryKey: ["pipeline", id] });
      setSynced(false);
      setStepsSynced(false);
    }
    if (msg.entity === "skill") {
      queryClient.invalidateQueries({ queryKey: ["skills"] });
    }
  }, [id, isEdit, queryClient]));

  const [selectedStep, setSelectedStep] = useState<number | null>(null);
  const [rightTab, setRightTab] = useState<"config" | "skill" | "test">("config");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationResult, setValidationResult] = useState<ApiValidationResult | null>(null);

  const inputKeys = schemaFields.map((f) => f.key).filter(Boolean);

  const addStep = useCallback(() => {
    const newStep: DraftStep = {
      name: `Step ${steps.length + 1}`,
      skillName: "",
      promptTemplate: "",
      timeoutSeconds: 300,
      approvalRequired: false,
    };
    setSteps((prev) => [...prev, newStep]);
    setSelectedStep(steps.length);
  }, [steps.length]);

  const removeStep = useCallback((i: number) => {
    setSteps((prev) => prev.filter((_, j) => j !== i));
    setSelectedStep((prev) => {
      if (prev === null) return null;
      if (prev === i) return null;
      if (prev > i) return prev - 1;
      return prev;
    });
    setRightTab("config");
  }, []);

  const moveStep = useCallback((from: number, to: number) => {
    setSteps((prev) => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
    setSelectedStep(to);
  }, []);

  const updateStep = useCallback((i: number, updated: DraftStep) => {
    setSteps((prev) => prev.map((s, j) => (j === i ? updated : s)));
    setValidationResult(null);
  }, []);

  const save = async () => {
    if (!name.trim()) { setError("Pipeline name is required."); return; }
    setSaving(true);
    setError(null);
    try {
      const inputSchema = buildJsonSchema(schemaFields);
      const modelProvider = modelFullId ? modelFullId.split("/")[0] : null;
      const modelName = modelFullId ? modelFullId.split("/").slice(1).join("/") : null;
      let pipeline: ApiPipeline;

      if (isEdit && existing) {
        pipeline = await api.updatePipeline(existing.id, {
          name,
          description: description || undefined,
          inputSchema,
          modelProvider: modelProvider ?? undefined,
          modelName: modelName ?? undefined,
        });

        // Diff steps: update existing, create new, delete removed
        const existingStepMap = new Map(existing.steps.map((s) => [s.id, s]));
        const keptIds = new Set<string>();

        for (let i = 0; i < steps.length; i++) {
          const draft = steps[i];
          const body: Partial<ApiPipelineStep> = {
            stepIndex: i,
            name: draft.name,
            skillName: draft.skillName || null,
            promptTemplate: draft.promptTemplate,
            timeoutSeconds: draft.timeoutSeconds,
            approvalRequired: draft.approvalRequired,
          };
          if (draft.id && existingStepMap.has(draft.id)) {
            await api.updateStep(existing.id, draft.id, body);
            keptIds.add(draft.id);
          } else {
            const created = await api.createStep(existing.id, body);
            keptIds.add(created.id);
          }
        }

        // Delete steps that were removed
        for (const s of existing.steps) {
          if (!keptIds.has(s.id)) {
            await api.deleteStep(existing.id, s.id);
          }
        }
      } else {
        pipeline = await api.createPipeline({
          name,
          description: description || undefined,
          inputSchema,
          modelProvider: modelProvider ?? undefined,
          modelName: modelName ?? undefined,
        });
        for (let i = 0; i < steps.length; i++) {
          const draft = steps[i];
          await api.createStep(pipeline.id, {
            stepIndex: i,
            name: draft.name,
            skillName: draft.skillName || null,
            promptTemplate: draft.promptTemplate,
            timeoutSeconds: draft.timeoutSeconds,
            approvalRequired: draft.approvalRequired,
          });
        }
      }

      queryClient.invalidateQueries({ queryKey: ["pipelines"] });
      queryClient.invalidateQueries({ queryKey: ["pipeline", id] });
      queryClient.invalidateQueries({ queryKey: ["validate-builder", id] });

      // Run validation and show results before navigating in edit mode
      if (isEdit && existing) {
        try {
          const vr = await api.validatePipeline(existing.id);
          setValidationResult(vr);
          if (!vr.valid || vr.warnings.length > 0) {
            // Stay on page briefly so user sees the dots
            setSaving(false);
            return;
          }
        } catch {
          // Ignore validation errors — still navigate
        }
      }

      navigate(`/pipelines/${pipeline.id}`);
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  };

  if (isEdit && loadingPipeline) return <LoadingState />;
  const loading = loadingSkills;

  return (
    <div className="p-4 sm:p-6 lg:p-10 max-w-6xl pt-14 lg:pt-10">
      {/* Header */}
      <div className="mb-8">
        <Link
          to={isEdit ? `/pipelines/${id}` : "/pipelines"}
          className="flex items-center gap-1.5 text-xs text-pawn-surface-500 hover:text-pawn-surface-300 mb-5 transition-colors"
        >
          <ArrowLeft size={12} /> {isEdit ? "Back to pipeline" : "Pipelines"}
        </Link>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <GitBranch size={20} className="text-indigo-400" />
            <h1 className="text-2xl font-semibold font-display text-pawn-text-primary tracking-tight">{isEdit ? "Edit Pipeline" : "New Pipeline"}</h1>
          </div>
          <div className="flex items-center gap-3">
            {error && <span className="text-xs text-rose-400">{error}</span>}
            <button
              className="px-4 py-2 bg-pawn-gold-500 hover:bg-pawn-gold-400 text-pawn-surface-950 text-sm font-medium rounded-button disabled:opacity-50"
              disabled={saving || loading}
              onClick={save}
            >
              {saving ? "Saving..." : isEdit ? "Save Changes" : "Create Pipeline"}
            </button>
          </div>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 lg:gap-8">
        {/* Left: step list + metadata */}
        <div className="col-span-2 space-y-6">
          {/* Metadata */}
          <div className="bg-pawn-surface-900 border border-pawn-surface-800 rounded-card p-5 space-y-4">
            <h2 className="text-xs font-semibold text-pawn-surface-400 uppercase tracking-wider">Pipeline</h2>
            <div>
              <label className="block text-xs text-pawn-surface-400 mb-1">Name <span className="text-rose-400">*</span></label>
              <input
                className="w-full bg-pawn-surface-800 border border-pawn-surface-700 rounded-button px-3 py-2 text-sm text-pawn-text-primary placeholder-pawn-surface-500 focus:outline-none focus:border-pawn-gold-500 focus:ring-1 focus:ring-pawn-gold-500"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Pipeline"
              />
            </div>
            <div>
              <label className="block text-xs text-pawn-surface-400 mb-1">Description</label>
              <textarea
                className="w-full bg-pawn-surface-800 border border-pawn-surface-700 rounded-button px-3 py-2 text-sm text-pawn-text-primary placeholder-pawn-surface-500 focus:outline-none focus:border-pawn-gold-500 focus:ring-1 focus:ring-pawn-gold-500 resize-none"
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What does this pipeline do?"
              />
            </div>
            <div>
              <label className="block text-xs text-pawn-surface-400 mb-1.5">Model</label>
              <ModelSelector
                value={modelFullId}
                onChange={setModelFullId}
                allowNull
                defaultLabel="Use default (from settings)"
              />
            </div>
            <div>
              <label className="block text-xs text-pawn-surface-400 mb-2">Input schema</label>
              <SchemaBuilder fields={schemaFields} onChange={setSchemaFields} />
            </div>
          </div>

          {/* Steps */}
          <div className="bg-pawn-surface-900 border border-pawn-surface-800 rounded-card p-5">
            <h2 className="text-xs font-semibold text-pawn-surface-400 uppercase tracking-wider mb-4">
              Steps ({steps.length})
            </h2>
            <StepList
              steps={steps}
              selectedIndex={selectedStep}
              validationResult={validationResult ?? autoValidation ?? null}
              onSelect={setSelectedStep}
              onAdd={addStep}
              onRemove={removeStep}
              onMove={moveStep}
            />
          </div>
        </div>

        {/* Right: step editor */}
        <div className="col-span-3">
          <div className="bg-pawn-surface-900 border border-pawn-surface-800 rounded-card sticky top-6 overflow-hidden">
            {selectedStep !== null && steps[selectedStep] ? (() => {
              const step = steps[selectedStep];
              const hasSkill = !!step.skillName;
              const canTest = isEdit && !!id && hasSkill;
              return (
                <>
                  {/* Tab bar */}
                  <div className="flex border-b border-pawn-surface-800">
                    {(["config", "skill", "test"] as const).map((tab) => {
                      const labels: Record<typeof tab, string> = { config: "Step Config", skill: "Edit Skill", test: "Test Step" };
                      const disabled = (tab === "skill" && !hasSkill) || (tab === "test" && !canTest);
                      return (
                        <button
                          key={tab}
                          onClick={() => !disabled && setRightTab(tab)}
                          disabled={disabled}
                          className={`px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
                            rightTab === tab
                              ? "border-indigo-400 text-indigo-300"
                              : disabled
                              ? "border-transparent text-pawn-surface-700 cursor-not-allowed"
                              : "border-transparent text-pawn-surface-400 hover:text-pawn-surface-200"
                          }`}
                        >
                          {labels[tab]}
                        </button>
                      );
                    })}
                  </div>

                  {/* Tab content */}
                  <div className="p-5 max-h-[calc(100vh-12rem)] overflow-y-auto">
                    {rightTab === "config" && (
                      <StepForm
                        key={selectedStep}
                        step={step}
                        steps={steps}
                        skills={skills}
                        inputKeys={inputKeys}
                        stepIndex={selectedStep}
                        totalSteps={steps.length}
                        onChange={(updated) => updateStep(selectedStep, updated)}
                      />
                    )}
                    {rightTab === "skill" && hasSkill && (
                      <InlineSkillEditor key={step.skillName} skillName={step.skillName} />
                    )}
                    {rightTab === "test" && canTest && (
                      <StepTestPanel
                        key={`${selectedStep}-${id}`}
                        pipelineId={id}
                        stepIndex={selectedStep}
                        promptTemplate={step.promptTemplate}
                      />
                    )}
                    {rightTab === "test" && !isEdit && (
                      <p className="text-xs text-pawn-surface-500 italic">Save the pipeline first to enable step testing.</p>
                    )}
                  </div>
                </>
              );
            })() : (
              <div className="p-5 flex flex-col items-center justify-center py-16 text-center">
                <GitBranch size={32} className="text-pawn-surface-700 mb-3" />
                <p className="text-sm text-pawn-surface-500">Select a step to edit it,</p>
                <p className="text-sm text-pawn-surface-500">or add a new step to get started.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
