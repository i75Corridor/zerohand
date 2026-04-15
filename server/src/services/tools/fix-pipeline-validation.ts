import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "@mariozechner/pi-ai";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { eq, asc } from "drizzle-orm";
import { pipelineSteps } from "@pawn/db";
import type { ApiValidationError } from "@pawn/shared";
import type { AgentToolContext } from "./context.js";
import { validatePipeline } from "./validate-pipeline.js";
import { loadSkillDef } from "../skill-loader.js";
import { safeSkillDir, buildSkillMd } from "./skill-utils.js";
import type { SkillSchemaField } from "./skill-utils.js";

interface AutoFixed {
  type: string;
  stepIndex?: number;
  description: string;
}

interface Remaining {
  severity: "error" | "warning";
  type: string;
  stepIndex?: number;
  message: string;
  suggestion: string;
}

/**
 * Enable bash on a skill in-place, preserving all other frontmatter.
 * Returns a description of the change, or null on failure.
 */
function enableBash(skillName: string, skillsDir: string): string | null {
  const skillDir = safeSkillDir(skillName, skillsDir);
  if (!skillDir) return null;
  const skillPath = join(skillDir, "SKILL.md");
  if (!existsSync(skillPath)) return null;

  const existing = readFileSync(skillPath, "utf-8");
  const fmMatch = existing.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)/);
  if (!fmMatch) return null;

  let fm: Record<string, unknown>;
  try { fm = parseYaml(fmMatch[1]) as Record<string, unknown>; } catch { return null; }

  if (fm.bash === true) return null; // already enabled

  const body = fmMatch[2].trim();

  function parseSchema(raw: unknown): SkillSchemaField[] | undefined {
    if (!Array.isArray(raw)) return undefined;
    return (raw as Array<Record<string, unknown>>).map((p) => ({
      name: String(p.name ?? ""),
      type: (p.type as SkillSchemaField["type"]) ?? "string",
      description: p.description !== undefined ? String(p.description) : undefined,
      required: Boolean(p.required ?? false),
    }));
  }

  const slashIdx = skillName.indexOf("/");
  const baseName = slashIdx > -1 ? skillName.slice(slashIdx + 1) : skillName;
  const existingMeta = (fm.metadata as Record<string, string> | undefined) ?? {};

  const content = buildSkillMd({
    name: baseName,
    description: String(fm.description ?? ""),
    body,
    model: fm.model as string | undefined,
    network: fm.network as boolean | undefined,
    bash: true,
    secrets: fm.secrets as string[] | undefined,
    mcpServers: fm.mcpServers as string[] | undefined,
    license: fm.license as string | undefined,
    compatibility: fm.compatibility as string | undefined,
    allowedTools: fm["allowed-tools"] as string | undefined,
    metadata: existingMeta,
    inputSchema: parseSchema(fm.inputSchema),
    outputSchema: parseSchema(fm.outputSchema),
  });

  writeFileSync(skillPath, content, "utf-8");
  return `Enabled bash: true on skill "${skillName}"`;
}

/**
 * Build a human-readable suggestion for a validation issue.
 * Loads step/skill context from the pipeline steps array.
 */
