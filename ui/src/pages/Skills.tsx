import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Cpu } from "lucide-react";
import { api } from "../lib/api.ts";

export default function Skills() {
  const { data: skills = [], isLoading } = useQuery({
    queryKey: ["skills"],
    queryFn: () => api.listSkills(),
  });

  if (isLoading) return <div className="p-8 text-slate-500">Loading...</div>;

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Skills</h1>
        <p className="text-sm text-slate-500 mt-1">
          Skills are installed from packages or created by the agent. Use the Agent AI to create or edit skills.
        </p>
      </div>

      {skills.length === 0 ? (
        <div className="text-slate-600 text-sm border border-dashed border-slate-800 rounded-xl p-8 text-center">
          No skills installed yet. Install a package or ask the agent to create one.
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
