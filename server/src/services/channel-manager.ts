import { createHmac, timingSafeEqual } from "node:crypto";
import { eq, and } from "drizzle-orm";
import type { Db } from "@zerohand/db";
import { triggers, pipelineRuns } from "@zerohand/db";
import type { WsManager } from "../ws/index.js";

interface TelegramConfig {
  botToken: string;
  webhookSecret?: string;
  chatId?: string;
}

interface SlackConfig {
  botToken: string;
  signingSecret: string;
  channelId?: string;
}

export class ChannelManager {
  constructor(
    private db: Db,
    private ws: WsManager,
  ) {}

  async start(): Promise<void> {
    const publicUrl = process.env.PUBLIC_URL;
    if (!publicUrl) {
      console.log("[ChannelManager] PUBLIC_URL not set — skipping Telegram webhook registration.");
      return;
    }

    const channelTriggers = await this.db
      .select()
      .from(triggers)
      .where(and(eq(triggers.type, "channel"), eq(triggers.enabled, true)));

    for (const trigger of channelTriggers) {
      if (trigger.channelType === "telegram") {
        await this.registerTelegramWebhook(trigger.id, trigger.channelConfig as TelegramConfig | null, publicUrl);
      }
    }
  }

  async registerTelegramWebhook(triggerId: string, config: TelegramConfig | null, publicUrl?: string): Promise<void> {
    const url = publicUrl ?? process.env.PUBLIC_URL;
    if (!url || !config?.botToken) return;

    const webhookUrl = `${url}/webhooks/telegram/${triggerId}`;
    const telegramApiUrl = `https://api.telegram.org/bot${config.botToken}/setWebhook`;

    const body: Record<string, unknown> = { url: webhookUrl };
    if (config.webhookSecret) body.secret_token = config.webhookSecret;

    try {
      const resp = await fetch(telegramApiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await resp.json() as { ok: boolean; description?: string };
      if (result.ok) {
        console.log(`[ChannelManager] Registered Telegram webhook for trigger ${triggerId}`);
      } else {
        console.error(`[ChannelManager] Telegram webhook registration failed: ${result.description}`);
      }
    } catch (err) {
      console.error(`[ChannelManager] Failed to register Telegram webhook:`, err);
    }
  }

  async fireTelegram(
    triggerId: string,
    messageText: string,
    rawPayload: Record<string, unknown>,
  ): Promise<boolean> {
    const trigger = await this.db.query.triggers.findFirst({
      where: and(eq(triggers.id, triggerId), eq(triggers.type, "channel"), eq(triggers.enabled, true)),
    });
    if (!trigger) return false;

    const config = trigger.channelConfig as TelegramConfig | null;
    const chatId = (rawPayload?.message as Record<string, unknown> | undefined)?.chat
      ? String(((rawPayload.message as Record<string, unknown>).chat as Record<string, unknown>).id)
      : undefined;

    // If chatId filter is set, enforce it
    if (config?.chatId && chatId && config.chatId !== chatId) return false;

    await this.fire(trigger, { messageText, chatId, source: "telegram", raw: rawPayload });
    return true;
  }

  async fireSlack(
    triggerId: string,
    messageText: string,
    channelId: string | undefined,
    rawPayload: Record<string, unknown>,
  ): Promise<boolean> {
    const trigger = await this.db.query.triggers.findFirst({
      where: and(eq(triggers.id, triggerId), eq(triggers.type, "channel"), eq(triggers.enabled, true)),
    });
    if (!trigger) return false;

    const config = trigger.channelConfig as SlackConfig | null;

    // If channelId filter is set, enforce it
    if (config?.channelId && channelId && config.channelId !== channelId) return false;

    await this.fire(trigger, { messageText, channelId, source: "slack", raw: rawPayload });
    return true;
  }

  private async fire(
    trigger: typeof triggers.$inferSelect,
    inputParams: Record<string, unknown>,
  ): Promise<void> {
    const merged = { ...(trigger.defaultInputs as Record<string, unknown> ?? {}), ...inputParams };
    const [run] = await this.db
      .insert(pipelineRuns)
      .values({
        pipelineId: trigger.pipelineId,
        inputParams: merged,
        triggerType: "channel",
        triggerDetail: trigger.channelType ?? "channel",
      })
      .returning();

    await this.db
      .update(triggers)
      .set({ lastFiredAt: new Date(), updatedAt: new Date() })
      .where(eq(triggers.id, trigger.id));

    this.ws.broadcast({ type: "run_status", pipelineRunId: run.id, status: "queued" });
    console.log(`[ChannelManager] Fired trigger ${trigger.id} (${trigger.channelType}) → run ${run.id}`);
  }

  // ── Static verification helpers ────────────────────────────────────────────

  static verifyTelegramSecret(incomingSecret: string | undefined, expectedSecret: string | undefined): boolean {
    if (!expectedSecret) return true; // no secret configured = allow all
    if (!incomingSecret) return false;
    try {
      return timingSafeEqual(Buffer.from(incomingSecret), Buffer.from(expectedSecret));
    } catch {
      return false;
    }
  }

  static verifySlackSignature(
    signingSecret: string,
    rawBody: string,
    timestamp: string | undefined,
    signature: string | undefined,
  ): boolean {
    if (!timestamp || !signature) return false;
    // Reject requests older than 5 minutes
    if (Math.abs(Date.now() / 1000 - parseInt(timestamp, 10)) > 300) return false;
    const baseStr = `v0:${timestamp}:${rawBody}`;
    const expected = `v0=${createHmac("sha256", signingSecret).update(baseStr).digest("hex")}`;
    try {
      return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
    } catch {
      return false;
    }
  }
}
