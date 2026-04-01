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
import type { WsGlobalAgentEvent } from "@zerohand/shared";
import { makeAuthStorage, makeResourceLoader } from "./pi-executor.js";

const SYSTEM_PROMPT = `You are the Zerohand assistant — the operator's AI copilot for managing an agentic workflow orchestration system.

You have tools to list pipelines, trigger runs, check run status, list workers, get system stats, cancel runs, and navigate the UI.

Be concise and action-oriented. When the user asks you to do something, use your tools to do it. When showing results, format them cleanly. When you trigger a run or take an action, confirm what you did and offer to navigate to the relevant page.

Zerohand is a pipeline orchestrator where each pipeline has sequential steps, each step runs a worker (pi LLM agents, imagen image generation, or publish markdown writers).`;

export class GlobalAgentService {
  private session: AgentSession | null = null;
  private sessionDir: string;
  private cancelRunFn: ((runId: string) => void) | null = null;

  constructor(
    private db: Db,
    private broadcastFn: (msg: WsGlobalAgentEvent) => void,
    dataDir: string,
  ) {
    this.sessionDir = join(dataDir, "global-agent");
    mkdirSync(this.sessionDir, { recursive: true });
  }

  setCancelRunFn(fn: (runId: string) => void): void {
    this.cancelRunFn = fn;
  }

  async handleMessage(action: string, message?: string): Promise<void> {
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
      try {
        await session.prompt(message);
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
      description: "Navigate the user's browser to a specific page in the UI. Valid paths: /dashboard, /pipelines, /workers, /approvals, /settings, /canvas, /runs/:id",
      parameters: Type.Object({
        path: Type.String({ description: "The UI path to navigate to (e.g. /dashboard, /runs/abc123)" }),
      }),
      execute: async (_id, params: { path: string }) => {
        broadcast({ type: "global_agent_event", eventType: "navigate", payload: { path: params.path } });
        return { content: [{ type: "text" as const, text: `Navigating to ${params.path}` }], details: {} };
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
    ];
  }
}
