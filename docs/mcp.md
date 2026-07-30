---
title: MCP Server
---

# MCP Server

`datum-sync` ships a [Model Context Protocol](https://modelcontextprotocol.io) (MCP) stdio server. Once configured, AI agents (Claude Desktop, Cursor, Windsurf, and any MCP-compatible client) can query your synced PostGIS data directly with natural language.

> **"What's the average building height in the viewport?"** → Claude calls `query` → instant PostGIS answer from local PGlite.

## Install

```bash
npm install datum-sync
```

The `datum-mcp` binary is included. You can also run it without installing:

```bash
npx datum-sync datum-mcp ws://localhost:3000/ws
```

## Zero-install: `datum-cli mcp`

If you're using [`datum-cli`](/getting-started#cli) for local development, `datum-cli mcp` starts Postgres, `datum-server`, and this MCP bridge together in one command:

```bash
npx datum-cli mcp
```

It resolves a table name the same way `datum-cli init` writes it: from `table.name` in a `datum.yaml` in the current directory, or via `--table <name>` if you have multiple tables configured or no config file. All of `datum-mcp`'s flags below (`--allow-writes`, `--jwt`, `--bbox`, `--max-rows`) are forwarded as-is:

```bash
npx datum-cli mcp --table parcels --allow-writes
```

Point Claude Desktop at `datum-cli` directly instead of `datum-sync`:

```json
{
  "mcpServers": {
    "datum": {
      "command": "npx",
      "args": ["datum-cli", "mcp"]
    }
  }
}
```

## Usage

```
datum-mcp <ws://server-url> [--table <name>] [--allow-writes] [--jwt <token>]
```

| Flag | Default | Description |
|------|---------|-------------|
| `--table` | `features` | Table name (must match your datum-server config) |
| `--allow-writes` | off | Enable INSERT/UPDATE/DELETE. Off by default. |
| `--jwt` | — | JWT for authenticated datum-servers |
| `--max-rows` | `1000` | Cap on rows returned by `query`. Results beyond this are truncated with a `total_row_count` note. |

The server connects to datum-server, syncs the local PGlite snapshot, then listens on **stdin/stdout** for MCP JSON-RPC messages. All diagnostic output goes to **stderr** so it never interferes with the protocol.

## Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (Mac) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "datum": {
      "command": "npx",
      "args": [
        "datum-sync",
        "datum-mcp",
        "ws://localhost:3000/ws",
        "--table", "features"
      ]
    }
  }
}
```

If `datum-sync` is installed globally (`npm install -g datum-sync`):

```json
{
  "mcpServers": {
    "datum": {
      "command": "datum-mcp",
      "args": ["ws://localhost:3000/ws", "--table", "features"]
    }
  }
}
```

Restart Claude Desktop after editing the config.

## Tools

### `query`

Run SQL against the local PGlite database. Full PostGIS is available.

```
SELECT ST_AsGeoJSON(geom), name FROM features WHERE ST_DWithin(geom::geography, ST_MakePoint(-0.12, 51.5)::geography, 1000)
```

**Input:**

| Field | Type | Description |
|-------|------|-------------|
| `sql` | `string` | SQL to execute |
| `params` | `unknown[]` (optional) | Positional parameters (`$1`, `$2`, …) |

**Output:**

```json
{
  "rows": [{ "name": "Tower Bridge", "st_asgeojson": "{...}" }],
  "row_count": 1,
  "duration_ms": 4
}
```

By default the tool is **read-only** — mutations (`INSERT`, `UPDATE`, `DELETE`, `DROP`, etc.) are rejected. Start the server with `--allow-writes` to enable them.

Results are capped at `--max-rows` (default `1000`). When a query's result exceeds the cap, the response includes `"truncated": true` and `"total_row_count"` alongside the (truncated) `rows` — narrow the query with `WHERE`/`LIMIT` to see more.

---

### `get_schema`

Returns the table schema: column names, PostgreSQL types, and datum roles.

**Output:**

```json
{
  "table": "features",
  "columns": [
    { "name": "id",         "pg_type": "uuid",        "role": "id",         "nullable": false },
    { "name": "geom",       "pg_type": "geometry",    "role": "geom",       "nullable": false },
    { "name": "name",       "pg_type": "text",        "role": "data",       "nullable": true  },
    { "name": "updated_at", "pg_type": "timestamptz", "role": "updated_at", "nullable": false }
  ]
}
```

---

### `get_status`

Returns current sync state.

**Output:**

```json
{
  "connection": "connected",
  "table": "features",
  "pending_writes": 0,
  "row_count": 1842
}
```

`connection` is one of `connecting`, `connected`, or `disconnected`. `pending_writes` is the number of local writes not yet acknowledged by the server.

## Authentication

For datum-servers with JWT auth configured, pass the token via `--jwt`:

```bash
datum-mcp ws://your-server.com/ws --table features --jwt eyJhbGci...
```

See [Authentication](./auth.md) for how to configure JWT auth on the server side.

## Write mode

`--allow-writes` lifts the read-only guard and permits any SQL. Use it only in trusted, local development environments — the MCP client has full table access.

```bash
datum-mcp ws://localhost:3000/ws --table features --allow-writes
```
