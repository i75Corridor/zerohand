import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Cpu, Copy, Check, Save, Pencil, Plus, Key, Server, Globe } from "lucide-react";
import { useState, useRef, useCallback } from "react";
import { api } from "../lib/api.ts";
import LoadingState from "../components/LoadingState.tsx";
import EmptyState from "../components/EmptyState.tsx";
import ModelSelector from "../components/ModelSelector.tsx";
import { parseFrontMatter, serializeFrontMatter, type SkillFm, ScriptEditor, NewScriptForm, TagInput, SchemaFieldEditor } from "../components/SkillEditor.tsx";

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
            <h1 className="text-sm font-mono font-medium text-pawn-text-primary tracking-tight truncate">{qualifiedName}</h1>
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
            className="flex items-center gap-2 text-xs px-4 py-1.5 bg-pawn-gold-500 hover:bg-pawn-gold-400 text-pawn-surface-950 font-medium rounded-button transition-colors disabled:opacity-50"
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
              <div className="flex items-center gap-2 px-3.5 py-2 bg-pawn-surface-800/40 border border-pawn-surface-700/40 rounded-button">
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
                className="w-full bg-pawn-surface-900 border border-pawn-surface-800 rounded-button px-3.5 py-2.5 text-sm text-pawn-text-secondary placeholder-pawn-surface-600 focus:outline-none focus:border-pawn-gold-500 focus:ring-1 focus:ring-pawn-gold-500/20 transition-all resize-none"
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

            {/* Bash tool toggle */}
            <div className="flex items-center justify-between py-1">
              <div>
                <p className="text-[10px] font-bold text-pawn-surface-500 uppercase tracking-wider">Bash Tool</p>
                <p className="text-[11px] text-pawn-surface-600 mt-0.5">Let the agent run shell commands directly</p>
              </div>
              <button
                role="switch"
                aria-checked={fm.bash}
                onClick={() => update({ bash: !fm.bash })}
                className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pawn-gold-500 ${
                  fm.bash ? "bg-pawn-gold-500" : "bg-pawn-surface-700"
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                    fm.bash ? "translate-x-4" : "translate-x-1"
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

            {/* I/O Schemas */}
            <div className="pt-2 border-t border-pawn-surface-800/60 space-y-5">
              <SchemaFieldEditor
                label="Input Schema (advisory)"
                fields={fm.inputSchema}
                onChange={(inputSchema) => update({ inputSchema })}
                addLabel="+ Add input field"
              />
              <SchemaFieldEditor
                label="Output Schema (enforced)"
                fields={fm.outputSchema}
                onChange={(outputSchema) => update({ outputSchema })}
                addLabel="+ Add output field"
              />
            </div>

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
    <div className="p-4 sm:p-6 lg:p-10 max-w-4xl pt-14 lg:pt-10">
      <Link to="/skills" className="flex items-center gap-1.5 text-xs text-pawn-surface-500 hover:text-pawn-surface-300 mb-5 transition-colors">
        <ArrowLeft size={12} /> Skills
      </Link>

      <div className="flex items-start gap-3 mb-10">
        <Cpu size={20} className="text-violet-400 flex-shrink-0 mt-0.5" />
        <div>
          <h1 className="text-2xl font-semibold font-display text-pawn-text-primary tracking-tight font-mono">{qualifiedName}</h1>
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
        <pre className="bg-pawn-surface-900 border border-pawn-surface-800 rounded-card p-4 text-xs text-pawn-surface-300 font-mono overflow-auto whitespace-pre-wrap leading-relaxed">
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
