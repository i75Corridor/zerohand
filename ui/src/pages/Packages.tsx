import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Package,
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
} from "lucide-react";
import { api } from "../lib/api.ts";
import type { ApiInstalledPackage, ApiDiscoveredPackage } from "@zerohand/shared";

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

  const repoMatch = inner.match(/^Error: Package (.+?) failed security check/);
  const repoName = repoMatch?.[1] ?? "package";

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
    return <p className="mb-4 text-xs text-red-400">Install failed: {String(error)}</p>;
  }

  const levelStyle: Record<SecurityFinding["level"], string> = {
    HIGH: "text-red-400 bg-red-500/10 border-red-500/20",
    MEDIUM: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    LOW: "text-slate-400 bg-slate-500/10 border-slate-500/20",
  };

  return (
    <div className="mb-4 bg-red-950/20 border border-red-500/20 rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <ShieldAlert size={14} className="text-red-400 flex-shrink-0" />
        <span className="text-sm font-semibold text-red-300">Security check failed</span>
        <span className="text-xs text-slate-500">{parsed.repoName}</span>
      </div>
      <div className="flex flex-col gap-2 mb-4">
        {parsed.findings.map((f, i) => (
          <div key={i} className="flex items-start gap-2">
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border flex-shrink-0 mt-0.5 ${levelStyle[f.level]}`}>
              {f.level}
            </span>
            <div className="min-w-0">
              <p className="text-xs font-mono text-slate-400 truncate">{f.file}</p>
              <p className="text-xs text-slate-300">{f.description}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between pt-3 border-t border-red-500/10">
        <p className="text-xs text-slate-500">Only install if you trust this source.</p>
        <button
          onClick={onForce}
          disabled={forcing}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
        >
          <Download size={11} />
          {forcing ? "Installing..." : "Install anyway"}
        </button>
      </div>
    </div>
  );
}

// ── Installed package card ─────────────────────────────────────────────────────

function InstalledCard({
  pkg,
  onUpdate,
  onUninstall,
  updating,
  uninstalling,
}: {
  pkg: ApiInstalledPackage;
  onUpdate: () => void;
  onUninstall: () => void;
  updating: boolean;
  uninstalling: boolean;
}) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col gap-3 card-glow">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <a
              href={`https://github.com/${pkg.repoFullName}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-semibold text-white hover:text-sky-300 flex items-center gap-1 transition-colors"
            >
              {pkg.repoFullName}
              <ExternalLink size={11} className="text-slate-500" />
            </a>
            {pkg.updateAvailable ? (
              <span className="flex items-center gap-1 text-xs font-medium text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded-md">
                <ArrowUpCircle size={10} />
                Update available
              </span>
            ) : (
              <span className="flex items-center gap-1 text-xs font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded-md">
                <CheckCircle size={10} />
                Up to date
              </span>
            )}
          </div>
          {pkg.pipelineName && (
            <p className="text-xs text-slate-500 mt-0.5">Pipeline: {pkg.pipelineName}</p>
          )}
        </div>
      </div>

      {pkg.skills.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {pkg.skills.map((skill) => (
            <span
              key={skill}
              className="text-xs text-sky-400 bg-sky-900/40 border border-sky-800/50 px-2 py-0.5 rounded-full"
            >
              {skill}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between pt-1 border-t border-slate-800/60">
        <p className="text-xs text-slate-600">
          {pkg.installedAt
            ? `Installed ${new Date(pkg.installedAt).toLocaleDateString()}`
            : ""}
        </p>
        <div className="flex gap-2">
          {pkg.updateAvailable && (
            <button
              onClick={onUpdate}
              disabled={updating}
              className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 disabled:opacity-50 transition-colors"
            >
              <RefreshCw size={12} className={updating ? "animate-spin" : ""} />
              {updating ? "Updating..." : "Update"}
            </button>
          )}
          <button
            onClick={onUninstall}
            disabled={uninstalling}
            className="text-slate-600 hover:text-red-400 disabled:opacity-50 transition-colors"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Discovered package card ────────────────────────────────────────────────────

function DiscoverCard({
  pkg,
  onInstall,
  installing,
}: {
  pkg: ApiDiscoveredPackage;
  onInstall: () => void;
  installing: boolean;
}) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <a
            href={pkg.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-semibold text-white hover:text-sky-300 flex items-center gap-1 transition-colors"
          >
            {pkg.fullName}
            <ExternalLink size={11} className="text-slate-500" />
          </a>
          {pkg.description && (
            <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{pkg.description}</p>
          )}
        </div>
        <div className="flex items-center gap-1 text-xs text-slate-500 flex-shrink-0">
          <Star size={11} />
          {pkg.stars}
        </div>
      </div>

      <div className="flex items-center justify-between mt-auto">
        <div className="flex flex-wrap gap-1">
          {pkg.topics
            .filter((t) => t !== "zerohand-package")
            .slice(0, 3)
            .map((t) => (
              <span key={t} className="text-xs text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded">
                {t}
              </span>
            ))}
        </div>
        <button
          onClick={onInstall}
          disabled={pkg.installed || installing}
          className="flex items-center gap-1 px-3 py-1.5 bg-sky-500/10 text-sky-400 border border-sky-500/20 hover:bg-sky-500 hover:text-slate-950 text-xs font-medium rounded-md disabled:opacity-40 transition-colors"
        >
          <Download size={11} />
          {pkg.installed ? "Installed" : installing ? "Installing..." : "Install"}
        </button>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function Packages() {
  const queryClient = useQueryClient();
  const [discoverQuery, setDiscoverQuery] = useState("");
  const [manualUrl, setManualUrl] = useState("");
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [failedInstallUrl, setFailedInstallUrl] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [uninstallingId, setUninstallingId] = useState<string | null>(null);

  const { data: installed = [], isLoading: loadingInstalled } = useQuery({
    queryKey: ["packages"],
    queryFn: () => api.listInstalledPackages(),
  });

  const { data: discovered = [], isLoading: loadingDiscover, refetch: runDiscover } = useQuery({
    queryKey: ["packages", "discover", discoverQuery],
    queryFn: () => api.discoverPackages(discoverQuery || undefined),
    enabled: false, // only run when user triggers
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["packages"] });

  const install = useMutation({
    mutationFn: ({ repoUrl, force }: { repoUrl: string; force?: boolean }) =>
      api.installPackage(repoUrl, force),
    onSuccess: () => { invalidate(); setManualUrl(""); setFailedInstallUrl(null); },
    onError: (_err, vars) => { setFailedInstallUrl(vars.repoUrl); },
    onSettled: () => setInstallingId(null),
  });

  const update = useMutation({
    mutationFn: (id: string) => api.updatePackage(id),
    onSuccess: () => invalidate(),
    onSettled: () => setUpdatingId(null),
  });

  const uninstall = useMutation({
    mutationFn: (id: string) => api.uninstallPackage(id),
    onSuccess: () => invalidate(),
    onSettled: () => setUninstallingId(null),
  });

  const checkUpdates = useMutation({
    mutationFn: () => api.checkForUpdates(),
    onSuccess: () => invalidate(),
  });

  const handleDiscover = () => void runDiscover();

  const handleInstallDiscovered = (pkg: ApiDiscoveredPackage) => {
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
    <div className="p-8 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Package size={20} className="text-sky-400" />
          <h1 className="text-2xl font-bold font-display text-white">Packages</h1>
        </div>
        <button
          onClick={() => checkUpdates.mutate()}
          disabled={checkUpdates.isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-md transition-colors disabled:opacity-50"
        >
          <RefreshCw size={12} className={checkUpdates.isPending ? "animate-spin" : ""} />
          {checkUpdates.isPending ? "Checking..." : "Check for updates"}
        </button>
      </div>

      {/* Installed packages */}
      <section className="mb-8">
        <h2 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">
          Installed
        </h2>
        {loadingInstalled ? (
          <p className="text-xs text-slate-600">Loading...</p>
        ) : installed.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center">
            <Package size={24} className="text-slate-700 mx-auto mb-2" />
            <p className="text-sm text-slate-500">No packages installed yet.</p>
            <p className="text-xs text-slate-600 mt-1">Discover packages below or install from a URL.</p>
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
        <h2 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">
          Discover
        </h2>

        <div className="flex gap-2 mb-4">
          <div className="relative flex-1">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-8 pr-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-sky-500"
              placeholder="Search GitHub for zerohand packages..."
              value={discoverQuery}
              onChange={(e) => setDiscoverQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleDiscover()}
            />
          </div>
          <button
            onClick={handleDiscover}
            disabled={loadingDiscover}
            className="px-4 py-2 bg-sky-500 hover:bg-sky-400 text-slate-950 text-sm font-medium rounded-xl transition-colors disabled:opacity-50"
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

        {install.isError && failedInstallUrl && (
          <SecurityErrorPanel
            repoUrl={failedInstallUrl}
            error={install.error}
            onForce={handleForceInstall}
            forcing={installingId === "force"}
          />
        )}

        {/* Manual URL install */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Link size={13} className="text-slate-500" />
            <span className="text-xs font-medium text-slate-400">Install from URL</span>
          </div>
          <p className="text-xs text-slate-600 mb-3">
            For private or unlisted repos. Use the full GitHub URL.
          </p>
          <div className="flex gap-2">
            <input
              className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-sky-500 font-mono placeholder-slate-600 focus:outline-none focus:border-sky-500"
              placeholder="https://github.com/owner/repo"
              value={manualUrl}
              onChange={(e) => setManualUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleInstallManual()}
            />
            <button
              onClick={handleInstallManual}
              disabled={!manualUrl.trim() || (install.isPending && installingId === "manual")}
              className="flex items-center gap-1 px-3 py-1.5 bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-medium rounded-xl disabled:opacity-50 transition-colors"
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
