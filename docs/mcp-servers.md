# MCP Servers

Zerohand can connect to external [Model Context Protocol](https://modelcontextprotocol.io) servers and expose their tools to pipeline skills during execution. This lets skills call tools like web search, file access, database queries, or any other capability provided by an MCP-compliant server.

**Source:** `server/src/services/mcp-client.ts`, `server/src/services/mcp-tool-bridge.ts`, `server/src/routes/mcp-servers.ts`

---

## Overview

MCP servers are registered globally in Settings and referenced by skills via their `mcpServers` frontmatter field. When a pipeline runs a skill that declares MCP dependencies, the engine:

1. Connects to each referenced MCP server (or reuses an existing connection from the pool)
2. Lists available tools on that server
3. Converts the tools to pi-coding-agent `ToolDefinition` objects
4. Makes them available to the LLM alongside the skill's script tools

---

## Registering MCP Servers

### Via Settings UI

Open **Settings → MCP Servers** and click **Add MCP Server**. Choose a transport type and fill in the details.

### Via the Agent

Ask the global agent to register a server:

> "Register a Brave Search MCP server using npx @anthropic/brave-search-mcp with my BRAVE_API_KEY env var"

The agent uses the `register_mcp_server`, `update_mcp_server`, and `delete_mcp_server` tools.

### Via API

```http
POST /api/mcp-servers
```

```json
{
  "name": "brave-search",
  "transport": "stdio",
  "command": "npx",
  "args": ["-y", "@anthropic/brave-search-mcp"],
  "env": { "BRAVE_API_KEY": "your-key" },
  "enabled": true
}
```

```json
{
  "name": "my-api",
  "transport": "streamable-http",
  "url": "https://api.example.com/mcp",
  "headers": { "Authorization": "Bearer token" }
}
```

---

## Transport Types

| Transport | Use case | Required fields |
|-----------|----------|-----------------|
| `stdio` | Local CLI-based servers (e.g. npx packages) | `command`, `args`, `env` (optional) |
| `sse` | HTTP servers using Server-Sent Events | `url`, `headers` (optional) |
| `streamable-http` | HTTP servers using Streamable HTTP (MCP 2025-03-26 spec) | `url`, `headers` (optional) |

---

## Declaring MCP Dependencies in a Skill

Add a `mcpServers` list to `SKILL.md` frontmatter:

```markdown
---
name: web-researcher
description: "Research using Brave Search"
type: pi
mcpServers:
  - brave-search
  - filesystem
---

You are a researcher. Use web search to find accurate, up-to-date information.
```

The engine only connects to servers listed in the skill's frontmatter — skills without `mcpServers` incur no MCP connection overhead.

---

## Tool Naming Convention

MCP tools appear in the LLM context with the name `mcp__<serverName>__<toolName>`. For example, a `search` tool on the `brave-search` server becomes `mcp__brave_search__search` (dashes in server names are replaced with underscores). Double underscores prevent naming collisions with script tools.

---

## Connection Lifecycle

- A `McpClientPool` is created at the start of each pipeline run.
- Connections are established lazily — only when a step's skill references that server.
- The pool is shared across all steps in a run; a server connected in step 1 is reused in step 3.
- The pool is fully disconnected in the `finally` block of `executeRun()` — success or failure.
- Connection timeout: 30 seconds per server.

---

## Package MCP Server Declarations

Packages can auto-register MCP servers on import by declaring them in `pipeline.yaml`:

```yaml
mcpServers:
  brave-search:
    transport: stdio
    command: npx
    args: ["-y", "@anthropic/brave-search-mcp"]
  my-api:
    transport: streamable-http
    url: https://api.example.com/mcp
```

On import, these are upserted into the `mcp_servers` table with `source: "package"`. If a server with that name already exists, the existing record takes precedence (logged as a warning).

---

## API Reference

### `GET /api/mcp-servers`

List all registered MCP servers.

```json
[
  {
    "id": "uuid",
    "name": "brave-search",
    "transport": "stdio",
    "command": "npx",
    "args": ["-y", "@anthropic/brave-search-mcp"],
    "enabled": true,
    "source": "manual",
    "createdAt": "..."
  }
]
```

### `POST /api/mcp-servers`

Register a new server. See body fields above.

### `PATCH /api/mcp-servers/:id`

Update any fields (e.g. toggle `enabled`, change `url`).

### `DELETE /api/mcp-servers/:id`

Remove a server. Does not affect running pipelines.

### `POST /api/mcp-servers/:id/test`

Test the connection. Connects, lists tools, disconnects, returns results.

```json
{
  "connected": true,
  "tools": [
    {
      "serverName": "brave-search",
      "name": "search",
      "description": "Search the web",
      "inputSchema": { "type": "object", "properties": { "query": { "type": "string" } } }
    }
  ]
}
```

### `GET /api/mcp-servers/:id/tools`

Live tool list for a server (connects, queries, disconnects).

---

## Security Notes

- MCP server credentials (API keys in `env` or `headers`) are stored in the database. Keep your database access secure.
- Environment variables passed to stdio servers are merged with the server process environment, not the full Zerohand server environment — standard tools (search, filesystem) will not receive your `ANTHROPIC_API_KEY` unless you explicitly pass it.
- MCP tools can perform arbitrary actions depending on the server. Only register servers you trust.
