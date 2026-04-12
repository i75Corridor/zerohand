import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Save, Check, Trash2, Plus, X, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { api } from "../lib/api.ts";
import type { ApiSkillBundleScript } from "@pawn/shared";

// ── Front matter parsing / serialization ──────────────────────────────────────

export interface SkillFm {
  name: string;
  description: string;
  model: string | null;
  bash: boolean;
  secrets: string[];
  mcpServers: string[];
  /** raw lines for keys we don't surface in the form (e.g. version, type, metadata) */
  _preserved: string[];
}

export function parseFrontMatter(content: string): { fm: SkillFm; body: string } {
  const fm: SkillFm = { name: "", description: "", model: null, bash: false, secrets: [], mcpServers: [], _preserved: [] };
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)/);
  if (!match) return { fm, body: content };

  const body = match[2].trim();
  const lines = match[1].split("\n");
  const HANDLED = new Set(["name", "description", "model", "bash", "secrets", "mcpServers"]);

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    const keyMatch = line.match(/^([a-zA-Z_]\w*):\s*(.*)$/);
    if (!keyMatch) { fm._preserved.push(line); i++; continue; }

    const key = keyMatch[1];
    const val = keyMatch[2].trim();

    if (!HANDLED.has(key)) {
      // Preserve this key + any following indented lines
      const block = [line];
      i++;
      while (i < lines.length && (lines[i].startsWith("  ") || lines[i].startsWith("\t"))) {
        block.push(lines[i]);
        i++;
      }
      fm._preserved.push(...block);
      continue;
    }

    if (val === "" || val === "[]") {
      // Block array
      const arr: string[] = [];
      i++;
      while (i < lines.length && /^\s*-\s+/.test(lines[i])) {
        arr.push(lines[i].trim().replace(/^-\s+/, "").replace(/^['"]|['"]$/g, ""));
        i++;
      }
      if (key === "secrets") fm.secrets = arr;
      if (key === "mcpServers") fm.mcpServers = arr;
      continue;
    }

    if (val.startsWith("[")) {
      // Inline array
      const inner = val.slice(1, val.lastIndexOf("]"));
      const items = inner.split(",").map((s) => s.trim().replace(/^['"]|['"]$/g, "")).filter(Boolean);
      if (key === "secrets") fm.secrets = items;
      if (key === "mcpServers") fm.mcpServers = items;
    } else {
      const strVal = val.replace(/^['"]|['"]$/g, "");
      if (key === "name") fm.name = strVal;
      if (key === "description") fm.description = strVal;
      if (key === "model") fm.model = strVal || null;
      if (key === "bash") fm.bash = val === "true";
    }
    i++;
  }

  return { fm, body };
}

export function serializeFrontMatter(fm: SkillFm, body: string): string {
  const lines: string[] = ["---"];
  if (fm._preserved.length > 0) lines.push(...fm._preserved);
  if (fm.name) lines.push(`name: ${fm.name}`);
  if (fm.description) lines.push(`description: "${fm.description.replace(/"/g, '\\"')}"`);
  if (fm.model) lines.push(`model: ${fm.model}`);
  if (fm.bash) lines.push("bash: true");
  if (fm.secrets.length > 0) {
    lines.push("secrets:");
    fm.secrets.forEach((s) => lines.push(`  - ${s}`));
  }
  if (fm.mcpServers.length > 0) {
    lines.push("mcpServers:");
    fm.mcpServers.forEach((s) => lines.push(`  - ${s}`));
  }
  lines.push("---");
  lines.push("");
  lines.push(body);
  return lines.join("\n");
}

// ── Script editor ─────────────────────────────────────────────────────────────

export function ScriptEditor({
  skillName,
  script,
  onDeleted,
}: {
  skillName: string;
  script: ApiSkillBundleScript;
  onDeleted: () => void;
}) {
  const queryClient = useQueryClient();
  const [content, setContent] = useState(script.content);
  const [saved, setSaved] = useState(false);

  const save = useMutation({
    mutationFn: () => api.saveSkillScript(skillName, script.filename, content),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["skill-bundle", skillName] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  const [delError, setDelError] = useState<string | null>(null);

  const del = useMutation({
    mutationFn: () => api.deleteSkillScript(skillName, script.filename),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["skill-bundle", skillName] });
      onDeleted();
    },
    onError: (err) => {
      setDelError(String(err));
    },
  });

  const dirty = content !== script.content;

  return (
    <div className="bg-pawn-surface-900 border border-pawn-surface-800 rounded-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-pawn-surface-800">
        <span className="font-mono text-xs text-violet-300">{script.filename}</span>
        <div className="flex items-center gap-2">
          {delError && (
            <span className="text-xs text-rose-400 font-mono truncate max-w-[200px]" title={delError}>
              {delError}
            </span>
          )}
          {dirty && (
            <button
              onClick={() => save.mutate()}
              disabled={save.isPending}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1 bg-pawn-gold-500 hover:bg-pawn-gold-400 text-pawn-surface-950 font-semibold rounded-button transition-colors disabled:opacity-50"
            >
              {saved ? <Check size={12} /> : <Save size={12} />}
              {save.isPending ? "Saving..." : saved ? "Saved" : "Save"}
            </button>
          )}
          <button
            onClick={() => del.mutate()}
            disabled={del.isPending}
            className="flex items-center gap-1 text-xs text-pawn-surface-600 hover:text-rose-400 transition-colors"
            title="Delete script"
            aria-label="Delete script"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
      <textarea
        className="w-full bg-transparent px-4 py-3 text-xs text-pawn-surface-300 font-mono leading-relaxed resize-none focus:outline-none"
        rows={Math.max(8, content.split("\n").length + 1)}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        spellCheck={false}
      />
    </div>
  );
}

// ── New script form ───────────────────────────────────────────────────────────

export function NewScriptForm({ skillName, onCreated, onCancel }: { skillName: string; onCreated: () => void; onCancel: () => void }) {
  const queryClient = useQueryClient();
  const [filename, setFilename] = useState("");
  const [content, setContent] = useState("");

  const create = useMutation({
    mutationFn: () => api.saveSkillScript(skillName, filename, content),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["skill-bundle", skillName] });
      onCreated();
    },
  });

  return (
    <div className="bg-pawn-surface-900 border border-pawn-surface-800 rounded-card overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-pawn-surface-800">
        <input
          className="flex-1 bg-pawn-surface-800 border border-pawn-surface-700 rounded-button px-3 py-1.5 text-xs font-mono text-pawn-text-primary placeholder-pawn-surface-500 focus:outline-none focus:border-pawn-gold-500"
          placeholder="filename.py"
          value={filename}
          onChange={(e) => setFilename(e.target.value.toLowerCase())}
          autoFocus
        />
        <button
          onClick={() => create.mutate()}
          disabled={!filename || !content || create.isPending}
          className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 bg-pawn-gold-500 hover:bg-pawn-gold-400 text-pawn-surface-950 font-semibold rounded-button transition-colors disabled:opacity-40"
        >
          <Save size={12} /> Create
        </button>
        <button onClick={onCancel} className="text-pawn-surface-500 hover:text-pawn-surface-300 transition-colors">
          <X size={14} />
        </button>
      </div>
      <textarea
        className="w-full bg-transparent px-4 py-3 text-xs text-pawn-surface-300 font-mono leading-relaxed resize-none focus:outline-none"
        rows={12}
        placeholder="# Script content — read JSON from stdin, write results to stdout"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        spellCheck={false}
      />
    </div>
  );
}

// ── Tag input (secrets / mcpServers) ─────────────────────────────────────────

export function TagInput({
  label,
  icon: Icon,
  tags,
  onChange,
  addLabel,
  addOptions,
  placeholder,
}: {
  label: string;
  icon: LucideIcon;
  tags: string[];
  onChange: (tags: string[]) => void;
  addLabel: string;
  addOptions?: string[];
  placeholder?: string;
}) {
  const [adding, setAdding] = useState(false);
  const [inputVal, setInputVal] = useState("");

  function commit(val: string) {
    const trimmed = val.trim();
    if (trimmed && !tags.includes(trimmed)) onChange([...tags, trimmed]);
    setInputVal("");
    setAdding(false);
  }

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <label className="text-[10px] font-bold text-pawn-surface-500 uppercase tracking-wider">{label}</label>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="text-[10px] text-pawn-gold-400 hover:text-pawn-gold-300 font-medium transition-colors"
          >
            {addLabel}
          </button>
        )}
      </div>

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1.5 px-2 py-1 bg-pawn-surface-800 border border-pawn-surface-700 rounded-button text-xs text-pawn-surface-300 font-mono"
            >
              <Icon size={10} className="text-pawn-surface-500 flex-shrink-0" />
              {tag}
              <button
                onClick={() => onChange(tags.filter((t) => t !== tag))}
                className="text-pawn-surface-600 hover:text-rose-400 transition-colors ml-0.5"
                aria-label={`Remove ${tag}`}
              >
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}

      {adding && (
        <div className="flex gap-2">
          {addOptions ? (
            <select
              autoFocus
              className="flex-1 bg-pawn-surface-900 border border-pawn-surface-700 rounded-button px-3 py-1.5 text-xs text-pawn-text-secondary focus:outline-none focus:border-pawn-gold-500 font-mono"
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
            >
              <option value="">Select a server…</option>
              {addOptions.filter((o) => !tags.includes(o)).map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          ) : (
            <input
              autoFocus
              className="flex-1 bg-pawn-surface-900 border border-pawn-surface-700 rounded-button px-3 py-1.5 text-xs text-pawn-surface-300 font-mono placeholder-pawn-surface-600 focus:outline-none focus:border-pawn-gold-500"
              placeholder={placeholder ?? "Enter value…"}
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commit(inputVal);
                if (e.key === "Escape") setAdding(false);
              }}
            />
          )}
          <button
            onClick={() => commit(inputVal)}
            disabled={!inputVal.trim()}
            className="text-xs px-2.5 py-1.5 bg-pawn-gold-500 hover:bg-pawn-gold-400 text-pawn-surface-950 rounded-button disabled:opacity-40 transition-colors"
          >
            Add
          </button>
          <button onClick={() => setAdding(false)} className="text-pawn-surface-500 hover:text-pawn-surface-300 transition-colors">
            <X size={14} />
          </button>
        </div>
      )}

      {tags.length === 0 && !adding && (
        <p className="text-xs text-pawn-surface-600 italic">None configured</p>
      )}
    </div>
  );
}
