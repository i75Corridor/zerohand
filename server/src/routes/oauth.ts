/**
 * OAuth callback route — handles the browser redirect after the user
 * authorizes with an external OAuth provider.
 */

import { Router } from "express";
import type { Db } from "@pawn/db";
import { handleOAuthCallback } from "../services/oauth-flow.js";

export function createOAuthRouter(db: Db): Router {
  const router = Router();

  // GET /oauth/callback — browser redirect from the authorization server
  router.get("/oauth/callback", async (req, res) => {
    const code = req.query.code as string | undefined;
    const state = req.query.state as string | undefined;

    if (!code || !state) {
      res.redirect("/?oauth=error&message=" + encodeURIComponent("Missing parameters"));
      return;
    }

    // Build redirect URI so the provider can match it during token exchange
    const redirectUri =
      process.env.OAUTH_REDIRECT_URI ??
      `http://localhost:${process.env.PORT || 3009}/api/oauth/callback`;

    const result = await handleOAuthCallback(db, state, code, redirectUri);

    if (result.success) {
      res.redirect(`/?oauth=success&server=${result.mcpServerId}`);
    } else {
      res.redirect("/?oauth=error&message=" + encodeURIComponent(result.error ?? "Unknown error"));
    }
  });

  return router;
}
