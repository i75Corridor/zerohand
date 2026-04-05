import { Router } from "express";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { logsDir } from "../services/paths.js";

export function createLogsRouter(): Router {
  const router = Router();

  router.get("/runs/:id/log", (req, res) => {
    const runId = req.params.id;
    // Validate runId is a safe UUID-like string (no path traversal)
    if (!/^[\w-]+$/.test(runId)) {
      res.status(400).json({ error: "Invalid run id" });
      return;
    }

    const logPath = join(logsDir(), `${runId}.jsonl`);
    if (!existsSync(logPath)) {
      res.status(404).json({ error: "Log not found" });
      return;
    }

    try {
      const content = readFileSync(logPath, "utf-8");
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.send(content);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  return router;
}
