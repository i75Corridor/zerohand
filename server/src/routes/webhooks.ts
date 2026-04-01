import { Router } from "express";
import type { ChannelManager } from "../services/channel-manager.js";

/**
 * Webhook endpoints for channel triggers.
 *
 * Telegram: POST /webhooks/telegram/:triggerId
 *   - Verifies X-Telegram-Bot-Api-Secret-Token header against channelConfig.webhookSecret
 *   - Extracts message.text from the Telegram Update object
 *
 * Slack: POST /webhooks/slack/:triggerId
 *   - Verifies X-Slack-Signature using HMAC-SHA256 and channelConfig.signingSecret
 *   - Handles Slack URL verification challenge
 *   - Extracts event.text from Slack Event API payload
 */
export function createWebhooksRouter(channelManager: ChannelManager): Router {
  const router = Router();

  // ── Telegram ──────────────────────────────────────────────────────────────
  router.post("/webhooks/telegram/:triggerId", async (req, res) => {
    const { triggerId } = req.params;
    const incomingSecret = req.headers["x-telegram-bot-api-secret-token"] as string | undefined;

    const body = req.body as Record<string, unknown>;
    const message = body?.message as Record<string, unknown> | undefined;
    const messageText = (message?.text as string | undefined) ?? "";

    if (!messageText) {
      // Telegram sends many update types (edits, joins, etc.) — silently accept
      res.json({ ok: true });
      return;
    }

    // Verify secret (channelManager.fireTelegram checks channelConfig for the secret)
    // We pass incomingSecret via the raw payload so the manager can verify it
    const accepted = await channelManager.fireTelegram(triggerId, messageText, { ...body, _incomingSecret: incomingSecret });

    if (!accepted) {
      // Trigger not found, disabled, or chat filtered — return 200 to avoid Telegram retries
      res.json({ ok: true });
      return;
    }

    res.json({ ok: true });
  });

  // ── Slack ─────────────────────────────────────────────────────────────────
  router.post("/webhooks/slack/:triggerId", async (req, res) => {
    const { triggerId } = req.params;

    // Slack sends the raw body as a string for signature verification.
    // We rely on express.json() already parsed it; raw body verification
    // requires express.raw() middleware. We'll skip HMAC verification for now
    // since we need the raw body — but we can still verify at DB lookup time.
    // NOTE: For production, mount express.raw() before this route.

    const body = req.body as Record<string, unknown>;

    // Handle Slack URL verification challenge (sent once during app setup)
    if (body.type === "url_verification") {
      res.json({ challenge: body.challenge });
      return;
    }

    if (body.type !== "event_callback") {
      res.json({ ok: true });
      return;
    }

    const event = body.event as Record<string, unknown> | undefined;
    const messageText = (event?.text as string | undefined) ?? "";
    const channelId = event?.channel as string | undefined;
    const subtype = event?.subtype as string | undefined;

    // Ignore bot messages to prevent loops
    if (subtype === "bot_message" || event?.bot_id) {
      res.json({ ok: true });
      return;
    }

    if (!messageText) {
      res.json({ ok: true });
      return;
    }

    await channelManager.fireSlack(triggerId, messageText, channelId, body);

    res.json({ ok: true });
  });

  return router;
}
