import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "@mariozechner/pi-ai";
import { mkdtempSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import type { AgentToolContext } from "./context.js";
import { scanPackage } from "../security-scanner.js";

export function makeScanPackage(_ctx: AgentToolContext): ToolDefinition {
  return {
    name: "scan_package",
    label: "Scan Package",
    description:
      "Clone a package repository into a temp directory and run a security scan without installing. Returns a security report with risk level and findings.",
    parameters: Type.Object({
      repoUrl: Type.String({
        description: "GitHub repository URL to scan, e.g. https://github.com/owner/repo",
      }),
    }),
    execute: async (_id, params: { repoUrl: string }) => {
      let tempDir: string | null = null;
      try {
        tempDir = mkdtempSync(join(tmpdir(), "pawn-scan-"));

        await new Promise<void>((resolve, reject) => {
          const child = spawn("git", ["clone", "--depth", "1", params.repoUrl, tempDir!], {
            stdio: ["ignore", "pipe", "pipe"],
          });
          child.on("close", (code) => {
            if (code === 0) resolve();
            else reject(new Error(`git clone failed for ${params.repoUrl}`));
          });
          child.on("error", reject);
        });

        const report = scanPackage(tempDir);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(report, null, 2) }],
          details: {},
        };
      } finally {
        if (tempDir && existsSync(tempDir)) {
          rmSync(tempDir, { recursive: true, force: true });
        }
      }
    },
  };
}
