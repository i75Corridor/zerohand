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
import { join } from "node:path";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import type { Db } from "@zerohand/db";
import { pipelines, pipelineRuns, pipelineSteps, workers, stepRuns, costEvents } from "@zerohand/db";
import type { WsGlobalAgentEvent, WsDataChanged, WsIncomingGlobalChat } from "@zerohand/shared";
import { makeAuthStorage, makeResourceLoader } from "./pi-executor.js";

const SYSTEM_PROMPT = `You are the Zerohand assistant — the operator's AI copilot for managing an agentic workflow orchestration system.

## Concepts
- **Pipeline**: an orchestration graph of sequential steps, each referencing a worker. Defines what happens and in what order. Has a name, input schema, and ordered steps.
- **Worker**: a configured AI agent or processor. Defines who does the work. Has a model, system prompt, skills, and budget. Types: pi (LLM), imagen (image generation), publish (markdown writer), function, api.
- **Skill**: a reusable capability definition (SKILL.md files on disk) assigned to workers by name.

## Capabilities
You can list, create, edit, and delete pipelines, steps, and workers. You can trigger and cancel runs, check status and stats, and navigate the UI.

When the user's message includes context about which page they are viewing, use that to provide relevant assistance — e.g. if they are on a pipeline page and say "add a step", you know which pipeline to edit. After making changes, offer to navigate to the relevant page.

Be concise and action-oriented. Use your tools — don't ask permission to do things, just do them. Confirm what you did briefly.`;

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
        if (context.workerId) contextLines += ` — worker id: ${context.workerId}`;
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

    const model = getModel("google" as any, "gemini-2.5-flash" as any);
    if (!model) throw new Error("Model not found: google/gemini-2.5-flash");

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

    const list_workers: ToolDefinition = {
      name: "list_workers",
      label: "List Workers",
      description: "List all configured AI workers with their models and status.",
      parameters: Type.Object({}),
      execute: async () => {
        const rows = await db.select().from(workers);
        const result = rows.map((w) => ({
          id: w.id,
          name: w.name,
          workerType: w.workerType,
          modelProvider: w.modelProvider,
          modelName: w.modelName,
          status: w.status,
          skills: w.skills,
        }));
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }], details: {} };
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
        const workerIds = [...new Set(steps.map((s) => s.workerId))];
        const workerRows = workerIds.length ? await db.select({ id: workers.id, name: workers.name }).from(workers) : [];
        const workerNames = new Map(workerRows.map((w) => [w.id, w.name]));
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              id: pipeline.id, name: pipeline.name, description: pipeline.description,
              status: pipeline.status, inputSchema: pipeline.inputSchema,
              steps: steps.map((s) => ({
                id: s.id, stepIndex: s.stepIndex, name: s.name,
                workerId: s.workerId, workerName: s.workerId ? workerNames.get(s.workerId) : undefined,
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
        workerId: Type.String({ description: "Worker ID for this step" }),
        promptTemplate: Type.String({ description: "Prompt template text" }),
        stepIndex: Type.Number({ description: "Position in the pipeline (0-based)" }),
        timeoutSeconds: Type.Optional(Type.Number({ description: "Timeout in seconds (default 300)" })),
        approvalRequired: Type.Optional(Type.Boolean({ description: "Whether human approval is required before executing (default false)" })),
      }),
      execute: async (_id, params: { pipelineId: string; name: string; workerId: string; promptTemplate: string; stepIndex: number; timeoutSeconds?: number; approvalRequired?: boolean }) => {
        const [row] = await db.insert(pipelineSteps).values({
          pipelineId: params.pipelineId,
          stepIndex: params.stepIndex,
          name: params.name,
          workerId: params.workerId,
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
        workerId: Type.Optional(Type.String()),
        promptTemplate: Type.Optional(Type.String()),
        timeoutSeconds: Type.Optional(Type.Number()),
        approvalRequired: Type.Optional(Type.Boolean()),
      }),
      execute: async (_id, params: { stepId: string; name?: string; workerId?: string; promptTemplate?: string; timeoutSeconds?: number; approvalRequired?: boolean }) => {
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

    const create_worker: ToolDefinition = {
      name: "create_worker",
      label: "Create Worker",
      description: "Create a new worker.",
      parameters: Type.Object({
        name: Type.String({ description: "Worker name" }),
        workerType: Type.Optional(Type.String({ description: "Worker type: pi, imagen, publish, function, api (default: pi)" })),
        modelProvider: Type.Optional(Type.String({ description: "Model provider (e.g. anthropic, google)" })),
        modelName: Type.Optional(Type.String({ description: "Model name" })),
        systemPrompt: Type.Optional(Type.String({ description: "System prompt for pi workers" })),
        skills: Type.Optional(Type.Array(Type.String(), { description: "List of skill names" })),
        description: Type.Optional(Type.String({ description: "Worker description" })),
      }),
      execute: async (_id, params: { name: string; workerType?: string; modelProvider?: string; modelName?: string; systemPrompt?: string; skills?: string[]; description?: string }) => {
        const [row] = await db.insert(workers).values({
          name: params.name,
          description: params.description,
          workerType: (params.workerType ?? "pi") as any,
          modelProvider: params.modelProvider ?? "anthropic",
          modelName: params.modelName ?? "claude-sonnet-4-5-20251001",
          systemPrompt: params.systemPrompt,
          skills: params.skills ?? [],
          customTools: [],
        }).returning();
        this.broadcastDataChanged("worker", "created", row.id);
        return { content: [{ type: "text" as const, text: JSON.stringify({ id: row.id, name: row.name }, null, 2) }], details: {} };
      },
    };

    const update_worker: ToolDefinition = {
      name: "update_worker",
      label: "Update Worker",
      description: "Update an existing worker.",
      parameters: Type.Object({
        workerId: Type.String({ description: "The worker ID" }),
        name: Type.Optional(Type.String()),
        description: Type.Optional(Type.String()),
        systemPrompt: Type.Optional(Type.String()),
        skills: Type.Optional(Type.Array(Type.String())),
        modelProvider: Type.Optional(Type.String()),
        modelName: Type.Optional(Type.String()),
      }),
      execute: async (_id, params: { workerId: string; name?: string; description?: string; systemPrompt?: string; skills?: string[]; modelProvider?: string; modelName?: string }) => {
        const { workerId, ...fields } = params;
        const [row] = await db.update(workers).set({ ...fields, updatedAt: new Date() }).where(eq(workers.id, workerId)).returning();
        if (!row) return { content: [{ type: "text" as const, text: "Worker not found." }], details: {} };
        this.broadcastDataChanged("worker", "updated", row.id);
        return { content: [{ type: "text" as const, text: `Updated worker "${row.name}".` }], details: {} };
      },
    };

    return [
      list_pipelines,
      trigger_pipeline,
      cancel_run,
      list_recent_runs,
      get_run_status,
      list_workers,
      get_system_stats,
      navigate_ui,
      get_pipeline_detail,
      create_pipeline,
      update_pipeline,
      delete_pipeline,
      add_pipeline_step,
      update_pipeline_step,
      remove_pipeline_step,
      create_worker,
      update_worker,
    ];
  }
}
