import { Router } from "express";
import { existsSync } from "node:fs";
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

    res.setHeader("Content-Type", "application/x-ndjson");
    res.sendFile(logPath, { root: "/" }, (err) => {
      if (err && !res.headersSent) res.status(500).json({ error: String(err) });
    });
  });

  return router;
}
