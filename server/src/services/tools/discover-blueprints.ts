import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "@mariozechner/pi-ai";
import type { AgentToolContext } from "./context.js";
import { discoverBlueprints } from "../blueprint-manager.js";

export function makeDiscoverBlueprints(ctx: AgentToolContext): ToolDefinition {
  return {
    name: "discover_blueprints",
    label: "Discover Blueprints",
    description:
      "Search GitHub for pawn blueprints (repos tagged with the pawn-blueprint topic). Returns name, description, stars, and whether already installed.",
    parameters: Type.Object({
      query: Type.Optional(
        Type.String({
          description: "Optional search query to filter blueprints by keyword.",
        }),
      ),
    }),
    execute: async (_id, params: { query?: string }) => {
      const results = await discoverBlueprints(ctx.db, params.query);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(results, null, 2) }],
        details: {},
      };
    },
  };
}
