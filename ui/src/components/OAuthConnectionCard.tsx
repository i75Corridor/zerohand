import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, ShieldCheck, ShieldAlert, ShieldX, Loader } from "lucide-react";
import { api } from "../lib/api.ts";
import type { ApiMcpServer } from "@pawn/shared";

/**
 * Shown inside McpServerRow expanded view for HTTP-based servers.
 * Handles connected/error/expired states and the connect/disconnect actions.
 * OAuth config (auth type, scopes, credentials) lives in AddMcpServerForm.
 */
export default function OAuthConnectionCard({ server }: { server: ApiMcpServer }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState("");

  const connect = useMutation({
    mutationFn: () => api.initiateOAuthConnect(server.id),
    onSuccess: (data) => {
      window.open(data.authUrl, "_blank");
    },
    onError: (e: Error) => setError(e.message),
  });

  const disconnect = useMutation({
    mutationFn: () => api.disconnectOAuth(server.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["mcp-servers"] }),
    onError: (e: Error) => setError(e.message),
  });

  const conn = server.oauthConnection;

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

  // ── Error / Expired / Revoked ──────────────────────────────────────────────
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
        {error && <p className="text-xs text-rose-400 mt-2">{error}</p>}
      </div>
    );
  }

  // ── Disconnected (has OAuth config but no active connection) ────────────────
  if (server.oauthConfig) {
    return (
      <div className="border-t border-pawn-surface-800 bg-pawn-surface-950 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert size={14} className="text-pawn-surface-500" />
            <span className="text-xs text-pawn-surface-400">OAuth configured — not connected</span>
          </div>
          <button
            onClick={() => connect.mutate()}
            disabled={connect.isPending}
            className="text-xs px-2.5 py-1 bg-pawn-gold-500 hover:bg-pawn-gold-400 text-pawn-surface-950 font-semibold rounded-button transition-colors disabled:opacity-50"
          >
            {connect.isPending ? <Loader size={11} className="animate-spin inline" /> : "Connect with OAuth"}
          </button>
        </div>
        {error && <p className="text-xs text-rose-400 mt-2">{error}</p>}
      </div>
    );
  }

  // No OAuth config — nothing to show (config lives in AddMcpServerForm / edit form)
  return null;
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
