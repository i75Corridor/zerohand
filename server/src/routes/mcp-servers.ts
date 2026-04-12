import { Router } from "express";
import { eq } from "drizzle-orm";
import type { Db } from "@pawn/db";
import { mcpServers, oauthConnections } from "@pawn/db";
import type { ApiMcpServer, ApiOAuthConfig, ApiOAuthConnection } from "@pawn/shared";
import { McpClientPool } from "../services/mcp-client.js";
import { detectEnvVars } from "../services/mcp-env-detector.js";
import { initiateOAuthFlow, disconnectOAuth } from "../services/oauth-flow.js";

function rowToApi(
  row: typeof mcpServers.$inferSelect,
  oauthRow?: typeof oauthConnections.$inferSelect | null,
): ApiMcpServer {
  const oauthCfg = row.oauthConfig as { clientId: string; clientSecret?: string; scopes?: string[] } | null;

  let oauthConfig: ApiOAuthConfig | undefined;
  if (oauthCfg) {
    oauthConfig = {
      clientId: oauthCfg.clientId,
      hasClientSecret: !!oauthCfg.clientSecret,
      scopes: oauthCfg.scopes,
    };
  }

  let oauthConnection: ApiOAuthConnection | undefined;
  if (oauthRow && oauthRow.status) {
    oauthConnection = {
      id: oauthRow.id,
      mcpServerId: oauthRow.mcpServerId,
      status: oauthRow.status as ApiOAuthConnection["status"],
      scope: oauthRow.scope ?? undefined,
      tokenType: oauthRow.tokenType,
      connectedAt: oauthRow.connectedAt.toISOString(),
      lastRefreshedAt: oauthRow.lastRefreshedAt?.toISOString(),
      expiresAt: oauthRow.expiresAt?.toISOString(),
      errorMessage: oauthRow.errorMessage ?? undefined,
    };
  }

  return {
    id: row.id,
    name: row.name,
    transport: row.transport as ApiMcpServer["transport"],
    command: row.command ?? undefined,
    args: (row.args as string[] | null) ?? [],
    url: row.url ?? undefined,
    headers: (row.headers as Record<string, string> | null) ?? {},
    env: (row.env as Record<string, string> | null) ?? {},
    enabled: row.enabled,
    source: row.source as ApiMcpServer["source"],
    sourceBlueprintId: row.sourceBlueprintId ?? undefined,
    metadata: (row.metadata as ApiMcpServer["metadata"]) ?? undefined,
    oauthConfig,
    oauthConnection,
  };
}

