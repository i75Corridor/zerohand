import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "@mariozechner/pi-ai";
import type { AgentToolContext } from "./context.js";
import { installPackage } from "../package-manager.js";
import { packagesDir } from "../paths.js";

export function makeInstallPackage(ctx: AgentToolContext): ToolDefinition {
  return {
    name: "install_package",
    label: "Install Package",
    description:
      "Install a zerohand package from a GitHub repository URL. The package must contain a pipeline.yaml at its root. A security scan runs automatically before installation.",
    parameters: Type.Object({
      repoUrl: Type.String({
        description: "GitHub repository URL, e.g. https://github.com/owner/repo",
      }),
      force: Type.Optional(
        Type.Boolean({
          description: "If true, install even when the security scan reports high risk. Default false.",
        }),
      ),
    }),
    execute: async (_id, params: { repoUrl: string; force?: boolean }) => {
      const result = await installPackage(
        ctx.db,
        params.repoUrl,
        packagesDir(),
        ctx.skillsDir,
        { force: params.force === true },
      );
      ctx.broadcastDataChanged("package", "created", params.repoUrl);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        details: {},
      };
    },
  };
}
