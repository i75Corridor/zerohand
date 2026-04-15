import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Blocks,
  RefreshCw,
  Trash2,
  Download,
  Star,
  Search,
  ArrowUpCircle,
  CheckCircle,
  ExternalLink,
  Link,
  ShieldAlert,
  AlertTriangle,
} from "lucide-react";
import { api } from "../lib/api.ts";
import EmptyState from "../components/EmptyState.tsx";
import PageHeader from "../components/PageHeader.tsx";
import type { ApiInstalledBlueprint, ApiDiscoveredBlueprint, ApiModelWarning } from "@pawn/shared";

// ── Security error parsing ─────────────────────────────────────────────────────

interface SecurityFinding {
  level: "HIGH" | "MEDIUM" | "LOW";
  file: string;
  description: string;
}

interface ParsedSecurityError {
  repoName: string;
  findings: SecurityFinding[];
}

function parseSecurityError(err: unknown): ParsedSecurityError | null {
  const msg = String(err);
  // Extract JSON body from the fetch error string
  const jsonMatch = msg.match(/\{.*\}/s);
  if (!jsonMatch) return null;
  let inner: string;
  try {
    inner = (JSON.parse(jsonMatch[0]) as { error?: string }).error ?? "";
  } catch {
    return null;
  }
  if (!inner.includes("failed security check")) return null;

  const repoMatch = inner.match(/^Error: Blueprint (.+?) failed security check/);
  const repoName = repoMatch?.[1] ?? "blueprint";

  const findings: SecurityFinding[] = [];
  for (const line of inner.split("\n")) {
    const m = line.match(/•\s*\[(HIGH|MEDIUM|LOW)\]\s*\[(.+?)\]\s*(.+)/);
    if (m) {
      findings.push({ level: m[1] as SecurityFinding["level"], file: m[2], description: m[3].trim() });
    }
  }

  return findings.length > 0 ? { repoName, findings } : null;
}

