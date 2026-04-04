import { Router } from "express";
import { readdirSync, readFileSync, existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, basename, extname, resolve, sep } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import type { ApiSkill } from "@zerohand/shared";
import { skillsDir as getSkillsDir } from "../services/paths.js";

const ALLOWED_EXTS = [".js", ".ts", ".py", ".sh"];

function safeScriptPath(skillsDir: string, skillName: string, filename: string): string | null {
  const base = basename(filename);
  if (base !== filename) return null;
  if (!ALLOWED_EXTS.includes(extname(base))) return null;
  if (!/^[a-z0-9_-]+\.[a-z]+$/.test(base)) return null;
  const skillDir = join(skillsDir, skillName);
  const resolved = resolve(join(skillDir, "scripts", base));
  if (!resolved.startsWith(resolve(skillsDir) + sep)) return null;
  return resolved;
}

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

  const scriptsDir = join(skillDir, "scripts");
  const scripts: string[] = [];
  if (existsSync(scriptsDir)) {
    const files = readdirSync(scriptsDir).filter((f: string) => /\.(js|ts|py|sh)$/.test(f));
    scripts.push(...files.map((f: string) => f.replace(/\.(js|ts|py|sh)$/, "")));
  }

  return {
    name: String(fm.name ?? ""),
    version: String(fm.version ?? "0.0.0"),
    description: String(fm.description ?? ""),
    allowedTools,
    scripts,
  };
}

export function createSkillsRouter(): Router {
  const skillsDir = getSkillsDir();
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

  // GET /api/skills/:name/bundle — full file contents for package export
  router.get("/skills/:name/bundle", (req, res) => {
    const skillDir = join(skillsDir, req.params.name);
    if (!existsSync(skillDir)) {
      return res.status(404).json({ error: "Skill not found" });
    }
    const skillPath = join(skillDir, "SKILL.md");
    if (!existsSync(skillPath)) {
      return res.status(404).json({ error: "Skill not found or invalid SKILL.md" });
    }
    const skillMd = readFileSync(skillPath, "utf-8");

    const scripts: Array<{ filename: string; content: string }> = [];
    const scriptsDir = join(skillDir, "scripts");
    if (existsSync(scriptsDir)) {
      const files = readdirSync(scriptsDir).filter((f: string) => /\.(js|cjs|ts|py|sh)$/.test(f));
      for (const filename of files) {
        const content = readFileSync(join(scriptsDir, filename), "utf-8");
        scripts.push({ filename, content });
      }
    }

    res.json({ name: req.params.name, skillMd, scripts });
  });

  // POST /api/skills — create a new skill
  router.post("/skills", (req, res) => {
    const { name, description, version, allowedTools } = req.body as {
      name?: string;
      description?: string;
      version?: string;
      allowedTools?: string[];
    };

    if (!name || typeof name !== "string" || !/^[a-z0-9_-]+$/.test(name)) {
      return res.status(400).json({ error: "name is required and must match ^[a-z0-9_-]+$" });
    }

    const skillDir = join(skillsDir, name);
    if (existsSync(skillDir)) {
      return res.status(409).json({ error: `Skill "${name}" already exists` });
    }

    const fm: Record<string, unknown> = { name };
    if (version) fm.version = version;
    if (description) fm.description = description;
    if (allowedTools && allowedTools.length > 0) fm["allowed-tools"] = allowedTools.join(", ");

    const skillMd = `---\n${stringifyYaml(fm).trim()}\n---\n\n`;

    mkdirSync(join(skillDir, "scripts"), { recursive: true });
    writeFileSync(join(skillDir, "SKILL.md"), skillMd, "utf-8");

    const skill = parseSkillFile(skillDir);
    return res.status(201).json(skill);
  });

  // PATCH /api/skills/:name — update SKILL.md content
  router.patch("/skills/:name", (req, res) => {
    const { content } = req.body as { content?: string };
    if (typeof content !== "string") {
      return res.status(400).json({ error: "content is required" });
    }

    const skillDir = join(skillsDir, req.params.name);
    if (!existsSync(skillDir)) {
      return res.status(404).json({ error: "Skill not found" });
    }

    writeFileSync(join(skillDir, "SKILL.md"), content, "utf-8");
    const skill = parseSkillFile(skillDir);
    if (!skill) {
      return res.status(400).json({ error: "Invalid SKILL.md content" });
    }
    return res.json({ ...skill, content });
  });

  // PUT /api/skills/:name/scripts/:filename — create or update a script file
  router.put("/skills/:name/scripts/:filename", (req, res) => {
    const { content } = req.body as { content?: string };
    if (typeof content !== "string") {
      return res.status(400).json({ error: "content is required" });
    }
    const scriptPath = safeScriptPath(skillsDir, req.params.name, req.params.filename);
    if (!scriptPath) {
      return res.status(400).json({ error: "Invalid skill name or filename" });
    }
    const skillDir = join(skillsDir, req.params.name);
    if (!existsSync(skillDir)) {
      return res.status(404).json({ error: "Skill not found" });
    }
    mkdirSync(join(skillDir, "scripts"), { recursive: true });
    writeFileSync(scriptPath, content, "utf-8");
    res.json({ filename: req.params.filename });
  });

  // DELETE /api/skills/:name/scripts/:filename — remove a script file
  router.delete("/skills/:name/scripts/:filename", (req, res) => {
    const scriptPath = safeScriptPath(skillsDir, req.params.name, req.params.filename);
    if (!scriptPath) {
      return res.status(400).json({ error: "Invalid skill name or filename" });
    }
    if (!existsSync(scriptPath)) {
      return res.status(404).json({ error: "Script not found" });
    }
    rmSync(scriptPath);
    res.status(204).end();
  });

  return router;
}
