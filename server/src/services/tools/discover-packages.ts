import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "@mariozechner/pi-ai";
import type { AgentToolContext } from "./context.js";
import { discoverPackages } from "../package-manager.js";

export function makeDiscoverPackages(ctx: AgentToolContext): ToolDefinition {
  return {
    name: "discover_packages",
    label: "Discover Packages",
    description:
      "Search GitHub for pawn packages (repos tagged with the pawn-package topic). Returns name, description, stars, and whether already installed.",
    parameters: Type.Object({
      query: Type.Optional(
        Type.String({
          description: "Optional search query to filter packages by keyword.",
        }),
      ),
    }),
    execute: async (_id, params: { query?: string }) => {
      const results = await discoverPackages(ctx.db, params.query);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(results, null, 2) }],
        details: {},
      };
    },
  };
}
