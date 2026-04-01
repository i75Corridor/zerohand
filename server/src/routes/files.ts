import { Router } from "express";
import { resolve, join, basename } from "node:path";
import { existsSync } from "node:fs";

export function createFilesRouter(): Router {
  const router = Router();
  const outputDir = resolve(process.env.OUTPUT_DIR ?? join(process.cwd(), "..", "output"));

  router.get("/files/:filename", (req, res, next) => {
    try {
      const filename = basename(req.params.filename); // strip any path components
      const filePath = join(outputDir, filename);

      // Ensure the resolved path stays within OUTPUT_DIR
      const resolved = resolve(filePath);
      if (!resolved.startsWith(outputDir + "/") && resolved !== outputDir) {
        return res.status(403).json({ error: "Forbidden" });
      }

      if (!existsSync(resolved)) {
        return res.status(404).json({ error: "File not found" });
      }

      res.sendFile(resolved);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
