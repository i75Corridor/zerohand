import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "@mariozechner/pi-ai";
import { eq, asc } from "drizzle-orm";
import { pipelines, pipelineSteps, mcpServers } from "@zerohand/db";
import type { AgentToolContext } from "./context.js";
import { loadSkillDef } from "../skill-loader.js";

export interface ValidationError {
  type:
    | "missing_skill"
    | "invalid_template"
    | "broken_step_ref"
    | "schema_mismatch"
    | "missing_mcp_server"
    | "missing_secret";
  stepIndex?: number;
  field: string;
  message: string;
  severity: "error" | "warning";
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

export async function validatePipeline(
  pipelineId: string,
  ctx: AgentToolContext,
): Promise<ValidationResult> {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  const pipeline = await ctx.db.query.pipelines.findFirst({ where: eq(pipelines.id, pipelineId) });
  if (!pipeline) {
    errors.push({ type: "missing_skill", field: "pipeline", message: "Pipeline not found.", severity: "error" });
    return { valid: false, errors, warnings };
  }

  const steps = await ctx.db.query.pipelineSteps.findMany({
    where: eq(pipelineSteps.pipelineId, pipelineId),
    orderBy: [asc(pipelineSteps.stepIndex)],
  });

  const inputProps = (pipeline.inputSchema as Record<string, unknown> | null)?.properties as
    | Record<string, unknown>
    | undefined;

  // Load all enabled MCP server names for cross-referencing
  const enabledMcpServers = await ctx.db.query.mcpServers.findMany({
    where: eq(mcpServers.enabled, true),
  });
  const enabledMcpNames = new Set(enabledMcpServers.map((s) => s.name));

  const TOKEN_RE = /\{\{([^}]+)\}\}/g;

  for (const step of steps) {
    const si = step.stepIndex;

    // Check skill exists
    if (!step.skillName) {
      errors.push({
        type: "missing_skill",
        stepIndex: si,
        field: "skillName",
        message: `Step ${si} has no skill assigned.`,
        severity: "error",
      });
    } else {
      const skill = loadSkillDef(step.skillName, ctx.skillsDir);
      if (!skill) {
        errors.push({
          type: "missing_skill",
          stepIndex: si,
          field: "skillName",
          message: `Skill not found: "${step.skillName}"`,
          severity: "error",
        });
      } else {
        // Check MCP servers referenced by this skill
        for (const mcpName of skill.mcpServers ?? []) {
          if (!enabledMcpNames.has(mcpName)) {
            errors.push({
              type: "missing_mcp_server",
              stepIndex: si,
              field: "mcpServers",
              message: `Skill "${step.skillName}" references MCP server "${mcpName}" which is not registered or not enabled.`,
              severity: "error",
            });
          }
        }

        // Check secrets exist
        for (const key of skill.secrets ?? []) {
          if (!process.env[key]) {
            warnings.push({
              type: "missing_secret",
              stepIndex: si,
              field: "secrets",
              message: `Skill "${step.skillName}" requires env var "${key}" which is not set.`,
              severity: "warning",
            });
          }
        }
      }
    }

    // Check template tokens in promptTemplate
    const template = step.promptTemplate ?? "";
    let match: RegExpExecArray | null;
    TOKEN_RE.lastIndex = 0;
    while ((match = TOKEN_RE.exec(template)) !== null) {
      const path = match[1].trim();
      const parts = path.split(".");

      if (parts[0] === "input" && parts.length === 2) {
        if (inputProps && !inputProps[parts[1]]) {
          errors.push({
            type: "schema_mismatch",
            stepIndex: si,
            field: "promptTemplate",
            message: `Token "{{${path}}}" references input field "${parts[1]}" not defined in inputSchema.`,
            severity: "error",
          });
        }
      } else if (parts[0] === "steps" && parts.length >= 3) {
        const refIdx = parseInt(parts[1], 10);
        if (isNaN(refIdx) || refIdx >= si) {
          errors.push({
            type: "broken_step_ref",
            stepIndex: si,
            field: "promptTemplate",
            message: `Token "{{${path}}}" references step ${refIdx}, which does not precede step ${si}.`,
            severity: "error",
          });
        }
      } else if (parts[0] === "secret") {
        // secrets warnings already handled above
      } else if (parts[0] === "context") {
        warnings.push({
          type: "invalid_template",
          stepIndex: si,
          field: "promptTemplate",
          message: `Token "{{${path}}}" uses "context" — ensure the pipeline has this context key set.`,
          severity: "warning",
        });
      } else if (parts[0] !== "input" && parts[0] !== "steps" && parts[0] !== "secret" && parts[0] !== "context") {
        warnings.push({
          type: "invalid_template",
          stepIndex: si,
          field: "promptTemplate",
          message: `Unknown template token: "{{${path}}}"`,
          severity: "warning",
        });
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export function makeValidatePipeline(ctx: AgentToolContext): ToolDefinition {
  return {
    name: "validate_pipeline",
    label: "Validate Pipeline",
    description:
      "Run a fast validation pass on a pipeline. Checks that all skills exist on disk, MCP servers are registered, template tokens resolve correctly, and required env vars are present. Returns errors (blocking) and warnings (non-blocking).",
    parameters: Type.Object({
      pipelineId: Type.String({ description: "The pipeline ID to validate." }),
    }),
    execute: async (_id, params: { pipelineId: string }) => {
      const result = await validatePipeline(params.pipelineId, ctx);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        details: {},
      };
    },
  };
}
