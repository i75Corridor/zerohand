import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Cpu, Copy, Check, Save, Trash2, Plus, X, Pencil, Key, Server, Globe, type LucideIcon } from "lucide-react";
import { useState, useRef, useCallback } from "react";
import { api } from "../lib/api.ts";
import LoadingState from "../components/LoadingState.tsx";
import EmptyState from "../components/EmptyState.tsx";
import ModelSelector from "../components/ModelSelector.tsx";
import type { ApiSkillBundleScript } from "@pawn/shared";

// ── Front matter parsing / serialization ──────────────────────────────────────

interface SkillFm {
  name: string;
  description: string;
  model: string | null;
  network: boolean;
  secrets: string[];
  mcpServers: string[];
  /** raw lines for keys we don't surface in the form (e.g. version, type, metadata) */
  _preserved: string[];
}

function parseFrontMatter(content: string): { fm: SkillFm; body: string } {
  const fm: SkillFm = { name: "", description: "", model: null, network: false, secrets: [], mcpServers: [], _preserved: [] };
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)/);
  if (!match) return { fm, body: content };

  const body = match[2].trim();
  const lines = match[1].split("\n");
  const HANDLED = new Set(["name", "description", "model", "network", "secrets", "mcpServers"]);

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
      if (key === "network") fm.network = val === "true";
    }
    i++;
  }

  return { fm, body };
}

