/**
 * Background polling service that refreshes OAuth tokens before they expire.
 *
 * Follows the same start/stop pattern as ollama-provider.ts.
 * Runs every 60 seconds, picking up active connections whose access tokens
 * will expire within the next 5 minutes and attempting a token refresh.
 */

import type { Db } from "@pawn/db";
import { oauthConnections, mcpServers } from "@pawn/db";
import { eq, and, lte, isNotNull, sql } from "drizzle-orm";
import {
  refreshAuthorization,
  discoverOAuthServerInfo,
} from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  OAuthDiscoveryState,
} from "@modelcontextprotocol/sdk/client/auth.js";
import type { OAuthClientInformationMixed } from "@modelcontextprotocol/sdk/shared/auth.js";
import { encrypt, decrypt } from "./oauth-crypto.js";

// ── Constants ───────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 60_000; // 60 seconds
const EXPIRY_BUFFER_MS = 5 * 60 * 1000; // 5 minutes

// ── Module state ────────────────────────────────────────────────────────────

let pollTimer: ReturnType<typeof setInterval> | null = null;

// ── Public API ──────────────────────────────────────────────────────────────

export function startOAuthRefreshPolling(db: Db): void {
  if (pollTimer) return;

  console.log("[oauth-refresh] Starting background token refresh polling");
  pollTimer = setInterval(() => void refreshExpiringTokens(db), POLL_INTERVAL_MS);
}

export function stopOAuthRefreshPolling(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
    console.log("[oauth-refresh] Stopped background token refresh polling");
  }
}

// ── Internal ────────────────────────────────────────────────────────────────

async function refreshExpiringTokens(db: Db): Promise<void> {
  try {
    const threshold = new Date(Date.now() + EXPIRY_BUFFER_MS);

    // Find active connections expiring within the buffer window that have a refresh token
    const expiring = await db
      .select({
        id: oauthConnections.id,
        mcpServerId: oauthConnections.mcpServerId,
        refreshToken: oauthConnections.refreshToken,
        discoveryState: oauthConnections.discoveryState,
      })
      .from(oauthConnections)
      .where(
        and(
          eq(oauthConnections.status, "active"),
          isNotNull(oauthConnections.expiresAt),
          lte(oauthConnections.expiresAt, threshold),
          isNotNull(oauthConnections.refreshToken),
        ),
      );

    if (expiring.length === 0) return;

    console.log(
      `[oauth-refresh] Found ${expiring.length} token(s) expiring soon, attempting refresh`,
    );

    for (const conn of expiring) {
      try {
        await refreshSingleConnection(db, conn);
      } catch (err) {
        // Mark the connection as errored so it stops being picked up
        const message =
          err instanceof Error ? err.message : String(err);
        console.error(
          `[oauth-refresh] Failed to refresh token for connection ${conn.id}: ${message}`,
        );

        await db
          .update(oauthConnections)
          .set({
            status: "error",
            errorMessage: `Token refresh failed: ${message}`,
          })
          .where(eq(oauthConnections.id, conn.id));
      }
    }
  } catch (err) {
    // Top-level catch so the interval keeps running
    console.error(
      "[oauth-refresh] Unexpected error during refresh cycle:",
      err,
    );
  }
}

async function refreshSingleConnection(
  db: Db,
  conn: {
    id: string;
    mcpServerId: string;
    refreshToken: string | null;
    discoveryState: unknown;
  },
): Promise<void> {
  if (!conn.refreshToken) return;

  // 1. Get MCP server URL and OAuth config
  const server = await db.query.mcpServers.findFirst({
    where: eq(mcpServers.id, conn.mcpServerId),
    columns: { url: true, oauthConfig: true },
  });

  if (!server?.url) {
    throw new Error(`MCP server ${conn.mcpServerId} has no URL`);
  }

  if (!server.oauthConfig) {
    throw new Error(`MCP server ${conn.mcpServerId} has no OAuth config`);
  }

  const oauthConfig = server.oauthConfig as {
    clientId: string;
    clientSecret?: string;
  };

  // 2. Decrypt the refresh token
  const refreshToken = decrypt(conn.refreshToken);

  // 3. Discover auth server info (use cached discovery state if available)
  let authorizationServerUrl: string;
  let metadata;

  const cached = conn.discoveryState as OAuthDiscoveryState | null;
  if (cached?.authorizationServerUrl && cached?.authorizationServerMetadata) {
    authorizationServerUrl = cached.authorizationServerUrl;
    metadata = cached.authorizationServerMetadata;
  } else {
    const info = await discoverOAuthServerInfo(server.url);
    authorizationServerUrl = info.authorizationServerUrl;
    metadata = info.authorizationServerMetadata;
  }

  // 4. Build client information
  const clientInformation: OAuthClientInformationMixed = {
    client_id: oauthConfig.clientId,
    ...(oauthConfig.clientSecret
      ? { client_secret: oauthConfig.clientSecret }
      : undefined),
  };

  // 5. Refresh the token
  const tokens = await refreshAuthorization(authorizationServerUrl, {
    metadata,
    clientInformation,
    refreshToken,
  });

  // 6. Encrypt and persist
  const encryptedAccessToken = encrypt(tokens.access_token);
  const encryptedRefreshToken = tokens.refresh_token
    ? encrypt(tokens.refresh_token)
    : conn.refreshToken; // keep the old one if not rotated

  const expiresAt = tokens.expires_in
    ? new Date(Date.now() + tokens.expires_in * 1000)
    : null;

  await db
    .update(oauthConnections)
    .set({
      accessToken: encryptedAccessToken,
      refreshToken: encryptedRefreshToken,
      expiresAt,
      lastRefreshedAt: new Date(),
      errorMessage: null,
    })
    .where(eq(oauthConnections.id, conn.id));

  console.log(
    `[oauth-refresh] Successfully refreshed token for connection ${conn.id}`,
  );
}
