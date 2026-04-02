import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { Play, GitBranch, Clock, Trash2, ToggleLeft, ToggleRight, Plus, ChevronDown, ChevronUp, MessageSquare } from "lucide-react";
import cronstrue from "cronstrue";
import { api } from "../lib/api.ts";
import type { ApiPipeline, ApiTrigger } from "@zerohand/shared";

// ── Helpers ────────────────────────────────────────────────────────────────

interface JsonSchemaProperty {
  type?: string;
  description?: string;
}
interface JsonSchema {
  type?: string;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
}

function parseCron(expr: string): string {
  if (!expr.trim()) return "";
  try {
    return cronstrue.toString(expr, { use24HourTimeFormat: true });
  } catch {
    return "Invalid expression";
  }
}

// ── Quick Schedule Builder ─────────────────────────────────────────────────

const PRESETS = [
  { label: "Every hour",          cron: "0 * * * *" },
  { label: "Every day at midnight", cron: "0 0 * * *" },
  { label: "Every day at 9am",    cron: "0 9 * * *" },
  { label: "Every day at noon",   cron: "0 12 * * *" },
  { label: "Weekdays at 9am",     cron: "0 9 * * 1-5" },
  { label: "Every Monday at 9am", cron: "0 9 * * 1" },
  { label: "Every Sunday at midnight", cron: "0 0 * * 0" },
  { label: "1st of every month",  cron: "0 9 1 * *" },
];

const DAYS = [
  { label: "Sun", value: "0" },
  { label: "Mon", value: "1" },
  { label: "Tue", value: "2" },
  { label: "Wed", value: "3" },
  { label: "Thu", value: "4" },
  { label: "Fri", value: "5" },
  { label: "Sat", value: "6" },
];

function buildDaysPart(selected: Set<string>): string {
  if (selected.size === 0 || selected.size === 7) return "*";
  const sorted = [...selected].map(Number).sort((a, b) => a - b);
  // Collapse consecutive runs
  const parts: string[] = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    parts.push(j > i + 1 ? `${sorted[i]}-${sorted[j]}` : j > i ? `${sorted[i]},${sorted[j]}` : `${sorted[i]}`);
    i = j + 1;
  }
  return parts.join(",");
}

