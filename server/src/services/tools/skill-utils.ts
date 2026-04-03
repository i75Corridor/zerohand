import { join, resolve, sep } from "node:path";

// ── Spec validation ────────────────────────────────────────────────────────────
// https://agentskills.io/specification

const NAME_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

export function validateSkillName(name: string): string | null {
  if (!name) return "name is required";
  if (name.length > 64) return `name exceeds 64 characters (got ${name.length})`;
  if (!NAME_RE.test(name)) return "name must contain only lowercase letters, numbers, and hyphens; must not start or end with a hyphen";
  if (/--/.test(name)) return "name must not contain consecutive hyphens";
  return null;
}

export function validateDescription(description: string): string | null {
  if (!description || description.trim() === "") return "description is required";
  if (description.length > 1024) return `description exceeds 1024 characters (got ${description.length})`;
  return null;
}

// ── Path guard ─────────────────────────────────────────────────────────────────

export function safeSkillDir(skillName: string, skillsDir: string): string | null {
  const skillDir = join(skillsDir, skillName);
  const resolvedBase = resolve(skillsDir);
  const resolvedTarget = resolve(skillDir);
  if (!resolvedTarget.startsWith(resolvedBase + sep)) return null;
  return skillDir;
}

// ── SKILL.md serialization ─────────────────────────────────────────────────────

export interface SkillMdParams {
  name: string;
  description: string;
  /** Zerohand model override in provider/name format */
  model?: string;
  /** Whether scripts need outbound network access (zerohand extension) */
  network?: boolean;
  /** Secret keys to inject as env vars (zerohand extension) */
  secrets?: string[];
  /** SPDX license identifier or reference to bundled license file */
  license?: string;
  /** Environment requirements per spec — auto-includes network note when network: true */
  compatibility?: string;
  /** Space-delimited list of pre-approved tools (spec: allowed-tools) */
  allowedTools?: string;
  /** Additional metadata key-value pairs; version is stored here */
  metadata?: Record<string, string>;
  /** Markdown body (system prompt instructions) */
  body: string;
}

export function buildSkillMd(params: SkillMdParams): string {
  const lines: string[] = [];

  // Spec required fields
  lines.push(`name: ${params.name}`);
  lines.push(`description: ${serializeScalar(params.description)}`);

  // Spec optional fields
  if (params.license) {
    lines.push(`license: ${serializeScalar(params.license)}`);
  }

  // compatibility: explicit value takes precedence; auto-add network note
  const compatParts: string[] = [];
  if (params.compatibility) compatParts.push(params.compatibility);
  if (params.network && !params.compatibility?.toLowerCase().includes("network")) {
    compatParts.push("Requires outbound network access");
  }
  if (compatParts.length > 0) {
    lines.push(`compatibility: ${serializeScalar(compatParts.join(". "))}`);
  }

  if (params.allowedTools) {
    lines.push(`allowed-tools: ${params.allowedTools}`);
  }

  // Zerohand-specific runtime fields (extensions, not in spec)
  if (params.model) lines.push(`model: ${params.model}`);
  if (params.network) lines.push(`network: true`);
  if (params.secrets && params.secrets.length > 0) {
    lines.push(`secrets:`);
    for (const s of params.secrets) lines.push(`  - ${s}`);
  }

  // metadata block — version lives here per spec (no top-level version field)
  const meta: Record<string, string> = { version: "1.0.0", ...params.metadata };
  lines.push(`metadata:`);
  for (const [k, v] of Object.entries(meta)) {
    lines.push(`  ${k}: ${serializeScalar(v)}`);
  }

  return `---\n${lines.join("\n")}\n---\n${params.body.trim()}\n`;
}

function serializeScalar(value: string): string {
  // Use double-quoted YAML string if value contains special chars or is long
  if (/[:#\[\]{},|>&*!%@`'"\\]/.test(value) || value.includes("\n")) {
    return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return value;
}
