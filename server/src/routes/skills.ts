import { Router } from "express";
import { readdirSync, readFileSync, existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, basename, extname, resolve, sep } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import type { ApiSkill } from "@zerohand/shared";
import { skillsDir as getSkillsDir } from "../services/paths.js";

const ALLOWED_EXTS = [".js", ".ts", ".py", ".sh"];

/** Validate a single path segment (namespace or skill name) */
function isValidSegment(s: string): boolean {
  return /^[a-z0-9][a-z0-9_-]*$/.test(s) && s.length <= 64;
}

function safeScriptPath(skillsDir: string, namespace: string, skillName: string, filename: string): string | null {
  const base = basename(filename);
  if (base !== filename) return null;
  if (!ALLOWED_EXTS.includes(extname(base))) return null;
  if (!/^[a-z0-9_-]+\.[a-z]+$/.test(base)) return null;
  const skillDir = join(skillsDir, namespace, skillName);
  const resolved = resolve(join(skillDir, "scripts", base));
  if (!resolved.startsWith(resolve(skillsDir) + sep)) return null;
  return resolved;
}

function parseSkillFile(skillDir: string, namespace: string, skillFolderName: string): ApiSkill | null {
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

  // Strip any accidental "namespace/" prefix from the name field
  const rawName = String(fm.name ?? skillFolderName);
  const nameSlash = rawName.indexOf("/");
  const skillBaseName = nameSlash > -1 ? rawName.slice(nameSlash + 1) : rawName;

  return {
    name: skillBaseName,
    namespace,
    version: String(fm.version ?? "0.0.0"),
    description: String(fm.description ?? ""),
    allowedTools,
    scripts,
  };
}

/**
 * Scan two levels deep: SKILLS_DIR/<namespace>/<skill>/SKILL.md
 * Returns all skills with their namespace.
 */
function listAllSkills(skillsDir: string): ApiSkill[] {
  if (!existsSync(skillsDir)) return [];
  const skills: ApiSkill[] = [];

  const namespaceEntries = readdirSync(skillsDir, { withFileTypes: true });
  for (const nsEntry of namespaceEntries) {
    if (!nsEntry.isDirectory()) continue;
    const namespace = nsEntry.name;
    const nsDir = join(skillsDir, namespace);

    const skillEntries = readdirSync(nsDir, { withFileTypes: true });
    for (const skillEntry of skillEntries) {
      if (!skillEntry.isDirectory()) continue;
      const skillDir = join(nsDir, skillEntry.name);
      const skill = parseSkillFile(skillDir, namespace, skillEntry.name);
      if (skill) skills.push(skill);
    }
  }

  return skills;
}

