import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bot, Server, Plus, X, Trash2, ChevronDown, ChevronRight, Check, AlertCircle, Loader, Cable, Sun, Moon, Monitor, Palette } from "lucide-react";
import { useState, useEffect } from "react";
import { api } from "../lib/api.ts";
import { useTheme } from "../context/ThemeContext.tsx";
import ModelSelector from "../components/ModelSelector.tsx";
import PageHeader from "../components/PageHeader.tsx";
import OAuthConnectionCard from "../components/OAuthConnectionCard.tsx";
import type { ApiMcpServer, ApiMcpTool } from "@pawn/shared";

// ── Appearance ───────────────────────────────────────────────────────────────

const themeOptions = [
  { value: "system" as const, label: "System", icon: Monitor },
  { value: "light" as const, label: "Light", icon: Sun },
  { value: "dark" as const, label: "Dark", icon: Moon },
];

function AppearanceSection() {
  const { theme, resolvedTheme, setTheme } = useTheme();

  return (
    <div className="bg-pawn-surface-900 border border-pawn-surface-800 rounded-card mb-6 overflow-hidden">
      <div className="px-6 py-4 border-b border-pawn-surface-800 flex items-center gap-3">
        <Palette size={14} className="text-pawn-gold-400" />
        <h2 className="text-xs font-semibold text-pawn-surface-400 uppercase tracking-wider">Appearance</h2>
      </div>

      <div className="p-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {themeOptions.map(({ value, label, icon: Icon }) => {
            const isActive = theme === value;
            return (
              <button
                key={value}
                onClick={() => setTheme(value)}
                className={`group flex items-center gap-3 px-4 py-3 rounded-card border text-sm font-medium transition-colors text-left ${
                  isActive
                    ? "bg-pawn-gold-600/20 border-pawn-gold-500/30 text-pawn-gold-400"
                    : "bg-pawn-surface-800/40 border-pawn-surface-800 text-pawn-surface-400 hover:text-pawn-text-primary hover:border-pawn-surface-700 hover:bg-pawn-surface-800/60"
                }`}
              >
                <Icon size={16} className={isActive ? "text-pawn-gold-400" : "group-hover:text-pawn-gold-400 transition-colors"} />
                <div className="flex flex-col">
                  <span>{label}</span>
                  {value === "system" && (
                    <span className="text-xs text-pawn-surface-500 font-normal mt-0.5">
                      Currently using {resolvedTheme}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Active Models ─────────────────────────────────────────────────────────────

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
    <div className="bg-pawn-surface-900 border border-pawn-surface-800 rounded-card mb-6 overflow-hidden">
      <div className="px-6 py-4 border-b border-pawn-surface-800 flex items-center gap-3">
        <Bot size={14} className="text-pawn-gold-400" />
        <h2 className="text-xs font-semibold text-pawn-surface-400 uppercase tracking-wider">Active Models</h2>
      </div>

      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
          <div>
            <div className="text-sm font-medium text-pawn-text-secondary">Agent Model</div>
            <p className="text-xs text-pawn-surface-500 mt-0.5">Used by the global agent in the sidebar chat.</p>
          </div>
          <ModelSelector
            value={agentModel ?? "google/gemini-2.5-flash"}
            onChange={(fullId) => { if (fullId) saveAgentModel.mutate(fullId); }}
          />
        </div>

        <div className="h-px bg-pawn-surface-800" />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
          <div>
            <div className="text-sm font-medium text-pawn-text-secondary">Default Pipeline Model</div>
            <p className="text-xs text-pawn-surface-500 mt-0.5">Fallback model for pipelines without an explicit model set.</p>
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

// ── MCP Server row ────────────────────────────────────────────────────────────

function McpServerRow({ server }: { server: ApiMcpServer }) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [tools, setTools] = useState<ApiMcpTool[] | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  // Compute missing required env vars from metadata
  const missingEnvVars = (server.metadata?.envRequirements ?? [])
    .filter(r => r.required && !(server.env && r.name in server.env))
    .map(r => r.name);

  const toggleEnabled = useMutation({
    mutationFn: () => api.updateMcpServer(server.id, { enabled: !server.enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["mcp-servers"] }),
  });

  const del = useMutation({
    mutationFn: () => api.deleteMcpServer(server.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["mcp-servers"] }),
  });

  async function handleTest() {
    setTesting(true);
    setTestError(null);
    setTools(null);
    try {
      const result = await api.testMcpServer(server.id);
      if (result.connected) {
        setTools(result.tools);
        setExpanded(true);
      } else {
        setTestError(result.error ?? "Connection failed");
      }
    } catch (e) {
      setTestError(String(e));
    } finally {
      setTesting(false);
    }
  }

  const transportBadgeColor = {
    "stdio": "bg-violet-500/20 text-violet-300",
    "sse": "bg-emerald-500/20 text-emerald-300",
    "streamable-http": "bg-pawn-gold-500/20 text-pawn-gold-300",
  }[server.transport] ?? "bg-pawn-surface-700 text-pawn-surface-300";

  return (
    <div className="border border-pawn-surface-800 rounded-card overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 bg-pawn-surface-900">
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-pawn-surface-500 hover:text-pawn-surface-300 transition-colors"
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-mono text-pawn-text-primary">{server.name}</span>
            <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${transportBadgeColor}`}>
              {server.transport}
            </span>
            {server.source === "blueprint" && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-pawn-surface-700 text-pawn-surface-400">blueprint</span>
            )}
            {missingEnvVars.length > 0 && (
              <span
                className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400"
                title={`Missing: ${missingEnvVars.join(", ")}`}
              >
                <AlertCircle size={10} />
                {missingEnvVars.length} env var{missingEnvVars.length > 1 ? "s" : ""} missing
              </span>
            )}
          </div>
          {server.transport === "stdio" && server.command && (
            <div className="text-xs text-pawn-surface-500 font-mono mt-0.5 truncate">
              {server.command} {server.args?.join(" ")}
            </div>
          )}
          {(server.transport === "sse" || server.transport === "streamable-http") && server.url && (
            <div className="text-xs text-pawn-surface-500 font-mono mt-0.5 truncate">{server.url}</div>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={handleTest}
            disabled={testing}
            className="text-xs px-2 py-1 bg-pawn-surface-800 hover:bg-pawn-surface-700 text-pawn-surface-300 rounded-button transition-colors disabled:opacity-50"
          >
            {testing ? <Loader size={11} className="animate-spin inline" /> : "Test"}
          </button>
          <button
            onClick={() => toggleEnabled.mutate()}
            disabled={toggleEnabled.isPending}
            className={`w-9 h-5 rounded-full transition-colors ${server.enabled ? "bg-pawn-gold-500" : "bg-pawn-surface-700"}`}
            title={server.enabled ? "Disable" : "Enable"}
          >
            <div className={`w-3.5 h-3.5 bg-white rounded-full transition-transform mx-0.5 ${server.enabled ? "translate-x-4" : "translate-x-0"}`} />
          </button>
          <button
            onClick={() => del.mutate()}
            disabled={del.isPending}
            className="text-pawn-surface-600 hover:text-rose-400 transition-colors"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {testError && (
        <div className="px-4 py-2 bg-rose-900/20 border-t border-rose-800/30 flex items-center gap-2 text-xs text-rose-300">
          <AlertCircle size={12} /> {testError}
        </div>
      )}

      {expanded && tools !== null && (
        <div className="border-t border-pawn-surface-800 bg-pawn-surface-950 px-4 py-3">
          <div className="text-xs text-pawn-surface-500 mb-2">{tools.length} tool{tools.length !== 1 ? "s" : ""} available</div>
          <div className="space-y-1.5">
            {tools.map((t) => (
              <div key={t.name} className="flex items-start gap-2">
                <Check size={11} className="text-emerald-400 mt-0.5 flex-shrink-0" />
                <div>
                  <span className="text-xs font-mono text-pawn-surface-300">{t.name}</span>
                  {t.description && (
                    <span className="text-xs text-pawn-surface-500 ml-2">{t.description}</span>
                  )}
                </div>
              </div>
            ))}
            {tools.length === 0 && (
              <div className="text-xs text-pawn-surface-600">No tools exposed by this server.</div>
            )}
          </div>
        </div>
      )}

      {(server.transport === "sse" || server.transport === "streamable-http") && server.oauthConfig && (
        <OAuthConnectionCard server={server} />
      )}
    </div>
  );
}

// ── Add MCP Server form ───────────────────────────────────────────────────────

function AddMcpServerForm({ onCreated, onCancel }: { onCreated: () => void; onCancel: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [transport, setTransport] = useState<"stdio" | "sse" | "streamable-http">("stdio");
  const [command, setCommand] = useState("");
  const [args, setArgs] = useState("");
  const [url, setUrl] = useState("");
  const [headers, setHeaders] = useState("");
  const [envVars, setEnvVars] = useState("");
  const [error, setError] = useState("");
  const [detectedVars, setDetectedVars] = useState<Array<{ name: string; required: boolean; description?: string; docsUrl?: string; detectedFrom: string; value: string }>>([]);
  const [detectionRan, setDetectionRan] = useState(false);

  // OAuth config state
  const [authType, setAuthType] = useState<"none" | "oauth">("none");
  const [oauthScopes, setOauthScopes] = useState("");
  const [useCustomCredentials, setUseCustomCredentials] = useState(false);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const isHttpTransport = transport === "sse" || transport === "streamable-http";

  const create = useMutation({
    mutationFn: () => {
      const parsedArgs = args.trim() ? args.trim().split(/\s+/) : [];
      const parsedHeaders = parseKV(headers);
      const parsedEnv = detectedVars.length > 0
        ? Object.fromEntries(detectedVars.filter(v => v.value).map(v => [v.name, v.value]))
        : parseKV(envVars);

      // Build OAuth config if auth type is oauth
      const oauthConfig = (isHttpTransport && authType === "oauth")
        ? {
            clientId: useCustomCredentials ? clientId.trim() : "default",
            hasClientSecret: useCustomCredentials && !!clientSecret.trim(),
            scopes: oauthScopes.trim() ? oauthScopes.trim().split(/\s+/) : undefined,
            ...(useCustomCredentials && clientSecret.trim() ? { clientSecret: clientSecret.trim() } : {}),
          } as any
        : undefined;

      return api.createMcpServer({
        name,
        transport,
        command: transport === "stdio" ? command || undefined : undefined,
        args: transport === "stdio" ? parsedArgs : undefined,
        url: transport !== "stdio" ? url || undefined : undefined,
        headers: parsedHeaders,
        env: parsedEnv,
        enabled: true,
        ...(oauthConfig ? { oauthConfig } : {}),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mcp-servers"] });
      onCreated();
    },
    onError: (e: Error) => setError(e.message),
  });

  const detect = useMutation({
    mutationFn: () => {
      const parsedArgs = args.trim() ? args.trim().split(/\s+/) : [];
      return api.detectMcpEnv({
        transport,
        command: transport === "stdio" ? command || undefined : undefined,
        args: transport === "stdio" ? parsedArgs : undefined,
        url: transport !== "stdio" ? url || undefined : undefined,
        name: name || undefined,
      });
    },
    onSuccess: (data) => {
      setDetectionRan(true);
      if (data.detected.length > 0) {
        const existingEnv = parseKV(envVars);
        const merged = data.detected.map(d => ({
          ...d,
          value: existingEnv[d.name] ?? (d.required ? `\${${d.name}}` : ""),
        }));
        setDetectedVars(merged);
      } else {
        setDetectedVars([]);
      }
    },
    onError: (e: Error) => {
      setDetectionRan(false);
      if (e.message.includes("429")) {
        setError("Detection is busy, try again in a moment");
      } else {
        setError(e.message);
      }
    },
  });

  const nameValid = /^[a-z0-9][a-z0-9_-]*$/.test(name);

  return (
    <div className="border border-pawn-surface-700 rounded-card p-4 bg-pawn-surface-900 mb-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-pawn-text-primary">Add MCP Server</span>
        <button onClick={onCancel} className="text-pawn-surface-500 hover:text-pawn-surface-300"><X size={14} /></button>
      </div>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-pawn-surface-400 mb-1 block">Name</label>
            <input
              className="w-full bg-pawn-surface-800 border border-pawn-surface-700 rounded-button px-3 py-1.5 text-sm font-mono text-pawn-text-primary placeholder-pawn-surface-500 focus:outline-none focus:border-pawn-gold-500"
              placeholder="brave-search"
              value={name}
              onChange={(e) => { setName(e.target.value.toLowerCase()); setError(""); }}
              autoFocus
            />
            {name && !nameValid && <p className="text-xs text-rose-400 mt-1">Lowercase letters, numbers, hyphens, underscores</p>}
          </div>
          <div>
            <label className="text-xs text-pawn-surface-400 mb-1 block">Transport</label>
            <select
              className="w-full bg-pawn-surface-800 border border-pawn-surface-700 rounded-button px-3 py-1.5 text-sm text-pawn-text-primary focus:outline-none focus:border-pawn-gold-500"
              value={transport}
              onChange={(e) => setTransport(e.target.value as typeof transport)}
            >
              <option value="stdio">stdio</option>
              <option value="sse">SSE</option>
              <option value="streamable-http">Streamable HTTP</option>
            </select>
          </div>
        </div>

        {transport === "stdio" && (
          <>
            <div>
              <label className="text-xs text-pawn-surface-400 mb-1 block">Command</label>
              <input
                className="w-full bg-pawn-surface-800 border border-pawn-surface-700 rounded-button px-3 py-1.5 text-sm font-mono text-pawn-text-primary placeholder-pawn-surface-500 focus:outline-none focus:border-pawn-gold-500"
                placeholder="npx"
                value={command}
                onChange={(e) => setCommand(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-pawn-surface-400 mb-1 block">Args (space-separated)</label>
              <input
                className="w-full bg-pawn-surface-800 border border-pawn-surface-700 rounded-button px-3 py-1.5 text-sm font-mono text-pawn-text-primary placeholder-pawn-surface-500 focus:outline-none focus:border-pawn-gold-500"
                placeholder="-y @anthropic/brave-search-mcp"
                value={args}
                onChange={(e) => setArgs(e.target.value)}
              />
            </div>
          </>
        )}

        {isHttpTransport && (
          <>
            <div>
              <label className="text-xs text-pawn-surface-400 mb-1 block">URL</label>
              <input
                className="w-full bg-pawn-surface-800 border border-pawn-surface-700 rounded-button px-3 py-1.5 text-sm font-mono text-pawn-text-primary placeholder-pawn-surface-500 focus:outline-none focus:border-pawn-gold-500"
                placeholder="https://api.example.com/mcp"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>

            {/* Authentication */}
            <div className="border border-pawn-surface-700 rounded-card p-3 space-y-3">
              <div>
                <label className="text-xs font-medium text-pawn-text-secondary mb-1 block">Authentication</label>
                <select
                  className="w-full bg-pawn-surface-800 border border-pawn-surface-700 rounded-button px-3 py-1.5 text-sm text-pawn-text-primary focus:outline-none focus:border-pawn-gold-500"
                  value={authType}
                  onChange={(e) => setAuthType(e.target.value as "none" | "oauth")}
                >
                  <option value="none">None</option>
                  <option value="oauth">OAuth</option>
                </select>
              </div>

              {authType === "oauth" && (
                <div className="border border-pawn-surface-700 rounded-card p-3 space-y-3">
                  <button
                    type="button"
                    onClick={() => setAdvancedOpen(!advancedOpen)}
                    className="flex items-center gap-1.5 text-xs text-pawn-surface-400 hover:text-pawn-surface-300 transition-colors"
                  >
                    {advancedOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    Advanced
                  </button>

                  {advancedOpen && (
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs font-medium text-pawn-text-secondary mb-1 block">OAuth Scopes</label>
                        <input
                          className="w-full bg-pawn-surface-800 border border-pawn-surface-700 rounded-button px-3 py-1.5 text-sm font-mono text-pawn-text-primary placeholder-pawn-surface-500 focus:outline-none focus:border-pawn-gold-500"
                          placeholder="mcp:* or custom scopes separated by spaces"
                          value={oauthScopes}
                          onChange={(e) => setOauthScopes(e.target.value)}
                        />
                        <p className="text-xs text-pawn-surface-500 mt-1">Default: mcp:* (space-separated for multiple scopes)</p>
                      </div>

                      <div>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={useCustomCredentials}
                            onChange={(e) => setUseCustomCredentials(e.target.checked)}
                            className="rounded border-pawn-surface-600 bg-pawn-surface-800 text-pawn-gold-500 focus:ring-pawn-gold-500"
                          />
                          <span className="text-sm text-pawn-text-secondary">Use custom OAuth credentials</span>
                        </label>
                        <p className="text-xs text-pawn-surface-500 mt-1 ml-6">Leave unchecked to use the server's default OAuth flow</p>
                      </div>

                      {useCustomCredentials && (
                        <div className="space-y-3 ml-6">
                          <div>
                            <label className="text-xs text-pawn-surface-400 mb-1 block">Client ID</label>
                            <input
                              className="w-full bg-pawn-surface-800 border border-pawn-surface-700 rounded-button px-3 py-1.5 text-sm font-mono text-pawn-text-primary placeholder-pawn-surface-500 focus:outline-none focus:border-pawn-gold-500"
                              placeholder="your-client-id"
                              value={clientId}
                              onChange={(e) => setClientId(e.target.value)}
                            />
                          </div>
                          <div>
                            <label className="text-xs text-pawn-surface-400 mb-1 block">Client Secret</label>
                            <input
                              type="password"
                              className="w-full bg-pawn-surface-800 border border-pawn-surface-700 rounded-button px-3 py-1.5 text-sm font-mono text-pawn-text-primary placeholder-pawn-surface-500 focus:outline-none focus:border-pawn-gold-500"
                              placeholder="your-client-secret"
                              value={clientSecret}
                              onChange={(e) => setClientSecret(e.target.value)}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Custom Headers */}
            <div>
              <label className="text-xs text-pawn-surface-400 mb-1 block">Custom Headers (KEY=VALUE, one per line)</label>
              <textarea
                className="w-full bg-pawn-surface-800 border border-pawn-surface-700 rounded-button px-3 py-1.5 text-sm font-mono text-pawn-text-primary placeholder-pawn-surface-500 focus:outline-none focus:border-pawn-gold-500 resize-none"
                rows={2}
                placeholder={"X-Custom-Header=value"}
                value={headers}
                onChange={(e) => setHeaders(e.target.value)}
              />
            </div>
          </>
        )}

        {detectedVars.length > 0 ? (
          <div className="space-y-2">
            <label className="text-xs text-pawn-surface-400 mb-1 block">Detected Environment Variables</label>
            {detectedVars.map((v, i) => (
              <div key={v.name} className="bg-pawn-surface-800 border border-pawn-surface-700 rounded-button p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-mono font-medium text-pawn-text-primary">{v.name}</span>
                  {v.required && <span className="text-[10px] px-1.5 py-0.5 bg-rose-500/20 text-rose-400 rounded">required</span>}
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${v.detectedFrom === "registry" || v.detectedFrom === "both" ? "bg-pawn-gold-500/20 text-pawn-gold-400" : "bg-amber-500/20 text-amber-400"}`}>
                    {v.detectedFrom === "registry" || v.detectedFrom === "both" ? "verified" : "detected"}
                  </span>
                </div>
                {v.description && <p className="text-xs text-pawn-surface-500 mb-1.5">{v.description}</p>}
                {v.docsUrl && <a href={v.docsUrl} target="_blank" rel="noreferrer" className="text-xs text-pawn-gold-400 hover:text-pawn-gold-300 mb-1.5 block">Documentation →</a>}
                <input
                  className="w-full bg-pawn-surface-900 border border-pawn-surface-600 rounded px-2 py-1 text-sm font-mono text-pawn-text-primary placeholder-pawn-surface-500 focus:outline-none focus:border-pawn-gold-500"
                  placeholder={v.required ? `\${${v.name}}` : "optional"}
                  value={v.value}
                  onChange={(e) => {
                    const updated = [...detectedVars];
                    updated[i] = { ...updated[i], value: e.target.value };
                    setDetectedVars(updated);
                  }}
                />
              </div>
            ))}
            <button
              type="button"
              onClick={() => { setDetectedVars([]); setDetectionRan(false); }}
              className="text-xs text-pawn-surface-500 hover:text-pawn-surface-300"
            >
              Switch to manual entry
            </button>
          </div>
        ) : (
          <div>
            <label className="text-xs text-pawn-surface-400 mb-1 block">Env Vars (KEY=VALUE, one per line)</label>
            <textarea
              className="w-full bg-pawn-surface-800 border border-pawn-surface-700 rounded-button px-3 py-1.5 text-sm font-mono text-pawn-text-primary placeholder-pawn-surface-500 focus:outline-none focus:border-pawn-gold-500 resize-none"
              rows={2}
              placeholder={"BRAVE_API_KEY=...\nOTHER_VAR=value"}
              value={envVars}
              onChange={(e) => setEnvVars(e.target.value)}
            />
            {detectionRan && <p className="text-xs text-pawn-surface-500 mt-1">No required environment variables detected.</p>}
          </div>
        )}

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => detect.mutate()}
            disabled={detect.isPending || (transport === "stdio" && !command)}
            className="px-3 py-1.5 bg-pawn-surface-700 hover:bg-pawn-surface-600 text-pawn-text-secondary text-xs font-medium rounded-button transition-colors disabled:opacity-40 flex items-center gap-1.5"
          >
            {detect.isPending ? (
              <><Loader size={12} className="animate-spin" /> Detecting...</>
            ) : (
              <><Cable size={12} /> Detect Required Environment</>
            )}
          </button>
        </div>

        {error && <p className="text-xs text-rose-400">{error}</p>}

        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="px-3 py-1.5 text-sm text-pawn-surface-400 hover:text-pawn-text-primary transition-colors">Cancel</button>
          <button
            onClick={() => create.mutate()}
            disabled={!nameValid || create.isPending}
            className="px-3 py-1.5 bg-pawn-gold-500 hover:bg-pawn-gold-400 text-pawn-surface-950 text-sm font-semibold rounded-button transition-colors disabled:opacity-40"
          >
            {create.isPending ? "Adding..." : "Add Server"}
          </button>
        </div>
      </div>
    </div>
  );
}

