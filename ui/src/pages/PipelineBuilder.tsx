import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useState, useCallback } from "react";
import { ArrowLeft, Plus, Trash2, ChevronUp, ChevronDown, GitBranch, CheckSquare } from "lucide-react";
import { api } from "../lib/api.ts";
import type { ApiPipeline, ApiPipelineStep, ApiSkill } from "@zerohand/shared";
import ModelSelector from "../components/ModelSelector.tsx";

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

// ── Step form (right panel) ────────────────────────────────────────────────────

function StepForm({
  step,
  skills,
  inputKeys,
  stepIndex,
  totalSteps,
  onChange,
}: {
  step: DraftStep;
  skills: ApiSkill[];
  inputKeys: string[];
  stepIndex: number;
  totalSteps: number;
  onChange: (updated: DraftStep) => void;
}) {
  const tokenHints = [
    ...inputKeys.map((k) => `{{input.${k}}}`),
    ...Array.from({ length: stepIndex }, (_, i) => `{{steps.${i}.output}}`),
  ];

  const insertToken = (token: string) => {
    onChange({ ...step, promptTemplate: step.promptTemplate + token });
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs text-slate-400 mb-1">Step name</label>
        <input
          className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
          value={step.name}
          onChange={(e) => onChange({ ...step, name: e.target.value })}
          placeholder="Unnamed step"
        />
      </div>

      <div>
        <label className="block text-xs text-slate-400 mb-1">Skill</label>
        <select
          className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
          value={step.skillName}
          onChange={(e) => onChange({ ...step, skillName: e.target.value })}
        >
          <option value="">— select skill —</option>
          {skills.map((s) => (
            <option key={s.name} value={s.name}>{s.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs text-slate-400 mb-1">Prompt template</label>
        {tokenHints.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {tokenHints.map((t) => (
              <button
                key={t}
                type="button"
                className="text-xs px-2 py-0.5 bg-sky-500/10 text-sky-300 border border-sky-500/20 hover:bg-sky-500/20 rounded font-mono transition-colors"
                onClick={() => insertToken(t)}
              >
                {t}
              </button>
            ))}
          </div>
        )}
        <textarea
          className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 font-mono leading-relaxed resize-y"
          rows={6}
          value={step.promptTemplate}
          onChange={(e) => onChange({ ...step, promptTemplate: e.target.value })}
          placeholder="Write a satirical article about {{input.topic}}"
        />
      </div>

      <div className="flex gap-4">
        <div className="flex-1">
          <label className="block text-xs text-slate-400 mb-1">Timeout (seconds)</label>
          <input
            type="number"
            min="10"
            max="3600"
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
            value={step.timeoutSeconds}
            onChange={(e) => onChange({ ...step, timeoutSeconds: parseInt(e.target.value) || 300 })}
          />
        </div>
        <div className="flex items-end pb-2">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              className="w-4 h-4 accent-sky-500"
              checked={step.approvalRequired}
              onChange={(e) => onChange({ ...step, approvalRequired: e.target.checked })}
            />
            <span className="text-sm text-slate-300 flex items-center gap-1">
              <CheckSquare size={13} className="text-yellow-500" /> Require approval
            </span>
          </label>
        </div>
      </div>

      <p className="text-xs text-slate-600">Step {stepIndex + 1} of {totalSteps}</p>
    </div>
  );
}

// ── Step list (left panel) ─────────────────────────────────────────────────────

function StepList({
  steps,
  selectedIndex,
  onSelect,
  onAdd,
  onRemove,
  onMove,
}: {
  steps: DraftStep[];
  selectedIndex: number | null;
  onSelect: (i: number) => void;
  onAdd: () => void;
  onRemove: (i: number) => void;
  onMove: (from: number, to: number) => void;
}) {
  return (
    <div className="space-y-2">
      {steps.map((step, i) => (
        <div key={i} className="relative group">
          <button
            className={`w-full text-left px-4 py-3 rounded-lg border transition-colors ${
              selectedIndex === i
                ? "bg-sky-900/20 border-sky-500/40"
                : "bg-slate-800 border-slate-700 hover:border-slate-600"
            }`}
            onClick={() => onSelect(i)}
          >
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-sky-500 flex items-center justify-center text-xs font-bold text-slate-950">
                {i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-white truncate">{step.name || "Unnamed step"}</div>
                {step.skillName && (
                  <div className="text-xs text-sky-400 mt-0.5 truncate">
                    skill: {step.skillName}
                  </div>
                )}
              </div>
            </div>
          </button>

          {/* Reorder / delete controls */}
          <div className="absolute right-2 top-1/2 -translate-y-1/2 hidden group-hover:flex items-center gap-0.5">
            <button
              className="p-1 text-slate-500 hover:text-slate-200 disabled:opacity-30"
              disabled={i === 0}
              onClick={(e) => { e.stopPropagation(); onMove(i, i - 1); }}
            >
              <ChevronUp size={13} />
            </button>
            <button
              className="p-1 text-slate-500 hover:text-slate-200 disabled:opacity-30"
              disabled={i === steps.length - 1}
              onClick={(e) => { e.stopPropagation(); onMove(i, i + 1); }}
            >
              <ChevronDown size={13} />
            </button>
            <button
              className="p-1 text-slate-500 hover:text-red-400"
              onClick={(e) => { e.stopPropagation(); onRemove(i); }}
            >
              <Trash2 size={13} />
            </button>
          </div>

          {/* Connector line */}
          {i < steps.length - 1 && (
            <div className="flex justify-center my-1">
              <div className="w-0.5 h-3 bg-sky-800" />
            </div>
          )}
        </div>
      ))}

      <button
        className="w-full flex items-center justify-center gap-2 px-4 py-3 border border-dashed border-slate-800 hover:border-sky-500/40 text-slate-500 hover:text-sky-400 hover:bg-sky-500/5 rounded-lg transition-colors text-sm"
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
        <div key={i} className="flex items-start gap-2 p-3 bg-slate-800/50 rounded-lg">
          <div className="flex-1 space-y-2">
            <div className="flex gap-2">
              <input
                className="flex-1 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
                placeholder="field_name"
                value={f.key}
                onChange={(e) => update(i, { key: e.target.value })}
              />
              <select
                className="bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-sky-500"
                value={f.type}
                onChange={(e) => update(i, { type: e.target.value as "string" | "number" | "boolean" })}
              >
                <option value="string">string</option>
                <option value="number">number</option>
                <option value="boolean">boolean</option>
              </select>
              <label className="flex items-center gap-1 text-xs text-slate-400 whitespace-nowrap">
                <input
                  type="checkbox"
                  className="accent-sky-500"
                  checked={f.required}
                  onChange={(e) => update(i, { required: e.target.checked })}
                />
                required
              </label>
            </div>
            <input
              className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
              placeholder="Description (shown as hint)"
              value={f.description}
              onChange={(e) => update(i, { description: e.target.value })}
            />
          </div>
          <button className="text-slate-600 hover:text-red-400 mt-1" onClick={() => remove(i)}>
            <Trash2 size={13} />
          </button>
        </div>
      ))}
      <button
        className="flex items-center gap-1.5 text-xs text-sky-400 hover:text-sky-300 transition-colors"
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

  const [selectedStep, setSelectedStep] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      navigate(`/pipelines/${pipeline.id}`);
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  };

  if (isEdit && loadingPipeline) return <div className="p-8 text-slate-500">Loading...</div>;
  const loading = loadingSkills;

  return (
    <div className="p-8 max-w-6xl">
      {/* Header */}
      <div className="mb-6">
        <Link
          to={isEdit ? `/pipelines/${id}` : "/pipelines"}
          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 mb-4"
        >
          <ArrowLeft size={12} /> {isEdit ? "Back to pipeline" : "Pipelines"}
        </Link>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <GitBranch size={20} className="text-sky-400" />
            <h1 className="text-2xl font-bold font-display text-white">{isEdit ? "Edit Pipeline" : "New Pipeline"}</h1>
          </div>
          <div className="flex items-center gap-3">
            {error && <span className="text-xs text-red-400">{error}</span>}
            <button
              className="px-4 py-2 bg-sky-500 hover:bg-sky-400 text-slate-950 text-sm font-medium rounded-md disabled:opacity-50"
              disabled={saving || loading}
              onClick={save}
            >
              {saving ? "Saving..." : isEdit ? "Save Changes" : "Create Pipeline"}
            </button>
          </div>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-5 gap-6">
        {/* Left: step list + metadata */}
        <div className="col-span-2 space-y-6">
          {/* Metadata */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Pipeline</h2>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Name <span className="text-red-400">*</span></label>
              <input
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Pipeline"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Description</label>
              <textarea
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 resize-none"
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What does this pipeline do?"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Model</label>
              <ModelSelector
                value={modelFullId}
                onChange={setModelFullId}
                allowNull
                defaultLabel="Use default (from settings)"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-2">Input schema</label>
              <SchemaBuilder fields={schemaFields} onChange={setSchemaFields} />
            </div>
          </div>

          {/* Steps */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-4">
              Steps ({steps.length})
            </h2>
            <StepList
              steps={steps}
              selectedIndex={selectedStep}
              onSelect={setSelectedStep}
              onAdd={addStep}
              onRemove={removeStep}
              onMove={moveStep}
            />
          </div>
        </div>

        {/* Right: step editor */}
        <div className="col-span-3">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sticky top-6">
            {selectedStep !== null && steps[selectedStep] ? (
              <>
                <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-4">
                  Edit Step {selectedStep + 1}
                </h2>
                <StepForm
                  key={selectedStep}
                  step={steps[selectedStep]}
                  skills={skills}
                  inputKeys={inputKeys}
                  stepIndex={selectedStep}
                  totalSteps={steps.length}
                  onChange={(updated) => updateStep(selectedStep, updated)}
                />
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <GitBranch size={32} className="text-slate-700 mb-3" />
                <p className="text-sm text-slate-500">Select a step to edit it,</p>
                <p className="text-sm text-slate-500">or add a new step to get started.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
