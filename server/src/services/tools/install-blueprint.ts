import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "@mariozechner/pi-ai";
import type { AgentToolContext } from "./context.js";
import { installBlueprint } from "../blueprint-manager.js";
import { blueprintsDir } from "../paths.js";

export function makeInstallBlueprint(ctx: AgentToolContext): ToolDefinition {
  return {
    name: "install_blueprint",
    label: "Install Blueprint",
    description:
      "Install a pawn blueprint from a GitHub repository URL. The blueprint must contain a pipeline.yaml at its root. A security scan runs automatically before installation.",
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
      const result = await installBlueprint(
        ctx.db,
        params.repoUrl,
        blueprintsDir(),
        ctx.skillsDir,
        { force: params.force === true },
      );
      ctx.broadcastDataChanged("blueprint", "created", params.repoUrl);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        details: {},
      };
    },
  };
}
