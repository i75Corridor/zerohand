import { createServer } from "node:http";
import { mkdirSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import express from "express";
import cors from "cors";
// @ts-ignore - detect-port types
import detectPort from "detect-port";
import EmbeddedPostgres from "embedded-postgres";
import { createDb, ensurePostgresDatabase, applyPendingMigrations } from "@zerohand/db";
import { WsManager } from "./ws/index.js";
import { ExecutionEngine } from "./services/execution-engine.js";
import { TriggerManager } from "./services/trigger-manager.js";
import { importAllPackages } from "./services/pipeline-import.js";
import { checkForUpdates } from "./services/package-manager.js";
import { detectDocker } from "./services/script-sandbox.js";
import { createHealthRouter } from "./routes/health.js";
import { createPipelinesRouter } from "./routes/pipelines.js";
import { createPipelineRunsRouter } from "./routes/pipeline-runs.js";
import { createTriggersRouter } from "./routes/triggers.js";
import { createApprovalsRouter } from "./routes/approvals.js";
import { createBudgetsRouter } from "./routes/budgets.js";
import { createStatsRouter } from "./routes/stats.js";
import { createSettingsRouter } from "./routes/settings.js";
import { createFilesRouter } from "./routes/files.js";
import { createWebhooksRouter } from "./routes/webhooks.js";
import { createSkillsRouter } from "./routes/skills.js";
import { createPackagesRouter } from "./routes/packages.js";
import { createModelsRouter } from "./routes/models.js";
import { createLogsRouter } from "./routes/logs.js";
import { ChannelManager } from "./services/channel-manager.js";
import { GlobalAgentService } from "./services/global-agent.js";

const PORT = parseInt(process.env.PORT ?? "3009", 10);
const DATA_DIR = process.env.DATA_DIR ?? join(process.cwd(), "..", ".data");
const DB_NAME = "zerohand";
const DB_USER = "zerohand";
const DB_PASS = "zerohand";

mkdirSync(DATA_DIR, { recursive: true });

async function startPostgres(): Promise<{ url: string; stop: () => Promise<void> }> {
  // If DATABASE_URL is set, use external postgres (e.g. Docker)
  if (process.env.DATABASE_URL) {
    const dbUrl = process.env.DATABASE_URL;
    console.log("[Postgres] Using external database:", dbUrl.replace(/:\/\/[^@]+@/, "://<credentials>@"));
    await applyPendingMigrations(dbUrl);
    console.log("[Postgres] Migrations up to date.");
    return { url: dbUrl, stop: async () => {} };
  }

  // Otherwise start embedded postgres for local dev
  const pgDataDir = join(DATA_DIR, "postgres");
  mkdirSync(pgDataDir, { recursive: true });

  const pgPort = await detectPort(5442);
  console.log(`[Postgres] Starting embedded postgres on port ${pgPort}...`);

  const embeddedPostgres = new EmbeddedPostgres({
    databaseDir: pgDataDir,
    user: DB_USER,
    password: DB_PASS,
    port: pgPort,
    persistent: true,
    initdbFlags: ["--encoding=UTF8", "--locale=C", "--lc-messages=C"],
    onLog: (msg: unknown) => console.log(`[Postgres] ${msg}`),
    onError: (msg: unknown) => console.error(`[Postgres] ERROR: ${msg}`),
  });

  // If postmaster.pid exists, postgres is already running — reuse its port
  const postmasterPid = join(pgDataDir, "postmaster.pid");
  if (existsSync(postmasterPid)) {
    const lines = readFileSync(postmasterPid, "utf8").trim().split("\n");
    const runningPort = parseInt(lines[3] ?? "", 10);
    if (runningPort > 0) {
      console.log(`[Postgres] Already running on port ${runningPort}, reusing.`);
      const rootUrl = `postgresql://${DB_USER}:${DB_PASS}@localhost:${runningPort}/postgres`;
      await ensurePostgresDatabase(rootUrl, DB_NAME);
      const dbUrl = `postgresql://${DB_USER}:${DB_PASS}@localhost:${runningPort}/${DB_NAME}`;
      await applyPendingMigrations(dbUrl);
      console.log("[Postgres] Migrations up to date.");
      return { url: dbUrl, stop: async () => {} };
    }
  }

  // Only run initdb if the cluster doesn't already exist
  const pgVersionFile = join(pgDataDir, "PG_VERSION");
  if (!existsSync(pgVersionFile)) {
    await embeddedPostgres.initialise();
  }
  await embeddedPostgres.start();

  const rootUrl = `postgresql://${DB_USER}:${DB_PASS}@localhost:${pgPort}/postgres`;
  await ensurePostgresDatabase(rootUrl, DB_NAME);

  const dbUrl = `postgresql://${DB_USER}:${DB_PASS}@localhost:${pgPort}/${DB_NAME}`;
  console.log("[Postgres] Applying migrations...");
  await applyPendingMigrations(dbUrl);
  console.log("[Postgres] Migrations up to date.");

  return {
    url: dbUrl,
    stop: async () => {
      await embeddedPostgres.stop();
    },
  };
}

async function main() {
  const { url: dbUrl, stop: stopPostgres } = await startPostgres();

  const db = createDb(dbUrl);
  const pipelinesDir = process.env.PIPELINES_DIR ?? join(process.cwd(), "..", "pipelines");
  await importAllPackages(db, pipelinesDir);

  // Non-blocking startup update check, then every 30 minutes
  const runUpdateCheck = () =>
    void checkForUpdates(db).catch((err) =>
      console.error("[Packages] Update check failed:", err),
    );
  runUpdateCheck();
  setInterval(runUpdateCheck, 30 * 60 * 1000);

  // Check Docker availability for script sandbox
  void detectDocker().then((available) => {
    if (available) {
      console.log("[Sandbox] Docker available — skill scripts will run in containers");
    } else {
      console.warn("[Sandbox] Docker not available — skill scripts will run as subprocesses");
    }
  });

  const app = express();

  app.use(cors());
  app.use(express.json());

  // Routes (approvals needs ws for re-queuing after approve/reject)
  app.use("/api", createHealthRouter());
  app.use("/api", createPipelinesRouter(db));
  app.use("/api", createPipelineRunsRouter(db));
  app.use("/api", createTriggersRouter(db));
  app.use("/api", createBudgetsRouter(db));
  app.use("/api", createStatsRouter(db));
  let globalAgentRef: import("./services/global-agent.js").GlobalAgentService | null = null;
  app.use("/api", createSettingsRouter(db, () => { void globalAgentRef?.resetSession(); }));
  app.use("/api", createFilesRouter());
  app.use("/api", createSkillsRouter());
  app.use("/api", createPackagesRouter(db));
  app.use("/api", createModelsRouter());
  app.use("/api", createLogsRouter());

  // 404 handler
  app.use((_req, res) => res.status(404).json({ error: "Not found" }));

  // Error handler
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("[Server] Error:", err);
    res.status(500).json({ error: String(err) });
  });

  const httpServer = createServer(app);
  const ws = new WsManager(httpServer);

  // Approvals router needs ws for re-queuing runs after approve/reject
  app.use("/api", createApprovalsRouter(db, ws));

  const engine = new ExecutionEngine(db, ws);
  const triggers = new TriggerManager(db, ws);
  const channels = new ChannelManager(db, ws);
  app.use("/", createWebhooksRouter(channels));

  // Wire bidirectional WebSocket → engine chat handler
  ws.onChatMessage((msg) => engine.handleChatMessage(msg));

  const globalAgent = new GlobalAgentService(db, (msg) => ws.broadcast(msg), DATA_DIR);
  globalAgentRef = globalAgent;
  globalAgent.setCancelRunFn((runId) => engine.cancelRun(runId));
  ws.onGlobalChatMessage((msg) => {
    void globalAgent.handleMessage(msg.action, msg.message, msg.context);
  });

  engine.start();
  triggers.start();
  void channels.start();
  console.log("[Engine] Execution engine started.");

  httpServer.listen(PORT, () => {
    console.log(`[Server] Listening on http://localhost:${PORT}`);
    console.log(`[Server] WebSocket on ws://localhost:${PORT}`);
  });

  const shutdown = async () => {
    console.log("[Server] Shutting down...");
    engine.stop();
    triggers.stop();
    httpServer.close();
    await stopPostgres();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  console.error("[Server] Fatal error:", err);
  process.exit(1);
});
