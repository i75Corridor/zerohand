import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "@mariozechner/pi-ai";
import type { AgentToolContext } from "./context.js";
import { updatePackage } from "../package-manager.js";

export function makeUpdatePackage(ctx: AgentToolContext): ToolDefinition {
  return {
    name: "update_package",
    label: "Update Package",
    description:
      "Update an installed package to the latest version by pulling from its remote repository. A security scan runs after the pull.",
    parameters: Type.Object({
      packageId: Type.String({
        description: "ID of the installed package to update.",
      }),
      force: Type.Optional(
        Type.Boolean({
          description: "If true, keep the update even when the security scan reports high risk. Default false.",
        }),
      ),
    }),
    execute: async (_id, params: { packageId: string; force?: boolean }) => {
      const result = await updatePackage(
        ctx.db,
        params.packageId,
        ctx.skillsDir,
        { force: params.force === true },
      );
      ctx.broadcastDataChanged("package", "updated", params.packageId);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        details: {},
      };
    },
  };
}
