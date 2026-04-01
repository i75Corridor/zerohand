import { Router } from "express";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import type { ApiSkill } from "@zerohand/shared";

function parseSkillFile(skillDir: string): ApiSkill | null {
  const skillPath = join(skillDir, "SKILL.md");
  if (!existsSync(skillPath)) return null;

  const content = readFileSync(skillPath, "utf-8");
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fmMatch) return null;

  let fm: Record<string, unknown>;
  try {
    fm = parseYaml(fmMatch[1]) as Record<string, unknown>;
  } catch {
    return null;
  }

  const allowedTools = typeof fm["allowed-tools"] === "string"
    ? fm["allowed-tools"].split(",").map((t) => t.trim()).filter(Boolean)
    : [];

  return {
    name: String(fm.name ?? ""),
    version: String(fm.version ?? "0.0.0"),
    description: String(fm.description ?? ""),
    allowedTools,
  };
}

export function createSkillsRouter(): Router {
  const skillsDir = process.env.SKILLS_DIR ?? join(process.cwd(), "..", "skills");
  const router = Router();

  router.get("/skills", (_req, res) => {
    if (!existsSync(skillsDir)) {
      return res.json([]);
    }
    const entries = readdirSync(skillsDir, { withFileTypes: true });
    const skills: ApiSkill[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skill = parseSkillFile(join(skillsDir, entry.name));
      if (skill) skills.push(skill);
    }
    res.json(skills);
  });

  router.get("/skills/:name", (req, res) => {
    const skillDir = join(skillsDir, req.params.name);
    if (!existsSync(skillDir)) {
      return res.status(404).json({ error: "Skill not found" });
    }
    const skill = parseSkillFile(skillDir);
    if (!skill) {
      return res.status(404).json({ error: "Skill not found or invalid SKILL.md" });
    }
    const skillPath = join(skillDir, "SKILL.md");
    const content = readFileSync(skillPath, "utf-8");
    res.json({ ...skill, content });
  });

  return router;
}
