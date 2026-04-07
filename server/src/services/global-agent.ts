import {
  ModelRegistry,
  SessionManager,
  createAgentSession,
  createExtensionRuntime,
  type AgentSession,
} from "@mariozechner/pi-coding-agent";
import { resolveModel } from "./ollama-provider.js";
import { join } from "node:path";
import { mkdirSync, rmSync, existsSync, readdirSync, readFileSync } from "node:fs";
import type { Db } from "@pawn/db";
import type { WsGlobalAgentEvent, WsDataChanged, WsRunStatusChange, WsIncomingGlobalChat } from "@pawn/shared";
import { makeAuthStorage, makeResourceLoader, runSkillStep } from "./pi-executor.js";
import { readModelSetting } from "./model-utils.js";
import { makeAllTools, type AgentToolContext } from "./tools/index.js";
import { skillsDir as getSkillsDir } from "./paths.js";
import { buildDashboardContext, formatDashboardContext, type DashboardContext } from "./dashboard-context.js";

const SYSTEM_PROMPT = `You are the Pawn assistant — the operator's AI copilot for managing an agentic workflow orchestration system.

## Concepts
- **Pipeline**: an orchestration graph of sequential steps executed in order. Each step references a skill by name. Has a name, input schema, a top-level model, and a system prompt shared across all steps.
- **Skill**: a folder in SKILLS_DIR containing a SKILL.md file (YAML frontmatter + system prompt body) and an optional scripts/ directory of executable tools. Skills are the primary unit of execution — pipelines compose them.
- **Script**: an executable file inside a skill's scripts/ directory (.js, .py, .sh). The filename minus extension becomes a tool the skill's agent can call. Scripts receive input as JSON on stdin and write results to stdout. NODE_PATH is pre-set to server/node_modules so installed packages are available without separate install.
- **MCP Server**: an external server exposing tools via the Model Context Protocol. Skills can call MCP tools by listing server names in their SKILL.md frontmatter. Servers are registered globally in Settings.

## Capabilities
- **Pipelines**: list, create, edit, delete; add/update/remove steps; validate; get YAML; export package
- **Skills**: list, read, create, update, clone, delete (writes SKILL.md to disk)
- **Scripts**: create, update, delete script files within a skill
- **Runs**: trigger, cancel, check status, retrieve step outputs, get full execution trace (step events, LLM output, tool calls), test individual steps
- **MCP**: list registered MCP servers, list MCP server tools, register/update/delete MCP servers
- **Triggers**: list, create, update, delete cron/webhook/channel triggers for pipelines
- **Approvals**: list pending approvals, approve or reject pipeline steps
- **Budgets**: list, create, update, delete budget policies for cost control
- **Packages**: list installed, install from repo, update, uninstall, discover on GitHub, scan for security
- **Settings**: list all settings, update configuration values
- **Navigation**: navigate the UI to any page

## Skill Namespacing
Skills use the format \`<namespace>/<skill-name>\`. Skills you create go into the \`local\` namespace (e.g. \`local/researcher\`). Package-installed skills use the package slug as namespace. Always use fully-qualified names when referencing skills in pipeline steps.

## Pipeline Composition Workflow
When asked to build a complete pipeline:
1. Clarify requirements: purpose, inputs, desired output.
2. Call list_mcp_servers to see what external MCP servers are available.
3. For any MCP server you plan to use in a skill, call list_mcp_server_tools to get the exact tool names, descriptions, and input schemas — use this to write accurate skill system prompts that reference real tool names.
4. Design skill decomposition: break task into sequential steps, each with one skill.
5. For each skill: call create_skill (include mcpServers frontmatter if needed), then add scripts with create_skill_script.
6. Call create_pipeline (include inputSchema with all required inputs).
7. Add steps with add_pipeline_step, linking each to its skill (use full qualified name: local/skill-name).
8. Call validate_pipeline — fix any errors before proceeding.
9. Optionally test individual steps with test_step.
10. When ready, use get_pipeline_yaml to review the final YAML, or export_package for the full bundle.

## MCP Tools in Skills
If a skill needs external tools from a registered MCP server:
1. Call list_mcp_server_tools first to see the exact tools available (names, parameters, what they do).
2. Add mcpServers to the SKILL.md frontmatter:
\`\`\`yaml
mcpServers:
  - brave-search
  - filesystem
\`\`\`
3. Write the skill system prompt with explicit guidance on which MCP tools to use and when — reference the actual tool names (shown by list_mcp_server_tools as agentToolName, e.g. mcp__brave_search__search).
The agent running that skill will have those MCP tools available alongside any script tools.

## Script Authoring
Scripts receive JSON on stdin, write results to stdout. Key patterns:
- Web requests: use fetch() (Node 18+) or a library from server/node_modules
- File output: write to process.env.OUTPUT_DIR
- Error handling: exit non-zero to signal failure (message on stderr)
- Keep scripts focused: one capability per file

## Tool sequencing rules
- **Gather before acting**: if required information (IDs, names, details) is missing from the user's request, use tools to find it — list_pipelines, get_pipeline_detail, list_skills, get_skill, get_run_status, get_run_log, list_mcp_servers, list_mcp_server_tools. Only ask the user when the information genuinely cannot be discovered via tools.
- **Diagnosing failures**: when a run has failed, call get_run_status to see step errors, then get_step_run_output for detailed step output, and get_run_log for the full execution trace (LLM output, tool calls, errors per step). Use all three together to diagnose root causes before proposing fixes. get_run_log reads from the database and is always available.
- **Never ask for IDs in context**: if the Navigation block includes a runId or pipelineId, that is the resource the user is referring to. Use it immediately — never ask "what run ID?" or "what pipeline ID?" when the answer is already in the Navigation block.
- **Create before navigating**: always complete the creation/update tool call and confirm success before calling navigate_ui. Never navigate speculatively.
- **Navigate after**: once a resource is successfully created or updated, navigate to it automatically without asking.
- **Skill linking**: when adding a step to a pipeline with a skillName, always call list_skills first. If the skill exists, link it directly. If it does not exist, create it with create_skill before adding the step.
- **Validate after building**: always call validate_pipeline after finishing a pipeline build.
- **Triggers by pipeline**: list_triggers requires a pipelineId — there is no global trigger list.
- **Approvals before deciding**: always call list_approvals to see pending items before calling approve_step or reject_step.
- **Scan before install**: when the user wants to install a package, call scan_package first to check for security issues, then install_package.

## Dashboard Context
Each user message is prepended with a [Dashboard: ...] block containing live system state: active runs, cost this month, runs this month, pending approvals, and recent failures. A [Navigation: ...] block may follow with the current page and pipeline/run details.

Use this context proactively — you already know the system state without calling get_system_stats or list_approvals for basic counts. For detailed or real-time data, use the tools. The context is a point-in-time snapshot (up to 30s old). When the Navigation block includes a pipelineId or runId, use it automatically to scope your operations — do not ask the user for an ID you already have.

Be concise and action-oriented. Confirm briefly what you did.`;

