import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";

vi.mock("../services/mcp-env-detector.js", () => ({
  detectEnvVars: vi.fn(),
}));

import { detectEnvVars } from "../services/mcp-env-detector.js";

const mockedDetect = vi.mocked(detectEnvVars);

/**
 * Extracts the POST /mcp-servers/detect-env handler from the router.
 *
 * We build a real router via makeMcpServersRouter, then walk its stack
 * to find the handler registered for the detect-env path.
 */
async function getHandler() {
  // Dynamically import AFTER mocks are set up
  const { makeMcpServersRouter } = await import("../routes/mcp-servers.js");

  // Provide a minimal fake db — the detect-env handler only uses db.update
  // when an `id` query param is present, and we don't test that path here.
  const fakeDb = {} as any;
  const router = makeMcpServersRouter(fakeDb);

  // Walk the Express router stack to find our route
  const layer = (router as any).stack.find(
    (l: any) =>
      l.route &&
      l.route.path === "/mcp-servers/detect-env" &&
      l.route.methods.post,
  );

  if (!layer) {
    throw new Error("detect-env route not found on router");
  }

  // Return the first handler function registered on that route
  return layer.route.stack[0].handle as (req: Request, res: Response) => Promise<void>;
}

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response & { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };
}

describe("POST /mcp-servers/detect-env", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when transport is missing", async () => {
    const handler = await getHandler();
    const req = { body: {}, query: {} } as unknown as Request;
    const res = mockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "transport is required" });
    expect(mockedDetect).not.toHaveBeenCalled();
  });

  it("returns 400 when transport is stdio but command is missing", async () => {
    const handler = await getHandler();
    const req = { body: { transport: "stdio" }, query: {} } as unknown as Request;
    const res = mockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: "command is required for stdio transport",
    });
    expect(mockedDetect).not.toHaveBeenCalled();
  });

  it("calls detectEnvVars with correct params and returns result", async () => {
    const detected = [
      { name: "API_KEY", required: true, detectedFrom: "registry" as const },
    ];
    mockedDetect.mockResolvedValue({ detected });

    const handler = await getHandler();
    const req = {
      body: { transport: "stdio", command: "npx", args: ["-y", "mcp-server"], name: "test" },
      query: {},
    } as unknown as Request;
    const res = mockRes();

    await handler(req, res);

    expect(mockedDetect).toHaveBeenCalledWith({
      transport: "stdio",
      command: "npx",
      args: ["-y", "mcp-server"],
      name: "test",
    });
    expect(res.json).toHaveBeenCalledWith({ detected, error: undefined });
  });

  it("returns 429 when detector reports busy", async () => {
    mockedDetect.mockResolvedValue({ detected: [], error: "detection busy" });

    const handler = await getHandler();
    const req = {
      body: { transport: "stdio", command: "npx", args: [] },
      query: {},
    } as unknown as Request;
    const res = mockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith({
      error: "Detection is busy, try again in a moment",
    });
  });

  it("returns result for non-stdio transport without requiring command", async () => {
    const detected = [
      { name: "TOKEN", required: false, detectedFrom: "registry" as const },
    ];
    mockedDetect.mockResolvedValue({ detected });

    const handler = await getHandler();
    const req = {
      body: { transport: "sse", url: "http://localhost:3000/sse" },
      query: {},
    } as unknown as Request;
    const res = mockRes();

    await handler(req, res);

    expect(mockedDetect).toHaveBeenCalledWith({
      transport: "sse",
      command: undefined,
      args: undefined,
      name: undefined,
    });
    expect(res.json).toHaveBeenCalledWith({ detected, error: undefined });
  });
});
