import {
  ModelRegistry,
  SessionManager,
  createAgentSession,
  createExtensionRuntime,
  type AgentSession,
  type ToolDefinition,
} from "@mariozechner/pi-coding-agent";
import { getModel, Type } from "@mariozechner/pi-ai";
import { eq, desc, gte, and, count, sql } from "drizzle-orm";
import { join, resolve, sep } from "node:path";
import { mkdirSync, rmSync, existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import type { Db } from "@zerohand/db";
import { pipelines, pipelineRuns, pipelineSteps, stepRuns, costEvents } from "@zerohand/db";
import type { WsGlobalAgentEvent, WsDataChanged, WsIncomingGlobalChat } from "@zerohand/shared";
import { makeAuthStorage, makeResourceLoader } from "./pi-executor.js";
import { readModelSetting } from "./model-utils.js";

const SYSTEM_PROMPT = `You are the Zerohand assistant — the operator's AI copilot for managing an agentic workflow orchestration system.

## Concepts
- **Pipeline**: an orchestration graph of sequential steps executed in order. Each step references a skill by name. Has a name, input schema, a top-level model, and a system prompt shared across all steps.
- **Skill**: a folder in SKILLS_DIR containing a SKILL.md file (YAML frontmatter + system prompt body) and an optional scripts/ directory of executable tools. Skills are the primary unit of execution — pipelines compose them.

## Capabilities
- **Pipelines**: list, create, edit, delete; add/update/remove steps
- **Skills**: list, read, create, update (writes SKILL.md to disk)
- **Runs**: trigger, cancel, check status and recent history
- **Navigation**: navigate the UI to any page

When creating a skill, write a focused system prompt body that clearly defines the skill's role, input expectations, and output format — this is what the LLM sees at runtime.

When the user's message includes context about which page they are viewing, use that to provide relevant assistance. After making changes, offer to navigate to the relevant page.

Be concise and action-oriented. Use your tools — don't ask permission, just do it. Confirm briefly what you did.`;

export class GlobalAgentService {
  private session: AgentSession | null = null;
  private sessionDir: string;
  private cancelRunFn: ((runId: string) => void) | null = null;

  constructor(
    private db: Db,
    private broadcastFn: (msg: WsGlobalAgentEvent | WsDataChanged) => void,
    dataDir: string,
  ) {
    this.sessionDir = join(dataDir, "global-agent");
    mkdirSync(this.sessionDir, { recursive: true });
  }

  setCancelRunFn(fn: (runId: string) => void): void {
    this.cancelRunFn = fn;
  }

  async handleMessage(
    action: string,
    message?: string,
    context?: WsIncomingGlobalChat["context"],
  ): Promise<void> {
    if (action === "reset") {
      await this.destroySession();
      this.broadcastFn({ type: "global_agent_event", eventType: "status_change", message: "reset" });
      return;
    }

    if (action === "abort") {
      if (this.session) {
        await this.session.abort();
      }
      return;
    }

    if (action === "prompt" && message) {
      const session = await this.ensureSession();
      let fullMessage = message;

      // Inject context block
      if (context?.path) {
        let contextLines = `[Context: viewing ${context.path}`;
        if (context.pipelineId) {
          // Try to fetch pipeline name for better context
          try {
            const p = await this.db.query.pipelines.findFirst({ where: eq(pipelines.id, context.pipelineId) });
            if (p) contextLines += ` — pipeline "${p.name}" (id: ${p.id})`;
          } catch { /* ignore */ }
        }
        if (context.runId) contextLines += ` — run id: ${context.runId}`;
        contextLines += "]";
        fullMessage = `${contextLines}\n\n${message}`;
      }

      try {
        await session.prompt(fullMessage);
      } catch (err) {
        this.broadcastFn({
          type: "global_agent_event",
          eventType: "error",
          message: String(err),
        });
      } finally {
        this.broadcastFn({ type: "global_agent_event", eventType: "status_change", message: "done" });
      }
    }
  }

  private broadcastDataChanged(entity: WsDataChanged["entity"], action: WsDataChanged["action"], id: string): void {
    this.broadcastFn({ type: "data_changed", entity, action, id });
  }

  private async ensureSession(): Promise<AgentSession> {
    if (this.session) return this.session;

    const { provider, modelId } = await readModelSetting(this.db, "agent_model", "google/gemini-2.5-flash");
    const model = getModel(provider as any, modelId as any);
    if (!model) throw new Error(`Model not found: ${provider}/${modelId}`);

    const authStorage = makeAuthStorage();
    const modelRegistry = ModelRegistry.inMemory(authStorage);
    const resourceLoader = makeResourceLoader(SYSTEM_PROMPT, []);
    const sessionManager = SessionManager.create(this.sessionDir);

    const { session } = await createAgentSession({
      model,
      thinkingLevel: "off",
      authStorage,
      modelRegistry,
      resourceLoader,
      tools: [],
      customTools: this.makeTools(),
      sessionManager,
    });

    session.subscribe((event: any) => {
      if (event.type !== "message_update") return;
      const ae = event.assistantMessageEvent;
      if (!ae) return;

      if (ae.type === "text_delta") {
        this.broadcastFn({
          type: "global_agent_event",
          eventType: "text_delta",
          message: ae.delta as string,
        });
      } else if (ae.type === "tool_use") {
        this.broadcastFn({
          type: "global_agent_event",
          eventType: "tool_call_start",
          message: ae.name as string,
          payload: { toolName: ae.name, input: ae.input ?? {} },
        });
      } else if (ae.type === "tool_result") {
        this.broadcastFn({
          type: "global_agent_event",
          eventType: "tool_call_end",
          payload: { toolCallId: ae.tool_use_id as string },
        });
      }
    });

    this.session = session;
    return session;
  }

  async resetSession(): Promise<void> {
    await this.destroySession();
  }

  private async destroySession(): Promise<void> {
    if (this.session) {
      try { await this.session.abort(); } catch { /* ignore */ }
      this.session = null;
    }
    // Remove session files so next session starts fresh
    if (existsSync(this.sessionDir)) {
      rmSync(this.sessionDir, { recursive: true, force: true });
      mkdirSync(this.sessionDir, { recursive: true });
    }
  }

  private makeTools(): ToolDefinition[] {
    const db = this.db;
    const broadcast = this.broadcastFn.bind(this);

    const list_pipelines: ToolDefinition = {
      name: "list_pipelines",
      label: "List Pipelines",
      description: "List all pipelines in the system with their step counts and status.",
      parameters: Type.Object({}),
      execute: async () => {
        const rows = await db.select().from(pipelines);
        const withSteps = await Promise.all(
          rows.map(async (p) => {
            const steps = await db
              .select({ count: count() })
              .from(pipelineSteps)
              .where(eq(pipelineSteps.pipelineId, p.id));
            return {
              id: p.id,
              name: p.name,
              description: p.description,
              status: p.status,
              stepCount: steps[0]?.count ?? 0,
            };
          }),
        );
        return { content: [{ type: "text" as const, text: JSON.stringify(withSteps, null, 2) }], details: {} };
      },
    };

    const trigger_pipeline: ToolDefinition = {
      name: "trigger_pipeline",
      label: "Trigger Pipeline",
      description: "Trigger a pipeline run with optional input parameters. Returns the run ID.",
      parameters: Type.Object({
        pipelineId: Type.String({ description: "The pipeline ID to run" }),
        inputParams: Type.Optional(Type.Record(Type.String(), Type.Unknown(), { description: "Input parameters for the pipeline" })),
      }),
      execute: async (_id, params: { pipelineId: string; inputParams?: Record<string, unknown> }) => {
        const [run] = await db
          .insert(pipelineRuns)
          .values({
            pipelineId: params.pipelineId,
            inputParams: params.inputParams ?? {},
            triggerType: "manual",
          })
          .returning();
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({ runId: run.id, status: "queued", message: "Run created and queued for execution." }, null, 2),
          }],
          details: {},
        };
      },
    };

    const cancel_run: ToolDefinition = {
      name: "cancel_run",
      label: "Cancel Run",
      description: "Cancel an active pipeline run.",
      parameters: Type.Object({
        runId: Type.String({ description: "The pipeline run ID to cancel" }),
      }),
      execute: async (_id, params: { runId: string }) => {
        if (this.cancelRunFn) this.cancelRunFn(params.runId);
        await db
          .update(pipelineRuns)
          .set({ status: "cancelled", finishedAt: new Date(), updatedAt: new Date() })
          .where(eq(pipelineRuns.id, params.runId));
        return { content: [{ type: "text" as const, text: `Run ${params.runId} has been cancelled.` }], details: {} };
      },
    };

    const list_recent_runs: ToolDefinition = {
      name: "list_recent_runs",
      label: "List Recent Runs",
      description: "List recent pipeline runs, optionally filtered by pipeline.",
      parameters: Type.Object({
        limit: Type.Optional(Type.Number({ description: "Max results (default 10)" })),
        pipelineId: Type.Optional(Type.String({ description: "Filter by pipeline ID" })),
      }),
      execute: async (_id, params: { limit?: number; pipelineId?: string }) => {
        const limit = params.limit ?? 10;
        const rows = await db.query.pipelineRuns.findMany({
          where: params.pipelineId ? eq(pipelineRuns.pipelineId, params.pipelineId) : undefined,
          orderBy: [desc(pipelineRuns.createdAt)],
          limit,
          with: { pipeline: { columns: { name: true } } } as any,
        });
        const result = rows.map((r: any) => ({
          id: r.id,
          pipelineName: r.pipeline?.name ?? r.pipelineId,
          status: r.status,
          triggerType: r.triggerType,
          createdAt: r.createdAt,
          finishedAt: r.finishedAt,
        }));
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }], details: {} };
      },
    };

    const get_run_status: ToolDefinition = {
      name: "get_run_status",
      label: "Get Run Status",
      description: "Get detailed status of a specific pipeline run including all steps.",
      parameters: Type.Object({
        runId: Type.String({ description: "The pipeline run ID" }),
      }),
      execute: async (_id, params: { runId: string }) => {
        const run = await db.query.pipelineRuns.findFirst({
          where: eq(pipelineRuns.id, params.runId),
        });
        if (!run) return { content: [{ type: "text" as const, text: `Run ${params.runId} not found.` }], details: {} };
        const steps = await db
          .select()
          .from(stepRuns)
          .where(eq(stepRuns.pipelineRunId, params.runId))
          .orderBy(stepRuns.stepIndex);
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              run: { id: run.id, status: run.status, error: run.error, createdAt: run.createdAt, finishedAt: run.finishedAt },
              steps: steps.map((s) => ({ stepIndex: s.stepIndex, status: s.status, error: s.error })),
            }, null, 2),
          }],
          details: {},
        };
      },
    };

    const get_system_stats: ToolDefinition = {
      name: "get_system_stats",
      label: "Get System Stats",
      description: "Get system statistics: runs this month, active runs, and total cost this month.",
      parameters: Type.Object({}),
      execute: async () => {
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

        const [runsThisMonth] = await db
          .select({ count: count() })
          .from(pipelineRuns)
          .where(gte(pipelineRuns.createdAt, monthStart));

        const [activeRuns] = await db
          .select({ count: count() })
          .from(pipelineRuns)
          .where(
            sql`${pipelineRuns.status} IN ('running', 'queued', 'paused')`,
          );

        const [costResult] = await db
          .select({ total: sql<number>`coalesce(sum(${costEvents.costCents}), 0)` })
          .from(costEvents)
          .where(gte(costEvents.occurredAt, monthStart));

        const result = {
          runsThisMonth: runsThisMonth?.count ?? 0,
          activeRuns: activeRuns?.count ?? 0,
          costCentsThisMonth: Number(costResult?.total ?? 0),
          costDollarsThisMonth: (Number(costResult?.total ?? 0) / 100).toFixed(2),
        };
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }], details: {} };
      },
    };

    const navigate_ui: ToolDefinition = {
      name: "navigate_ui",
      label: "Navigate UI",
      description: "Navigate the user's browser to a specific page in the UI. Valid paths: /dashboard, /pipelines, /pipelines/:id, /pipelines/:id/edit, /pipelines/new, /workers, /approvals, /settings, /runs/:id",
      parameters: Type.Object({
        path: Type.String({ description: "The UI path to navigate to (e.g. /dashboard, /pipelines/abc123)" }),
      }),
      execute: async (_id, params: { path: string }) => {
        broadcast({ type: "global_agent_event", eventType: "navigate", payload: { path: params.path } });
        return { content: [{ type: "text" as const, text: `Navigating to ${params.path}` }], details: {} };
      },
    };

    // ── Pipeline editing tools ────────────────────────────────────────────────

    const get_pipeline_detail: ToolDefinition = {
      name: "get_pipeline_detail",
      label: "Get Pipeline Detail",
      description: "Get full details for a pipeline including all steps with worker names.",
      parameters: Type.Object({
        pipelineId: Type.String({ description: "The pipeline ID" }),
      }),
      execute: async (_id, params: { pipelineId: string }) => {
        const pipeline = await db.query.pipelines.findFirst({ where: eq(pipelines.id, params.pipelineId) });
        if (!pipeline) return { content: [{ type: "text" as const, text: "Pipeline not found." }], details: {} };
        const steps = await db.query.pipelineSteps.findMany({ where: eq(pipelineSteps.pipelineId, params.pipelineId) });
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              id: pipeline.id, name: pipeline.name, description: pipeline.description,
              status: pipeline.status, inputSchema: pipeline.inputSchema,
              steps: steps.map((s) => ({
                id: s.id, stepIndex: s.stepIndex, name: s.name,
                skillName: s.skillName,
                promptTemplate: s.promptTemplate, timeoutSeconds: s.timeoutSeconds,
                approvalRequired: s.approvalRequired,
              })),
            }, null, 2),
          }],
          details: {},
        };
      },
    };

    const create_pipeline: ToolDefinition = {
      name: "create_pipeline",
      label: "Create Pipeline",
      description: "Create a new pipeline.",
      parameters: Type.Object({
        name: Type.String({ description: "Pipeline name" }),
        description: Type.Optional(Type.String({ description: "Pipeline description" })),
        inputSchema: Type.Optional(Type.Record(Type.String(), Type.Unknown(), { description: "JSON Schema for pipeline inputs" })),
      }),
      execute: async (_id, params: { name: string; description?: string; inputSchema?: Record<string, unknown> }) => {
        const [row] = await db.insert(pipelines).values({ name: params.name, description: params.description, inputSchema: params.inputSchema }).returning();
        this.broadcastDataChanged("pipeline", "created", row.id);
        return { content: [{ type: "text" as const, text: JSON.stringify({ id: row.id, name: row.name }, null, 2) }], details: {} };
      },
    };

    const update_pipeline: ToolDefinition = {
      name: "update_pipeline",
      label: "Update Pipeline",
      description: "Update pipeline metadata (name, description, status, input schema).",
      parameters: Type.Object({
        pipelineId: Type.String({ description: "The pipeline ID" }),
        name: Type.Optional(Type.String()),
        description: Type.Optional(Type.String()),
        status: Type.Optional(Type.String()),
        inputSchema: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
      }),
      execute: async (_id, params: { pipelineId: string; name?: string; description?: string; status?: string; inputSchema?: Record<string, unknown> }) => {
        const { pipelineId, ...fields } = params;
        const [row] = await db.update(pipelines).set({ ...fields, updatedAt: new Date() }).where(eq(pipelines.id, pipelineId)).returning();
        if (!row) return { content: [{ type: "text" as const, text: "Pipeline not found." }], details: {} };
        this.broadcastDataChanged("pipeline", "updated", row.id);
        return { content: [{ type: "text" as const, text: `Updated pipeline "${row.name}".` }], details: {} };
      },
    };

    const delete_pipeline: ToolDefinition = {
      name: "delete_pipeline",
      label: "Delete Pipeline",
      description: "Delete a pipeline and all its steps. This cannot be undone.",
      parameters: Type.Object({
        pipelineId: Type.String({ description: "The pipeline ID to delete" }),
      }),
      execute: async (_id, params: { pipelineId: string }) => {
        const deleted = await db.delete(pipelines).where(eq(pipelines.id, params.pipelineId)).returning();
        if (deleted.length === 0) return { content: [{ type: "text" as const, text: "Pipeline not found." }], details: {} };
        this.broadcastDataChanged("pipeline", "deleted", params.pipelineId);
        return { content: [{ type: "text" as const, text: `Deleted pipeline ${params.pipelineId}.` }], details: {} };
      },
    };

    const add_pipeline_step: ToolDefinition = {
      name: "add_pipeline_step",
      label: "Add Pipeline Step",
      description: "Add a new step to a pipeline.",
      parameters: Type.Object({
        pipelineId: Type.String({ description: "The pipeline ID" }),
        name: Type.String({ description: "Step name" }),
        skillName: Type.String({ description: "Skill name for this step" }),
        promptTemplate: Type.String({ description: "Prompt template text" }),
        stepIndex: Type.Number({ description: "Position in the pipeline (0-based)" }),
        timeoutSeconds: Type.Optional(Type.Number({ description: "Timeout in seconds (default 300)" })),
        approvalRequired: Type.Optional(Type.Boolean({ description: "Whether human approval is required before executing (default false)" })),
      }),
      execute: async (_id, params: { pipelineId: string; name: string; skillName: string; promptTemplate: string; stepIndex: number; timeoutSeconds?: number; approvalRequired?: boolean }) => {
        const [row] = await db.insert(pipelineSteps).values({
          pipelineId: params.pipelineId,
          stepIndex: params.stepIndex,
          name: params.name,
          skillName: params.skillName,
          promptTemplate: params.promptTemplate,
          timeoutSeconds: params.timeoutSeconds ?? 300,
          approvalRequired: params.approvalRequired ?? false,
        }).returning();
        this.broadcastDataChanged("step", "created", row.id);
        this.broadcastDataChanged("pipeline", "updated", params.pipelineId);
        return { content: [{ type: "text" as const, text: JSON.stringify({ id: row.id, name: row.name, stepIndex: row.stepIndex }, null, 2) }], details: {} };
      },
    };

    const update_pipeline_step: ToolDefinition = {
      name: "update_pipeline_step",
      label: "Update Pipeline Step",
      description: "Update an existing pipeline step.",
      parameters: Type.Object({
        stepId: Type.String({ description: "The step ID" }),
        name: Type.Optional(Type.String()),
        skillName: Type.Optional(Type.String()),
        promptTemplate: Type.Optional(Type.String()),
        timeoutSeconds: Type.Optional(Type.Number()),
        approvalRequired: Type.Optional(Type.Boolean()),
      }),
      execute: async (_id, params: { stepId: string; name?: string; skillName?: string; promptTemplate?: string; timeoutSeconds?: number; approvalRequired?: boolean }) => {
        const { stepId, ...fields } = params;
        const [row] = await db.update(pipelineSteps).set({ ...fields, updatedAt: new Date() }).where(eq(pipelineSteps.id, stepId)).returning();
        if (!row) return { content: [{ type: "text" as const, text: "Step not found." }], details: {} };
        this.broadcastDataChanged("step", "updated", row.id);
        this.broadcastDataChanged("pipeline", "updated", row.pipelineId);
        return { content: [{ type: "text" as const, text: `Updated step "${row.name}".` }], details: {} };
      },
    };

    const remove_pipeline_step: ToolDefinition = {
      name: "remove_pipeline_step",
      label: "Remove Pipeline Step",
      description: "Remove a step from a pipeline.",
      parameters: Type.Object({
        stepId: Type.String({ description: "The step ID to remove" }),
      }),
      execute: async (_id, params: { stepId: string }) => {
        const deleted = await db.delete(pipelineSteps).where(eq(pipelineSteps.id, params.stepId)).returning();
        if (deleted.length === 0) return { content: [{ type: "text" as const, text: "Step not found." }], details: {} };
        this.broadcastDataChanged("step", "deleted", params.stepId);
        this.broadcastDataChanged("pipeline", "updated", deleted[0].pipelineId);
        return { content: [{ type: "text" as const, text: `Removed step "${deleted[0].name}".` }], details: {} };
      },
    };

    // ── Skill tools (file-based, no DB) ───────────────────────────────────────
    const skillsDir = process.env.SKILLS_DIR ?? join(process.cwd(), "..", "skills");

    function safeSkillDir(skillName: string): string | null {
      const skillDir = join(skillsDir, skillName);
      const resolvedBase = resolve(skillsDir);
      const resolvedTarget = resolve(skillDir);
      if (!resolvedTarget.startsWith(resolvedBase + sep)) return null;
      return skillDir;
    }

    function buildSkillMd(params: {
      name: string;
      description: string;
      type: string;
      model?: string;
      body: string;
      network?: boolean;
    }): string {
      const fm: string[] = [
        `name: ${params.name}`,
        `version: "1.0.0"`,
        `description: "${params.description.replace(/"/g, '\\"')}"`,
        `type: ${params.type}`,
      ];
      if (params.model) fm.push(`model: ${params.model}`);
      if (params.network) fm.push(`network: true`);
      return `---\n${fm.join("\n")}\n---\n${params.body.trim()}\n`;
    }

    const list_skills: ToolDefinition = {
      name: "list_skills",
      label: "List Skills",
      description: "List all available skills in the skills directory.",
      parameters: Type.Object({}),
      execute: async () => {
        if (!existsSync(skillsDir)) return { content: [{ type: "text" as const, text: "[]" }], details: {} };
        const entries = readdirSync(skillsDir, { withFileTypes: true })
          .filter((e) => e.isDirectory())
          .map((e) => {
            const skillPath = join(skillsDir, e.name, "SKILL.md");
            if (!existsSync(skillPath)) return null;
            const content = readFileSync(skillPath, "utf-8");
            const fm = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
            const desc = fm?.[1].match(/description:\s*["']?(.+?)["']?\s*$/m)?.[1] ?? "";
            const type = fm?.[1].match(/type:\s*(\S+)/m)?.[1] ?? "pi";
            const hasScripts = existsSync(join(skillsDir, e.name, "scripts"));
            return { name: e.name, description: desc, type, hasScripts };
          })
          .filter(Boolean);
        return { content: [{ type: "text" as const, text: JSON.stringify(entries, null, 2) }], details: {} };
      },
    };

    const get_skill: ToolDefinition = {
      name: "get_skill",
      label: "Get Skill",
      description: "Read the full SKILL.md content for a skill.",
      parameters: Type.Object({
        skillName: Type.String({ description: "The skill folder name" }),
      }),
      execute: async (_id, params: { skillName: string }) => {
        const skillDir = safeSkillDir(params.skillName);
        if (!skillDir) return { content: [{ type: "text" as const, text: "Invalid skill name." }], details: {} };
        const skillPath = join(skillDir, "SKILL.md");
        if (!existsSync(skillPath)) return { content: [{ type: "text" as const, text: `Skill "${params.skillName}" not found.` }], details: {} };
        return { content: [{ type: "text" as const, text: readFileSync(skillPath, "utf-8") }], details: {} };
      },
    };

    const create_skill: ToolDefinition = {
      name: "create_skill",
      label: "Create Skill",
      description: "Create a new skill by writing a SKILL.md file to the skills directory.",
      parameters: Type.Object({
        skillName: Type.String({ description: "Folder name for the skill (lowercase, hyphens ok)" }),
        description: Type.String({ description: "One-line description of what the skill does" }),
        type: Type.String({ description: "Skill type: pi (LLM agent), imagen, or publish" }),
        body: Type.String({ description: "The system prompt body — the main instructions for this skill" }),
        model: Type.Optional(Type.String({ description: "Model override in provider/name format, e.g. google/gemini-2.5-flash" })),
        network: Type.Optional(Type.Boolean({ description: "Whether scripts in this skill need network access (default false)" })),
      }),
      execute: async (_id, params: { skillName: string; description: string; type: string; body: string; model?: string; network?: boolean }) => {
        const skillDir = safeSkillDir(params.skillName);
        if (!skillDir) return { content: [{ type: "text" as const, text: "Invalid skill name — must not contain path separators." }], details: {} };
        if (existsSync(skillDir)) return { content: [{ type: "text" as const, text: `Skill "${params.skillName}" already exists. Use update_skill to modify it.` }], details: {} };
        mkdirSync(skillDir, { recursive: true });
        const content = buildSkillMd({ name: params.skillName, ...params });
        writeFileSync(join(skillDir, "SKILL.md"), content, "utf-8");
        return { content: [{ type: "text" as const, text: `Created skill "${params.skillName}" at ${skillDir}.` }], details: {} };
      },
    };

    const update_skill: ToolDefinition = {
      name: "update_skill",
      label: "Update Skill",
      description: "Overwrite the SKILL.md for an existing skill. Provide the full new body — partial updates are not supported.",
      parameters: Type.Object({
        skillName: Type.String({ description: "The skill folder name to update" }),
        description: Type.Optional(Type.String({ description: "Updated description" })),
        type: Type.Optional(Type.String({ description: "Updated type: pi, imagen, or publish" })),
        body: Type.String({ description: "The full new system prompt body" }),
        model: Type.Optional(Type.String({ description: "Model override in provider/name format" })),
        network: Type.Optional(Type.Boolean({ description: "Whether scripts need network access" })),
      }),
      execute: async (_id, params: { skillName: string; description?: string; type?: string; body: string; model?: string; network?: boolean }) => {
        const skillDir = safeSkillDir(params.skillName);
        if (!skillDir) return { content: [{ type: "text" as const, text: "Invalid skill name." }], details: {} };
        const skillPath = join(skillDir, "SKILL.md");
        if (!existsSync(skillPath)) return { content: [{ type: "text" as const, text: `Skill "${params.skillName}" not found. Use create_skill to create it.` }], details: {} };

        // Merge: read existing frontmatter for fields not provided
        const existing = readFileSync(skillPath, "utf-8");
        const fm = existing.match(/^---\r?\n([\s\S]*?)\r?\n---/);
        const existingDesc = fm?.[1].match(/description:\s*["']?(.+?)["']?\s*$/m)?.[1] ?? "";
        const existingType = fm?.[1].match(/type:\s*(\S+)/m)?.[1] ?? "pi";

        const content = buildSkillMd({
          name: params.skillName,
          description: params.description ?? existingDesc,
          type: params.type ?? existingType,
          body: params.body,
          model: params.model,
          network: params.network,
        });
        writeFileSync(skillPath, content, "utf-8");
        return { content: [{ type: "text" as const, text: `Updated skill "${params.skillName}".` }], details: {} };
      },
    };

    return [
      list_pipelines,
      trigger_pipeline,
      cancel_run,
      list_recent_runs,
      get_run_status,
      get_system_stats,
      navigate_ui,
      get_pipeline_detail,
      create_pipeline,
      update_pipeline,
      delete_pipeline,
      add_pipeline_step,
      update_pipeline_step,
      remove_pipeline_step,
      list_skills,
      get_skill,
      create_skill,
      update_skill,
    ];
  }
}