function loadSkillSummary(skillsDir: string): string {
  if (!existsSync(skillsDir)) return "";
  const entries: string[] = [];
  // Two-level traversal: namespace dirs → skill dirs (e.g. local/researcher, zerohand-daily-absurdist/publisher)
  for (const ns of readdirSync(skillsDir, { withFileTypes: true })) {
    if (!ns.isDirectory()) continue;
    const nsPath = join(skillsDir, ns.name);
    for (const skill of readdirSync(nsPath, { withFileTypes: true })) {
      if (!skill.isDirectory()) continue;
      const skillPath = join(nsPath, skill.name, "SKILL.md");
      if (!existsSync(skillPath)) continue;
      const content = readFileSync(skillPath, "utf-8");
      const fm = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
      const desc = fm?.[1].match(/description:\s*["']?(.+?)["']?\s*$/m)?.[1] ?? "";
      entries.push(`- ${ns.name}/${skill.name}: ${desc}`);
    }
  }
  if (entries.length === 0) return "";
  return `\n\n## Available Skills\n${entries.join("\n")}`;
}

const CONTEXT_CACHE_TTL_MS = 30_000;

export class GlobalAgentService {
  private session: AgentSession | null = null;
  private sessionCreating: Promise<AgentSession> | null = null;
  private isProcessing = false;
  private sessionDir: string;
  private cancelRunFn: ((runId: string) => void) | null = null;
  private skillSummaryCache: string | null = null;
  private contextCache: { data: DashboardContext; timestamp: number; navigationKey: string } | null = null;

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
      if (this.isProcessing) {
        this.broadcastFn({
          type: "global_agent_event",
          eventType: "error",
          message: "Agent is already processing a message. Please wait.",
        });
        return;
      }
      this.isProcessing = true;
      const session = await this.ensureSession();
      let fullMessage = message;

      // Inject dashboard context block (includes navigation details)
      try {
        const dashCtx = await this.getDashboardContext(context);
        const formatted = formatDashboardContext(dashCtx);
        console.log("[GlobalAgent] context injected:", formatted.slice(0, 400));
        fullMessage = `${formatted}\n\n${message}`;
      } catch (err) {
        console.error("[GlobalAgent] Failed to build dashboard context:", err);
        /* graceful degradation — proceed without context */
      }

      try {
        await session.prompt(fullMessage);
        this.broadcastFn({ type: "global_agent_event", eventType: "status_change", message: "done" });
      } catch (err) {
        this.broadcastFn({
          type: "global_agent_event",
          eventType: "error",
          message: String(err),
        });
      } finally {
        this.isProcessing = false;
      }
    }
  }

  private async getDashboardContext(
    navigation?: WsIncomingGlobalChat["context"],
  ): Promise<DashboardContext> {
    const navKey = navigation
      ? `${navigation.path}|${navigation.pipelineId ?? ""}|${navigation.runId ?? ""}`
      : "";
    const now = Date.now();

    if (
      this.contextCache &&
      now - this.contextCache.timestamp < CONTEXT_CACHE_TTL_MS &&
      this.contextCache.navigationKey === navKey
    ) {
      return this.contextCache.data;
    }

    const data = await buildDashboardContext(this.db, navigation ?? undefined);
    this.contextCache = { data, timestamp: now, navigationKey: navKey };
    return data;
  }

  private broadcastDataChanged(entity: WsDataChanged["entity"], action: WsDataChanged["action"], id: string): void {
    this.broadcastFn({ type: "data_changed", entity, action, id });
    if (entity === "skill") this.skillSummaryCache = null;
  }

  private async ensureSession(): Promise<AgentSession> {
    if (this.session) return this.session;
    if (this.sessionCreating) return this.sessionCreating;

    this.sessionCreating = this._createSession().finally(() => { this.sessionCreating = null; });
    return this.sessionCreating;
  }

  private async _createSession(): Promise<AgentSession> {
    const { provider, modelId } = await readModelSetting(this.db, "agent_model", "google/gemini-2.5-flash");
    const model = resolveModel(provider, modelId);

    const authStorage = makeAuthStorage();
    const modelRegistry = ModelRegistry.inMemory(authStorage);
    if (this.skillSummaryCache === null) {
      this.skillSummaryCache = loadSkillSummary(getSkillsDir());
    }
    const fullPrompt = SYSTEM_PROMPT + this.skillSummaryCache;
    const resourceLoader = makeResourceLoader(fullPrompt, []);
    const sessionManager = SessionManager.create(this.sessionDir);

    const ctx: AgentToolContext = {
      db: this.db,
      broadcast: this.broadcastFn.bind(this),
      broadcastDataChanged: this.broadcastDataChanged.bind(this),
      cancelRun: (runId) => this.cancelRunFn?.(runId),
      skillsDir: getSkillsDir(),
      runSkillStep,
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

  /** Invalidate skill summary cache so the next session picks up changes */
  invalidateSkillCache(): void {
    this.skillSummaryCache = null;
  }

  private async destroySession(): Promise<void> {
    this.sessionCreating = null;
    this.isProcessing = false;
    if (this.session) {
      try { await this.session.abort(); } catch { /* ignore */ }
      this.session = null;
    }
    this.skillSummaryCache = null;
    this.contextCache = null;
    if (existsSync(this.sessionDir)) {
      rmSync(this.sessionDir, { recursive: true, force: true });
      mkdirSync(this.sessionDir, { recursive: true });
    }
  }
}