function buildSuggestion(
  issue: ApiValidationError,
  steps: Array<{ stepIndex: number; skillName: string | null; promptTemplate: string | null }>,
  skillsDir: string,
): string {
  const { type, stepIndex, message } = issue;

  switch (type) {
    case "missing_skill": {
      if (issue.field === "skillName") {
        const step = steps.find((s) => s.stepIndex === stepIndex);
        if (!step?.skillName) return "Assign a skill to this step using update_pipeline_step.";
        return `Skill "${step.skillName}" does not exist on disk. Use create_skill to create it, or update_pipeline_step to assign a different skill.`;
      }
      return "Check that the pipeline ID is correct.";
    }

    case "schema_mismatch": {
      // Extract token path from message: Token "{{steps.N.output.field}}"
      const tokenMatch = message.match(/Token "\{\{(steps\.\d+\.output\.[\w.]+)\}\}"/);
      if (tokenMatch) {
        const parts = tokenMatch[1].split(".");
        const refIdx = parseInt(parts[1], 10); // 1-based token index
        const fieldName = parts.slice(3).join(".");
        const mappedStepIdx = refIdx >= 1 ? refIdx - 1 : 0;
        const referencedStep = steps.find((s) => s.stepIndex === mappedStepIdx);
        const referencedSkill = referencedStep?.skillName ?? null;

        // Check if another step already has this field in its outputSchema
        const alternateStepIdx = stepIndex !== undefined ? stepIndex : steps.length;
        const alternates: string[] = [];
        for (const s of steps) {
          if (s.stepIndex >= alternateStepIdx) continue;
          if (s.stepIndex === mappedStepIdx) continue;
          if (!s.skillName) continue;
          const sk = loadSkillDef(s.skillName, skillsDir);
          if (sk?.outputSchema?.some((f) => f.name === fieldName)) {
            alternates.push(`{{steps.${s.stepIndex + 1}.output.${fieldName}}} (from ${s.skillName})`);
          }
        }

        const parts2: string[] = [];
        if (referencedSkill) {
          parts2.push(`Option A: Add field "${fieldName}" to the outputSchema of skill "${referencedSkill}" using update_skill (so it explicitly declares this output).`);
        }
        if (alternates.length > 0) {
          parts2.push(`Option B: The field "${fieldName}" is already declared in another prior step — change the token to: ${alternates.join(" or ")}.`);
        }
        if (parts2.length === 0) {
          parts2.push(`The field "${fieldName}" is not declared in any prior step's outputSchema. Either add it to skill "${referencedSkill ?? "unknown"}" via update_skill, or remove this token reference.`);
        }
        return parts2.join(" ");
      }
      // input schema mismatch
      const inputMatch = message.match(/input field "(\w+)"/);
      if (inputMatch) {
        return `Add field "${inputMatch[1]}" to the pipeline's inputSchema using update_pipeline, or remove the {{input.${inputMatch[1]}}} reference from the prompt template.`;
      }
      return "Review the prompt template tokens and ensure they reference valid fields from prior steps.";
    }

    case "broken_step_ref": {
      const numMatch = message.match(/references step (\d+)/);
      const currentStep = stepIndex !== undefined ? stepIndex + 1 : "?";
      const maxValid = stepIndex !== undefined ? stepIndex : 0;
      return `Update the prompt template of step ${currentStep} to reference a step between 1 and ${maxValid} (1-based). ${numMatch ? `Token references step ${numMatch[1]} which does not exist or is not a prior step.` : ""}`;
    }

    case "missing_mcp_server": {
      const nameMatch = message.match(/MCP server "([^"]+)"/);
      return nameMatch
        ? `Register or enable MCP server "${nameMatch[1]}" in Settings → MCP Servers, or remove it from the skill's mcpServers frontmatter using update_skill.`
        : "Register the required MCP server in Settings → MCP Servers.";
    }

    case "missing_secret": {
      const keyMatch = message.match(/env var "([^"]+)"/);
      return keyMatch
        ? `Set the environment variable "${keyMatch[1]}" in your server's .env file or system environment, then restart the server.`
        : "Set the required environment variable and restart the server.";
    }

    case "missing_model": {
      const providerMatch = message.match(/provider "([^"]+)"/);
      return providerMatch
        ? `Add an API key for provider "${providerMatch[1]}" in Settings → Providers, or update the skill to use a different model with update_skill.`
        : "Add the required API key in Settings → Providers.";
    }

    case "bash_not_enabled": {
      const skillMatch = message.match(/Skill "([^"]+)"/);
      return skillMatch
        ? `Run fix_pipeline_validation again — this should have been auto-fixed. Alternatively, call update_skill on "${skillMatch[1]}" and add bash: true to the frontmatter.`
        : "Enable bash: true on the skill using update_skill.";
    }

    default:
      return "Review the error message and apply the appropriate fix using update_pipeline_step or update_skill.";
  }
}

export function makeFixPipelineValidation(ctx: AgentToolContext): ToolDefinition {
  return {
    name: "fix_pipeline_validation",
    label: "Fix Pipeline Validation",
    description:
      "Validates a pipeline, auto-fixes unambiguous issues (bash not enabled), and returns specific suggestions for every remaining error and warning — including which tool to call and with what arguments.",
    parameters: Type.Object({
      pipelineId: Type.String({ description: "The pipeline ID to validate and fix." }),
    }),
    execute: async (_id, params: { pipelineId: string }) => {
      const steps = await ctx.db.query.pipelineSteps.findMany({
        where: eq(pipelineSteps.pipelineId, params.pipelineId),
        orderBy: [asc(pipelineSteps.stepIndex)],
        columns: { stepIndex: true, skillName: true, promptTemplate: true },
      });

      // First pass: validate
      const initial = await validatePipeline(params.pipelineId, ctx);
      const allIssues = [...initial.errors, ...initial.warnings];

      const autoFixed: AutoFixed[] = [];
      const handledKeys = new Set<string>();

      // Auto-fix: bash_not_enabled
      for (const issue of allIssues) {
        if (issue.type !== "bash_not_enabled" || issue.stepIndex === undefined) continue;
        const step = steps.find((s) => s.stepIndex === issue.stepIndex);
        if (!step?.skillName) continue;
        const result = enableBash(step.skillName, ctx.skillsDir);
        if (result) {
          ctx.broadcastDataChanged("skill", "updated", step.skillName);
          autoFixed.push({ type: "bash_not_enabled", stepIndex: issue.stepIndex, description: result });
          handledKeys.add(`bash_not_enabled:${issue.stepIndex}`);
        }
      }

      // Re-validate after auto-fixes
      const final = await validatePipeline(params.pipelineId, ctx);
      const remaining: Remaining[] = [];

      for (const issue of [...final.errors, ...final.warnings]) {
        remaining.push({
          severity: issue.severity,
          type: issue.type,
          stepIndex: issue.stepIndex !== undefined ? issue.stepIndex + 1 : undefined, // 1-based for display
          message: issue.message,
          suggestion: buildSuggestion(issue, steps, ctx.skillsDir),
        });
      }

      const summary = [
        autoFixed.length > 0
          ? `Auto-fixed ${autoFixed.length} issue${autoFixed.length !== 1 ? "s" : ""}: ${autoFixed.map((f) => f.description).join("; ")}.`
          : "No issues were auto-fixed.",
        remaining.length === 0
          ? "Pipeline is now valid — no remaining issues."
          : `${remaining.filter((r) => r.severity === "error").length} error(s) and ${remaining.filter((r) => r.severity === "warning").length} warning(s) remain.`,
      ].join(" ");

      const report = { summary, autoFixed, remaining, valid: final.valid };
      return {
        content: [{ type: "text" as const, text: JSON.stringify(report, null, 2) }],
        details: {},
      };
    },
  };
}
