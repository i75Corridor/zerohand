/**
 * OAuth Flow Service — orchestrates the OAuth authorization code flow
 * using the MCP SDK's auth() orchestrator and our PawnOAuthClientProvider.
 */

import { eq } from "drizzle-orm";
import { auth } from "@modelcontextprotocol/sdk/client/auth.js";
import type { Db } from "@pawn/db";
import { mcpServers, oauthConnections, oauthPendingFlows } from "@pawn/db";
import { PawnOAuthClientProvider } from "./oauth-provider.js";

// ---------------------------------------------------------------------------
// initiateOAuthFlow
// ---------------------------------------------------------------------------

/**
 * Kicks off an OAuth authorization-code flow for the given MCP server.
 *
 * Creates a PawnOAuthClientProvider and delegates to the SDK's `auth()`
 * orchestrator, which will:
 *   1. Discover the authorization server
 *   2. Generate a PKCE code verifier (saved via provider.saveCodeVerifier)
 *   3. Build the authorization URL and call provider.redirectToAuthorization
 *
 * Because we run server-side (no browser redirect), the provider captures the
 * authorization URL instead of redirecting. We return it to the caller so the
 * frontend can open it.
 */
export async function initiateOAuthFlow(
  db: Db,
  mcpServerId: string,
  redirectUri: string,
): Promise<{ authUrl: string; state: string }> {
  const server = await db.query.mcpServers.findFirst({
    where: eq(mcpServers.id, mcpServerId),
    columns: { url: true },
  });

  if (!server?.url) {
    throw new Error(`MCP server ${mcpServerId} has no URL configured`);
  }

  const provider = new PawnOAuthClientProvider(db, mcpServerId, redirectUri);

  const result = await auth(provider, { serverUrl: server.url });

  if (result !== "REDIRECT") {
    // If already authorized we still return — the caller can decide what to do.
    // But there won't be an authorizationUrl, so treat as an error for the
    // "initiate" use-case.
    throw new Error("OAuth flow did not produce a redirect — server may already be authorized");
  }

  const authorizationUrl = provider.authorizationUrl;
  if (!authorizationUrl) {
    throw new Error("OAuth auth() returned REDIRECT but no authorization URL was captured");
  }

  // Retrieve the state that the provider persisted during saveCodeVerifier / state()
  const pendingFlow = await db.query.oauthPendingFlows.findFirst({
    where: eq(oauthPendingFlows.mcpServerId, mcpServerId),
    columns: { state: true },
  });

  if (!pendingFlow) {
    throw new Error("No pending OAuth flow found after auth() — state was not persisted");
  }

  return {
    authUrl: authorizationUrl.toString(),
    state: pendingFlow.state,
  };
}

// ---------------------------------------------------------------------------
// handleOAuthCallback
// ---------------------------------------------------------------------------

/**
 * Handles the OAuth callback after the user has authorized.
 *
 * Looks up the pending flow by `state`, validates expiry, then calls the SDK's
 * `auth()` with the authorization code so it can exchange it for tokens.
 */
export async function handleOAuthCallback(
  db: Db,
  state: string,
  code: string,
  redirectUri: string,
): Promise<{ success: boolean; mcpServerId: string; error?: string }> {
  // 1. Look up the pending flow by state
  const pendingFlow = await db.query.oauthPendingFlows.findFirst({
    where: eq(oauthPendingFlows.state, state),
  });

  if (!pendingFlow) {
    return { success: false, mcpServerId: "", error: "Unknown or expired OAuth state" };
  }

  const { mcpServerId } = pendingFlow;

  try {
    // 2. Validate expiry
    if (new Date(pendingFlow.expiresAt) < new Date()) {
      await db.delete(oauthPendingFlows).where(eq(oauthPendingFlows.state, state));
      return { success: false, mcpServerId, error: "OAuth flow has expired — please try again" };
    }

    // 3. Get the MCP server URL
    const server = await db.query.mcpServers.findFirst({
      where: eq(mcpServers.id, mcpServerId),
      columns: { url: true },
    });

    if (!server?.url) {
      return { success: false, mcpServerId, error: "MCP server not found or has no URL" };
    }

    // 4. Create provider and exchange the code for tokens via auth()
    const provider = new PawnOAuthClientProvider(db, mcpServerId, redirectUri);

    await auth(provider, {
      serverUrl: server.url,
      authorizationCode: code,
    });

    // 5. Clean up the pending flow
    await db.delete(oauthPendingFlows).where(eq(oauthPendingFlows.state, state));

    return { success: true, mcpServerId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[oauth-flow] Callback failed for server ${mcpServerId}:`, message);
    return { success: false, mcpServerId, error: message };
  }
}

// ---------------------------------------------------------------------------
// disconnectOAuth
// ---------------------------------------------------------------------------

/**
 * Removes all OAuth data for a given MCP server (connection + pending flows).
 */
export async function disconnectOAuth(
  db: Db,
  mcpServerId: string,
): Promise<void> {
  await db.delete(oauthConnections).where(eq(oauthConnections.mcpServerId, mcpServerId));
  await db.delete(oauthPendingFlows).where(eq(oauthPendingFlows.mcpServerId, mcpServerId));
}
