import { Router } from "express";
import { resolve, basename } from "node:path";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { outputDir as getOutputDir } from "../services/paths.js";

export function createFilesRouter(): Router {
  const router = Router();
  const outputDir = resolve(getOutputDir());
  mkdirSync(outputDir, { recursive: true });

  router.get("/files/:filename", (req, res, next) => {
    const filename = basename(req.params.filename); // strip any path components
    const filePath = join(outputDir, filename);

    if (!existsSync(filePath)) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    res.sendFile(filename, { root: outputDir }, (err) => {
      if (err) next(err);
    });
  });

  return router;
}
