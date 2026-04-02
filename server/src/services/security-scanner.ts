/**
 * Security scanner for Zerohand pipeline packages.
 *
 * Scans a cloned package directory for suspicious patterns in scripts,
 * skill metadata, and dependencies. Returns a structured report with a
 * 3-tier risk level: low, medium, or high.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { parse as parseYaml } from "yaml";

export type SecurityLevel = "low" | "medium" | "high";

export interface SecurityFinding {
  level: SecurityLevel;
  category: string;
  file: string;
  line?: number;
  description: string;
}

export interface SecurityReport {
  level: SecurityLevel;
  findings: SecurityFinding[];
  scannedFiles: number;
  scannedAt: string;
}

// ── Pattern definitions ────────────────────────────────────────────────────────

interface PatternRule {
  pattern: RegExp;
  level: SecurityLevel;
  category: string;
  description: string;
}

// JS/TS patterns
const JS_PATTERNS: PatternRule[] = [
  // High
  { pattern: /\beval\s*\(/, level: "high", category: "dangerous_pattern", description: "Use of eval() — allows arbitrary code execution" },
  { pattern: /\bnew\s+Function\s*\(/, level: "high", category: "dangerous_pattern", description: "Use of new Function() — allows arbitrary code execution" },
  { pattern: /require\s*\(\s*['"]child_process['"]/, level: "high", category: "dangerous_pattern", description: "child_process import — can spawn system processes" },
  { pattern: /from\s+['"]child_process['"]/, level: "high", category: "dangerous_pattern", description: "child_process import — can spawn system processes" },
  { pattern: /process\.exit\s*\(/, level: "high", category: "dangerous_pattern", description: "process.exit() — can terminate the host process" },
  { pattern: /rm\s+-rf/, level: "high", category: "dangerous_pattern", description: "rm -rf pattern detected" },
  { pattern: /[A-Za-z0-9+/]{100,}={0,2}/, level: "high", category: "obfuscation", description: "Long base64-like string — possible obfuscated payload" },
  { pattern: /(?:\\x[0-9a-fA-F]{2}){10,}/, level: "high", category: "obfuscation", description: "Dense hex escape sequences — possible obfuscated code" },
  // Medium
  { pattern: /fs\.(writeFileSync|writeFile|unlinkSync|unlink|rmSync|rm)\s*\(/, level: "medium", category: "filesystem_write", description: "File system write/delete operation" },
  { pattern: /process\.env\b/, level: "medium", category: "env_access", description: "Accesses process.env — may read sensitive environment variables" },
  { pattern: /require\s*\(\s*[^'"]\s*\)/, level: "medium", category: "dynamic_require", description: "Dynamic require() with non-literal argument" },
  { pattern: /import\s*\(\s*[^'"`]\s*\)/, level: "medium", category: "dynamic_import", description: "Dynamic import() with non-literal argument" },
];

// Network patterns (for detecting covert network access when network: false)
const JS_NETWORK_PATTERNS: PatternRule[] = [
  { pattern: /\bfetch\s*\(/, level: "high", category: "covert_network", description: "fetch() call — network access not declared in skill metadata" },
  { pattern: /\bhttp\.request\s*\(/, level: "high", category: "covert_network", description: "http.request() — network access not declared in skill metadata" },
  { pattern: /\bhttps\.request\s*\(/, level: "high", category: "covert_network", description: "https.request() — network access not declared in skill metadata" },
  { pattern: /require\s*\(\s*['"]axios['"]/, level: "high", category: "covert_network", description: "axios import — network access not declared in skill metadata" },
  { pattern: /from\s+['"]axios['"]/, level: "high", category: "covert_network", description: "axios import — network access not declared in skill metadata" },
  { pattern: /require\s*\(\s*['"]node-fetch['"]/, level: "high", category: "covert_network", description: "node-fetch import — network access not declared in skill metadata" },
];

// Python patterns
const PY_PATTERNS: PatternRule[] = [
  // High
  { pattern: /\beval\s*\(/, level: "high", category: "dangerous_pattern", description: "Use of eval() — allows arbitrary code execution" },
  { pattern: /\bexec\s*\(/, level: "high", category: "dangerous_pattern", description: "Use of exec() — allows arbitrary code execution" },
  { pattern: /\bsubprocess\b/, level: "high", category: "dangerous_pattern", description: "subprocess module — can spawn system processes" },
  { pattern: /\bos\.system\s*\(/, level: "high", category: "dangerous_pattern", description: "os.system() — can execute shell commands" },
  { pattern: /\bos\.popen\s*\(/, level: "high", category: "dangerous_pattern", description: "os.popen() — can execute shell commands" },
  { pattern: /[A-Za-z0-9+/]{100,}={0,2}/, level: "high", category: "obfuscation", description: "Long base64-like string — possible obfuscated payload" },
  // Medium
  { pattern: /\bopen\s*\(.+['"w]['"]/, level: "medium", category: "filesystem_write", description: "File write operation detected" },
  { pattern: /\bos\.environ\b/, level: "medium", category: "env_access", description: "Accesses os.environ — may read sensitive environment variables" },
];

const PY_NETWORK_PATTERNS: PatternRule[] = [
  { pattern: /\burllib\b/, level: "high", category: "covert_network", description: "urllib usage — network access not declared in skill metadata" },
  { pattern: /\brequests\.(get|post|put|delete|patch)\s*\(/, level: "high", category: "covert_network", description: "requests HTTP call — network access not declared in skill metadata" },
  { pattern: /\bhttpx\b/, level: "high", category: "covert_network", description: "httpx usage — network access not declared in skill metadata" },
  { pattern: /\baiohttp\b/, level: "high", category: "covert_network", description: "aiohttp usage — network access not declared in skill metadata" },
];

// Shell patterns
const SH_PATTERNS: PatternRule[] = [
  // High
  { pattern: /\brm\s+-rf\b/, level: "high", category: "dangerous_pattern", description: "rm -rf — destructive file deletion" },
  { pattern: /curl\s+.+\|\s*(bash|sh)\b/, level: "high", category: "dangerous_pattern", description: "curl | bash pattern — remote code execution" },
  { pattern: /wget\s+.+\|\s*(bash|sh)\b/, level: "high", category: "dangerous_pattern", description: "wget | bash pattern — remote code execution" },
  { pattern: /eval\s+['"`]/, level: "high", category: "dangerous_pattern", description: "eval in shell — dynamic code execution" },
  { pattern: /\bdd\s+if=.+of=/, level: "high", category: "dangerous_pattern", description: "dd command — can overwrite disk blocks" },
  // Medium
  { pattern: /^\s*(?!set\s+-e)/, level: "medium", category: "shell_safety", description: "Shell script does not start with 'set -e' — errors may be silently ignored" },
];

const SH_NETWORK_PATTERNS: PatternRule[] = [
  { pattern: /\bcurl\b/, level: "high", category: "covert_network", description: "curl usage — network access not declared in skill metadata" },
  { pattern: /\bwget\b/, level: "high", category: "covert_network", description: "wget usage — network access not declared in skill metadata" },
  { pattern: /\bnc\b|\bnetcat\b/, level: "high", category: "covert_network", description: "netcat usage — network access not declared in skill metadata" },
];

// Known supply-chain compromised packages
const RISKY_NPM_PACKAGES = new Set([
  "node-ipc",
  "peacenotwar",
  "colors",   // was compromised in 2022
  "faker",    // was intentionally broken
  "event-stream", // was compromised in 2018
]);

// ── File scanning helpers ──────────────────────────────────────────────────────

function scanLines(
  content: string,
  rules: PatternRule[],
  filePath: string,
): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  const lines = content.split("\n");
  for (const rule of rules) {
    for (let i = 0; i < lines.length; i++) {
      if (rule.pattern.test(lines[i])) {
        findings.push({
          level: rule.level,
          category: rule.category,
          file: filePath,
          line: i + 1,
          description: rule.description,
        });
        break; // one finding per rule per file
      }
    }
  }
  return findings;
}

function scanScript(absolutePath: string, relPath: string, networkDeclared: boolean): SecurityFinding[] {
  let content: string;
  try {
    content = readFileSync(absolutePath, "utf-8");
  } catch {
    return [];
  }

  const ext = absolutePath.split(".").pop() ?? "";
  const findings: SecurityFinding[] = [];

  if (ext === "js" || ext === "cjs" || ext === "ts") {
    findings.push(...scanLines(content, JS_PATTERNS, relPath));
    if (!networkDeclared) {
      findings.push(...scanLines(content, JS_NETWORK_PATTERNS, relPath));
    }
  } else if (ext === "py") {
    findings.push(...scanLines(content, PY_PATTERNS, relPath));
    if (!networkDeclared) {
      findings.push(...scanLines(content, PY_NETWORK_PATTERNS, relPath));
    }
  } else if (ext === "sh") {
    findings.push(...scanLines(content, SH_PATTERNS, relPath));
    if (!networkDeclared) {
      findings.push(...scanLines(content, SH_NETWORK_PATTERNS, relPath));
    }
  }

  return findings;
}

function scanSkillMeta(skillDir: string, relSkillDir: string): { findings: SecurityFinding[]; networkDeclared: boolean } {
  const skillMdPath = join(skillDir, "SKILL.md");
  const findings: SecurityFinding[] = [];
  let networkDeclared = false;

  if (!existsSync(skillMdPath)) return { findings, networkDeclared };

  const content = readFileSync(skillMdPath, "utf-8");
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fmMatch) return { findings, networkDeclared };

  let fm: Record<string, unknown>;
  try {
    fm = parseYaml(fmMatch[1]) as Record<string, unknown>;
  } catch {
    findings.push({
      level: "medium",
      category: "malformed_metadata",
      file: `${relSkillDir}/SKILL.md`,
      description: "SKILL.md frontmatter could not be parsed as YAML",
    });
    return { findings, networkDeclared };
  }

  if (fm.network === true) {
    networkDeclared = true;
    findings.push({
      level: "medium",
      category: "network_access",
      file: `${relSkillDir}/SKILL.md`,
      description: "Skill declares network: true — scripts may make outbound network requests",
    });
  }

  const declaredSecrets = fm.secrets as string[] | undefined;
  if (Array.isArray(declaredSecrets) && declaredSecrets.length > 0) {
    for (const secret of declaredSecrets) {
      findings.push({
        level: "medium",
        category: "secret_access",
        file: `${relSkillDir}/SKILL.md`,
        description: `Skill requests access to secret: ${secret}`,
      });
    }
  }

  return { findings, networkDeclared };
}

function scanPackageJson(dir: string, relDir: string): SecurityFinding[] {
  const pkgPath = join(dir, "package.json");
  if (!existsSync(pkgPath)) return [];

  const findings: SecurityFinding[] = [];
  let pkg: Record<string, unknown>;
  try {
    pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as Record<string, unknown>;
  } catch {
    return [];
  }

  const deps: string[] = [
    ...Object.keys((pkg.dependencies as Record<string, unknown>) ?? {}),
    ...Object.keys((pkg.devDependencies as Record<string, unknown>) ?? {}),
  ];

  for (const dep of deps) {
    if (RISKY_NPM_PACKAGES.has(dep)) {
      findings.push({
        level: "high",
        category: "risky_dependency",
        file: `${relDir}/package.json`,
        description: `Dependency "${dep}" has a known supply chain security incident`,
      });
    }
  }

  if (deps.length > 50) {
    findings.push({
      level: "medium",
      category: "large_dependency_tree",
      file: `${relDir}/package.json`,
      description: `Large number of dependencies (${deps.length}) — increases supply chain attack surface`,
    });
  }

  return findings;
}

// ── Public API ─────────────────────────────────────────────────────────────────

function maxLevel(a: SecurityLevel, b: SecurityLevel): SecurityLevel {
  const rank: Record<SecurityLevel, number> = { low: 0, medium: 1, high: 2 };
  return rank[a] >= rank[b] ? a : b;
}

export function scanPackage(packageDir: string): SecurityReport {
  const findings: SecurityFinding[] = [];
  let scannedFiles = 0;

  const skillsDir = join(packageDir, "skills");
  if (existsSync(skillsDir)) {
    const entries = readdirSync(skillsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skillDir = join(skillsDir, entry.name);
      const relSkillDir = join("skills", entry.name);

      // Scan SKILL.md metadata
      const { findings: metaFindings, networkDeclared } = scanSkillMeta(skillDir, relSkillDir);
      findings.push(...metaFindings);

      // Scan scripts
      const scriptsDir = join(skillDir, "scripts");
      if (existsSync(scriptsDir)) {
        const scripts = readdirSync(scriptsDir).filter((f) =>
          /\.(js|cjs|ts|py|sh)$/.test(f),
        );
        for (const script of scripts) {
          const absPath = join(scriptsDir, script);
          const relPath = relative(packageDir, absPath);
          findings.push(...scanScript(absPath, relPath, networkDeclared));
          scannedFiles++;
        }

        // Scan package.json if present in scripts dir
        findings.push(...scanPackageJson(scriptsDir, relative(packageDir, scriptsDir)));
      }
    }
  }

  // Check pipeline.yaml for anything unusual (future expansion point)
  const pipelinePath = join(packageDir, "pipeline.yaml");
  if (existsSync(pipelinePath)) {
    scannedFiles++;
    // (placeholder — currently pipeline.yaml is trusted as structural metadata)
  }

  const overallLevel = findings.reduce<SecurityLevel>(
    (acc, f) => maxLevel(acc, f.level),
    "low",
  );

  return {
    level: overallLevel,
    findings,
    scannedFiles,
    scannedAt: new Date().toISOString(),
  };
}