function QuickScheduleBuilder({ onSelect }: { onSelect: (cron: string) => void }) {
  const [hour, setHour] = useState("9");
  const [minute, setMinute] = useState("0");
  const [selectedDays, setSelectedDays] = useState<Set<string>>(new Set());

  const customCron = `${minute.padStart(1, "0")} ${hour} * * ${buildDaysPart(selectedDays)}`;

  const toggleDay = (v: string) => {
    setSelectedDays((prev) => {
      const next = new Set(prev);
      next.has(v) ? next.delete(v) : next.add(v);
      return next;
    });
  };

  return (
    <div className="border border-dashed border-slate-800 hover:border-sky-500/40 rounded-lg p-4 bg-slate-800/50 space-y-4">
      {/* Presets */}
      <div>
        <div className="text-xs text-slate-500 mb-2 uppercase tracking-wide">Presets</div>
        <div className="grid grid-cols-2 gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.cron}
              className="text-left text-xs px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-md transition-colors"
              onClick={() => onSelect(p.cron)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Custom time + days */}
      <div>
        <div className="text-xs text-slate-500 mb-2 uppercase tracking-wide">Custom</div>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs text-slate-400">At</span>
          <input
            type="number" min="0" max="23"
            className="w-14 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm text-white text-center focus:outline-none focus:border-sky-500"
            value={hour}
            onChange={(e) => setHour(e.target.value)}
          />
          <span className="text-slate-500">:</span>
          <input
            type="number" min="0" max="59"
            className="w-14 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm text-white text-center focus:outline-none focus:border-sky-500"
            value={minute}
            onChange={(e) => setMinute(e.target.value)}
          />
          <span className="text-xs text-slate-400 ml-1">on</span>
          <div className="flex gap-1">
            {DAYS.map((d) => (
              <button
                key={d.value}
                className={`text-xs px-1.5 py-1 rounded transition-colors ${
                  selectedDays.has(d.value)
                    ? "bg-sky-500 text-slate-950"
                    : "bg-slate-700 text-slate-400 hover:bg-slate-600"
                }`}
                onClick={() => toggleDay(d.value)}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>
        <div className="text-xs text-slate-500 mb-2 italic">{parseCron(customCron)}</div>
        <button
          className="text-xs px-3 py-1.5 bg-sky-500 hover:bg-sky-400 text-slate-950 rounded-md transition-colors"
          onClick={() => onSelect(customCron)}
        >
          Use this schedule
        </button>
      </div>
    </div>
  );
}

// ── Run Modal ──────────────────────────────────────────────────────────────

function RunModal({ pipeline, onClose }: { pipeline: ApiPipeline; onClose: () => void }) {
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

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-white mb-4">Run: {pipeline.name}</h2>

        {fields.length === 0 ? (
          <p className="text-sm text-slate-500 mb-4">No inputs required.</p>
        ) : (
          <div className="space-y-4 mb-4">
            {fields.map(([key, prop]) => (
              <div key={key}>
                <label className="block text-sm text-slate-400 mb-1">
                  {key}{required.has(key) && <span className="text-red-400 ml-1">*</span>}
                </label>
                {prop.description && <p className="text-xs text-slate-600 mb-1">{prop.description}</p>}
                <input
                  className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
                  placeholder={prop.description ?? key}
                  value={values[key] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
                  onKeyDown={(e) => e.key === "Enter" && trigger.mutate()}
                />
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-3 justify-end">
          <button className="px-4 py-2 text-sm text-slate-400 hover:text-white" onClick={onClose}>Cancel</button>
          <button
            className="px-4 py-2 bg-sky-500 hover:bg-sky-400 text-slate-950 text-sm font-medium rounded-md disabled:opacity-50"
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

// ── Triggers Modal ─────────────────────────────────────────────────────────

function TriggerRow({ t, onToggle, onRemove, serverBase }: {
  t: ApiTrigger;
  onToggle: (t: ApiTrigger) => void;
  onRemove: (id: string) => void;
  serverBase: string;
}) {
  const isCron = t.type === "cron";
  const isChannel = t.type === "channel";

  return (
    <div className="flex items-start gap-3 bg-slate-800 rounded-lg px-3 py-2">
      <button onClick={() => onToggle(t)} className="text-slate-400 hover:text-white mt-0.5">
        {t.enabled ? <ToggleRight size={18} className="text-sky-400" /> : <ToggleLeft size={18} />}
      </button>
      <div className="flex-1 min-w-0">
        {isCron && (
          <>
            <div className="text-xs font-mono text-slate-200">{t.cronExpression}</div>
            <div className="text-xs text-slate-500">
              {parseCron(t.cronExpression ?? "")}
              {" · "}{t.timezone}
              {t.nextRunAt && ` · next: ${new Date(t.nextRunAt).toLocaleString()}`}
              {t.lastFiredAt && ` · last: ${new Date(t.lastFiredAt).toLocaleString()}`}
            </div>
          </>
        )}
        {isChannel && (
          <>
            <div className="flex items-center gap-1.5 text-xs text-slate-200">
              <MessageSquare size={11} className="text-purple-400" />
              <span className="font-medium capitalize">{t.channelType ?? "channel"}</span> trigger
            </div>
            <div className="text-xs text-slate-500 mt-0.5 font-mono break-all">
              {serverBase}/webhooks/{t.channelType}/{t.id}
            </div>
            {t.lastFiredAt && (
              <div className="text-xs text-slate-600">last: {new Date(t.lastFiredAt).toLocaleString()}</div>
            )}
          </>
        )}
      </div>
      <button
        onClick={() => onRemove(t.id)}
        className="text-slate-600 hover:text-red-400 transition-colors mt-0.5"
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
}

function TriggersModal({ pipeline, onClose }: { pipeline: ApiPipeline; onClose: () => void }) {
  const queryClient = useQueryClient();
  const schema = (pipeline.inputSchema ?? null) as JsonSchema | null;
  const fields = schema?.properties ? Object.entries(schema.properties) : [];
  const required = new Set(schema?.required ?? []);

  // Tab: "cron" | "channel"
  const [tab, setTab] = useState<"cron" | "channel">("cron");

  // Cron form
  const [cron, setCron] = useState("");
  const [tz, setTz] = useState("UTC");
  const [showBuilder, setShowBuilder] = useState(false);
  const [defaultInputs, setDefaultInputs] = useState<Record<string, string>>(
    () => Object.fromEntries(fields.map(([key]) => [key, ""])),
  );

  // Channel form
  const [channelType, setChannelType] = useState<"telegram" | "slack">("telegram");
  const [botToken, setBotToken] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [channelId, setChannelId] = useState("");
  const [signingSecret, setSigningSecret] = useState("");

  const cronDescription = useMemo(() => parseCron(cron), [cron]);
  const cronInvalid = cron.trim() !== "" && cronDescription === "Invalid expression";

  const serverBase = window.location.origin.replace(/:\d+$/, ":3009");

  const { data: existingTriggers = [] } = useQuery({
    queryKey: ["triggers", pipeline.id],
    queryFn: () => api.listTriggers(pipeline.id),
  });

  const create = useMutation({
    mutationFn: () => {
      const parsed = Object.fromEntries(
        Object.entries(defaultInputs).filter(([, v]) => v.trim() !== ""),
      );
      if (tab === "cron") {
        return api.createTrigger(pipeline.id, {
          type: "cron",
          cronExpression: cron,
          timezone: tz,
          defaultInputs: parsed,
        });
      }
      // Channel trigger
      const config: Record<string, string> = { botToken };
      if (channelType === "telegram" && webhookSecret) config.webhookSecret = webhookSecret;
      if (channelType === "telegram" && channelId) config.chatId = channelId;
      if (channelType === "slack" && signingSecret) config.signingSecret = signingSecret;
      if (channelType === "slack" && channelId) config.channelId = channelId;
      return api.createTrigger(pipeline.id, {
        type: "channel",
        channelType,
        channelConfig: config,
        defaultInputs: parsed,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["triggers", pipeline.id] });
      setCron("");
      setBotToken("");
      setWebhookSecret("");
      setChannelId("");
      setSigningSecret("");
      setDefaultInputs(Object.fromEntries(fields.map(([key]) => [key, ""])));
    },
  });

  const toggle = useMutation({
    mutationFn: (t: ApiTrigger) => api.updateTrigger(t.id, { enabled: !t.enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["triggers", pipeline.id] }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteTrigger(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["triggers", pipeline.id] }),
  });

  const canSubmit = tab === "cron"
    ? cron.trim() !== "" && !cronInvalid && !create.isPending
    : botToken.trim() !== "" && !create.isPending;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-white mb-4">
          <Clock size={16} className="inline mr-2 text-sky-400" />
          Triggers: {pipeline.name}
        </h2>

        {/* Existing triggers */}
        {existingTriggers.length > 0 && (
          <div className="mb-5 space-y-2">
            {existingTriggers.map((t) => (
              <TriggerRow
                key={t.id}
                t={t}
                serverBase={serverBase}
                onToggle={(tr) => toggle.mutate(tr)}
                onRemove={(id) => remove.mutate(id)}
              />
            ))}
          </div>
        )}

        {/* Tab bar */}
        <div className="border-t border-slate-700 pt-4">
          <div className="flex gap-1 mb-4">
            {(["cron", "channel"] as const).map((t) => (
              <button
                key={t}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  tab === t ? "bg-sky-500 text-slate-950" : "bg-slate-800 text-slate-400 hover:bg-slate-700"
                }`}
                onClick={() => setTab(t)}
              >
                {t === "cron" ? "Cron Schedule" : "Channel Bot"}
              </button>
            ))}
          </div>

          {/* ── Cron form ── */}
          {tab === "cron" && (
            <div className="space-y-3">
              <div className="flex gap-2">
                <div className="flex-1">
                  <input
                    className={`w-full bg-slate-800 border rounded-md px-3 py-2 text-sm text-white placeholder-slate-500 font-mono focus:outline-none focus:border-sky-500 ${
                      cronInvalid ? "border-red-500" : "border-slate-700"
                    }`}
                    placeholder="0 9 * * *"
                    value={cron}
                    onChange={(e) => setCron(e.target.value)}
                  />
                  {cronDescription && (
                    <p className={`text-xs mt-1 ${cronInvalid ? "text-red-400" : "text-sky-300"}`}>
                      {cronDescription}
                    </p>
                  )}
                </div>
                <input
                  className="w-28 bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
                  placeholder="UTC"
                  value={tz}
                  onChange={(e) => setTz(e.target.value)}
                />
              </div>

              <button
                className="flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300 transition-colors"
                onClick={() => setShowBuilder((v) => !v)}
              >
                {showBuilder ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                {showBuilder ? "Hide" : "Show"} schedule builder
              </button>

              {showBuilder && (
                <QuickScheduleBuilder
                  onSelect={(c) => {
                    setCron(c);
                    setShowBuilder(false);
                  }}
                />
              )}
            </div>
          )}

          {/* ── Channel form ── */}
          {tab === "channel" && (
            <div className="space-y-3">
              <div className="flex gap-1">
                {(["telegram", "slack"] as const).map((ct) => (
                  <button
                    key={ct}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors capitalize ${
                      channelType === ct ? "bg-sky-600 text-white" : "bg-slate-800 text-slate-400 hover:bg-slate-700"
                    }`}
                    onClick={() => setChannelType(ct)}
                  >
                    {ct}
                  </button>
                ))}
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Bot Token <span className="text-red-400">*</span></label>
                <input
                  type="password"
                  className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
                  placeholder={channelType === "telegram" ? "1234567890:ABC..." : "xoxb-..."}
                  value={botToken}
                  onChange={(e) => setBotToken(e.target.value)}
                />
              </div>

              {channelType === "telegram" && (
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Webhook Secret <span className="text-slate-600">(optional, recommended)</span></label>
                  <input
                    className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
                    placeholder="Random secret string"
                    value={webhookSecret}
                    onChange={(e) => setWebhookSecret(e.target.value)}
                  />
                </div>
              )}

              {channelType === "slack" && (
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Signing Secret <span className="text-red-400">*</span></label>
                  <input
                    type="password"
                    className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
                    placeholder="Slack app signing secret"
                    value={signingSecret}
                    onChange={(e) => setSigningSecret(e.target.value)}
                  />
                </div>
              )}

              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  {channelType === "telegram" ? "Chat ID filter" : "Channel ID filter"}
                  {" "}<span className="text-slate-600">(optional)</span>
                </label>
                <input
                  className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
                  placeholder={channelType === "telegram" ? "-100123456789" : "C01234567"}
                  value={channelId}
                  onChange={(e) => setChannelId(e.target.value)}
                />
              </div>

              <p className="text-xs text-slate-600">
                {channelType === "telegram"
                  ? "Set PUBLIC_URL env var to auto-register the Telegram webhook. Otherwise register manually."
                  : "Point your Slack app's Event Subscriptions to the webhook URL shown above."}
              </p>
            </div>
          )}

          {/* Default inputs (shared) */}
          {fields.length > 0 && (
            <div className="space-y-2 mt-3">
              <div className="text-xs text-slate-500 font-medium">Default inputs</div>
              {fields.map(([key, prop]) => (
                <div key={key}>
                  <label className="block text-xs text-slate-400 mb-1">
                    {key}
                    {required.has(key) && <span className="text-red-400 ml-1">*</span>}
                    {prop.description && <span className="text-slate-600 ml-1">— {prop.description}</span>}
                  </label>
                  <input
                    className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
                    placeholder={prop.description ?? key}
                    value={defaultInputs[key] ?? ""}
                    onChange={(e) => setDefaultInputs((v) => ({ ...v, [key]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
          )}

          <button
            className="mt-3 flex items-center gap-1.5 px-3 py-2 bg-sky-500 hover:bg-sky-400 text-slate-950 text-sm font-medium rounded-md disabled:opacity-50"
            disabled={!canSubmit}
            onClick={() => create.mutate()}
          >
            <Plus size={13} />
            Add Trigger
          </button>
        </div>

        <div className="mt-4 flex justify-end">
          <button className="px-4 py-2 text-sm text-slate-400 hover:text-white" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ── Pipeline Row ───────────────────────────────────────────────────────────

function PipelineRow({ pipeline }: { pipeline: ApiPipeline }) {
  const [showRun, setShowRun] = useState(false);
  const [showTriggers, setShowTriggers] = useState(false);

  return (
    <>
      <div className="flex flex-col md:flex-row justify-between items-center gap-6 px-5 py-4 bg-slate-900 rounded-2xl border border-slate-800">
        <div className="flex items-center gap-4 flex-1 min-w-0 w-full md:w-auto">
          <div className="p-3 bg-sky-500/10 rounded-2xl flex-shrink-0">
            <GitBranch size={16} className="text-sky-400" />
          </div>
          <div className="flex-1 min-w-0">
            <Link to={`/pipelines/${pipeline.id}`} className="text-sm font-medium text-slate-100 hover:text-sky-400 transition-colors">
              {pipeline.name}
            </Link>
            {pipeline.description && (
              <div className="text-xs text-slate-500 mt-0.5 truncate">{pipeline.description}</div>
            )}
            <div className="text-xs text-slate-600 mt-0.5">
              {pipeline.steps.length} step{pipeline.steps.length !== 1 ? "s" : ""} · {pipeline.status}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-md transition-colors"
            onClick={() => setShowTriggers(true)}
            title="Manage cron triggers"
          >
            <Clock size={12} />
            Triggers
          </button>
          <button
            className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-medium rounded-md transition-colors"
            onClick={() => setShowRun(true)}
          >
            <Play size={12} />
            Run
          </button>
        </div>
      </div>
      {showRun && <RunModal pipeline={pipeline} onClose={() => setShowRun(false)} />}
      {showTriggers && <TriggersModal pipeline={pipeline} onClose={() => setShowTriggers(false)} />}
    </>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function Pipelines() {
  const { data: pipelines = [], isLoading } = useQuery({
    queryKey: ["pipelines"],
    queryFn: () => api.listPipelines(),
  });

  if (isLoading) return <div className="p-8 text-slate-500">Loading...</div>;

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold font-display text-white">Pipelines</h1>
        <Link
          to="/pipelines/new"
          className="flex items-center gap-1.5 px-3 py-2 bg-sky-500 hover:bg-sky-400 text-slate-950 text-sm font-medium rounded-md transition-colors"
        >
          <Plus size={14} />
          New Pipeline
        </Link>
      </div>
      {pipelines.length === 0 ? (
        <div className="text-slate-500 text-sm">No pipelines yet.</div>
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
