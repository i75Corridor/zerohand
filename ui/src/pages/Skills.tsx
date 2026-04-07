import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { Cpu, Plus, X } from "lucide-react";
import { useState } from "react";
import { api } from "../lib/api.ts";
import LoadingState from "../components/LoadingState.tsx";
import EmptyState from "../components/EmptyState.tsx";
import PageHeader from "../components/PageHeader.tsx";
import type { ApiSkill } from "@pawn/shared";

function NewSkillForm({ onCancel }: { onCancel: () => void }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");

  const create = useMutation({
    mutationFn: () => api.createSkill({ name, namespace: "local", description: description || undefined }),
    onSuccess: (skill) => {
      queryClient.invalidateQueries({ queryKey: ["skills"] });
      const ns = skill.namespace ?? "local";
      navigate(`/skills/${encodeURIComponent(ns)}/${encodeURIComponent(skill.name)}`);
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  const nameValid = /^[a-z0-9][a-z0-9_-]*$/.test(name);

  return (
    <div className="bg-pawn-surface-900 border border-pawn-surface-700 rounded-card p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-white">New Skill</span>
        <button onClick={onCancel} className="text-pawn-surface-500 hover:text-pawn-surface-300 transition-colors">
          <X size={14} />
        </button>
      </div>
      <div className="space-y-3">
        <div>
          <input
            className="w-full bg-pawn-surface-800 border border-pawn-surface-700 rounded-button px-3 py-2 text-sm text-white placeholder-pawn-surface-500 focus:outline-none focus:border-pawn-gold-500 font-mono"
            placeholder="skill-name (lowercase, hyphens ok)"
            value={name}
            onChange={(e) => { setName(e.target.value.toLowerCase()); setError(""); }}
            autoFocus
          />
          {name && !nameValid && (
            <p className="text-xs text-rose-400 mt-1">Only lowercase letters, numbers, hyphens, and underscores</p>
          )}
        </div>
        <input
          className="w-full bg-pawn-surface-800 border border-pawn-surface-700 rounded-button px-3 py-2 text-sm text-white placeholder-pawn-surface-500 focus:outline-none focus:border-pawn-gold-500"
          placeholder="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        {error && <p className="text-xs text-rose-400">{error}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="px-3 py-1.5 text-sm text-pawn-surface-400 hover:text-white transition-colors">
            Cancel
          </button>
          <button
            onClick={() => create.mutate()}
            disabled={!nameValid || create.isPending}
            className="px-3 py-1.5 bg-pawn-gold-600 hover:bg-pawn-gold-500 text-white text-sm font-medium rounded-button transition-colors disabled:opacity-40"
          >
            {create.isPending ? "Creating..." : "Create Skill"}
          </button>
        </div>
      </div>
    </div>
  );
}

function skillDetailPath(skill: ApiSkill): string {
  const ns = skill.namespace ?? "local";
  return `/skills/${encodeURIComponent(ns)}/${encodeURIComponent(skill.name)}`;
}

export default function Skills() {
  const { data: skills = [], isLoading, error } = useQuery({
    queryKey: ["skills"],
    queryFn: () => api.listSkills(),
  });
  const [creating, setCreating] = useState(false);

  if (isLoading) return <LoadingState />;

  // Group skills by namespace
  const byNamespace = new Map<string, ApiSkill[]>();
  for (const skill of skills) {
    const ns = skill.namespace ?? "local";
    if (!byNamespace.has(ns)) byNamespace.set(ns, []);
    byNamespace.get(ns)!.push(skill);
  }

  // Sort: "local" first, then alphabetical
  const namespaces = [...byNamespace.keys()].sort((a, b) => {
    if (a === "local") return -1;
    if (b === "local") return 1;
    return a.localeCompare(b);
  });

  return (
    <div className="p-4 sm:p-6 lg:p-10 max-w-4xl pt-14 lg:pt-10">
      <PageHeader
        title="Skills"
        actions={
          !creating ? (
            <button
              onClick={() => setCreating(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-pawn-surface-800 hover:bg-pawn-surface-700 text-pawn-surface-300 text-sm font-medium rounded-button transition-colors"
            >
              <Plus size={13} /> New Skill
            </button>
          ) : undefined
        }
      />

      {creating && <NewSkillForm onCancel={() => setCreating(false)} />}

      {skills.length === 0 ? (
        <EmptyState
          icon={Cpu}
          title="No pieces in play"
          description="Skills are reusable AI capabilities -- prompts, scripts, or tools that pipeline steps can invoke. Create one from scratch or install a package that includes skills."
          actions={[
            { label: "Create a Skill", onClick: () => setCreating(true) },
            { label: "Browse Packages", to: "/packages", variant: "secondary" },
          ]}
          hint="Skills installed from packages appear here automatically."
        />
      ) : (
        <div className="space-y-6">
          {namespaces.map((ns) => (
            <div key={ns}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-semibold text-pawn-surface-500 uppercase tracking-widest">{ns}</span>
                <div className="flex-1 h-px bg-pawn-surface-800" />
              </div>
              <div className="space-y-2">
                {byNamespace.get(ns)!.map((skill) => (
                  <Link
                    key={`${ns}/${skill.name}`}
                    to={skillDetailPath(skill)}
                    className="flex items-center gap-4 px-4 py-3 bg-pawn-surface-900/50 border border-pawn-surface-800/60 rounded-card hover:border-pawn-surface-700 transition-colors"
                  >
                    <Cpu size={15} className="text-violet-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-white font-mono">{ns}/{skill.name}</div>
                      {skill.description && (
                        <div className="text-xs text-pawn-surface-500 mt-0.5 truncate">{skill.description}</div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {skill.scripts.length > 0 && (
                        <span className="text-xs text-pawn-surface-600">{skill.scripts.length} script{skill.scripts.length !== 1 ? "s" : ""}</span>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
