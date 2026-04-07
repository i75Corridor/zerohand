import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import * as Dialog from "@radix-ui/react-dialog";
import { Play, GitBranch, Clock, Trash2, ToggleLeft, ToggleRight, Plus, ChevronDown, ChevronUp, MessageSquare, AlertCircle } from "lucide-react";
import cronstrue from "cronstrue";
import { api } from "../lib/api.ts";
import LoadingState from "../components/LoadingState.tsx";
import EmptyState from "../components/EmptyState.tsx";
import type { ApiPipeline, ApiTrigger } from "@pawn/shared";

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
    <div className="border border-dashed border-pawn-surface-800 hover:border-pawn-gold-500/40 rounded-lg p-4 bg-pawn-surface-800/50 space-y-4">
      {/* Presets */}
      <div>
        <div className="text-xs text-pawn-surface-500 mb-2 uppercase tracking-wide">Presets</div>
        <div className="grid grid-cols-2 gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.cron}
              className="text-left text-xs px-2.5 py-1.5 bg-pawn-surface-800 hover:bg-pawn-surface-700 text-pawn-surface-300 rounded-md transition-colors"
              onClick={() => onSelect(p.cron)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Custom time + days */}
      <div>
        <div className="text-xs text-pawn-surface-500 mb-2 uppercase tracking-wide">Custom</div>
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <span className="text-xs text-pawn-surface-400">At</span>
          <input
            type="number" min="0" max="23"
            aria-label="Hour"
            className="w-14 bg-pawn-surface-800 border border-pawn-surface-700 rounded px-2 py-1 text-sm text-white text-center focus:outline-none focus:border-pawn-gold-500"
            value={hour}
            onChange={(e) => setHour(e.target.value)}
          />
          <span className="text-pawn-surface-500">:</span>
          <input
            type="number" min="0" max="59"
            aria-label="Minute"
            className="w-14 bg-pawn-surface-800 border border-pawn-surface-700 rounded px-2 py-1 text-sm text-white text-center focus:outline-none focus:border-pawn-gold-500"
            value={minute}
            onChange={(e) => setMinute(e.target.value)}
          />
          <span className="text-xs text-pawn-surface-400 ml-1">on</span>
          <div className="flex gap-1" role="group" aria-label="Days of the week">
            {DAYS.map((d) => (
              <button
                key={d.value}
                className={`text-xs px-2.5 py-2 sm:px-1.5 sm:py-1 rounded transition-colors ${
                  selectedDays.has(d.value)
                    ? "bg-pawn-gold-600 text-white"
                    : "bg-pawn-surface-700 text-pawn-surface-400 hover:bg-pawn-surface-600"
                }`}
                onClick={() => toggleDay(d.value)}
                aria-pressed={selectedDays.has(d.value)}
                aria-label={d.label}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>
        <div className="text-xs text-pawn-surface-500 mb-2 italic">{parseCron(customCron)}</div>
        <button
          className="text-xs px-3 py-1.5 bg-pawn-gold-600 hover:bg-pawn-gold-500 text-white rounded-md transition-colors"
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
  const navigate = useNavigate();
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
      navigate(`/runs/${run.id}`);
    },
  });

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 z-50 animate-overlay-in" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-pawn-surface-900 border border-pawn-surface-700 rounded-xl p-4 sm:p-6 w-[calc(100%-2rem)] max-w-md shadow-lg animate-scale-in">
          <Dialog.Title className="text-lg font-semibold text-white mb-4 truncate">Run: {pipeline.name}</Dialog.Title>
          <Dialog.Description className="sr-only">Configure inputs and trigger a pipeline run.</Dialog.Description>

        {fields.length === 0 ? (
          <p className="text-sm text-pawn-surface-400 mb-4">No inputs required.</p>
        ) : (
          <div className="space-y-4 mb-4">
            {fields.map(([key, prop]) => (
              <div key={key}>
                <label className="block text-sm text-pawn-surface-400 mb-1">
                  {key}{required.has(key) && <span className="text-rose-400 ml-1" aria-label="required">*</span>}
                </label>
                {prop.description && <p className="text-xs text-pawn-surface-500 mb-1">{prop.description}</p>}
                <input
                  className="w-full bg-pawn-surface-800 border border-pawn-surface-700 rounded-md px-3 py-2 text-sm text-white placeholder-pawn-surface-500 focus:outline-none focus:border-pawn-gold-500"
                  placeholder={prop.description ?? key}
                  value={values[key] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
                  onKeyDown={(e) => e.key === "Enter" && !trigger.isPending && trigger.mutate()}
                />
              </div>
            ))}
          </div>
        )}

        {trigger.isError && (
          <p className="text-xs text-rose-400 mb-3" role="alert">{(trigger.error as Error).message}</p>
        )}

        <div className="flex gap-3 justify-end">
          <button className="px-4 py-2 text-sm text-pawn-surface-400 hover:text-white transition-colors" onClick={onClose}>Cancel</button>
          <button
            className="px-4 py-2 bg-pawn-gold-600 hover:bg-pawn-gold-500 text-white text-sm font-medium rounded-md disabled:opacity-50 transition-colors"
            disabled={trigger.isPending}
            onClick={() => trigger.mutate()}
          >
            {trigger.isPending ? "Starting..." : "Run Pipeline"}
          </button>
        </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
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
    <div className="flex items-start gap-3 bg-pawn-surface-800 rounded-lg px-3 py-2">
      <button onClick={() => onToggle(t)} className="text-pawn-surface-400 hover:text-white mt-0.5" aria-label={t.enabled ? "Disable trigger" : "Enable trigger"}>
        {t.enabled ? <ToggleRight size={18} className="text-pawn-gold-400" /> : <ToggleLeft size={18} />}
      </button>
      <div className="flex-1 min-w-0">
        {isCron && (
          <>
            <div className="text-xs font-mono text-pawn-surface-200 break-all">{t.cronExpression}</div>
            <div className="text-xs text-pawn-surface-500 break-words">
              {parseCron(t.cronExpression ?? "")}
              {" \u00B7 "}{t.timezone}
              {t.nextRunAt && ` \u00B7 next: ${new Date(t.nextRunAt).toLocaleString()}`}
              {t.lastFiredAt && ` \u00B7 last: ${new Date(t.lastFiredAt).toLocaleString()}`}
            </div>
          </>
        )}
        {isChannel && (
          <>
            <div className="flex items-center gap-1.5 text-xs text-pawn-surface-200">
              <MessageSquare size={11} className="text-violet-400" />
              <span className="font-medium capitalize">{t.channelType ?? "channel"}</span> trigger
            </div>
            <div className="text-xs text-pawn-surface-500 mt-0.5 font-mono break-all">
              {serverBase}/webhooks/{t.channelType}/{t.id}
            </div>
            {t.lastFiredAt && (
              <div className="text-xs text-pawn-surface-600">last: {new Date(t.lastFiredAt).toLocaleString()}</div>
            )}
          </>
        )}
      </div>
      <button
        onClick={() => onRemove(t.id)}
        className="text-pawn-surface-600 hover:text-rose-400 transition-colors mt-0.5"
        aria-label="Remove trigger"
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
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 z-50 animate-overlay-in" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-pawn-surface-900 border border-pawn-surface-700 rounded-xl p-4 sm:p-6 w-[calc(100%-2rem)] max-w-lg shadow-lg max-h-[85vh] overflow-y-auto animate-scale-in">
          <Dialog.Title className="text-lg font-semibold text-white mb-4 truncate">
            <Clock size={16} className="inline mr-2 text-indigo-400" />
            Triggers: {pipeline.name}
          </Dialog.Title>
          <Dialog.Description className="sr-only">Manage cron and channel triggers for this pipeline.</Dialog.Description>

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
        <div className="border-t border-pawn-surface-700 pt-4">
          <div className="flex gap-1 mb-4" role="tablist" aria-label="Trigger type">
            {(["cron", "channel"] as const).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  tab === t ? "bg-pawn-gold-600 text-white" : "bg-pawn-surface-800 text-pawn-surface-400 hover:bg-pawn-surface-700"
                }`}
                onClick={() => setTab(t)}
              >
                {t === "cron" ? "Cron Schedule" : "Channel Bot"}
              </button>
            ))}
          </div>

          {/* ── Cron form ── */}
          {tab === "cron" && (
            <div className="space-y-3" role="tabpanel" aria-label="Cron Schedule">
              <div className="flex gap-2">
                <div className="flex-1 min-w-0">
                  <input
                    className={`w-full bg-pawn-surface-800 border rounded-md px-3 py-2 text-sm text-white placeholder-pawn-surface-500 font-mono focus:outline-none focus:border-pawn-gold-500 ${
                      cronInvalid ? "border-rose-500" : "border-pawn-surface-700"
                    }`}
                    placeholder="0 9 * * *"
                    value={cron}
                    onChange={(e) => setCron(e.target.value)}
                    aria-label="Cron expression"
                    aria-invalid={cronInvalid}
                  />
                  {cronDescription && (
                    <p className={`text-xs mt-1 ${cronInvalid ? "text-rose-400" : "text-pawn-gold-300"}`} role={cronInvalid ? "alert" : undefined}>
                      {cronDescription}
                    </p>
                  )}
                </div>
                <input
                  className="w-28 bg-pawn-surface-800 border border-pawn-surface-700 rounded-md px-3 py-2 text-sm text-white placeholder-pawn-surface-500 focus:outline-none focus:border-pawn-gold-500"
                  placeholder="UTC"
                  value={tz}
                  onChange={(e) => setTz(e.target.value)}
                  aria-label="Timezone"
                />
              </div>

              <button
                className="flex items-center gap-1 text-xs text-pawn-gold-400 hover:text-pawn-gold-300 transition-colors"
                onClick={() => setShowBuilder((v) => !v)}
                aria-expanded={showBuilder}
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
            <div className="space-y-3" role="tabpanel" aria-label="Channel Bot">
              <div className="flex gap-1" role="group" aria-label="Channel type">
                {(["telegram", "slack"] as const).map((ct) => (
                  <button
                    key={ct}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors capitalize ${
                      channelType === ct ? "bg-pawn-gold-600 text-white" : "bg-pawn-surface-800 text-pawn-surface-400 hover:bg-pawn-surface-700"
                    }`}
                    onClick={() => setChannelType(ct)}
                    aria-pressed={channelType === ct}
                  >
                    {ct}
                  </button>
                ))}
              </div>

              <div>
                <label className="block text-xs text-pawn-surface-400 mb-1">Bot Token <span className="text-rose-400" aria-label="required">*</span></label>
                <input
                  type="password"
                  className="w-full bg-pawn-surface-800 border border-pawn-surface-700 rounded-md px-3 py-2 text-sm text-white placeholder-pawn-surface-500 focus:outline-none focus:border-pawn-gold-500"
                  placeholder={channelType === "telegram" ? "1234567890:ABC..." : "xoxb-..."}
                  value={botToken}
                  onChange={(e) => setBotToken(e.target.value)}
                  autoComplete="off"
                />
              </div>

              {channelType === "telegram" && (
                <div>
                  <label className="block text-xs text-pawn-surface-400 mb-1">Webhook Secret <span className="text-pawn-surface-600">(optional, recommended)</span></label>
                  <input
                    className="w-full bg-pawn-surface-800 border border-pawn-surface-700 rounded-md px-3 py-2 text-sm text-white placeholder-pawn-surface-500 focus:outline-none focus:border-pawn-gold-500"
                    placeholder="Random secret string"
                    value={webhookSecret}
                    onChange={(e) => setWebhookSecret(e.target.value)}
                  />
                </div>
              )}

              {channelType === "slack" && (
                <div>
                  <label className="block text-xs text-pawn-surface-400 mb-1">Signing Secret <span className="text-rose-400" aria-label="required">*</span></label>
                  <input
                    type="password"
                    className="w-full bg-pawn-surface-800 border border-pawn-surface-700 rounded-md px-3 py-2 text-sm text-white placeholder-pawn-surface-500 focus:outline-none focus:border-pawn-gold-500"
                    placeholder="Slack app signing secret"
                    value={signingSecret}
                    onChange={(e) => setSigningSecret(e.target.value)}
                    autoComplete="off"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs text-pawn-surface-400 mb-1">
                  {channelType === "telegram" ? "Chat ID filter" : "Channel ID filter"}
                  {" "}<span className="text-pawn-surface-600">(optional)</span>
                </label>
                <input
                  className="w-full bg-pawn-surface-800 border border-pawn-surface-700 rounded-md px-3 py-2 text-sm text-white placeholder-pawn-surface-500 focus:outline-none focus:border-pawn-gold-500"
                  placeholder={channelType === "telegram" ? "-100123456789" : "C01234567"}
                  value={channelId}
                  onChange={(e) => setChannelId(e.target.value)}
                />
              </div>

              <p className="text-xs text-pawn-surface-600">
                {channelType === "telegram"
                  ? "Set PUBLIC_URL env var to auto-register the Telegram webhook. Otherwise register manually."
                  : "Point your Slack app's Event Subscriptions to the webhook URL shown above."}
              </p>
            </div>
          )}

          {/* Default inputs (shared) */}
          {fields.length > 0 && (
            <div className="space-y-2 mt-3">
              <div className="text-xs text-pawn-surface-500 font-medium">Default inputs</div>
              {fields.map(([key, prop]) => (
                <div key={key}>
                  <label className="block text-xs text-pawn-surface-400 mb-1">
                    {key}
                    {required.has(key) && <span className="text-rose-400 ml-1" aria-label="required">*</span>}
                    {prop.description && <span className="text-pawn-surface-600 ml-1">&mdash; {prop.description}</span>}
                  </label>
                  <input
                    className="w-full bg-pawn-surface-800 border border-pawn-surface-700 rounded-md px-3 py-2 text-sm text-white placeholder-pawn-surface-500 focus:outline-none focus:border-pawn-gold-500"
                    placeholder={prop.description ?? key}
                    value={defaultInputs[key] ?? ""}
                    onChange={(e) => setDefaultInputs((v) => ({ ...v, [key]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
          )}

          {create.isError && (
            <p className="text-xs text-rose-400 mt-2" role="alert">{(create.error as Error).message}</p>
          )}

          <button
            className="mt-3 flex items-center gap-1.5 px-3 py-2 bg-pawn-gold-600 hover:bg-pawn-gold-500 text-white text-sm font-medium rounded-md disabled:opacity-50 transition-colors"
            disabled={!canSubmit}
            onClick={() => create.mutate()}
          >
            <Plus size={13} />
            Add Trigger
          </button>
        </div>

        <div className="mt-4 flex justify-end">
          <button className="px-4 py-2 text-sm text-pawn-surface-400 hover:text-white transition-colors" onClick={onClose}>Close</button>
        </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ── Pipeline Row ───────────────────────────────────────────────────────────

function PipelineRow({ pipeline }: { pipeline: ApiPipeline }) {
  const [showRun, setShowRun] = useState(false);
  const [showTriggers, setShowTriggers] = useState(false);

  return (
    <>
      <div className="flex flex-col md:flex-row justify-between items-center gap-6 px-5 py-4 bg-pawn-surface-900 rounded-xl border border-pawn-surface-800">
        <div className="flex items-center gap-4 flex-1 min-w-0 w-full md:w-auto">
          <div className="p-3 bg-indigo-500/10 rounded-xl flex-shrink-0">
            <GitBranch size={16} className="text-indigo-400" aria-hidden="true" />
          </div>
          <div className="flex-1 min-w-0">
            <Link to={`/pipelines/${pipeline.id}`} className="text-sm font-medium text-pawn-surface-100 hover:text-pawn-gold-400 transition-colors truncate block" title={pipeline.name}>
              {pipeline.name}
            </Link>
            {pipeline.description && (
              <div className="text-xs text-pawn-surface-500 mt-0.5 truncate" title={pipeline.description}>{pipeline.description}</div>
            )}
            <div className="text-xs text-pawn-surface-600 mt-0.5">
              {pipeline.steps.length} step{pipeline.steps.length !== 1 ? "s" : ""} &middot; {pipeline.status}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            className="flex items-center gap-1.5 px-3 py-1.5 bg-pawn-surface-800 hover:bg-pawn-surface-700 text-pawn-surface-300 text-xs font-medium rounded-md transition-colors"
            onClick={() => setShowTriggers(true)}
            aria-label={`Manage triggers for ${pipeline.name}`}
          >
            <Clock size={12} />
            Triggers
          </button>
          <button
            className="flex items-center gap-1.5 px-3 py-1.5 bg-pawn-gold-600 hover:bg-pawn-gold-500 text-white text-xs font-medium rounded-md transition-colors"
            onClick={() => setShowRun(true)}
            aria-label={`Run ${pipeline.name}`}
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
  const { data: pipelines = [], isLoading, error } = useQuery({
    queryKey: ["pipelines"],
    queryFn: () => api.listPipelines(),
  });

  if (isLoading) return <LoadingState message="Loading pipelines..." />;

  if (error) {
    return (
      <div className="p-8 max-w-lg" role="alert">
        <div className="flex items-start gap-3 p-4 bg-rose-950/30 border border-rose-900/50 rounded-xl">
          <AlertCircle size={16} className="text-rose-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-rose-300 mb-1">Failed to load pipelines</p>
            <p className="text-xs text-pawn-surface-400">{(error as Error).message}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 pt-14 lg:pt-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold font-display text-white tracking-tight">Pipelines</h1>
        <Link
          to="/pipelines/new"
          className="flex items-center gap-1.5 px-3 py-2 bg-pawn-gold-600 hover:bg-pawn-gold-500 text-white text-sm font-medium rounded-md transition-colors"
        >
          <Plus size={14} />
          New Pipeline
        </Link>
      </div>
      {pipelines.length === 0 ? (
        <EmptyState
          icon={GitBranch}
          title="No pipelines yet"
          description="Pipelines define multi-step AI agent workflows. Each pipeline chains skills together with configurable inputs, triggers, and approval gates."
          actions={[
            { label: "Create Pipeline", to: "/pipelines/new" },
            { label: "Browse Packages", to: "/packages", variant: "secondary" },
          ]}
          hint="Pipelines can be triggered manually, on a cron schedule, or via webhook."
        />
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
