import { join, resolve, sep } from "node:path";

export function safeSkillDir(skillName: string, skillsDir: string): string | null {
  const skillDir = join(skillsDir, skillName);
  const resolvedBase = resolve(skillsDir);
  const resolvedTarget = resolve(skillDir);
  if (!resolvedTarget.startsWith(resolvedBase + sep)) return null;
  return skillDir;
}

export function buildSkillMd(params: {
  name: string;
  description: string;
  type: string;
  model?: string;
  body: string;
  network?: boolean;
}): string {
  const fm: string[] = [
    `name: ${params.name}`,
    `version: "1.0.0"`,
    `description: "${params.description.replace(/"/g, '\\"')}"`,
    `type: ${params.type}`,
  ];
  if (params.model) fm.push(`model: ${params.model}`);
  if (params.network) fm.push(`network: true`);
  return `---\n${fm.join("\n")}\n---\n${params.body.trim()}\n`;
}
