import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { Cpu, Plus, X } from "lucide-react";
import { useState } from "react";
import { api } from "../lib/api.ts";

function NewSkillForm({ onCancel }: { onCancel: () => void }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");

  const create = useMutation({
    mutationFn: () => api.createSkill({ name, description: description || undefined }),
    onSuccess: (skill) => {
      queryClient.invalidateQueries({ queryKey: ["skills"] });
      navigate(`/skills/${encodeURIComponent(skill.name)}`);
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  const nameValid = /^[a-z0-9_-]+$/.test(name);

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-white">New Skill</span>
        <button onClick={onCancel} className="text-slate-500 hover:text-slate-300 transition-colors">
          <X size={14} />
        </button>
      </div>
      <div className="space-y-3">
        <div>
          <input
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 font-mono"
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
          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
          placeholder="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        {error && <p className="text-xs text-rose-400">{error}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="px-3 py-1.5 text-sm text-slate-400 hover:text-white transition-colors">
            Cancel
          </button>
          <button
            onClick={() => create.mutate()}
            disabled={!nameValid || create.isPending}
            className="px-3 py-1.5 bg-sky-500 hover:bg-sky-400 text-slate-950 text-sm font-semibold rounded-lg transition-colors disabled:opacity-40"
          >
            {create.isPending ? "Creating..." : "Create Skill"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Skills() {
  const { data: skills = [], isLoading } = useQuery({
    queryKey: ["skills"],
    queryFn: () => api.listSkills(),
  });
  const [creating, setCreating] = useState(false);

  if (isLoading) return <div className="p-8 text-slate-500">Loading...</div>;

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Skills</h1>
          <p className="text-sm text-slate-500 mt-1">
            Skills are installed from packages or created in-app.
          </p>
        </div>
        {!creating && (
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium rounded-xl transition-colors"
          >
            <Plus size={13} /> New Skill
          </button>
        )}
      </div>

      {creating && <NewSkillForm onCancel={() => setCreating(false)} />}

      {skills.length === 0 ? (
        <div className="text-slate-600 text-sm border border-dashed border-slate-800 rounded-xl p-8 text-center">
          No skills yet. Create one above or install a package.
        </div>
      ) : (
        <div className="space-y-2">
          {skills.map((skill) => (
            <Link
              key={skill.name}
              to={`/skills/${encodeURIComponent(skill.name)}`}
              className="flex items-center gap-4 px-4 py-3 bg-slate-900/50 border border-slate-800/60 rounded-xl hover:border-slate-700 transition-colors"
            >
              <Cpu size={15} className="text-sky-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-white">{skill.name}</div>
                {skill.description && (
                  <div className="text-xs text-slate-500 mt-0.5 truncate">{skill.description}</div>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {skill.scripts.length > 0 && (
                  <span className="text-xs text-slate-600">{skill.scripts.length} script{skill.scripts.length !== 1 ? "s" : ""}</span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
