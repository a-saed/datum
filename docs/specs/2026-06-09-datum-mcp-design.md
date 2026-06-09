---
title: datum MCP Server
date: 2026-06-09
status: approved
---

# datum MCP Server

A Model Context Protocol (MCP) server that exposes a synced datum table as tools AI agents can call. Agents (Claude Desktop, Cursor, Windsurf) can query local PostGIS data with natural language, inspect schema, and optionally write rows — all through the standard MCP stdio transport.

## Structure & Entrypoint

Lives at `packages/client/src/mcp/` and is exported as `datum-sync/mcp`. Follows the same pattern as `datum-sync/devtools` — dynamic import, zero impact on the main bundle.

**Two files:**

- `packages/client/src/mcp/index.ts` — exports `initDatumMcp(client, opts?)`. Programmatic API, mirrors `initDatumDevtools`.
- `packages/client/src/mcp/cli.ts` — thin CLI wrapper. Parses `<serverUrl> --table <name> [--allow-writes] [--jwt <token>]`, calls `DatumClient.connect()`, then `initDatumMcp()`, keeps the process alive.

**`package.json` additions:**

```json
"exports": {
  "./mcp": { "import": "./dist/mcp/index.js", "types": "./dist/mcp/index.d.ts" }
},
"bin": {
  "datum-mcp": "./dist/mcp/cli.js"
}
```

**Usage:**
```bash
# via npx
npx datum-mcp ws://localhost:3000/ws --table features

# programmatic
import { initDatumMcp } from 'datum-sync/mcp'
await initDatumMcp(client, { allowWrites: true })
```

**Claude Desktop config example:**
```json
{
  "mcpServers": {
    "datum": {
      "command": "npx",
      "args": ["datum-mcp", "ws://localhost:3000/ws", "--table", "features"]
    }
  }
}
```

## MCP Tools

### `query`

Run arbitrary SQL against the local PGlite database. Full PostGIS available (`ST_Distance`, `ST_Within`, `ST_DWithin`, etc.).

```
Input:  { sql: string, params?: unknown[] }
Output: { rows: Record<string, unknown>[], rowCount: number, duration_ms: number }
```

- With `allowWrites: false` (default): mutations (`INSERT`/`UPDATE`/`DELETE`) are rejected before execution and return an error.
- With `allowWrites: true`: mutations go through the normal datum outbox and sync to the server, subject to all existing JWT auth and RLS policies.

### `get_schema`

Returns the introspected server schema. Gives the AI agent column names, types, and roles so it can write correct queries without guessing.

```
Input:  (none)
Output: { table: string, columns: { name: string, pg_type: string, role: string, nullable: boolean }[] }
```

### `get_status`

Live sync state. Useful for an agent to confirm data is fresh before querying.

```
Input:  (none)
Output: { connection: 'connecting'|'connected'|'disconnected', table: string, pending_writes: number, row_count: number }
```

## Protocol Implementation

Uses `@modelcontextprotocol/sdk` (Anthropic-maintained). Handles stdio transport, JSON-RPC framing, and tool registration.

```ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

export async function initDatumMcp(client: DatumClient, opts = { allowWrites: false }) {
  const server = new McpServer({ name: 'datum', version: '...' })
  // register tools
  await server.connect(new StdioServerTransport())
}
```

## Process Lifecycle

1. Parse args: `serverUrl`, `--table`, `--allow-writes`, `--jwt`
2. `DatumClient.connect()` — waits for initial snapshot before accepting MCP connections
3. `initDatumMcp(client, opts)` — registers tools, connects stdio transport
4. Keep process alive — stdin closing triggers graceful `client.disconnect()` + exit

## Error Handling

| Scenario | Behaviour |
|---|---|
| Connection failure at startup | Exit non-zero + stderr message |
| Bad SQL in `query` | Return MCP error response, process stays alive |
| Disconnected mid-session | Tools return `{ error: 'disconnected — reconnecting' }`, process stays alive, DatumClient auto-reconnects |
| Mutation with `allowWrites: false` | Return MCP error response with clear message |

## Dependencies

- `@modelcontextprotocol/sdk` — added to `packages/client/package.json`
- No other new dependencies; reuses existing `DatumClient`, PGlite, and the datum WebSocket protocol

## Out of Scope (v1)

- HTTP+SSE transport
- Multi-table in a single MCP server process (use multiple MCP server entries instead)
- Spatial helper tools (`find_nearest`, `features_in_bbox`) — `query` covers these
- Streaming query results
