import { join, resolve, sep } from "node:path";
import type { ApiSkillSchemaField } from "@pawn/shared";
export type { ApiSkillSchemaField as SkillSchemaField };

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

/**
 * Validate a qualified skill name "namespace/skill-name".
 * Each segment must be a valid skill name.
 * A bare name without "/" is also accepted and treated as "local/<name>".
 */
export function validateQualifiedSkillName(qualifiedName: string): string | null {
  if (!qualifiedName) return "skill name is required";
  const parts = qualifiedName.split("/");
  if (parts.length === 1) {
    return validateSkillName(parts[0]);
  }
  if (parts.length === 2) {
    const nsErr = validateSkillName(parts[0]);
    if (nsErr) return `invalid namespace: ${nsErr}`;
    const nameErr = validateSkillName(parts[1]);
    if (nameErr) return `invalid skill name: ${nameErr}`;
    return null;
  }
  return "skill name must be in 'namespace/skill-name' format (e.g. 'local/my-skill')";
}

/**
 * Normalize a skill name: if it doesn't contain "/", prefix with "local/".
 */
export function normalizeSkillName(skillName: string): string {
  if (skillName.includes("/")) return skillName;
  return `local/${skillName}`;
}

export function validateDescription(description: string): string | null {
  if (!description || description.trim() === "") return "description is required";
  if (description.length > 1024) return `description exceeds 1024 characters (got ${description.length})`;
  return null;
}

// ── Path guard ─────────────────────────────────────────────────────────────────

/**
 * Returns the full filesystem path for a skill, or null if the name is unsafe.
 * Accepts both qualified "namespace/skill-name" and bare "skill-name" (→ local/).
 * The "/" in the qualified name is handled correctly by path.join().
 */
export function safeSkillDir(skillName: string, skillsDir: string): string | null {
  const normalized = normalizeSkillName(skillName);
  // path.join handles "local/researcher" as a sub-path correctly
  const skillDir = join(skillsDir, normalized);
  const resolvedBase = resolve(skillsDir);
  const resolvedTarget = resolve(skillDir);
  if (!resolvedTarget.startsWith(resolvedBase + sep)) return null;
  return skillDir;
}

// ── SKILL.md serialization ─────────────────────────────────────────────────────

export interface SkillMdParams {
  name: string;
  description: string;
  /** Pawn model override in provider/name format */
  model?: string;
  /** Whether scripts need outbound network access (pawn extension) */
  network?: boolean;
  /** Whether to expose the built-in bash tool to the agent (pawn extension) */
  bash?: boolean;
  /** Secret keys to inject as env vars (pawn extension) */
  secrets?: string[];
  /** Names of registered MCP servers whose tools this skill can access at runtime */
  mcpServers?: string[];
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
  /** Advisory: what inputs this skill is designed to receive */
  inputSchema?: ApiSkillSchemaField[];
  /** What structured data this skill produces (enforced at runtime when present) */
  outputSchema?: ApiSkillSchemaField[];
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

  // Pawn-specific runtime fields (extensions, not in spec)
  if (params.model) lines.push(`model: ${params.model}`);
  if (params.network) lines.push(`network: true`);
  if (params.bash) lines.push(`bash: true`);
  if (params.secrets && params.secrets.length > 0) {
    lines.push(`secrets:`);
    for (const s of params.secrets) lines.push(`  - ${s}`);
  }
  if (params.mcpServers && params.mcpServers.length > 0) {
    lines.push(`mcpServers:`);
    for (const s of params.mcpServers) lines.push(`  - ${s}`);
  }

  // I/O schema blocks (pawn extensions)
  if (params.inputSchema && params.inputSchema.length > 0) {
    lines.push(`inputSchema:`);
    for (const f of params.inputSchema) {
      lines.push(`  - name: ${f.name}`);
      if (f.type) lines.push(`    type: ${f.type}`);
      if (f.description) lines.push(`    description: ${serializeScalar(f.description)}`);
      if (f.required) lines.push(`    required: true`);
    }
  }
  if (params.outputSchema && params.outputSchema.length > 0) {
    lines.push(`outputSchema:`);
    for (const f of params.outputSchema) {
      lines.push(`  - name: ${f.name}`);
      if (f.type) lines.push(`    type: ${f.type}`);
      if (f.description) lines.push(`    description: ${serializeScalar(f.description)}`);
      if (f.required) lines.push(`    required: true`);
    }
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
