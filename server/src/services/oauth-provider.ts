/**
 * OAuthClientProvider implementation backed by database storage and encryption.
 *
 * Implements the MCP SDK's OAuthClientProvider interface so that the Pawn server
 * can act as an OAuth client on behalf of the user when connecting to
 * OAuth-protected MCP servers.
 */

import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type { OAuthDiscoveryState } from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  OAuthClientMetadata,
  OAuthClientInformationMixed,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import type { Db } from "@pawn/db";
import { mcpServers, oauthConnections, oauthPendingFlows } from "@pawn/db";
import { encrypt, decrypt } from "./oauth-crypto.js";

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export class PawnOAuthClientProvider implements OAuthClientProvider {
  private db: Db;
  private mcpServerId: string;
  private redirectUri: string;

  /** Captured authorization URL (server-mediated flow — we don't redirect). */
  private _authorizationUrl: URL | undefined;

  /** Cached client secret presence for clientMetadata getter. */
  private _hasClientSecret: boolean | undefined;

  constructor(db: Db, mcpServerId: string, redirectUri: string) {
    this.db = db;
    this.mcpServerId = mcpServerId;
    this.redirectUri = redirectUri;
  }

  // -- 1. redirectUrl -------------------------------------------------------

  get redirectUrl(): string {
    return this.redirectUri;
  }

  // -- 2. clientMetadata ----------------------------------------------------

  get clientMetadata(): OAuthClientMetadata {
    return {
      redirect_uris: [this.redirectUri],
      client_name: "Pawn",
      grant_types: ["authorization_code"],
      response_types: ["code"],
      token_endpoint_auth_method:
        this._hasClientSecret === true ? "client_secret_post" : "none",
    };
  }

  // -- 3. clientInformation -------------------------------------------------

  async clientInformation(): Promise<OAuthClientInformationMixed | undefined> {
    const row = await this.db.query.mcpServers.findFirst({
      where: eq(mcpServers.id, this.mcpServerId),
      columns: { oauthConfig: true },
    });

    if (!row?.oauthConfig) return undefined;

    const config = row.oauthConfig as {
      clientId: string;
      clientSecret?: string;
    };

    // Cache for clientMetadata getter
    this._hasClientSecret = !!config.clientSecret;

    const info: OAuthClientInformationMixed = {
      client_id: config.clientId,
      ...(config.clientSecret
        ? { client_secret: config.clientSecret }
        : undefined),
    };

    return info;
  }

  // -- 4. saveClientInformation ---------------------------------------------

  async saveClientInformation(
    info: OAuthClientInformationMixed,
  ): Promise<void> {
    await this.db
      .insert(oauthConnections)
      .values({
        mcpServerId: this.mcpServerId,
        accessToken: "", // placeholder — no token yet
        clientRegistration: info,
      })
      .onConflictDoUpdate({
        target: oauthConnections.mcpServerId,
        set: { clientRegistration: info },
      });
  }

  // -- 5. tokens ------------------------------------------------------------

  async tokens(): Promise<OAuthTokens | undefined> {
    const row = await this.db.query.oauthConnections.findFirst({
      where: eq(oauthConnections.mcpServerId, this.mcpServerId),
    });

    if (!row || row.status !== "active" || !row.accessToken) return undefined;

    let accessToken: string;
    try {
      accessToken = decrypt(row.accessToken);
    } catch {
      // If the stored token is empty or cannot be decrypted, treat as missing
      return undefined;
    }

    let refreshToken: string | undefined;
    if (row.refreshToken) {
      try {
        refreshToken = decrypt(row.refreshToken);
      } catch {
        refreshToken = undefined;
      }
    }

    let expiresIn: number | undefined;
    if (row.expiresAt) {
      const diffMs = new Date(row.expiresAt).getTime() - Date.now();
      expiresIn = Math.max(0, Math.floor(diffMs / 1000));
    }

    return {
      access_token: accessToken,
      token_type: row.tokenType ?? "Bearer",
      ...(refreshToken ? { refresh_token: refreshToken } : undefined),
      ...(expiresIn !== undefined ? { expires_in: expiresIn } : undefined),
    };
  }

  // -- 6. saveTokens --------------------------------------------------------

  async saveTokens(tokens: OAuthTokens): Promise<void> {
    const encryptedAccessToken = encrypt(tokens.access_token);
    const encryptedRefreshToken = tokens.refresh_token
      ? encrypt(tokens.refresh_token)
      : null;

    const expiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000)
      : null;

    await this.db
      .insert(oauthConnections)
      .values({
        mcpServerId: this.mcpServerId,
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        tokenType: tokens.token_type ?? "Bearer",
        expiresAt,
        status: "active",
        connectedAt: new Date(),
        errorMessage: null,
      })
      .onConflictDoUpdate({
        target: oauthConnections.mcpServerId,
        set: {
          accessToken: encryptedAccessToken,
          refreshToken: encryptedRefreshToken,
          tokenType: tokens.token_type ?? "Bearer",
          expiresAt,
          status: "active",
          connectedAt: new Date(),
          lastRefreshedAt: new Date(),
          errorMessage: null,
        },
      });
  }

  // -- 7. redirectToAuthorization -------------------------------------------

  async redirectToAuthorization(authorizationUrl: URL): Promise<void> {
    this._authorizationUrl = authorizationUrl;
  }

  /** Retrieve the captured authorization URL (server-mediated flow). */
  get authorizationUrl(): URL | undefined {
    return this._authorizationUrl;
  }

  // -- 8. saveCodeVerifier --------------------------------------------------

  async saveCodeVerifier(codeVerifier: string): Promise<void> {
    const state = randomBytes(32).toString("hex");

    // Delete any existing pending flow for this server, then insert
    await this.db
      .delete(oauthPendingFlows)
      .where(eq(oauthPendingFlows.mcpServerId, this.mcpServerId));

    await this.db.insert(oauthPendingFlows).values({
      mcpServerId: this.mcpServerId,
      state,
      codeVerifier,
      redirectUri: this.redirectUri,
    });
  }

  // -- 9. codeVerifier ------------------------------------------------------

  async codeVerifier(): Promise<string> {
    const row = await this.db.query.oauthPendingFlows.findFirst({
      where: eq(oauthPendingFlows.mcpServerId, this.mcpServerId),
      columns: { codeVerifier: true },
    });

    if (!row) {
      throw new Error(
        `[oauth-provider] No pending flow found for server ${this.mcpServerId}`,
      );
    }

    return row.codeVerifier;
  }

  // -- 10. state ------------------------------------------------------------

  async state(): Promise<string> {
    const row = await this.db.query.oauthPendingFlows.findFirst({
      where: eq(oauthPendingFlows.mcpServerId, this.mcpServerId),
      columns: { state: true },
    });

    if (row) return row.state;

    // No pending flow — generate and store a new state
    const newState = randomBytes(32).toString("hex");
    const codeVerifier = randomBytes(32).toString("base64url");

    await this.db.insert(oauthPendingFlows).values({
      mcpServerId: this.mcpServerId,
      state: newState,
      codeVerifier,
      redirectUri: this.redirectUri,
    });

    return newState;
  }

  // -- 11. invalidateCredentials --------------------------------------------

  async invalidateCredentials(
    scope: "all" | "client" | "tokens" | "verifier" | "discovery",
  ): Promise<void> {
    switch (scope) {
      case "all":
        await this.db
          .delete(oauthConnections)
          .where(eq(oauthConnections.mcpServerId, this.mcpServerId));
        await this.db
          .delete(oauthPendingFlows)
          .where(eq(oauthPendingFlows.mcpServerId, this.mcpServerId));
        break;

      case "tokens":
        await this.db
          .update(oauthConnections)
          .set({ status: "revoked" })
          .where(eq(oauthConnections.mcpServerId, this.mcpServerId));
        break;

      case "verifier":
        await this.db
          .delete(oauthPendingFlows)
          .where(eq(oauthPendingFlows.mcpServerId, this.mcpServerId));
        break;

      case "client":
        await this.db
          .update(oauthConnections)
          .set({ clientRegistration: null })
          .where(eq(oauthConnections.mcpServerId, this.mcpServerId));
        break;

      case "discovery":
        await this.db
          .update(oauthConnections)
          .set({ discoveryState: null })
          .where(eq(oauthConnections.mcpServerId, this.mcpServerId));
        break;
    }
  }

  // -- 12. saveDiscoveryState -----------------------------------------------

  async saveDiscoveryState(state: OAuthDiscoveryState): Promise<void> {
    await this.db
      .insert(oauthConnections)
      .values({
        mcpServerId: this.mcpServerId,
        accessToken: "", // placeholder
        discoveryState: state,
      })
      .onConflictDoUpdate({
        target: oauthConnections.mcpServerId,
        set: { discoveryState: state },
      });
  }

  // -- 13. discoveryState ---------------------------------------------------

  async discoveryState(): Promise<OAuthDiscoveryState | undefined> {
    const row = await this.db.query.oauthConnections.findFirst({
      where: eq(oauthConnections.mcpServerId, this.mcpServerId),
      columns: { discoveryState: true },
    });

    if (!row?.discoveryState) return undefined;

    return row.discoveryState as OAuthDiscoveryState;
  }
}

// ---------------------------------------------------------------------------
// Standalone helper
// ---------------------------------------------------------------------------

/**
 * Quick check of OAuth connection status without creating a full provider.
 */
export async function getOAuthConnectionStatus(
  db: Db,
  mcpServerId: string,
): Promise<
  | { connected: false }
  | {
      connected: true;
      status: string;
      connectedAt: Date;
      expiresAt: Date | null;
    }
> {
  const row = await db.query.oauthConnections.findFirst({
    where: eq(oauthConnections.mcpServerId, mcpServerId),
    columns: {
      status: true,
      connectedAt: true,
      expiresAt: true,
    },
  });

  if (!row || row.status !== "active") {
    return { connected: false };
  }

  return {
    connected: true,
    status: row.status,
    connectedAt: row.connectedAt,
    expiresAt: row.expiresAt,
  };
}
