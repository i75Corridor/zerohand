import { Router } from "express";
import {
  getCustomProviderConfig,
  saveCustomProviderConfig,
  loadCustomProviders,
  type CustomProvidersConfig,
} from "../services/custom-providers.js";

function maskApiKey(key: string | undefined): string | undefined {
  if (!key) return undefined;
  if (key.length <= 8) return "****";
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

function maskConfig(config: CustomProvidersConfig): CustomProvidersConfig {
  const masked: CustomProvidersConfig = { providers: {} };
  for (const [name, provider] of Object.entries(config.providers)) {
    masked.providers[name] = {
      ...provider,
      apiKey: maskApiKey(provider.apiKey),
    };
  }
  return masked;
}

export function createCustomProvidersRouter(
  broadcast?: (msg: { type: string; entity: string; action: string }) => void,
): Router {
  const router = Router();

  router.get("/custom-providers", (_req, res) => {
    const config = getCustomProviderConfig();
    res.json(maskConfig(config));
  });

  router.put("/custom-providers", (req, res, next) => {
    try {
      const body = req.body as CustomProvidersConfig;
      if (!body.providers || typeof body.providers !== "object") {
        res.status(400).json({ error: "Missing or invalid \"providers\" key" });
        return;
      }
      saveCustomProviderConfig(body);
      broadcast?.({ type: "data_changed", entity: "model", action: "update" });
      res.json(maskConfig(getCustomProviderConfig()));
    } catch (err) {
      next(err);
    }
  });

  return router;
}
