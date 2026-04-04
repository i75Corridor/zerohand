import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Cpu, Copy, Check, Save, Trash2, Plus, X, Pencil } from "lucide-react";
import { useState } from "react";
import { api } from "../lib/api.ts";
import LoadingState from "../components/LoadingState.tsx";
import EmptyState from "../components/EmptyState.tsx";
import type { ApiSkillBundleScript } from "@zerohand/shared";

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
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-800">
        <span className="font-mono text-xs text-violet-300">{script.filename}</span>
        <div className="flex items-center gap-2">
          {dirty && (
            <button
              onClick={() => save.mutate()}
              disabled={save.isPending}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1 bg-sky-600 hover:bg-sky-500 text-white font-semibold rounded-lg transition-colors disabled:opacity-50"
            >
              {saved ? <Check size={12} /> : <Save size={12} />}
              {save.isPending ? "Saving..." : saved ? "Saved" : "Save"}
            </button>
          )}
          <button
            onClick={() => del.mutate()}
            disabled={del.isPending}
            className="flex items-center gap-1 text-xs text-slate-600 hover:text-rose-400 transition-colors"
            title="Delete script"
            aria-label="Delete script"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
      <textarea
        className="w-full bg-transparent px-4 py-3 text-xs text-slate-300 font-mono leading-relaxed resize-none focus:outline-none"
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
    <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-800">
        <input
          className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
          placeholder="filename.py"
          value={filename}
          onChange={(e) => setFilename(e.target.value.toLowerCase())}
          autoFocus
        />
        <button
          onClick={() => create.mutate()}
          disabled={!filename || !content || create.isPending}
          className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 bg-sky-600 hover:bg-sky-500 text-white font-semibold rounded-lg transition-colors disabled:opacity-40"
        >
          <Save size={12} /> Create
        </button>
        <button onClick={onCancel} className="text-slate-500 hover:text-slate-300 transition-colors">
          <X size={14} />
        </button>
      </div>
      <textarea
        className="w-full bg-transparent px-4 py-3 text-xs text-slate-300 font-mono leading-relaxed resize-none focus:outline-none"
        rows={12}
        placeholder="# Script content — read JSON from stdin, write results to stdout"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        spellCheck={false}
      />
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SkillDetail() {
  const { name } = useParams<{ name: string }>();
  const [copiedMd, setCopiedMd] = useState(false);
  const [addingScript, setAddingScript] = useState(false);
  const [editingMd, setEditingMd] = useState(false);
  const [mdContent, setMdContent] = useState("");

  const queryClient = useQueryClient();

  const { data: skill, isLoading, error } = useQuery({
    queryKey: ["skill-bundle", name],
    queryFn: () => api.getSkillBundle(name!),
    enabled: !!name,
  });

  const saveMd = useMutation({
    mutationFn: () => api.updateSkillContent(name!, mdContent),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["skill-bundle", name] });
      setEditingMd(false);
    },
    onError: () => {
      // Error rendered via saveMd.isError below
    },
  });

  if (isLoading) return <LoadingState />;
  if (error || !skill) return <div className="p-8 text-rose-400" role="alert">Skill not found.</div>;

  function handleCopyMd() {
    navigator.clipboard.writeText(skill!.skillMd).then(() => {
      setCopiedMd(true);
      setTimeout(() => setCopiedMd(false), 2000);
    });
  }

  function handleStartEdit() {
    setMdContent(skill!.skillMd);
    setEditingMd(true);
  }

  // Parse description from SKILL.md frontmatter for the header
  const descMatch = skill.skillMd.match(/^description:\s*["']?(.+?)["']?\s*$/m);
  const description = descMatch?.[1] ?? "";

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl pt-14 lg:pt-8">
      <Link to="/skills" className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 mb-5 transition-colors">
        <ArrowLeft size={12} /> Skills
      </Link>

      <div className="flex items-start gap-3 mb-10">
        <Cpu size={20} className="text-violet-400 flex-shrink-0 mt-0.5" />
        <div>
          <h1 className="text-2xl font-semibold font-display text-white tracking-tight">{skill.name}</h1>
          {description && <p className="text-sm text-slate-500 mt-1">{description}</p>}
        </div>
      </div>

      {/* SKILL.md */}
      <div className="mb-10">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">SKILL.md</h2>
          <div className="flex items-center gap-3">
            {!editingMd && (
              <>
                <button
                  onClick={handleCopyMd}
                  className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors"
                >
                  {copiedMd ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                  {copiedMd ? "Copied" : "Copy"}
                </button>
                <button
                  onClick={handleStartEdit}
                  className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors"
                >
                  <Pencil size={13} /> Edit
                </button>
              </>
            )}
            {editingMd && (
              <>
                <button
                  onClick={() => setEditingMd(false)}
                  className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => saveMd.mutate()}
                  disabled={saveMd.isPending}
                  className="flex items-center gap-1.5 text-xs px-2.5 py-1 bg-sky-600 hover:bg-sky-500 text-white font-semibold rounded-lg transition-colors disabled:opacity-50"
                >
                  <Save size={12} />
                  {saveMd.isPending ? "Saving..." : "Save"}
                </button>
              </>
            )}
          </div>
        </div>
        {editingMd ? (
          <textarea
            className="w-full bg-slate-900 border border-slate-700 rounded-xl p-4 text-xs text-slate-300 font-mono leading-relaxed resize-none focus:outline-none focus:border-sky-500"
            rows={Math.max(12, mdContent.split("\n").length + 2)}
            value={mdContent}
            onChange={(e) => setMdContent(e.target.value)}
            spellCheck={false}
          />
        ) : (
          <pre className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-xs text-slate-300 font-mono overflow-auto whitespace-pre-wrap leading-relaxed">
            {skill.skillMd}
          </pre>
        )}
      </div>

      {/* Scripts */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Scripts ({skill.scripts.length})
          </h2>
          {!addingScript && (
            <button
              onClick={() => setAddingScript(true)}
              className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors"
            >
              <Plus size={13} /> Add script
            </button>
          )}
        </div>

        <div className="space-y-4">
          {skill.scripts.map((script) => (
            <ScriptEditor
              key={script.filename}
              skillName={skill.name}
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
              skillName={skill.name}
              onCreated={() => setAddingScript(false)}
              onCancel={() => setAddingScript(false)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
