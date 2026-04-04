import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Cpu, Copy, Check, Save, Trash2, Plus, X, Pencil } from "lucide-react";
import { useState } from "react";
import { api } from "../lib/api.ts";
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
        <span className="font-mono text-xs text-sky-300">{script.filename}</span>
        <div className="flex items-center gap-2">
          {dirty && (
            <button
              onClick={() => save.mutate()}
              disabled={save.isPending}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1 bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold rounded-lg transition-colors disabled:opacity-50"
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
          className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold rounded-lg transition-colors disabled:opacity-40"
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
  });

  if (isLoading) return <div className="p-8 text-slate-500">Loading...</div>;
  if (error || !skill) return <div className="p-8 text-rose-400">Skill not found.</div>;

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
    <div className="p-8 max-w-4xl">
      <Link to="/skills" className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 mb-4 transition-colors">
        <ArrowLeft size={12} /> Skills
      </Link>

      <div className="flex items-start gap-3 mb-8">
        <Cpu size={20} className="text-sky-400 flex-shrink-0 mt-0.5" />
        <div>
          <h1 className="text-2xl font-bold text-white">{skill.name}</h1>
          {description && <p className="text-sm text-slate-500 mt-1">{description}</p>}
        </div>
      </div>

      {/* SKILL.md */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">SKILL.md</h2>
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
                  className="flex items-center gap-1.5 text-xs px-2.5 py-1 bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold rounded-lg transition-colors disabled:opacity-50"
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
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">
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
            <div className="text-slate-600 text-sm border border-dashed border-slate-800 rounded-xl p-6 text-center">
              No scripts yet. Add one above or ask the agent to create one.
            </div>
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