export function makeMcpServersRouter(db: Db): Router {
  const router = Router();

  // GET /api/mcp-servers
  router.get("/mcp-servers", async (_req, res) => {
    const rows = await db
      .select()
      .from(mcpServers)
      .leftJoin(oauthConnections, eq(mcpServers.id, oauthConnections.mcpServerId))
      .orderBy(mcpServers.name);

    res.json(rows.map((r) => rowToApi(r.mcp_servers, r.oauth_connections)));
  });

  // POST /api/mcp-servers/detect-env
  router.post("/mcp-servers/detect-env", async (req, res) => {
    const { transport, command, args, name } = req.body as {
      transport?: string;
      command?: string;
      args?: string[];
      name?: string;
    };

    if (!transport) {
      res.status(400).json({ error: "transport is required" });
      return;
    }

    if (transport === "stdio" && !command) {
      res.status(400).json({ error: "command is required for stdio transport" });
      return;
    }

    const result = await detectEnvVars({ transport, command, args, name });

    if (result.error === "detection busy") {
      res.status(429).json({ error: "Detection is busy, try again in a moment" });
      return;
    }

    // Optionally persist detected env requirements to the server row
    const id = req.query.id as string | undefined;
    if (id) {
      await db
        .update(mcpServers)
        .set({
          metadata: { envRequirements: result.detected },
          updatedAt: new Date(),
        })
        .where(eq(mcpServers.id, id));
    }

    res.json({ detected: result.detected, error: result.error });
  });

  // GET /api/mcp-servers/:id
  router.get("/mcp-servers/:id", async (req, res) => {
    const rows = await db
      .select()
      .from(mcpServers)
      .leftJoin(oauthConnections, eq(mcpServers.id, oauthConnections.mcpServerId))
      .where(eq(mcpServers.id, req.params.id))
      .limit(1);

    if (rows.length === 0) { res.status(404).json({ error: "Not found" }); return; }
    res.json(rowToApi(rows[0].mcp_servers, rows[0].oauth_connections));
  });

  // POST /api/mcp-servers
  router.post("/mcp-servers", async (req, res) => {
    const { name, transport, command, args, url, headers, env } = req.body as Partial<ApiMcpServer>;
    const oauthConfigBody = req.body.oauthConfig as { clientId: string; clientSecret?: string; scopes?: string[] } | undefined;
    if (!name || !transport) { res.status(400).json({ error: "name and transport are required" }); return; }
    try {
      const [row] = await db.insert(mcpServers).values({
        name,
        transport,
        command: command ?? null,
        args: args ?? [],
        url: url ?? null,
        headers: headers ?? {},
        env: env ?? {},
        source: "manual",
        ...(oauthConfigBody ? { oauthConfig: oauthConfigBody } : {}),
      }).returning();
      res.status(201).json(rowToApi(row));
    } catch (err: any) {
      if (err.code === "23505") {
        res.status(409).json({ error: `MCP server "${name}" already exists` });
      } else {
        throw err;
      }
    }
  });

  // PATCH /api/mcp-servers/:id
  router.patch("/mcp-servers/:id", async (req, res) => {
    const { name, transport, command, args, url, headers, env, enabled } = req.body as Partial<ApiMcpServer>;
    const oauthConfigBody = req.body.oauthConfig as { clientId: string; clientSecret?: string; scopes?: string[] } | undefined;

    const updates: Partial<typeof mcpServers.$inferInsert> = { updatedAt: new Date() };
    if (name !== undefined) updates.name = name;
    if (transport !== undefined) updates.transport = transport;
    if (command !== undefined) updates.command = command ?? null;
    if (args !== undefined) updates.args = args;
    if (url !== undefined) updates.url = url ?? null;
    if (headers !== undefined) updates.headers = headers;
    if (env !== undefined) updates.env = env;
    if (enabled !== undefined) updates.enabled = enabled;
    if (oauthConfigBody !== undefined) updates.oauthConfig = oauthConfigBody;

    const [row] = await db.update(mcpServers).set(updates).where(eq(mcpServers.id, req.params.id)).returning();
    if (!row) { res.status(404).json({ error: "Not found" }); return; }
    res.json(rowToApi(row));
  });

  // DELETE /api/mcp-servers/:id
  router.delete("/mcp-servers/:id", async (req, res) => {
    const [row] = await db.delete(mcpServers).where(eq(mcpServers.id, req.params.id)).returning();
    if (!row) { res.status(404).json({ error: "Not found" }); return; }
    res.status(204).end();
  });

  // POST /api/mcp-servers/:id/test — test connection and list tools
  router.post("/mcp-servers/:id/test", async (req, res) => {
    const row = await db.query.mcpServers.findFirst({ where: eq(mcpServers.id, req.params.id) });
    if (!row) { res.status(404).json({ error: "Not found" }); return; }

    const pool = new McpClientPool();
    pool.setDb(db);
    try {
      const tools = await pool.connect({
        id: row.id,
        name: row.name,
        transport: row.transport as "stdio" | "sse" | "streamable-http",
        command: row.command ?? undefined,
        args: (row.args as string[] | null) ?? [],
        url: row.url ?? undefined,
        headers: (row.headers as Record<string, string> | null) ?? {},
        env: (row.env as Record<string, string> | null) ?? {},
      });
      res.json({ connected: true, tools });
    } catch (err) {
      console.error(`[mcp-servers] Test connection failed for "${row.name}":`, err);
      res.status(502).json({ connected: false, error: String(err) });
    } finally {
      await pool.disconnectAll().catch((e) => console.error("[mcp-servers] disconnectAll error:", e));
    }
  });

  // POST /api/mcp-servers/:id/oauth/connect — initiate OAuth flow
  router.post("/mcp-servers/:id/oauth/connect", async (req, res) => {
    const row = await db.query.mcpServers.findFirst({
      where: eq(mcpServers.id, req.params.id),
      columns: { id: true, url: true, oauthConfig: true },
    });

    if (!row) { res.status(404).json({ error: "Not found" }); return; }
    if (!row.oauthConfig) { res.status(400).json({ error: "Server has no OAuth configuration" }); return; }
    if (!row.url) { res.status(400).json({ error: "Server has no URL configured" }); return; }

    const redirectUri =
      process.env.OAUTH_REDIRECT_URI ??
      `http://localhost:${process.env.PORT || 3009}/api/oauth/callback`;

    try {
      const result = await initiateOAuthFlow(db, req.params.id, redirectUri);
      res.json(result);
    } catch (err) {
      console.error(`[mcp-servers] OAuth connect failed for "${row.id}":`, err);
      res.status(502).json({ error: String(err) });
    }
  });

  // DELETE /api/mcp-servers/:id/oauth/disconnect — remove OAuth connection
  router.delete("/mcp-servers/:id/oauth/disconnect", async (req, res) => {
    const row = await db.query.mcpServers.findFirst({
      where: eq(mcpServers.id, req.params.id),
      columns: { id: true },
    });

    if (!row) { res.status(404).json({ error: "Not found" }); return; }

    await disconnectOAuth(db, req.params.id);
    res.status(204).end();
  });

  // GET /api/mcp-servers/:id/oauth/status — check OAuth connection status
  router.get("/mcp-servers/:id/oauth/status", async (req, res) => {
    const row = await db.query.mcpServers.findFirst({
      where: eq(mcpServers.id, req.params.id),
      columns: { id: true },
    });

    if (!row) { res.status(404).json({ error: "Not found" }); return; }

    const connection = await db.query.oauthConnections.findFirst({
      where: eq(oauthConnections.mcpServerId, req.params.id),
    });

    if (!connection || !connection.status || connection.status !== "active") {
      res.json({ status: "disconnected" });
      return;
    }

    res.json({
      status: connection.status,
      connectedAt: connection.connectedAt.toISOString(),
      lastRefreshedAt: connection.lastRefreshedAt?.toISOString() ?? null,
      expiresAt: connection.expiresAt?.toISOString() ?? null,
      scope: connection.scope ?? null,
      tokenType: connection.tokenType,
    });
  });

  // GET /api/mcp-servers/:id/tools — list available tools (live)
  router.get("/mcp-servers/:id/tools", async (req, res) => {
    const row = await db.query.mcpServers.findFirst({ where: eq(mcpServers.id, req.params.id) });
    if (!row) { res.status(404).json({ error: "Not found" }); return; }

    const pool = new McpClientPool();
    pool.setDb(db);
    try {
      const tools = await pool.connect({
        id: row.id,
        name: row.name,
        transport: row.transport as "stdio" | "sse" | "streamable-http",
        command: row.command ?? undefined,
        args: (row.args as string[] | null) ?? [],
        url: row.url ?? undefined,
        headers: (row.headers as Record<string, string> | null) ?? {},
        env: (row.env as Record<string, string> | null) ?? {},
      });
      res.json(tools);
    } catch (err) {
      console.error(`[mcp-servers] List tools failed for "${row.name}":`, err);
      res.status(502).json({ error: String(err) });
    } finally {
      await pool.disconnectAll().catch((e) => console.error("[mcp-servers] disconnectAll error:", e));
    }
  });

  return router;
}
