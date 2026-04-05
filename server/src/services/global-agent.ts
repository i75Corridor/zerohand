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
import type { WsGlobalAgentEvent, WsDataChanged, WsRunStatusChange, WsIncomingGlobalChat } from "@zerohand/shared";
import { makeAuthStorage, makeResourceLoader } from "./pi-executor.js";
import { readModelSetting } from "./model-utils.js";
import { makeAllTools, type AgentToolContext } from "./tools/index.js";
import { skillsDir as getSkillsDir } from "./paths.js";

const SYSTEM_PROMPT = `You are the Zerohand assistant — the operator's AI copilot for managing an agentic workflow orchestration system.

## Concepts
- **Pipeline**: an orchestration graph of sequential steps executed in order. Each step references a skill by name. Has a name, input schema, a top-level model, and a system prompt shared across all steps.
- **Skill**: a folder in SKILLS_DIR containing a SKILL.md file (YAML frontmatter + system prompt body) and an optional scripts/ directory of executable tools. Skills are the primary unit of execution — pipelines compose them.
- **Script**: an executable file inside a skill's scripts/ directory (.js, .py, .sh). The filename minus extension becomes a tool the skill's agent can call. Scripts receive input as JSON on stdin and write results to stdout. NODE_PATH is pre-set to server/node_modules so installed packages are available without separate install.

## Capabilities
- **Pipelines**: list, create, edit, delete; add/update/remove steps
- **Skills**: list, read, create, update (writes SKILL.md to disk)
- **Scripts**: create, update, delete script files within a skill
- **Runs**: trigger, cancel, check status and recent history
- **Triggers**: list, create, update, delete cron/webhook/channel triggers for pipelines
- **Approvals**: list pending approvals, approve or reject pipeline steps
- **Budgets**: list, create, update, delete budget policies for cost control
- **Packages**: list installed, install from repo, update, uninstall, discover on GitHub, scan for security
- **Settings**: list all settings, update configuration values
- **Navigation**: navigate the UI to any page

When creating a skill:
- Write a focused system prompt body: role line, input description, numbered steps, output format, gotchas.
- If the skill needs to call external APIs, fetch URLs, or run system commands, create a script for it — do not rely on the LLM to do those things directly.
- Name scripts descriptively after what they do (web_search.js, generate_image.js, send_email.py).
- After creating the skill, create any needed scripts with create_skill_script.

When the user's message includes context about which page they are viewing, use that to provide relevant assistance.

## Tool sequencing rules
- **Gather before acting**: if required information (name, description, inputs, etc.) is missing from the user's request, ask for it before calling any tools.
- **Create before navigating**: always complete the creation/update tool call and confirm success before calling navigate_ui. Never navigate speculatively.
- **Navigate after**: once a resource is successfully created or updated, navigate to it automatically without asking.
- **Skill linking**: when adding a step to a pipeline with a skillName, always call list_skills first. If the skill exists, link it directly. If it does not exist, create it with create_skill before adding the step.
- **Triggers by pipeline**: list_triggers requires a pipelineId — there is no global trigger list.
- **Approvals before deciding**: always call list_approvals to see pending items before calling approve_step or reject_step.
- **Scan before install**: when the user wants to install a package, call scan_package first to check for security issues, then install_package.

Be concise and action-oriented. Confirm briefly what you did.`;

export class GlobalAgentService {
  private session: AgentSession | null = null;
  private sessionDir: string;
  private cancelRunFn: ((runId: string) => void) | null = null;

  constructor(
    private db: Db,
    private broadcastFn: (msg: WsGlobalAgentEvent | WsDataChanged | WsRunStatusChange) => void,
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
      skillsDir: getSkillsDir(),
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
