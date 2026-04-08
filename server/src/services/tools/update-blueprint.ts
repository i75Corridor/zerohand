import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "@mariozechner/pi-ai";
import type { AgentToolContext } from "./context.js";
import { updateBlueprint } from "../blueprint-manager.js";

export function makeUpdateBlueprint(ctx: AgentToolContext): ToolDefinition {
  return {
    name: "update_blueprint",
    label: "Update Blueprint",
    description:
      "Update an installed blueprint to the latest version by pulling from its remote repository. A security scan runs after the pull.",
    parameters: Type.Object({
      blueprintId: Type.String({
        description: "ID of the installed blueprint to update.",
      }),
      force: Type.Optional(
        Type.Boolean({
          description: "If true, keep the update even when the security scan reports high risk. Default false.",
        }),
      ),
    }),
    execute: async (_id, params: { blueprintId: string; force?: boolean }) => {
      const result = await updateBlueprint(
        ctx.db,
        params.blueprintId,
        ctx.skillsDir,
        { force: params.force === true },
      );
      ctx.broadcastDataChanged("blueprint", "updated", params.blueprintId);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        details: {},
      };
    },
  };
}
