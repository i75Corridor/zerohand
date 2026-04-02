import { Router } from "express";
import { listAllModels } from "../services/model-utils.js";

export function createModelsRouter(): Router {
  const router = Router();

  router.get("/models", (_req, res) => {
    res.json(listAllModels());
  });

  return router;
}
