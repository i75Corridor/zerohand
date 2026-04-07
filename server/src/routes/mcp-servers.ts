import { Router } from "express";
import { eq } from "drizzle-orm";
import type { Db } from "@pawn/db";
import { mcpServers } from "@pawn/db";
import type { ApiMcpServer } from "@pawn/shared";
import { McpClientPool } from "../services/mcp-client.js";
import { detectEnvVars } from "../services/mcp-env-detector.js";

function rowToApi(row: typeof mcpServers.$inferSelect): ApiMcpServer {
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
    sourcePackageId: row.sourcePackageId ?? undefined,
    metadata: (row.metadata as ApiMcpServer["metadata"]) ?? undefined,
  };
}

export function makeMcpServersRouter(db: Db): Router {
  const router = Router();

  // GET /api/mcp-servers
  router.get("/mcp-servers", async (_req, res) => {
    const rows = await db.select().from(mcpServers).orderBy(mcpServers.name);
    res.json(rows.map(rowToApi));
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
    const row = await db.query.mcpServers.findFirst({ where: eq(mcpServers.id, req.params.id) });
    if (!row) { res.status(404).json({ error: "Not found" }); return; }
    res.json(rowToApi(row));
  });

  // POST /api/mcp-servers
  router.post("/mcp-servers", async (req, res) => {
    const { name, transport, command, args, url, headers, env } = req.body as Partial<ApiMcpServer>;
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
    const updates: Partial<typeof mcpServers.$inferInsert> = { updatedAt: new Date() };
    if (name !== undefined) updates.name = name;
    if (transport !== undefined) updates.transport = transport;
    if (command !== undefined) updates.command = command ?? null;
    if (args !== undefined) updates.args = args;
    if (url !== undefined) updates.url = url ?? null;
    if (headers !== undefined) updates.headers = headers;
    if (env !== undefined) updates.env = env;
    if (enabled !== undefined) updates.enabled = enabled;

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

  // GET /api/mcp-servers/:id/tools — list available tools (live)
  router.get("/mcp-servers/:id/tools", async (req, res) => {
    const row = await db.query.mcpServers.findFirst({ where: eq(mcpServers.id, req.params.id) });
    if (!row) { res.status(404).json({ error: "Not found" }); return; }

    const pool = new McpClientPool();
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