export function createSkillsRouter(): Router {
  const skillsDir = getSkillsDir();
  const router = Router();

  // GET /api/skills — list all skills across all namespaces
  router.get("/skills", (_req, res) => {
    res.json(listAllSkills(skillsDir));
  });

  // GET /api/skills/:namespace/:name — get a specific skill with SKILL.md content
  router.get("/skills/:namespace/:name", (req, res) => {
    const { namespace, name } = req.params;
    if (!isValidSegment(namespace) || !isValidSegment(name)) {
      return res.status(400).json({ error: "Invalid namespace or skill name" });
    }

    const skillDir = join(skillsDir, namespace, name);
    if (!existsSync(skillDir)) {
      return res.status(404).json({ error: "Skill not found" });
    }
    const skill = parseSkillFile(skillDir, namespace, name);
    if (!skill) {
      return res.status(404).json({ error: "Skill not found or invalid SKILL.md" });
    }
    const skillPath = join(skillDir, "SKILL.md");
    const content = readFileSync(skillPath, "utf-8");
    res.json({ ...skill, content });
  });

  // GET /api/skills/:namespace/:name/bundle — full file contents for package export
  router.get("/skills/:namespace/:name/bundle", (req, res) => {
    const { namespace, name } = req.params;
    if (!isValidSegment(namespace) || !isValidSegment(name)) {
      return res.status(400).json({ error: "Invalid namespace or skill name" });
    }

    const skillDir = join(skillsDir, namespace, name);
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

    res.json({ name, namespace, qualifiedName: `${namespace}/${name}`, skillMd, scripts });
  });

  // POST /api/skills — create a new skill
  // Body: { name, namespace?, description?, version?, allowedTools? }
  router.post("/skills", (req, res) => {
    const { name, namespace: ns, description, version, allowedTools } = req.body as {
      name?: string;
      namespace?: string;
      description?: string;
      version?: string;
      allowedTools?: string[];
    };

    if (!name || typeof name !== "string" || !/^[a-z0-9][a-z0-9_-]*$/.test(name)) {
      return res.status(400).json({ error: "name is required and must match ^[a-z0-9][a-z0-9_-]*$" });
    }

    const namespace = ns ?? "local";
    if (!isValidSegment(namespace)) {
      return res.status(400).json({ error: "Invalid namespace — must match ^[a-z0-9][a-z0-9_-]*$" });
    }

    const nsDir = join(skillsDir, namespace);
    const skillDir = join(nsDir, name);

    // Path traversal guard
    if (!resolve(skillDir).startsWith(resolve(skillsDir) + sep)) {
      return res.status(400).json({ error: "Invalid skill path" });
    }

    if (existsSync(skillDir)) {
      return res.status(409).json({ error: `Skill "${namespace}/${name}" already exists` });
    }

    const fm: Record<string, unknown> = { name };
    if (version) fm.version = version;
    if (description) fm.description = description;
    if (allowedTools && allowedTools.length > 0) fm["allowed-tools"] = allowedTools.join(", ");

    const skillMd = `---\n${stringifyYaml(fm).trim()}\n---\n\n`;

    mkdirSync(join(skillDir, "scripts"), { recursive: true });
    writeFileSync(join(skillDir, "SKILL.md"), skillMd, "utf-8");

    const skill = parseSkillFile(skillDir, namespace, name);
    return res.status(201).json(skill);
  });

  // PATCH /api/skills/:namespace/:name — update SKILL.md content
  router.patch("/skills/:namespace/:name", (req, res) => {
    const { namespace, name } = req.params;
    if (!isValidSegment(namespace) || !isValidSegment(name)) {
      return res.status(400).json({ error: "Invalid namespace or skill name" });
    }

    const { content } = req.body as { content?: string };
    if (typeof content !== "string") {
      return res.status(400).json({ error: "content is required" });
    }

    const skillDir = join(skillsDir, namespace, name);
    if (!existsSync(skillDir)) {
      return res.status(404).json({ error: "Skill not found" });
    }

    writeFileSync(join(skillDir, "SKILL.md"), content, "utf-8");
    const skill = parseSkillFile(skillDir, namespace, name);
    if (!skill) {
      return res.status(400).json({ error: "Invalid SKILL.md content" });
    }
    return res.json({ ...skill, content });
  });

  // PUT /api/skills/:namespace/:name/scripts/:filename — create or update a script file
  router.put("/skills/:namespace/:name/scripts/:filename", (req, res) => {
    const { namespace, name, filename } = req.params;
    if (!isValidSegment(namespace) || !isValidSegment(name)) {
      return res.status(400).json({ error: "Invalid namespace or skill name" });
    }

    const { content } = req.body as { content?: string };
    if (typeof content !== "string") {
      return res.status(400).json({ error: "content is required" });
    }
    const scriptPath = safeScriptPath(skillsDir, namespace, name, filename);
    if (!scriptPath) {
      return res.status(400).json({ error: "Invalid skill name or filename" });
    }
    const skillDir = join(skillsDir, namespace, name);
    if (!existsSync(skillDir)) {
      return res.status(404).json({ error: "Skill not found" });
    }
    mkdirSync(join(skillDir, "scripts"), { recursive: true });
    writeFileSync(scriptPath, content, "utf-8");
    res.json({ filename });
  });

  // DELETE /api/skills/:namespace/:name/scripts/:filename — remove a script file
  router.delete("/skills/:namespace/:name/scripts/:filename", (req, res) => {
    const { namespace, name, filename } = req.params;
    if (!isValidSegment(namespace) || !isValidSegment(name)) {
      return res.status(400).json({ error: "Invalid namespace or skill name" });
    }

    const scriptPath = safeScriptPath(skillsDir, namespace, name, filename);
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
