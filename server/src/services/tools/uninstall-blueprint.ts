import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "@mariozechner/pi-ai";
import type { AgentToolContext } from "./context.js";
import { uninstallBlueprint } from "../blueprint-manager.js";

export function makeUninstallBlueprint(ctx: AgentToolContext): ToolDefinition {
  return {
    name: "uninstall_blueprint",
    label: "Uninstall Blueprint",
    description:
      "Uninstall a blueprint — removes the cloned repo, its pipeline, and any skills it installed.",
    parameters: Type.Object({
      blueprintId: Type.String({
        description: "ID of the installed blueprint to uninstall.",
      }),
    }),
    execute: async (_id, params: { blueprintId: string }) => {
      await uninstallBlueprint(ctx.db, params.blueprintId, ctx.skillsDir);
      ctx.broadcastDataChanged("blueprint", "deleted", params.blueprintId);
      return {
        content: [{ type: "text" as const, text: `Blueprint ${params.blueprintId} uninstalled successfully.` }],
        details: {},
      };
    },
  };
}
