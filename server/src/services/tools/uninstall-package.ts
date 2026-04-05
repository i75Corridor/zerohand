import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "@mariozechner/pi-ai";
import type { AgentToolContext } from "./context.js";
import { uninstallPackage } from "../package-manager.js";

export function makeUninstallPackage(ctx: AgentToolContext): ToolDefinition {
  return {
    name: "uninstall_package",
    label: "Uninstall Package",
    description:
      "Uninstall a package — removes the cloned repo, its pipeline, and any skills it installed.",
    parameters: Type.Object({
      packageId: Type.String({
        description: "ID of the installed package to uninstall.",
      }),
    }),
    execute: async (_id, params: { packageId: string }) => {
      await uninstallPackage(ctx.db, params.packageId, ctx.skillsDir);
      ctx.broadcastDataChanged("package", "deleted", params.packageId);
      return {
        content: [{ type: "text" as const, text: `Package ${params.packageId} uninstalled successfully.` }],
        details: {},
      };
    },
  };
}