function parseKV(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    result[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  }
  return result;
}

// ── MCP Servers section ───────────────────────────────────────────────────────

function McpServersSection() {
  const { data: servers = [], isLoading } = useQuery({
    queryKey: ["mcp-servers"],
    queryFn: () => api.listMcpServers(),
  });
  const [adding, setAdding] = useState(false);

  return (
    <div className="bg-pawn-surface-900 border border-pawn-surface-800 rounded-2xl mb-6 overflow-hidden">
      <div className="px-6 py-5 border-b border-pawn-surface-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Server size={14} className="text-pawn-gold-400" />
          <h2 className="text-sm font-semibold text-pawn-text-primary">MCP Servers</h2>
          {servers.length > 0 && (
            <span className="text-xs text-pawn-surface-500">{servers.length} registered</span>
          )}
        </div>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 text-xs text-pawn-surface-500 hover:text-pawn-surface-300 transition-colors"
          >
            <Plus size={13} /> Add Server
          </button>
        )}
      </div>

      <div className="p-4 space-y-3">
        {adding && <AddMcpServerForm onCreated={() => setAdding(false)} onCancel={() => setAdding(false)} />}

        {isLoading && <div className="text-pawn-surface-500 text-sm">Loading...</div>}

        {!isLoading && servers.length === 0 && !adding && (
          <div className="text-pawn-surface-600 text-sm bg-pawn-surface-900 border border-pawn-surface-800 rounded-card p-6 text-center">
            No MCP servers registered. Add one to enable skills to call external tools.
          </div>
        )}

        {servers.map((server) => (
          <McpServerRow key={server.id} server={server} />
        ))}
      </div>
    </div>
  );
}

