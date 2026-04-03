import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { interpolateContext, loadSkillDef, makeScriptTools } from "../services/skill-loader.js";

// ── interpolateContext ────────────────────────────────────────────────────────

describe("interpolateContext", () => {
  it("replaces a single token", () => {
    expect(interpolateContext("Hello {{context.name}}", { name: "World" })).toBe("Hello World");
  });

  it("replaces multiple different tokens", () => {
    expect(
      interpolateContext("{{context.a}} + {{context.b}}", { a: "foo", b: "bar" }),
    ).toBe("foo + bar");
  });

  it("replaces repeated occurrences of the same token", () => {
    expect(interpolateContext("{{context.x}} and {{context.x}}", { x: "hi" })).toBe("hi and hi");
  });

  it("leaves unrecognized tokens untouched", () => {
    expect(interpolateContext("{{context.missing}}", {})).toBe("{{context.missing}}");
  });

  it("leaves non-context templates untouched", () => {
    expect(interpolateContext("{{input.topic}}", {})).toBe("{{input.topic}}");
  });

  it("handles empty text", () => {
    expect(interpolateContext("", { a: "b" })).toBe("");
  });

  it("handles empty context", () => {
    expect(interpolateContext("no tokens here", {})).toBe("no tokens here");
  });
});

// ── loadSkillDef ─────────────────────────────────────────────────────────────

describe("loadSkillDef", () => {
  let skillsDir: string;

  beforeEach(() => {
    skillsDir = mkdtempSync(join(tmpdir(), "zerohand-skill-test-"));
  });

  // Security: path traversal
  it("returns null for a path traversal with ../", () => {
    expect(loadSkillDef("../../../etc/passwd", skillsDir)).toBeNull();
  });

  it("returns null for a path traversal with ..", () => {
    expect(loadSkillDef("..", skillsDir)).toBeNull();
  });

  it("returns null for a relative path that escapes skillsDir", () => {
    expect(loadSkillDef("../../secret", skillsDir)).toBeNull();
  });

  // Missing skill
  it("returns null when the skill directory does not exist", () => {
    expect(loadSkillDef("nonexistent", skillsDir)).toBeNull();
  });

  it("returns null when SKILL.md is missing", () => {
    mkdirSync(join(skillsDir, "empty-skill"), { recursive: true });
    expect(loadSkillDef("empty-skill", skillsDir)).toBeNull();
  });

  // Valid parsing
  it("parses a minimal SKILL.md", () => {
    const skillDir = join(skillsDir, "writer");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      join(skillDir, "SKILL.md"),
      `---
name: writer
version: "1.0.0"
description: "Test writer skill"
type: pi
---
You are a writer.`,
    );

    const skill = loadSkillDef("writer", skillsDir);
    expect(skill).not.toBeNull();
    expect(skill!.name).toBe("writer");
    expect(skill!.version).toBe("1.0.0");
    expect(skill!.description).toBe("Test writer skill");
    expect(skill!.type).toBe("pi");
    expect(skill!.systemPrompt).toBe("You are a writer.");
    expect(skill!.scriptPaths).toHaveLength(0);
    expect(skill!.modelProvider).toBeUndefined();
    expect(skill!.modelName).toBeUndefined();
  });

  it("parses model override in provider/name format", () => {
    const skillDir = join(skillsDir, "researcher");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      join(skillDir, "SKILL.md"),
      `---
name: researcher
version: "1.0.0"
description: "Researcher"
type: pi
model: google/gemini-2.5-flash
---
You research things.`,
    );

    const skill = loadSkillDef("researcher", skillsDir);
    expect(skill!.modelProvider).toBe("google");
    expect(skill!.modelName).toBe("gemini-2.5-flash");
  });


  it("uses skill folder name as fallback when name is missing from frontmatter", () => {
    const skillDir = join(skillsDir, "myfallback");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      join(skillDir, "SKILL.md"),
      `---
version: "1.0.0"
description: "No name field"
type: pi
---
Prompt body.`,
    );

    const skill = loadSkillDef("myfallback", skillsDir);
    expect(skill!.name).toBe("myfallback");
  });

  // Scripts discovery
  it("discovers .js, .ts, .py, .sh scripts and ignores other file types", () => {
    const skillDir = join(skillsDir, "multiscript");
    const scriptsDir = join(skillDir, "scripts");
    mkdirSync(scriptsDir, { recursive: true });
    writeFileSync(join(skillDir, "SKILL.md"), `---\nname: multiscript\nversion: "1.0.0"\ndescription: ""\ntype: pi\n---\nBody.`);
    writeFileSync(join(scriptsDir, "web_search.js"), "// js tool");
    writeFileSync(join(scriptsDir, "generate.cjs"), "// cjs tool");
    writeFileSync(join(scriptsDir, "fetch.ts"), "// ts tool");
    writeFileSync(join(scriptsDir, "analyze.py"), "# py tool");
    writeFileSync(join(scriptsDir, "run.sh"), "#!/bin/bash");
    writeFileSync(join(scriptsDir, "README.txt"), "ignored");
    writeFileSync(join(scriptsDir, "data.json"), "{}");

    const skill = loadSkillDef("multiscript", skillsDir);
    expect(skill!.scriptPaths).toHaveLength(5);
    const names = skill!.scriptPaths.map((p) => p.split("/").pop());
    expect(names).toContain("web_search.js");
    expect(names).toContain("generate.cjs");
    expect(names).toContain("fetch.ts");
    expect(names).toContain("analyze.py");
    expect(names).toContain("run.sh");
    expect(names).not.toContain("README.txt");
    expect(names).not.toContain("data.json");
  });

  it("returns empty scriptPaths when no scripts/ directory exists", () => {
    const skillDir = join(skillsDir, "noscripts");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, "SKILL.md"), `---\nname: noscripts\nversion: "1.0.0"\ndescription: ""\ntype: pi\n---\nBody.`);

    const skill = loadSkillDef("noscripts", skillsDir);
    expect(skill!.scriptPaths).toHaveLength(0);
  });
});

// ── makeScriptTools ───────────────────────────────────────────────────────────

describe("makeScriptTools", () => {
  it("returns empty array for no scripts", () => {
    expect(makeScriptTools([])).toHaveLength(0);
  });

  it("derives tool name from filename (strips extension)", () => {
    const tools = makeScriptTools(["/skills/researcher/scripts/web_search.js"]);
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe("web_search");
  });

  it("creates one tool per script path", () => {
    const tools = makeScriptTools([
      "/skills/researcher/scripts/web_search.js",
      "/skills/researcher/scripts/fetch_url.py",
    ]);
    expect(tools).toHaveLength(2);
    const names = tools.map((t) => t.name);
    expect(names).toContain("web_search");
    expect(names).toContain("fetch_url");
  });

  it("each tool has a label derived from its name", () => {
    const tools = makeScriptTools(["/skills/researcher/scripts/web_search.js"]);
    expect(tools[0].label).toBe("web search");
  });

  it("each tool has an execute function", () => {
    const tools = makeScriptTools(["/some/path/tool.js"]);
    expect(typeof tools[0].execute).toBe("function");
  });
});

