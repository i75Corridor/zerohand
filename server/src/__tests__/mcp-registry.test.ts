import { describe, it, expect } from "vitest";
import {
  lookupRegistry,
  lookupRegistryByName,
} from "../services/mcp-registry.js";

describe("mcp-registry", () => {
  describe("lookupRegistry", () => {
    it("returns entry with BRAVE_API_KEY for brave-search-mcp", () => {
      const result = lookupRegistry("npx", [
        "-y",
        "@anthropic/brave-search-mcp",
      ]);
      expect(result).not.toBeNull();
      expect(result!.packageName).toBe("@anthropic/brave-search-mcp");
      expect(result!.envVars).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "BRAVE_API_KEY", required: true }),
        ]),
      );
    });

    it("returns entry with GITHUB_PERSONAL_ACCESS_TOKEN for server-github", () => {
      const result = lookupRegistry("npx", [
        "-y",
        "@modelcontextprotocol/server-github",
      ]);
      expect(result).not.toBeNull();
      expect(result!.packageName).toBe(
        "@modelcontextprotocol/server-github",
      );
      expect(result!.envVars).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: "GITHUB_PERSONAL_ACCESS_TOKEN",
            required: true,
          }),
        ]),
      );
    });

    it("matches when args contain extra flags like --yes", () => {
      const result = lookupRegistry("npx", [
        "--yes",
        "@anthropic/brave-search-mcp",
      ]);
      expect(result).not.toBeNull();
      expect(result!.packageName).toBe("@anthropic/brave-search-mcp");
    });

    it("returns null for unknown package", () => {
      const result = lookupRegistry("npx", [
        "-y",
        "@unknown/some-mcp-server",
      ]);
      expect(result).toBeNull();
    });

    it("matches package name even with non-npx command", () => {
      const result = lookupRegistry("node", [
        "@anthropic/brave-search-mcp",
      ]);
      expect(result).not.toBeNull();
      expect(result!.packageName).toBe("@anthropic/brave-search-mcp");
    });

    it("strips version suffix and still matches", () => {
      const result = lookupRegistry("npx", [
        "-y",
        "@anthropic/brave-search-mcp@1.2.3",
      ]);
      expect(result).not.toBeNull();
      expect(result!.packageName).toBe("@anthropic/brave-search-mcp");
    });
  });

  describe("lookupRegistryByName", () => {
    it('matches "brave-search" to brave-search-mcp entry', () => {
      const result = lookupRegistryByName("brave-search");
      expect(result).not.toBeNull();
      expect(result!.packageName).toBe("@anthropic/brave-search-mcp");
      expect(result!.envVars).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "BRAVE_API_KEY" }),
        ]),
      );
    });

    it("returns null for unknown server name", () => {
      const result = lookupRegistryByName("unknown-server");
      expect(result).toBeNull();
    });
  });
});
