import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { checkModelAvailability } from "../services/package-manager.js";

describe("checkModelAvailability", () => {
  let skillsDir: string;

  beforeEach(() => {
    skillsDir = mkdtempSync(join(tmpdir(), "zerohand-model-test-"));
  });

  function makeSkill(namespace: string, name: string, frontMatter: string, body = "You are helpful.") {
    const skillDir = join(skillsDir, namespace, name);
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, "SKILL.md"), `---\n${frontMatter}\n---\n${body}`);
  }

  it("returns no warnings when no skills have a model override", () => {
    makeSkill("local", "writer", 'name: writer\nversion: "1.0.0"\ndescription: "A writer"');
    const warnings = checkModelAvailability(["local/writer"], skillsDir);
    expect(warnings).toHaveLength(0);
  });

  it("returns no warnings when the skill has no model key at all", () => {
    makeSkill("pkg", "researcher", 'name: researcher\ndescription: "Researcher"');
    const warnings = checkModelAvailability(["pkg/researcher"], skillsDir);
    expect(warnings).toHaveLength(0);
  });

  it("returns a warning when skill declares a model and the provider has no API key", () => {
    // Use a fake provider that definitely has no env var set
    makeSkill("local", "fancy-skill", 'name: fancy-skill\nmodel: totally-fake-provider/model-xyz');
    const originalEnv = process.env.TOTALLY_FAKE_PROVIDER_API_KEY;
    delete process.env.TOTALLY_FAKE_PROVIDER_API_KEY;

    const warnings = checkModelAvailability(["local/fancy-skill"], skillsDir);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].skillName).toBe("local/fancy-skill");
    expect(warnings[0].provider).toBe("totally-fake-provider");
    expect(warnings[0].model).toBe("totally-fake-provider/model-xyz");
    expect(warnings[0].message).toContain("totally-fake-provider");

    if (originalEnv !== undefined) process.env.TOTALLY_FAKE_PROVIDER_API_KEY = originalEnv;
  });

  it("returns no warnings for unknown skill names (skill dir doesn't exist)", () => {
    // Non-existent skill — loadSkillDef returns null, should be silently skipped
    const warnings = checkModelAvailability(["local/ghost-skill"], skillsDir);
    expect(warnings).toHaveLength(0);
  });

  it("aggregates warnings across multiple skills", () => {
    makeSkill("pkg", "skill-a", 'name: skill-a\nmodel: fake-provider-a/model-1');
    makeSkill("pkg", "skill-b", 'name: skill-b\nmodel: fake-provider-b/model-2');
    makeSkill("pkg", "skill-c", 'name: skill-c\ndescription: "No model"');

    const warnings = checkModelAvailability(
      ["pkg/skill-a", "pkg/skill-b", "pkg/skill-c"],
      skillsDir,
    );

    // skill-c has no model, only skill-a and skill-b should warn
    expect(warnings).toHaveLength(2);
    const providers = warnings.map((w) => w.provider);
    expect(providers).toContain("fake-provider-a");
    expect(providers).toContain("fake-provider-b");
  });
});