// ── Custom Providers section ─────────────────────────────────────────────────

interface ProviderEntry {
  baseUrl: string;
  apiKey?: string;
  models: Array<{ id: string; name?: string; contextWindow?: number; maxTokens?: number }>;
}

function CustomProvidersSection() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["custom-providers"],
    queryFn: () => api.getCustomProviders(),
  });

  const [adding, setAdding] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const providers = data?.providers ?? {};
  const providerNames = Object.keys(providers);

  const save = useMutation({
    mutationFn: (config: { providers: Record<string, ProviderEntry> }) =>
      api.updateCustomProviders(config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["custom-providers"] });
      queryClient.invalidateQueries({ queryKey: ["models"] });
    },
  });

  function handleDelete(name: string) {
    const next = { ...providers };
    delete next[name];
    save.mutate({ providers: next });
  }

  return (
    <div className="bg-pawn-surface-900 border border-pawn-surface-800 rounded-2xl mb-6 overflow-hidden">
      <div className="px-6 py-5 border-b border-pawn-surface-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Cable size={14} className="text-pawn-gold-400" />
          <h2 className="text-sm font-semibold text-pawn-text-primary">Custom Providers</h2>
          {providerNames.length > 0 && (
            <span className="text-xs text-pawn-surface-500">{providerNames.length} configured</span>
          )}
        </div>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 text-xs text-pawn-surface-500 hover:text-pawn-surface-300 transition-colors"
          >
            <Plus size={13} /> Add Provider
          </button>
        )}
      </div>

      <div className="p-4 space-y-3">
        {adding && (
          <AddProviderForm
            onCreated={(name, entry) => {
              save.mutate({ providers: { ...providers, [name]: entry } });
              setAdding(false);
            }}
            onCancel={() => setAdding(false)}
            existingNames={providerNames}
          />
        )}

        {isLoading && <div className="text-pawn-surface-500 text-sm">Loading...</div>}

        {!isLoading && providerNames.length === 0 && !adding && (
          <div className="text-pawn-surface-600 text-sm bg-pawn-surface-900 border border-pawn-surface-800 rounded-card p-6 text-center">
            No custom providers configured. Add one to use OpenAI-compatible endpoints (Ollama, LiteLLM, vLLM, etc.).
          </div>
        )}

        {providerNames.map((name) => {
          const provider = providers[name];
          const isExpanded = expanded[name] ?? false;
          return (
            <div key={name} className="border border-pawn-surface-800 rounded-card overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3 bg-pawn-surface-900">
                <button
                  onClick={() => setExpanded({ ...expanded, [name]: !isExpanded })}
                  className="text-pawn-surface-500 hover:text-pawn-surface-300 transition-colors"
                >
                  {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-mono text-pawn-text-primary">{name}</span>
                    <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                      {provider.models.length} model{provider.models.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="text-xs text-pawn-surface-500 font-mono mt-0.5 truncate">{provider.baseUrl}</div>
                </div>
                <button
                  onClick={() => handleDelete(name)}
                  disabled={save.isPending}
                  className="text-pawn-surface-600 hover:text-rose-400 transition-colors flex-shrink-0"
                >
                  <Trash2 size={13} />
                </button>
              </div>

              {isExpanded && (
                <div className="border-t border-pawn-surface-800 bg-pawn-surface-950 px-4 py-3">
                  {provider.apiKey && (
                    <div className="text-xs text-pawn-surface-500 mb-2">
                      API Key: <span className="font-mono">{provider.apiKey}</span>
                    </div>
                  )}
                  <div className="space-y-1.5">
                    {provider.models.map((m) => (
                      <div key={m.id} className="flex items-center gap-2">
                        <Check size={11} className="text-emerald-400 flex-shrink-0" />
                        <span className="text-xs font-mono text-pawn-surface-300">{m.id}</span>
                        {m.name && m.name !== m.id && (
                          <span className="text-xs text-pawn-surface-500">{m.name}</span>
                        )}
                        {m.contextWindow && (
                          <span className="text-xs text-pawn-surface-600">{(m.contextWindow / 1000).toFixed(0)}k ctx</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AddProviderForm({
  onCreated,
  onCancel,
  existingNames,
}: {
  onCreated: (name: string, entry: ProviderEntry) => void;
  onCancel: () => void;
  existingNames: string[];
}) {
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [modelsText, setModelsText] = useState("");
  const [error, setError] = useState("");

  const nameValid = /^[a-z0-9][a-z0-9_-]*$/.test(name) && !existingNames.includes(name);

  function handleAdd() {
    if (!baseUrl.trim()) { setError("Base URL is required"); return; }
    const modelIds = modelsText.split("\n").map((s) => s.trim()).filter(Boolean);
    if (modelIds.length === 0) { setError("At least one model ID is required"); return; }
    onCreated(name, {
      baseUrl: baseUrl.trim(),
      apiKey: apiKey.trim() || undefined,
      models: modelIds.map((id) => ({ id })),
    });
  }

  return (
    <div className="border border-pawn-surface-700 rounded-card p-4 bg-pawn-surface-900 mb-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-pawn-text-primary">Add Custom Provider</span>
        <button onClick={onCancel} className="text-pawn-surface-500 hover:text-pawn-surface-300"><X size={14} /></button>
      </div>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-pawn-surface-400 mb-1 block">Provider Name</label>
            <input
              className="w-full bg-pawn-surface-800 border border-pawn-surface-700 rounded-button px-3 py-1.5 text-sm font-mono text-pawn-text-primary placeholder-pawn-surface-500 focus:outline-none focus:border-pawn-gold-500"
              placeholder="litellm"
              value={name}
              onChange={(e) => { setName(e.target.value.toLowerCase()); setError(""); }}
              autoFocus
            />
            {name && !nameValid && (
              <p className="text-xs text-rose-400 mt-1">
                {existingNames.includes(name) ? "Name already exists" : "Lowercase letters, numbers, hyphens, underscores"}
              </p>
            )}
          </div>
          <div>
            <label className="text-xs text-pawn-surface-400 mb-1 block">Base URL</label>
            <input
              className="w-full bg-pawn-surface-800 border border-pawn-surface-700 rounded-button px-3 py-1.5 text-sm font-mono text-pawn-text-primary placeholder-pawn-surface-500 focus:outline-none focus:border-pawn-gold-500"
              placeholder="http://localhost:4000/v1"
              value={baseUrl}
              onChange={(e) => { setBaseUrl(e.target.value); setError(""); }}
            />
          </div>
        </div>
        <div>
          <label className="text-xs text-pawn-surface-400 mb-1 block">API Key (optional)</label>
          <input
            className="w-full bg-pawn-surface-800 border border-pawn-surface-700 rounded-button px-3 py-1.5 text-sm font-mono text-pawn-text-primary placeholder-pawn-surface-500 focus:outline-none focus:border-pawn-gold-500"
            placeholder="sk-..."
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            type="password"
          />
        </div>
        <div>
          <label className="text-xs text-pawn-surface-400 mb-1 block">Model IDs (one per line)</label>
          <textarea
            className="w-full bg-pawn-surface-800 border border-pawn-surface-700 rounded-button px-3 py-1.5 text-sm font-mono text-pawn-text-primary placeholder-pawn-surface-500 focus:outline-none focus:border-pawn-gold-500 resize-none"
            rows={3}
            placeholder={"gpt-4o\nclaude-3-opus\nllama-70b"}
            value={modelsText}
            onChange={(e) => { setModelsText(e.target.value); setError(""); }}
          />
        </div>

        {error && <p className="text-xs text-rose-400">{error}</p>}

        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="px-3 py-1.5 text-sm text-pawn-surface-400 hover:text-pawn-text-primary transition-colors">Cancel</button>
          <button
            onClick={handleAdd}
            disabled={!nameValid}
            className="px-3 py-1.5 bg-pawn-gold-500 hover:bg-pawn-gold-400 text-pawn-surface-950 text-sm font-semibold rounded-button transition-colors disabled:opacity-40"
          >
            Add Provider
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Settings() {
  const [oauthMessage, setOauthMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthStatus = params.get("oauth");
    if (oauthStatus === "success") {
      setOauthMessage({ type: "success", text: "OAuth connection established successfully." });
      window.history.replaceState({}, "", window.location.pathname);
    } else if (oauthStatus === "error") {
      const msg = params.get("message") || "OAuth connection failed.";
      setOauthMessage({ type: "error", text: msg });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  return (
    <div className="p-4 sm:p-6 lg:p-10 max-w-4xl pt-14 lg:pt-10">
      <PageHeader title="Settings" />

      {oauthMessage && (
        <div
          className={`mb-4 px-4 py-3 rounded-card border text-sm flex items-center justify-between ${
            oauthMessage.type === "success"
              ? "bg-emerald-900/20 border-emerald-800/30 text-emerald-300"
              : "bg-rose-900/20 border-rose-800/30 text-rose-300"
          }`}
        >
          <div className="flex items-center gap-2">
            {oauthMessage.type === "success" ? (
              <Check size={14} className="text-emerald-400" />
            ) : (
              <AlertCircle size={14} className="text-rose-400" />
            )}
            {oauthMessage.text}
          </div>
          <button
            onClick={() => setOauthMessage(null)}
            className="text-pawn-surface-400 hover:text-pawn-surface-300 transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      )}

      <AppearanceSection />
      <ActiveModelsSection />
      <CustomProvidersSection />
      <McpServersSection />
    </div>
  );
}
