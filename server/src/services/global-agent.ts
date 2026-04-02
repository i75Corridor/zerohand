import {
  ModelRegistry,
  SessionManager,
  createAgentSession,
  createExtensionRuntime,
  type AgentSession,
} from "@mariozechner/pi-coding-agent";
import { getModel } from "@mariozechner/pi-ai";
import { eq } from "drizzle-orm";
import { join } from "node:path";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import type { Db } from "@zerohand/db";
import { pipelines } from "@zerohand/db";
import type { WsGlobalAgentEvent, WsDataChanged, WsIncomingGlobalChat } from "@zerohand/shared";
import { makeAuthStorage, makeResourceLoader } from "./pi-executor.js";
import { readModelSetting } from "./model-utils.js";
import { makeAllTools, type AgentToolContext } from "./tools/index.js";

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

    const ctx: AgentToolContext = {
      db: this.db,
      broadcast: this.broadcastFn.bind(this),
      broadcastDataChanged: this.broadcastDataChanged.bind(this),
      cancelRun: (runId) => this.cancelRunFn?.(runId),
      skillsDir: process.env.SKILLS_DIR ?? join(process.cwd(), "..", "skills"),
    };

    const { session } = await createAgentSession({
      model,
      thinkingLevel: "off",
      authStorage,
      modelRegistry,
      resourceLoader,
      tools: [],
      customTools: makeAllTools(ctx),
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
    if (existsSync(this.sessionDir)) {
      rmSync(this.sessionDir, { recursive: true, force: true });
      mkdirSync(this.sessionDir, { recursive: true });
    }
  }
}
