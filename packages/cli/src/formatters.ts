export { pipelineToYaml } from "@pawn/shared";

// ─── Table formatting ────────────────────────────────────────────────────────

export function formatTable(rows: Record<string, string>[], cols: string[]): string {
  if (rows.length === 0) return "(none)";
  const widths = cols.map((col) => Math.max(col.length, ...rows.map((r) => (r[col] ?? "").length)));
  const header = cols.map((c, i) => c.toUpperCase().padEnd(widths[i])).join("  ");
  const divider = widths.map((w) => "─".repeat(w)).join("  ");
  const lines = rows.map((r) => cols.map((c, i) => (r[c] ?? "").padEnd(widths[i])).join("  "));
  return [header, divider, ...lines].join("\n");
}

export function shortId(id: string): string {
  return id.slice(0, 8);
}

export function relativeTime(isoDate: string): string {
  const ms = Date.now() - new Date(isoDate).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