function serializeFrontMatter(fm: SkillFm, body: string): string {
  const lines: string[] = ["---"];
  if (fm._preserved.length > 0) lines.push(...fm._preserved);
  if (fm.name) lines.push(`name: ${fm.name}`);
  if (fm.description) lines.push(`description: "${fm.description.replace(/"/g, '\\"')}"`);
  if (fm.model) lines.push(`model: ${fm.model}`);
  if (fm.network) lines.push("network: true");
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

function ScriptEditor({
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

  const del = useMutation({
    mutationFn: () => api.deleteSkillScript(skillName, script.filename),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["skill-bundle", skillName] });
      onDeleted();
    },
  });

  const dirty = content !== script.content;

  return (
    <div className="bg-pawn-surface-900 border border-pawn-surface-800 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-pawn-surface-800">
        <span className="font-mono text-xs text-violet-300">{script.filename}</span>
        <div className="flex items-center gap-2">
          {dirty && (
            <button
              onClick={() => save.mutate()}
              disabled={save.isPending}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1 bg-pawn-gold-600 hover:bg-pawn-gold-500 text-white font-semibold rounded-lg transition-colors disabled:opacity-50"
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

function NewScriptForm({ skillName, onCreated, onCancel }: { skillName: string; onCreated: () => void; onCancel: () => void }) {
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
    <div className="bg-pawn-surface-900 border border-pawn-surface-700 rounded-xl overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-pawn-surface-800">
        <input
          className="flex-1 bg-pawn-surface-800 border border-pawn-surface-700 rounded-lg px-3 py-1.5 text-xs font-mono text-white placeholder-pawn-surface-500 focus:outline-none focus:border-pawn-gold-500"
          placeholder="filename.py"
          value={filename}
          onChange={(e) => setFilename(e.target.value.toLowerCase())}
          autoFocus
        />
        <button
          onClick={() => create.mutate()}
          disabled={!filename || !content || create.isPending}
          className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 bg-pawn-gold-600 hover:bg-pawn-gold-500 text-white font-semibold rounded-lg transition-colors disabled:opacity-40"
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

function TagInput({
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
              className="inline-flex items-center gap-1.5 px-2 py-1 bg-pawn-surface-800 border border-pawn-surface-700 rounded-lg text-xs text-pawn-surface-300 font-mono"
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
              className="flex-1 bg-pawn-surface-900 border border-pawn-surface-700 rounded-lg px-3 py-1.5 text-xs text-pawn-surface-200 focus:outline-none focus:border-pawn-gold-500 font-mono"
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
              className="flex-1 bg-pawn-surface-900 border border-pawn-surface-700 rounded-lg px-3 py-1.5 text-xs text-pawn-surface-300 font-mono placeholder-pawn-surface-600 focus:outline-none focus:border-pawn-gold-500"
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
            className="text-xs px-2.5 py-1.5 bg-pawn-gold-600 hover:bg-pawn-gold-500 text-white rounded-lg disabled:opacity-40 transition-colors"
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

// ── Split skill editor ────────────────────────────────────────────────────────

function SplitSkillEditor({
  qualifiedName,
  initialContent,
  onSave,
  onCancel,
  saving,
}: {
  qualifiedName: string;
  initialContent: string;
  onSave: (content: string) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const { fm: initialFm, body: initialBody } = parseFrontMatter(initialContent);
  const [fm, setFm] = useState<SkillFm>(initialFm);
  const [body, setBody] = useState(initialBody);

  const { data: mcpServers = [] } = useQuery({
    queryKey: ["mcp-servers"],
    queryFn: () => api.listMcpServers(),
  });

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumsRef = useRef<HTMLDivElement>(null);

  const lineCount = body.split("\n").length;

  const syncScroll = useCallback(() => {
    if (textareaRef.current && lineNumsRef.current) {
      lineNumsRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  }, []);

  function handleSave() {
    onSave(serializeFrontMatter(fm, body));
  }

  const update = (patch: Partial<SkillFm>) => setFm((f) => ({ ...f, ...patch }));

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header bar */}
      <header className="flex-shrink-0 h-14 border-b border-pawn-surface-800 flex items-center justify-between px-6 bg-pawn-surface-950/80 backdrop-blur-sm z-10">
        <div className="flex items-center gap-4 min-w-0">
          <button
            onClick={onCancel}
            className="flex items-center gap-1.5 text-xs text-pawn-surface-500 hover:text-pawn-surface-300 transition-colors flex-shrink-0"
          >
            <ArrowLeft size={13} /> Skills
          </button>
          <div className="h-4 w-px bg-pawn-surface-800 flex-shrink-0" />
          <div className="flex items-center gap-2 min-w-0">
            <Cpu size={15} className="text-violet-400 flex-shrink-0" />
            <h1 className="text-sm font-mono font-medium text-white tracking-tight truncate">{qualifiedName}</h1>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <button
            onClick={onCancel}
            className="text-xs text-pawn-surface-400 hover:text-pawn-surface-200 px-3 py-1.5 transition-colors font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 text-xs px-4 py-1.5 bg-pawn-gold-600 hover:bg-pawn-gold-500 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            <Save size={13} />
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </header>

      {/* Split body */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left panel — Skill Config */}
        <aside className="w-[360px] flex-shrink-0 border-r border-pawn-surface-800 flex flex-col bg-pawn-surface-900/20">
          <div className="px-6 py-3.5 border-b border-pawn-surface-800/60">
            <h2 className="text-[10px] font-bold text-pawn-surface-500 uppercase tracking-[0.15em]">Skill Config</h2>
          </div>
          <div className="flex-1 overflow-y-auto p-6 space-y-7">

            {/* Qualified name — readonly */}
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-pawn-surface-500 uppercase tracking-wider">Qualified Name</label>
              <div className="flex items-center gap-2 px-3.5 py-2 bg-pawn-surface-800/40 border border-pawn-surface-700/40 rounded-lg">
                <span className="text-xs font-mono text-pawn-surface-400 flex-1 truncate">{qualifiedName}</span>
                <span className="text-pawn-surface-600 flex-shrink-0">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                </span>
              </div>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-pawn-surface-500 uppercase tracking-wider">Description</label>
              <textarea
                className="w-full bg-pawn-surface-900 border border-pawn-surface-800 rounded-lg px-3.5 py-2.5 text-sm text-pawn-surface-200 placeholder-pawn-surface-600 focus:outline-none focus:border-pawn-gold-500 focus:ring-1 focus:ring-pawn-gold-500/20 transition-all resize-none"
                rows={3}
                placeholder="What does this skill do?"
                value={fm.description}
                onChange={(e) => update({ description: e.target.value })}
              />
            </div>

            {/* Model */}
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-pawn-surface-500 uppercase tracking-wider">Model Override</label>
              <ModelSelector
                value={fm.model}
                onChange={(v) => update({ model: v })}
                allowNull
                defaultLabel="Use pipeline default"
              />
            </div>

            {/* Network toggle */}
            <div className="flex items-center justify-between py-1">
              <div>
                <p className="text-[10px] font-bold text-pawn-surface-500 uppercase tracking-wider">Network Access</p>
                <p className="text-[11px] text-pawn-surface-600 mt-0.5">Allow scripts to reach external APIs</p>
              </div>
              <button
                role="switch"
                aria-checked={fm.network}
                onClick={() => update({ network: !fm.network })}
                className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pawn-gold-500 ${
                  fm.network ? "bg-pawn-gold-600" : "bg-pawn-surface-700"
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                    fm.network ? "translate-x-4" : "translate-x-1"
                  }`}
                />
              </button>
            </div>

            {/* Secrets */}
            <TagInput
              label="Secrets"
              icon={Key}
              tags={fm.secrets}
              onChange={(secrets) => update({ secrets })}
              addLabel="+ Add"
              placeholder="ENV_VAR_NAME"
            />

            {/* MCP Servers */}
            <TagInput
              label="MCP Servers"
              icon={Server}
              tags={fm.mcpServers}
              onChange={(mcpServers) => update({ mcpServers })}
              addLabel="+ Attach"
              addOptions={mcpServers.map((s) => s.name)}
            />

          </div>
        </aside>

        {/* Right panel — System Prompt */}
        <section className="flex-1 flex flex-col bg-pawn-surface-950 overflow-hidden">
          <div className="flex-shrink-0 px-6 py-3.5 border-b border-pawn-surface-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-[10px] font-bold text-pawn-surface-500 uppercase tracking-[0.15em]">System Prompt</h2>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-pawn-surface-600 font-mono">
              <Globe size={10} />
              <span>{lineCount} lines</span>
              <span className="mx-1 text-pawn-surface-700">·</span>
              <span>{body.length} chars</span>
            </div>
          </div>

          {/* Editor area with gutter */}
          <div className="flex flex-1 overflow-hidden">
            {/* Line numbers */}
            <div
              ref={lineNumsRef}
              className="flex-shrink-0 w-12 overflow-hidden bg-pawn-surface-900/30 border-r border-pawn-surface-800/50 py-4 select-none"
              aria-hidden
            >
              {Array.from({ length: lineCount }, (_, i) => (
                <div key={i} className="text-right pr-3 text-[10px] font-mono text-pawn-surface-700 leading-relaxed h-[22px] flex items-center justify-end">
                  {i + 1}
                </div>
              ))}
            </div>

            {/* Textarea */}
            <textarea
              ref={textareaRef}
              spellCheck={false}
              className="flex-1 bg-transparent px-5 py-4 text-sm text-pawn-surface-300 font-mono leading-relaxed resize-none focus:outline-none"
              style={{ lineHeight: "22px" }}
              placeholder="Enter the core instructions for the AI agent…"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onScroll={syncScroll}
            />
          </div>

          {/* Footer bar */}
          <div className="flex-shrink-0 h-7 border-t border-pawn-surface-800 flex items-center px-4 bg-pawn-surface-900/20 text-[10px] text-pawn-surface-600 font-mono gap-4">
            <span>UTF-8</span>
            <span className="text-pawn-surface-700">·</span>
            <span>Markdown</span>
          </div>
        </section>

      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SkillDetail() {
  const { namespace, name } = useParams<{ namespace: string; name: string }>();
  const qualifiedName = namespace && name ? `${namespace}/${name}` : name ?? "";
  const [copiedMd, setCopiedMd] = useState(false);
  const [addingScript, setAddingScript] = useState(false);
  const [editingMd, setEditingMd] = useState(false);
  const [editContent, setEditContent] = useState("");

  const queryClient = useQueryClient();

  const { data: skill, isLoading, error } = useQuery({
    queryKey: ["skill-bundle", qualifiedName],
    queryFn: () => api.getSkillBundle(qualifiedName),
    enabled: !!qualifiedName,
  });

  const saveMd = useMutation({
    mutationFn: (content: string) => api.updateSkillContent(qualifiedName, content),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["skill-bundle", qualifiedName] });
      setEditingMd(false);
    },
  });

  if (isLoading) return <LoadingState />;
  if (error || !skill) return <div className="p-8 text-rose-400" role="alert">Skill not found.</div>;

  function handleStartEdit() {
    setEditContent(skill!.skillMd);
    setEditingMd(true);
  }

  function handleCopyMd() {
    navigator.clipboard.writeText(skill!.skillMd).then(() => {
      setCopiedMd(true);
      setTimeout(() => setCopiedMd(false), 2000);
    });
  }

  // Editing mode — full-height split editor replaces normal page content
  if (editingMd) {
    return (
      <SplitSkillEditor
        qualifiedName={qualifiedName}
        initialContent={editContent}
        onSave={(content) => saveMd.mutate(content)}
        onCancel={() => setEditingMd(false)}
        saving={saveMd.isPending}
      />
    );
  }

  // Parse description from SKILL.md frontmatter for the header
  const descMatch = skill.skillMd.match(/^description:\s*["']?(.+?)["']?\s*$/m);
  const description = descMatch?.[1] ?? "";

  // View mode
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl pt-14 lg:pt-8">
      <Link to="/skills" className="flex items-center gap-1.5 text-xs text-pawn-surface-500 hover:text-pawn-surface-300 mb-5 transition-colors">
        <ArrowLeft size={12} /> Skills
      </Link>

      <div className="flex items-start gap-3 mb-10">
        <Cpu size={20} className="text-violet-400 flex-shrink-0 mt-0.5" />
        <div>
          <h1 className="text-2xl font-semibold font-display text-white tracking-tight font-mono">{qualifiedName}</h1>
          {description && <p className="text-sm text-pawn-surface-500 mt-1">{description}</p>}
        </div>
      </div>

      {/* SKILL.md */}
      <div className="mb-10">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold text-pawn-surface-400 uppercase tracking-wider">SKILL.md</h2>
          <div className="flex items-center gap-3">
            <button
              onClick={handleCopyMd}
              className="flex items-center gap-1.5 text-xs text-pawn-surface-500 hover:text-pawn-surface-300 transition-colors"
            >
              {copiedMd ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
              {copiedMd ? "Copied" : "Copy"}
            </button>
            <button
              onClick={handleStartEdit}
              className="flex items-center gap-1.5 text-xs text-pawn-surface-500 hover:text-pawn-surface-300 transition-colors"
            >
              <Pencil size={13} /> Edit
            </button>
          </div>
        </div>
        <pre className="bg-pawn-surface-900 border border-pawn-surface-800 rounded-xl p-4 text-xs text-pawn-surface-300 font-mono overflow-auto whitespace-pre-wrap leading-relaxed">
          {skill.skillMd}
        </pre>
      </div>

      {/* Scripts */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-semibold text-pawn-surface-400 uppercase tracking-wider">
            Scripts ({skill.scripts.length})
          </h2>
          {!addingScript && (
            <button
              onClick={() => setAddingScript(true)}
              className="flex items-center gap-1.5 text-xs text-pawn-surface-500 hover:text-pawn-surface-300 transition-colors"
            >
              <Plus size={13} /> Add script
            </button>
          )}
        </div>

        <div className="space-y-4">
          {skill.scripts.map((script) => (
            <ScriptEditor
              key={script.filename}
              skillName={qualifiedName}
              script={script}
              onDeleted={() => {}}
            />
          ))}

          {skill.scripts.length === 0 && !addingScript && (
            <EmptyState
              compact
              icon={Cpu}
              title="No scripts yet"
              description="Scripts extend a skill with executable code. Add one above or ask the agent to create one."
              actions={[
                { label: "Add Script", onClick: () => setAddingScript(true) },
              ]}
            />
          )}

          {addingScript && (
            <NewScriptForm
              skillName={qualifiedName}
              onCreated={() => setAddingScript(false)}
              onCancel={() => setAddingScript(false)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
