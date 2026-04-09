import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, ShieldCheck, ShieldAlert, ShieldX, Unplug, Loader, KeyRound } from "lucide-react";
import { api } from "../lib/api.ts";
import type { ApiMcpServer } from "@pawn/shared";

export default function OAuthConnectionCard({ server }: { server: ApiMcpServer }) {
  const queryClient = useQueryClient();
  const [configExpanded, setConfigExpanded] = useState(false);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [scopes, setScopes] = useState("");
  const [saveError, setSaveError] = useState("");

  const saveConfig = useMutation({
    mutationFn: () =>
      api.updateMcpServer(server.id, {
        oauthConfig: {
          clientId: clientId.trim(),
          hasClientSecret: !!clientSecret.trim(),
          scopes: scopes.trim() ? scopes.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
        },
        // Send the secret via a separate field the backend expects
        ...(clientSecret.trim() ? { oauthClientSecret: clientSecret.trim() } as Record<string, string> : {}),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mcp-servers"] });
      setSaveError("");
    },
    onError: (e: Error) => setSaveError(e.message),
  });

  const connect = useMutation({
    mutationFn: () => api.initiateOAuthConnect(server.id),
    onSuccess: (data) => {
      window.open(data.authUrl, "_blank");
    },
    onError: (e: Error) => setSaveError(e.message),
  });

  const disconnect = useMutation({
    mutationFn: () => api.disconnectOAuth(server.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["mcp-servers"] }),
    onError: (e: Error) => setSaveError(e.message),
  });

  const conn = server.oauthConnection;
  const config = server.oauthConfig;

  // ── Connected ──────────────────────────────────────────────────────────────
  if (conn && conn.status === "active") {
    const expiresLabel = conn.expiresAt
      ? formatRelativeTime(conn.expiresAt)
      : "Never";

    return (
      <div className="border-t border-pawn-surface-800 bg-pawn-surface-950 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck size={14} className="text-emerald-400" />
            <span className="text-xs font-medium text-emerald-400">Connected</span>
            {conn.scope && (
              <span className="text-xs text-pawn-surface-500 font-mono ml-1">
                {conn.scope}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-pawn-surface-500">
              Expires: {expiresLabel}
            </span>
            <button
              onClick={() => disconnect.mutate()}
              disabled={disconnect.isPending}
              className="text-xs text-pawn-surface-500 hover:text-rose-400 transition-colors"
            >
              {disconnect.isPending ? "Disconnecting..." : "Disconnect"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Error / Expired ────────────────────────────────────────────────────────
  if (conn && (conn.status === "error" || conn.status === "expired" || conn.status === "revoked")) {
    const isError = conn.status === "error";
    return (
      <div className="border-t border-pawn-surface-800 bg-pawn-surface-950 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isError ? (
              <ShieldX size={14} className="text-rose-400" />
            ) : (
              <ShieldAlert size={14} className="text-amber-400" />
            )}
            <span className={`text-xs font-medium ${isError ? "text-rose-400" : "text-amber-400"}`}>
              {conn.status === "error" ? "Error" : conn.status === "expired" ? "Expired" : "Revoked"}
            </span>
            {conn.errorMessage && (
              <span className="text-xs text-pawn-surface-500 ml-1 truncate max-w-xs">
                {conn.errorMessage}
              </span>
            )}
          </div>
          <button
            onClick={() => connect.mutate()}
            disabled={connect.isPending}
            className="text-xs px-2.5 py-1 bg-pawn-gold-500 hover:bg-pawn-gold-400 text-pawn-surface-950 font-semibold rounded-button transition-colors disabled:opacity-50"
          >
            {connect.isPending ? <Loader size={11} className="animate-spin inline" /> : "Reconnect"}
          </button>
        </div>
      </div>
    );
  }

  // ── Disconnected (has config, no active connection) ────────────────────────
  if (config) {
    return (
      <div className="border-t border-pawn-surface-800 bg-pawn-surface-950 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Unplug size={14} className="text-pawn-surface-500" />
            <span className="text-xs text-pawn-surface-400">OAuth configured</span>
            <span className="text-xs text-pawn-surface-500 font-mono">{config.clientId}</span>
          </div>
          <button
            onClick={() => connect.mutate()}
            disabled={connect.isPending}
            className="text-xs px-2.5 py-1 bg-pawn-gold-500 hover:bg-pawn-gold-400 text-pawn-surface-950 font-semibold rounded-button transition-colors disabled:opacity-50"
          >
            {connect.isPending ? <Loader size={11} className="animate-spin inline" /> : "Connect with OAuth"}
          </button>
        </div>
        {saveError && (
          <p className="text-xs text-rose-400 mt-2">{saveError}</p>
        )}
      </div>
    );
  }

  // ── No OAuth Config ────────────────────────────────────────────────────────
  return (
    <div className="border-t border-pawn-surface-800 bg-pawn-surface-950 px-4 py-3">
      <button
        onClick={() => setConfigExpanded(!configExpanded)}
        className="flex items-center gap-2 text-xs text-pawn-surface-400 hover:text-pawn-surface-300 transition-colors w-full"
      >
        {configExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <KeyRound size={12} />
        <span>OAuth Configuration</span>
      </button>

      {configExpanded && (
        <div className="mt-3 space-y-3">
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
          <div>
            <label className="text-xs text-pawn-surface-400 mb-1 block">Scopes (comma-separated)</label>
            <input
              className="w-full bg-pawn-surface-800 border border-pawn-surface-700 rounded-button px-3 py-1.5 text-sm font-mono text-pawn-text-primary placeholder-pawn-surface-500 focus:outline-none focus:border-pawn-gold-500"
              placeholder="read,write,admin"
              value={scopes}
              onChange={(e) => setScopes(e.target.value)}
            />
          </div>

          {saveError && <p className="text-xs text-rose-400">{saveError}</p>}

          <div className="flex justify-end">
            <button
              onClick={() => saveConfig.mutate()}
              disabled={!clientId.trim() || saveConfig.isPending}
              className="px-3 py-1.5 bg-pawn-gold-500 hover:bg-pawn-gold-400 text-pawn-surface-950 text-sm font-semibold rounded-button transition-colors disabled:opacity-40"
            >
              {saveConfig.isPending ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();

  if (diffMs < 0) return "Expired";

  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  const diffDays = Math.floor(diffHr / 24);
  return `${diffDays}d`;
}