function SecurityErrorPanel({
  repoUrl,
  error,
  onForce,
  forcing,
}: {
  repoUrl: string;
  error: unknown;
  onForce: () => void;
  forcing: boolean;
}) {
  const parsed = parseSecurityError(error);
  if (!parsed) {
    return <p className="mb-4 text-xs text-rose-400">Install failed: {String(error)}</p>;
  }

  const levelStyle: Record<SecurityFinding["level"], string> = {
    HIGH: "text-rose-700 bg-rose-100 border-rose-300 dark:text-rose-400 dark:bg-rose-500/10 dark:border-rose-500/20",
    MEDIUM: "text-amber-700 bg-amber-100 border-amber-300 dark:text-amber-400 dark:bg-amber-500/10 dark:border-amber-500/20",
    LOW: "text-pawn-surface-600 bg-pawn-surface-100 border-pawn-surface-300 dark:text-pawn-surface-400 dark:bg-pawn-surface-500/10 dark:border-pawn-surface-500/20",
  };

  return (
    <div className="mb-4 bg-rose-50 border border-rose-200 rounded-card p-4 dark:bg-rose-950/20 dark:border-rose-500/20">
      <div className="flex items-center gap-2 mb-3">
        <ShieldAlert size={14} className="text-rose-600 flex-shrink-0 dark:text-rose-400" />
        <span className="text-sm font-semibold text-rose-700 dark:text-rose-300">Security check failed</span>
        <span className="text-xs text-pawn-surface-500">{parsed.repoName}</span>
      </div>
      <div className="flex flex-col gap-2 mb-4">
        {parsed.findings.map((f, i) => (
          <div key={i} className="flex items-start gap-2">
            <span className={`text-caption font-bold px-1.5 py-0.5 rounded border flex-shrink-0 mt-0.5 tracking-wide ${levelStyle[f.level]}`}>
              {f.level}
            </span>
            <div className="min-w-0">
              <p className="text-xs font-mono text-pawn-surface-400 truncate">{f.file}</p>
              <p className="text-xs text-pawn-surface-300">{f.description}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between pt-3 border-t border-rose-500/10">
        <p className="text-xs text-pawn-surface-500">Only install if you trust this source.</p>
        <button
          onClick={onForce}
          disabled={forcing}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-100 hover:bg-rose-200 text-rose-700 border border-rose-300 dark:bg-rose-500/10 dark:hover:bg-rose-500/20 dark:text-rose-400 dark:border-rose-500/20 text-xs font-medium rounded-button transition-colors disabled:opacity-50"
        >
          <Download size={11} />
          {forcing ? "Installing..." : "Install anyway"}
        </button>
      </div>
    </div>
  );
}

// ── Model warning panel ────────────────────────────────────────────────────────

function ModelWarningPanel({
  warnings,
  onDismiss,
}: {
  warnings: ApiModelWarning[];
  onDismiss: () => void;
}) {
  return (
    <div className="mb-4 bg-amber-50 border border-amber-300 dark:bg-amber-950/20 dark:border-amber-500/20 rounded-card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <AlertTriangle size={14} className="text-amber-600 dark:text-amber-400 flex-shrink-0" />
          <span className="text-sm font-semibold text-amber-800 dark:text-amber-300">Model API keys missing</span>
        </div>
        <button onClick={onDismiss} className="text-xs text-pawn-surface-500 hover:text-pawn-surface-300 transition-colors">
          Dismiss
        </button>
      </div>
      <div className="flex flex-col gap-2 mb-3">
        {warnings.map((w, i) => (
          <div key={i} className="text-xs text-amber-700 dark:text-amber-200/80">
            <span className="font-mono text-amber-700 dark:text-amber-400">{w.model}</span> — {w.message}
          </div>
        ))}
      </div>
      <p className="text-xs text-pawn-surface-500">
        Add the required API keys in <a href="/settings" className="text-pawn-gold-400 hover:underline">Settings</a> to use these skills.
        The pipeline was installed successfully and can run using the pipeline-level model instead.
      </p>
    </div>
  );
}

// ── Installed blueprint card ──────────────────────────────────────────────────

function InstalledCard({
  pkg,
  onUpdate,
  onUninstall,
  updating,
  uninstalling,
}: {
  pkg: ApiInstalledBlueprint;
  onUpdate: () => void;
  onUninstall: () => void;
  updating: boolean;
  uninstalling: boolean;
}) {
  return (
    <div className="bg-pawn-surface-900 border border-pawn-surface-800 rounded-card p-4 flex flex-col gap-3 card-hover">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <a
              href={`https://github.com/${pkg.repoFullName}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-semibold text-pawn-text-primary hover:text-pawn-gold-300 flex items-center gap-1 transition-colors"
            >
              {pkg.repoFullName}
              <ExternalLink size={11} className="text-pawn-surface-500" />
            </a>
            {(pkg.metadata as Record<string, unknown> | null)?.origin === "authored" && (
              <span className="text-xs font-medium text-violet-700 bg-violet-100 border border-violet-300 dark:text-violet-400 dark:bg-violet-500/10 dark:border-violet-500/20 px-1.5 py-0.5 rounded-badge">
                authored
              </span>
            )}
            {(pkg.metadata as Record<string, unknown> | null)?.isLocal === true && (
              <span className="text-xs font-medium text-pawn-surface-500 bg-pawn-surface-100 border border-pawn-surface-300 dark:text-pawn-surface-400 dark:bg-pawn-surface-700/40 dark:border-pawn-surface-700/50 px-1.5 py-0.5 rounded-badge">
                local
              </span>
            )}
            {pkg.repoNotFound ? (
              <span className="flex items-center gap-1 text-xs font-medium text-rose-700 bg-rose-100 border border-rose-300 dark:text-rose-400 dark:bg-rose-500/10 dark:border-rose-500/20 px-1.5 py-0.5 rounded-badge" title="The GitHub repository could not be found. It may have been deleted, renamed, or made private.">
                <AlertTriangle size={10} />
                Repo not found
              </span>
            ) : pkg.updateAvailable ? (
              <span className="flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-100 border border-amber-300 dark:text-amber-400 dark:bg-amber-500/10 dark:border-amber-500/20 px-1.5 py-0.5 rounded-badge">
                <ArrowUpCircle size={10} />
                Update available
              </span>
            ) : (
              <span className="flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-100 border border-emerald-300 dark:text-emerald-400 dark:bg-emerald-500/10 dark:border-emerald-500/20 px-1.5 py-0.5 rounded-badge">
                <CheckCircle size={10} />
                Up to date
              </span>
            )}
          </div>
          {pkg.pipelineName && (
            <p className="text-xs text-pawn-surface-500 mt-0.5">Pipeline: {pkg.pipelineName}</p>
          )}
        </div>
      </div>

      {pkg.skills.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {pkg.skills.map((skill) => (
            <span
              key={skill}
              className="text-xs text-violet-700 bg-violet-100 border border-violet-300 dark:text-violet-400 dark:bg-violet-900/40 dark:border-violet-800/50 px-2 py-0.5 rounded-full"
            >
              {skill}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between pt-1 border-t border-pawn-surface-800">
        <p className="text-xs text-pawn-surface-600">
          {pkg.installedAt
            ? `Installed ${new Date(pkg.installedAt).toLocaleDateString()}`
            : ""}
        </p>
        <div className="flex gap-2">
          {pkg.updateAvailable && !pkg.repoNotFound && (
            <button
              onClick={onUpdate}
              disabled={updating}
              className="flex items-center gap-1 text-xs text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300 disabled:opacity-50 transition-colors"
            >
              <RefreshCw size={12} className={updating ? "animate-spin" : ""} />
              {updating ? "Updating..." : "Update"}
            </button>
          )}
          <button
            onClick={onUninstall}
            disabled={uninstalling}
            className="text-pawn-surface-600 hover:text-rose-400 disabled:opacity-50 transition-colors"
            aria-label="Uninstall blueprint"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Discovered blueprint card ─────────────────────────────────────────────────

function DiscoverCard({
  pkg,
  onInstall,
  installing,
}: {
  pkg: ApiDiscoveredBlueprint;
  onInstall: () => void;
  installing: boolean;
}) {
  return (
    <div className="bg-pawn-surface-900 border border-pawn-surface-800 rounded-card p-4 flex flex-col gap-3 card-hover">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <a
            href={pkg.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-semibold text-pawn-text-primary hover:text-pawn-gold-300 flex items-center gap-1 transition-colors"
          >
            {pkg.fullName}
            <ExternalLink size={11} className="text-pawn-surface-500" />
          </a>
          {pkg.description && (
            <p className="text-xs text-pawn-surface-400 mt-0.5 line-clamp-2">{pkg.description}</p>
          )}
        </div>
        <div className="flex items-center gap-1 text-xs text-pawn-surface-500 flex-shrink-0">
          <Star size={11} />
          {pkg.stars}
        </div>
      </div>

      <div className="flex items-center justify-between mt-auto">
        <div className="flex flex-wrap gap-1">
          {pkg.topics
            .filter((t) => t !== "pawn-blueprint")
            .slice(0, 3)
            .map((t) => (
              <span key={t} className="text-xs text-pawn-surface-400 bg-pawn-surface-800 px-1.5 py-0.5 rounded">
                {t}
              </span>
            ))}
        </div>
        <button
          onClick={onInstall}
          disabled={pkg.installed || installing}
          className="flex items-center gap-1 px-3 py-1.5 bg-pawn-gold-500/10 text-pawn-gold-400 border border-pawn-gold-500/20 hover:bg-pawn-gold-500 hover:text-pawn-surface-950 hover:border-pawn-gold-500 text-xs font-medium rounded-button disabled:opacity-40 transition-colors"
        >
          <Download size={11} />
          {pkg.installed ? "Installed" : installing ? "Installing..." : "Install"}
        </button>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function Blueprints() {
  const queryClient = useQueryClient();
  const [discoverQuery, setDiscoverQuery] = useState("");
  const [manualUrl, setManualUrl] = useState("");
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [failedInstallUrl, setFailedInstallUrl] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [uninstallingId, setUninstallingId] = useState<string | null>(null);
  const [modelWarnings, setModelWarnings] = useState<ApiModelWarning[] | null>(null);

  const { data: installed = [], isLoading: loadingInstalled } = useQuery({
    queryKey: ["blueprints"],
    queryFn: () => api.listInstalledBlueprints(),
  });

  const { data: discovered = [], isLoading: loadingDiscover, refetch: runDiscover } = useQuery({
    queryKey: ["blueprints", "discover", discoverQuery],
    queryFn: () => api.discoverBlueprints(discoverQuery || undefined),
    enabled: false, // only run when user triggers
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["blueprints"] });

  const install = useMutation({
    mutationFn: ({ repoUrl, force }: { repoUrl: string; force?: boolean }) =>
      api.installBlueprint(repoUrl, force),
    onSuccess: (result) => {
      invalidate();
      setManualUrl("");
      setFailedInstallUrl(null);
      if (result.modelWarnings && result.modelWarnings.length > 0) {
        setModelWarnings(result.modelWarnings);
      }
    },
    onError: (_err, vars) => { setFailedInstallUrl(vars.repoUrl); },
    onSettled: () => setInstallingId(null),
  });

  const update = useMutation({
    mutationFn: (id: string) => api.updateBlueprint(id),
    onSuccess: (result) => {
      invalidate();
      if (result.modelWarnings && result.modelWarnings.length > 0) {
        setModelWarnings(result.modelWarnings);
      }
    },
    onSettled: () => setUpdatingId(null),
  });

  const uninstall = useMutation({
    mutationFn: (id: string) => api.uninstallBlueprint(id),
    onSuccess: () => invalidate(),
    onSettled: () => setUninstallingId(null),
  });

  const checkUpdates = useMutation({
    mutationFn: () => api.checkForUpdates(),
    onSuccess: () => invalidate(),
  });

  const handleDiscover = () => void runDiscover();

  const handleInstallDiscovered = (pkg: ApiDiscoveredBlueprint) => {
    setInstallingId(pkg.fullName);
    install.mutate({ repoUrl: `https://github.com/${pkg.fullName}` });
  };

  const handleInstallManual = () => {
    if (!manualUrl.trim()) return;
    setInstallingId("manual");
    install.mutate({ repoUrl: manualUrl.trim() });
  };

  const handleForceInstall = () => {
    if (!failedInstallUrl) return;
    setInstallingId("force");
    install.mutate({ repoUrl: failedInstallUrl, force: true });
  };

  return (
    <div className="p-4 sm:p-6 lg:p-10 max-w-6xl pt-14 lg:pt-10">
      <PageHeader
        title="Blueprints"
        actions={
          <button
            onClick={() => checkUpdates.mutate()}
            disabled={checkUpdates.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-pawn-surface-800 hover:bg-pawn-surface-700 text-pawn-surface-300 text-xs font-medium rounded-button transition-colors disabled:opacity-50"
          >
            <RefreshCw size={12} className={checkUpdates.isPending ? "animate-spin" : ""} />
            {checkUpdates.isPending ? "Checking..." : "Check for updates"}
          </button>
        }
      />

      {/* Installed blueprints */}
      <section className="mb-10">
        <h2 className="text-xs font-semibold text-pawn-surface-400 uppercase tracking-wider mb-4">
          Installed
        </h2>
        {loadingInstalled ? (
          <p className="text-xs text-pawn-surface-600">Loading...</p>
        ) : installed.length === 0 ? (
          <div className="bg-pawn-surface-900 border border-pawn-surface-800 rounded-card p-6">
            <EmptyState
              compact
              icon={Blocks}
              title="Your arsenal is empty"
              description="Blueprints bundle pipelines and skills from GitHub repositories. Search below to discover community blueprints, or paste a repo URL to install directly."
              actions={[
                { label: "Search Blueprints", onClick: () => document.querySelector<HTMLInputElement>('[placeholder*="Search GitHub"]')?.focus() },
              ]}
              hint="Blueprints are version-tracked and can be updated from here."
            />
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {installed.map((pkg) => (
              <InstalledCard
                key={pkg.id}
                pkg={pkg}
                onUpdate={() => {
                  setUpdatingId(pkg.id);
                  update.mutate(pkg.id);
                }}
                onUninstall={() => {
                  if (!confirm(`Uninstall ${pkg.repoFullName}? This removes the pipeline and its skills.`)) return;
                  setUninstallingId(pkg.id);
                  uninstall.mutate(pkg.id);
                }}
                updating={updatingId === pkg.id}
                uninstalling={uninstallingId === pkg.id}
              />
            ))}
          </div>
        )}
      </section>

      {/* Discover */}
      <section>
        <h2 className="text-xs font-semibold text-pawn-surface-400 uppercase tracking-wider mb-4">
          Discover
        </h2>

        <div className="flex gap-2 mb-4">
          <div className="relative flex-1">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-pawn-surface-500" />
            <input
              className="w-full bg-pawn-surface-900 border border-pawn-surface-800 rounded-button pl-8 pr-3 py-2 text-sm text-pawn-text-primary placeholder-pawn-surface-600 focus:outline-none focus:border-pawn-gold-500"
              placeholder="Search GitHub for pawn blueprints..."
              value={discoverQuery}
              onChange={(e) => setDiscoverQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleDiscover()}
            />
          </div>
          <button
            onClick={handleDiscover}
            disabled={loadingDiscover}
            className="px-4 py-2 bg-pawn-gold-500 hover:bg-pawn-gold-400 text-pawn-surface-950 text-sm font-medium rounded-button transition-colors disabled:opacity-50"
          >
            {loadingDiscover ? "Searching..." : "Search"}
          </button>
        </div>

        {discovered.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2 mb-6">
            {discovered.map((pkg) => (
              <DiscoverCard
                key={pkg.fullName}
                pkg={pkg}
                onInstall={() => handleInstallDiscovered(pkg)}
                installing={installingId === pkg.fullName}
              />
            ))}
          </div>
        )}

        {modelWarnings && modelWarnings.length > 0 && (
          <ModelWarningPanel warnings={modelWarnings} onDismiss={() => setModelWarnings(null)} />
        )}

        {install.isError && failedInstallUrl && (
          <SecurityErrorPanel
            repoUrl={failedInstallUrl}
            error={install.error}
            onForce={handleForceInstall}
            forcing={installingId === "force"}
          />
        )}

        {/* Manual URL install */}
        <div className="bg-pawn-surface-900 border border-pawn-surface-800 rounded-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <Link size={13} className="text-pawn-surface-500" />
            <span className="text-xs font-medium text-pawn-surface-400">Install from URL</span>
          </div>
          <p className="text-xs text-pawn-surface-600 mb-3">
            For private or unlisted repos. Use the full GitHub URL.
          </p>
          <div className="flex gap-2">
            <input
              className="flex-1 bg-pawn-surface-950 border border-pawn-surface-800 rounded-button px-3 py-1.5 text-xs text-pawn-gold-500 font-mono placeholder-pawn-surface-600 focus:outline-none focus:border-pawn-gold-500"
              placeholder="https://github.com/owner/repo"
              value={manualUrl}
              onChange={(e) => setManualUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleInstallManual()}
            />
            <button
              onClick={handleInstallManual}
              disabled={!manualUrl.trim() || (install.isPending && installingId === "manual")}
              className="flex items-center gap-1 px-3 py-1.5 bg-pawn-gold-500 hover:bg-pawn-gold-400 text-pawn-surface-950 text-xs font-medium rounded-button disabled:opacity-50 transition-colors"
            >
              <Download size={11} />
              {install.isPending && installingId === "manual" ? "Installing..." : "Install"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
