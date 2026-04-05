import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "@mariozechner/pi-ai";
import type { AgentToolContext } from "./context.js";

export function makeNavigateUi(ctx: AgentToolContext): ToolDefinition {
  return {
    name: "navigate_ui",
    label: "Navigate UI",
    description: "Navigate the user's browser to a specific page in the UI. Valid paths: /dashboard, /pipelines, /pipelines/:id, /pipelines/:id/edit, /pipelines/new, /skills, /skills/:namespace/:name, /packages, /approvals, /settings, /runs/:id",
    parameters: Type.Object({
      path: Type.String({ description: "The UI path to navigate to (e.g. /dashboard, /pipelines/abc123)" }),
    }),
    execute: async (_id, params: { path: string }) => {
      ctx.broadcast({ type: "global_agent_event", eventType: "navigate", payload: { path: params.path } });
      return { content: [{ type: "text" as const, text: `Navigating to ${params.path}` }], details: {} };
    },
  };
}
